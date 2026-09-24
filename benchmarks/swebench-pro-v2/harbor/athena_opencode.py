"""Pinned OpenCode + ATHENA agent for the official Harbor/Modal V2 protocol.

This is a Harbor extension, not a replacement runner.  It intentionally leaves
environment creation, per-phase networking, timeouts, and verification to
Harbor.  The official ``patch_replay:PatchReplayAgent`` consumes the resulting
``/logs/agent/model.patch`` in a fresh sandbox.
"""
from __future__ import annotations

import hashlib
import json
import shlex
from pathlib import Path
from typing import Annotated, Any, Literal, override

from pydantic import Field

from harbor.agents.installed.opencode import OpenCode, OpenCodeOptions
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

OPENCODE_COMMIT = "08462140ec0de1e4b17d4a353d8d5827f53cf7b0"
OPENCODE_VERSION = "2.0.14"
BUN_VERSION = "1.4.2"
BUN_URL = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64.zip"
BUN_SHA256 = "36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913"


class AthenaOpenCodeOptions(OpenCodeOptions):
    condition: Annotated[Literal["baseline", "athena_full"], Field(description="Frozen experimental condition")]
    athena_bundle: Annotated[str | None, Field(default=None, description="Host path to a prebuilt ATHENA bundle")]
    athena_sha: Annotated[str | None, Field(default=None, description="Exact ATHENA source commit recorded in artifacts")]


class AthenaOpenCode(OpenCode):
    """OpenCode source build with an optional isolated ATHENA V2 plugin."""

    options_model = AthenaOpenCodeOptions

    def __init__(self, *args: Any, condition: Literal["baseline", "athena_full"], athena_bundle: str | None = None,
                 athena_sha: str | None = None, **kwargs: Any):
        # The stock Harbor OpenCode installer is deliberately bypassed: v2.0.14
        # is an exact source tag, not an ``opencode-ai`` npm package.
        super().__init__(*args, **kwargs)
        self._condition = condition
        self._athena_bundle = Path(athena_bundle).resolve() if athena_bundle else None
        self._athena_sha = athena_sha

    @staticmethod
    @override
    def name() -> str:
        return "athena-opencode"

    async def install(self, environment: BaseEnvironment) -> None:
        await self.ensure_system_dependencies(environment, ("bash", "curl", "git", "unzip", "nodejs", "npm"))
        command = " && ".join((
            "set -euo pipefail",
            "mkdir -p /opt/athena-bench/bin /opt/athena-bench/src",
            f"curl -fsSL {BUN_URL} -o /tmp/bun.zip",
            f"echo '{BUN_SHA256}  /tmp/bun.zip' | sha256sum -c -",
            "unzip -q /tmp/bun.zip -d /opt/athena-bench/bin",
            "install -m 755 /opt/athena-bench/bin/bun-linux-x64/bun /usr/local/bin/bun",
            "rm -rf /tmp/bun.zip /opt/athena-bench/bin/bun-linux-x64",
            "git clone --no-checkout https://github.com/anomalyco/opencode.git /opt/athena-bench/src/opencode",
            "git -C /opt/athena-bench/src/opencode checkout --detach " + OPENCODE_COMMIT,
            "test \"$(git -C /opt/athena-bench/src/opencode rev-parse HEAD)\" = \"" + OPENCODE_COMMIT + "\"",
            "cd /opt/athena-bench/src/opencode",
            "bun install --frozen-lockfile",
            "bun packages/cli/script/build.ts",
            "binary=$(find packages/cli/dist -type f -path '*/bin/opencode' | head -n1)",
            "test -n \"$binary\" && install -m 755 \"$binary\" /usr/local/bin/opencode",
            "test \"$(opencode --version)\" = \"" + OPENCODE_VERSION + "\"",
        ))
        result = await environment.exec(command=command, user="root", timeout_sec=1800)
        if result.return_code != 0:
            raise RuntimeError("pinned OpenCode provisioning failed")
        if self._condition == "athena_full":
            await self._install_athena(environment)

    async def _install_athena(self, environment: BaseEnvironment) -> None:
        if self._athena_bundle is None or not self._athena_bundle.is_file() or not self._athena_sha:
            raise RuntimeError("ATHENA_FULL requires a prebuilt ATHENA bundle and exact ATHENA SHA")
        await environment.upload_file(self._athena_bundle, "/tmp/athena-bundle.tgz")
        await environment.exec(command="set -e; rm -rf /opt/athena; mkdir -p /opt/athena; tar xzf /tmp/athena-bundle.tgz -C /opt/athena", user="root", timeout_sec=300)
        config = {
            "mode": "balanced", "provider": "typesafe", "enforcementMode": "enforce",
            "toolRouter": {"mode": "active"},
        }
        plugin = 'export { AthenaPlugin as default } from "/opt/athena/packages/opencode/dist/v2/runtime/plugin.js";\n'
        escaped_config, escaped_plugin = shlex.quote(json.dumps(config)), shlex.quote(plugin)
        command = " && ".join((
            "set -euo pipefail",
            "test -n \"${TYPESAFE_API_KEY:-}\"",
            "mkdir -p /logs/agent/athena-state/.athena ~/.config/opencode/plugins",
            f"printf '%s' {escaped_config} > /logs/agent/athena-state/.athena/config.json",
            f"printf '%s' {escaped_plugin} > ~/.config/opencode/plugins/athena.ts",
        ))
        result = await self.exec_as_agent(environment, command=command)
        if result.return_code != 0:
            raise RuntimeError("ATHENA_FULL provisioning failed")

    @override
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        env = dict(self.model_connection.env)
        env.update({"OPENCODE_FAKE_VCS": "git", "XDG_DATA_HOME": "/logs/agent/opencode/xdg-data", "XDG_STATE_HOME": "/logs/agent/opencode/xdg-state"})
        if self._condition == "athena_full":
            env["ATHENA_STATE_ROOT"] = "/logs/agent/athena-state"
        self._instruction = instruction
        if not self.model_name or "/" not in self.model_name:
            raise ValueError("Model name must be provider/model")
        config_command = self._build_register_config_command()
        if config_command:
            await self.exec_as_agent(environment, command=config_command, env=env)
        command = (
            "set -o pipefail; "
            f"opencode --model={self.model_name} run --format=json --thinking "
            f"--dangerously-skip-permissions -- {shlex.quote(instruction)} "
            "2>&1 </dev/null | stdbuf -oL tee /logs/agent/opencode.txt"
        )
        try:
            await self.exec_as_agent(environment, command=command, env=env)
        finally:
            await environment.exec(command=(
                "set +e; mkdir -p /logs/agent; "
                "repo=$(git -C /app rev-parse --show-toplevel 2>/dev/null || git -C /testbed rev-parse --show-toplevel 2>/dev/null || echo /app); "
                "cd \"$repo\" && git add -A && git diff --cached > /logs/agent/model.patch && git reset -q; "
                "sha256sum /logs/agent/model.patch > /logs/agent/model.patch.sha256; true"
            ), user="root", timeout_sec=300)
            self._write_evidence()

    def _write_evidence(self) -> None:
        evidence: dict[str, Any] = {
            "condition": self._condition, "opencodeCommit": OPENCODE_COMMIT,
            "opencodeVersion": OPENCODE_VERSION, "opencodePath": "/usr/local/bin/opencode",
            "athenaInstalled": self._condition == "athena_full", "athenaLoaded": False,
            "athenaHooks": 0, "jevCalls": 0, "toolRouterCalls": 0,
        }
        events = self.logs_dir / "athena-state" / ".athena" / "events.jsonl"
        if self._condition == "athena_full" and events.exists():
            records = [json.loads(line) for line in events.read_text().splitlines() if line.strip()]
            evidence["athenaLoaded"] = any(record.get("type") == "PLUGIN_INITIALIZED" for record in records)
            evidence["athenaHooks"] = sum(record.get("type") == "ACTION_PROPOSED" for record in records)
            cognitive = [record.get("metadata", {}) for record in records if record.get("type") == "PROVIDER_STATUS" and record.get("metadata", {}).get("component") == "cognitive"]
            if cognitive:
                evidence["jevCalls"] = cognitive[-1].get("jevRequests", 0)
                evidence["jevLatencyMs"] = cognitive[-1].get("jevTotalLatencyMs", "NOT_AVAILABLE")
                evidence["goCount"] = sum(item.get("decision") == "GO" for item in cognitive)
                evidence["deliberateCount"] = sum(item.get("decision") == "DELIBERATE" for item in cognitive)
                evidence["verifyCount"] = sum(item.get("decision") == "VERIFY" for item in cognitive)
                evidence["blockCount"] = sum(item.get("decision") == "BLOCK" for item in cognitive)
            evidence["toolRouterCalls"] = sum(record.get("type") == "TOOL_ROUTED" for record in records)
        patch = self.logs_dir / "model.patch"
        evidence["patchSha256"] = hashlib.sha256(patch.read_bytes()).hexdigest() if patch.exists() else "NOT_AVAILABLE"
        (self.logs_dir / "athena-experiment.json").write_text(json.dumps(evidence, indent=2))
