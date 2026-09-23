import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { RGBA } from "@opentui/core";
import { athenaUiPhaseSymbol, type AthenaUiJev, type AthenaUiPhase, type AthenaUiSession, type AthenaUiSnapshot, type AthenaUiToolRouter } from "@athena/hud-protocol";
import { athenaRpc } from "../../shared/rpc.js";

/** White + blue only: quiet, readable, and non-interruptive. */
const ACCENT = "#4f8cff";
const BRIGHT = "#f7f9ff";
const SEED_ATTEMPTS = 5;
const SEED_BASE_DELAY_MS = 250;
const TIMELINE_SHOWN = 12;

type Color = string | RGBA;
type StatusResponse = { mode: string };

const EMPTY_SESSION: AthenaUiSession = { cycles: 0, deliberations: 0, verifications: 0, blocks: 0, strategyShifts: 0 };
const EMPTY_JEV: AthenaUiJev = { requests: 0 };
const EMPTY_ROUTER: AthenaUiToolRouter | undefined = undefined;


/**
 * Only these three transitions may interrupt the operator.
 * GO never toasts: permissive flow is the expected flow.
 */
const PHASE_TOASTS: Partial<Record<AthenaUiPhase, { title: string; message: string; variant: "warning" | "error" }>> = {
  DELIBERATE: { title: "ATHENA · METIS", message: "Strategy reconsidered", variant: "warning" },
  VERIFY: { title: "ATHENA · NIKE", message: "Verification required", variant: "warning" },
  BLOCK: { title: "ATHENA · AEGIS", message: "Action blocked", variant: "error" },
};

function symbol(phase: AthenaUiPhase): string {
  return athenaUiPhaseSymbol[phase];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function domainRow(label: string, value?: string): string {
  return `${label.padEnd(10, " ")}${value ?? "—"}`;
}

function valueColor(value: string | undefined, subdued: Color): Color {
  if (!value) return subdued;
  return BRIGHT;
}

function phaseColor(phase: AthenaUiPhase): Color { void phase; return ACCENT; }

function shiftRow(visible: boolean) {
  return visible ? <text fg={ACCENT}>{"  ↳ STRATEGY SHIFT"}</text> : null;
}

function decisionRow(decision: string | undefined, subdued: Color) {
  return decision ? <text fg={subdued}>{`last          ${decision}`}</text> : null;
}

function noticeRow(notice: string | null) {
  return notice ? <text fg={BRIGHT}>{notice}</text> : null;
}

function decisionLabel(current: AthenaUiSnapshot): string | undefined {
  const decision = current.lastDecision?.decision;
  return decision && current.enforcementMode === "observe" && decision !== "GO" ? `WOULD ${decision}` : decision;
}

export default Plugin.define({
  id: "athena-tui",
  async setup(ctx) {
    const cleanups: Array<() => void> = [];
    const [snapshot, setSnapshot] = createSignal<AthenaUiSnapshot | null>(null);
    const [mode, setMode] = createSignal<string | null>(null);
    const [seededSession, setSeededSession] = createSignal<string | null>(null);
    const [knownRef, setKnownRef] = createSignal<string | null>(null);
    const [shiftVisible, setShiftVisible] = createSignal(false);
    const [notice, setNotice] = createSignal<string | null>(null);

    // Toast policy state: only transitions interrupt.
    let previousPhase: AthenaUiPhase | null = null;
    // STRATEGY SHIFT note: appears on a shift, clears once a later cycle lands.
    let lastShifts = 0;
    let shiftAtCycles: number | null = null;

    const subdued = ctx.theme.text.subdued;
    const rpc = ctx.client.rpc(athenaRpc);

    function track(next: AthenaUiSnapshot): void {
      const counters = next.session ?? EMPTY_SESSION;
      if (counters.strategyShifts > lastShifts) shiftAtCycles = counters.cycles;
      lastShifts = counters.strategyShifts;
      if (shiftAtCycles !== null && counters.cycles > shiftAtCycles) shiftAtCycles = null;
      setShiftVisible(shiftAtCycles !== null);
    }

    function accept(next: AthenaUiSnapshot | null, adoptRef: boolean): void {
      if (!next) return;
      if (adoptRef && !knownRef()) setKnownRef(next.sessionRef);
      track(next);
      const previous = previousPhase;
      previousPhase = next.phase;
      setSnapshot(next);
      // Interrupt only when escalating into one of the three critical phases.
      if (previous === null || previous === next.phase) return;
      const toast = PHASE_TOASTS[next.phase];
      if (!toast) return;
      try {
        ctx.ui.toast.show({ ...toast, duration: 5000 });
      } catch {
        // A toast failure must never disturb the UI or cognition.
      }
    }

    async function seed(sessionID: string): Promise<void> {
      if (!sessionID || seededSession() === sessionID) return;
      setSeededSession(sessionID);
      for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt++) {
        try {
          const result = (await rpc.snapshot({ sessionID })) as { snapshot: AthenaUiSnapshot | null };
          accept(result.snapshot, true);
          break;
        } catch {
          // The server may still be registering the ATHENA RPC — bounded retry only.
          if (attempt === SEED_ATTEMPTS - 1) break;
          await delay(SEED_BASE_DELAY_MS * 2 ** attempt);
        }
      }
      try {
        const status = (await rpc.status({})) as StatusResponse;
        if (status?.mode) setMode(status.mode);
      } catch {
        // Mode is cosmetic; the panel works without it.
      }
    }

    function ensureSeeded(sessionID: string | undefined): void {
      if (!sessionID) return;
      void seed(sessionID).catch(() => undefined);
    }

    // Live event subscription. Polling is never the primary experience.
    try {
      cleanups.push(
        rpc.events.on("snapshot", (event) => {
          try {
            const data = event.data as { snapshot: AthenaUiSnapshot | null };
            const next = data.snapshot;
            if (!next) return;
            const ref = knownRef();
            if (ref) {
              if (next.sessionRef !== ref) return; // another session's telemetry
              accept(next, false);
              return;
            }
            // No known ref yet: adopt only after the seed pass has finished.
            if (seededSession()) accept(next, true);
          } catch {
            // Malformed telemetry is dropped, never rendered.
          }
        }),
      );
    } catch {
      // Live events unavailable: the bounded seed fetch still fills the panel.
    }

    try {
      cleanups.push(
        rpc.events.on("modeChanged", (event) => {
          const data = event.data as { mode?: string };
          if (data?.mode) {
            setMode(data.mode);
            setNotice(null);
          }
        }),
      );
    } catch {
      // Optional decoration.
    }

    // Server-side `/athena` (official `ctx.command.transform`): the server
    // emits `panelRequested` over RPC and the TUI opens the expanded panel.
    try {
      cleanups.push(
        rpc.events.on("panelRequested", () => {
          try {
            ctx.ui.panel.open("athena.session");
          } catch {
            // A panel failure must never disturb the UI or cognition.
          }
        }),
      );
    } catch {
      // Events unavailable: sidebar and footer still work.
    }

    // Server-side `/athena-mode`: inline notice for invalid input.
    try {
      cleanups.push(
        rpc.events.on("commandNotice", (event) => {
          const data = event.data as { message?: string };
          if (data?.message) setNotice(data.message);
        }),
      );
    } catch {
      // Optional decoration.
    }

    // Compact sidebar panel: identity, phase, four domains, counters.
    try {
      cleanups.push(
        ctx.ui.slot({
          append: "sidebar.content",
          render: (input) => {
            ensureSeeded(input.sessionID);
            const current = snapshot();
            if (!current) {
              return (
                <box flexDirection="column" paddingX={1} width="100%">
                  <text fg={ACCENT}>{"ATHENA"}</text>
                  <text fg={ACCENT}>{"● READY"}</text>
                </box>
              );
            }
            const counters = current.session ?? EMPTY_SESSION;
            const jev = current.jev ?? EMPTY_JEV;
            const router = current.toolRouter ?? EMPTY_ROUTER;
            return (
              <box flexDirection="column" paddingX={1} width="100%">
                <text fg={ACCENT}>{"ATHENA"}</text>
                <text fg={ACCENT}>{`${symbol(current.phase)} ${decisionLabel(current) ?? current.phase}`}</text>
                <text fg={subdued}>{""}</text>
                <text fg={BRIGHT}>{domainRow("AEGIS", current.aegis)}</text>
                <text fg={BRIGHT}>{domainRow("METIS", current.metis)}</text>
                {shiftRow(shiftVisible())}
                <text fg={BRIGHT}>{domainRow("NIKE", current.nike)}</text>
                <text fg={BRIGHT}>{domainRow("EPISTEMICS", current.epistemics)}</text>
                {current.enforcementMode ? <text fg={subdued}>{`MODE       ${current.enforcementMode.toUpperCase()}`}</text> : null}
                <text fg={subdued}>
                  {`cycles ${counters.cycles} · delib ${counters.deliberations} · ver ${counters.verifications} · block ${counters.blocks}`}
                </text>
                <text fg={subdued}>{`jev ${jev.requests}${jev.latencyMs === undefined ? "" : ` · ${jev.latencyMs}ms`}`}</text>
                {router ? <text fg={ACCENT}>{`TOOLS      ${router.selected}/${router.total} · ${router.mode}`}</text> : null}
                <text fg={subdued}>{`CYCLES     ${counters.cycles}`}</text>
                <text fg={subdued}>{`JEV        ${jev.latencyMs === undefined ? "—" : `${jev.latencyMs} ms`}`}</text>
                {decisionLabel(current) ? <text fg={BRIGHT}>{`LAST       ${decisionLabel(current)}`}</text> : null}
              </box>
            );
          },
        }),
      );
    } catch {
      // Sidebar unavailable: footer and panel still work.
    }

    // Footer status: ATHENA + current phase symbol.
    try {
      cleanups.push(
        ctx.ui.slot({
          append: "prompt.footer.status",
          render: (input) => {
            ensureSeeded(input.sessionID);
            const current = snapshot();
            if (!current) {
              return <text fg={ACCENT}>{"ATHENA ◌ idle"}</text>;
            }
            const label = mode();
            return (
              <text fg={phaseColor(current.phase)}>
                {`ATHENA  ${symbol(current.phase)} ${decisionLabel(current) ?? current.phase}${label ? ` · ${label.toUpperCase()}` : ""}`}
              </text>
            );
          },
        }),
      );
    } catch {
      // Footer unavailable: panel unaffected.
    }

    // Expanded view opened by /athena.
    try {
      cleanups.push(
        ctx.ui.slot({
          append: "session.panel",
          render: (panel) => {
            if (panel.name !== "athena.session") return null;
            // The host focuses the panel while it is open: Escape returns
            // input to the prompt through the documented close channel.
            useKeyboard((event) => {
              if (event.name !== "escape") return;
              try {
                panel.close();
              } catch {
                // Closing must never throw into the host.
              }
            });
            ensureSeeded(panel.sessionID);
            const current = snapshot();
            if (!current) {
              return (
                <box flexDirection="column" paddingX={2} paddingY={1}>
                  <text fg={ACCENT}>{"ATHENA"}</text>
                  <text fg={subdued}>{"● ready for task observation"}</text>
                </box>
              );
            }
            const counters = current.session ?? EMPTY_SESSION;
            const jev = current.jev ?? EMPTY_JEV;
            const router = current.toolRouter ?? EMPTY_ROUTER;
            const shown = current.timeline.slice(-TIMELINE_SHOWN);
            const label = mode();
            return (
              <box flexDirection="column" paddingX={2} paddingY={1}>
                <text fg={ACCENT}>{"ATHENA"}</text>
                <text fg={phaseColor(current.phase)}>{`${symbol(current.phase)} ${current.phase}`}</text>
                <text>{" "}</text>
                <text fg={valueColor(current.aegis, subdued)}>{domainRow("AEGIS", current.aegis)}</text>
                <text fg={valueColor(current.metis, subdued)}>{domainRow("METIS", current.metis)}</text>
                {shiftRow(shiftVisible())}
                <text fg={valueColor(current.nike, subdued)}>{domainRow("NIKE", current.nike)}</text>
                <text fg={valueColor(current.epistemics, subdued)}>{domainRow("EPISTEMICS", current.epistemics)}</text>
                <text>{" "}</text>
                <text fg={subdued}>{`cycles       ${counters.cycles}`}</text>
                <text fg={subdued}>{`deliberations ${counters.deliberations}`}</text>
                <text fg={subdued}>{`verifications ${counters.verifications}`}</text>
                <text fg={subdued}>{`blocked       ${counters.blocks}`}</text>
                <text fg={subdued}>{`strategy      ${counters.strategyShifts}`}</text>
                <text>{" "}</text>
                <text fg={subdued}>{`jev calls     ${jev.requests}`}</text>
                <text fg={subdued}>{`jev latency   ${jev.latencyMs === undefined ? "—" : `${jev.latencyMs}ms`}`}</text>
                <text fg={subdued}>{`mode          ${(label ?? "—").toUpperCase()}`}</text>
                {router ? <><text>{" "}</text><text fg={ACCENT}>{"TOOL ROUTER"}</text><text fg={subdued}>{`mode          ${router.mode}`}</text><text fg={subdued}>{`visible       ${router.visible}`}</text><text fg={subdued}>{`selected      ${router.selected}`}</text><text fg={subdued}>{`total         ${router.total}`}</text></> : null}
                <text>{" "}</text>
                <text fg={subdued}>{"timeline"}</text>
                <text fg={ACCENT}>{shown.map((phase) => symbol(phase)).join(" ")}</text>
                {decisionRow(decisionLabel(current), subdued)}
                {current.lastDecision?.shortReason ? <text fg={subdued}>{`             ${current.lastDecision.shortReason}`}</text> : null}
                {noticeRow(notice())}
              </box>
            );
          },
        }),
      );
    } catch {
      // Panel unavailable: sidebar and footer unaffected.
    }

    return () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Teardown must never throw into the host.
        }
      }
    };
  },
});
