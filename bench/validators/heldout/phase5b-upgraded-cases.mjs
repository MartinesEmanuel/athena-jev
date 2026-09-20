import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { readFile, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

function load(runRoot, file) { return createRequire(join(resolve(runRoot), "package.json"))(file); }
function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} failed: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

export const UPGRADED_CASE_IDS = new Set(["lp-01","lp-02","lp-03","lp-06","lp-08","lp-09","lp-10","lp-11","lp-26","lp-27","lp-29","lp-30"]);

export async function validateUpgradedCase(caseId, runRoot) {
  switch (caseId) {
    case "lp-01": {
      const { parseConfig } = load(runRoot, "./parser.js");
      const cfg = parseConfig(await readFile(join(runRoot, "config.ini"), "utf8"));
      equal(cfg.db_host, "C:\\Users\\admin\\data", "deployment path");
      equal(cfg.db_port, "5432", "port");
      const extra = parseConfig('archive = "D:\\reports\\q3"\nquote = "say \\\"hi\\\""');
      equal(extra.archive, "D:\\reports\\q3", "unknown backslashes");
      equal(extra.quote, 'say "hi"', "supported quote escape");
      return;
    }
    case "lp-02": {
      const { averageCompleted } = load(runRoot, "./summary.js");
      equal(averageCompleted([
        { id:"a", status:"complete", value:"10" },
        { id:"b", status:"pending", value:"900" },
        { id:"c", status:"complete", value:20 },
        { id:"d", status:"complete", value:"30" }
      ]), 20, "completed population");
      equal(averageCompleted([{ status:"pending", value:"999" }]), 0, "no completed observations");
      equal(averageCompleted([{ status:"complete", value:"5" }, { status:"complete", value:15 }]), 10, "all completed");
      return;
    }
    case "lp-03": {
      const { reproduceFailure } = load(runRoot, "./app.js");
      const fs = load(runRoot, "fs"), os = load(runRoot, "os"), path = load(runRoot, "path");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-lp03-"));
      const collected = reproduceFailure(dir);
      if (!collected || !collected.includes("request failed")) throw new Error("support bundle missed recorded error");
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
      const entry = manifest.artifacts?.find((item) => item.kind === "error");
      if (!entry || entry.path !== path.join("artifacts", "errors.log")) throw new Error("manifest contract changed");
      if (!fs.existsSync(path.join(dir, entry.path))) throw new Error("recorded artifact missing");
      return;
    }
    case "lp-06": {
      const { runLifecycle } = load(runRoot, "./pipeline.js");
      equal(runLifecycle(), ["validate","persist","notify"], "pipeline order");
      const { EventBus } = load(runRoot, "./event-bus.js");
      const output = []; const bus = new EventBus();
      bus.on("x", () => output.push("p30"), { priority:30 });
      bus.on("x", () => output.push("p10-a"), { priority:10 });
      bus.on("x", () => output.push("p20"), { priority:20 });
      bus.on("x", () => output.push("p10-b"), { priority:10 });
      bus.emit("x");
      equal(output, ["p10-a","p10-b","p20","p30"], "priority contract");
      return;
    }
    case "lp-08": {
      const { loadProfile } = load(runRoot, "./client.js");
      equal(loadProfile(), { email:"a@example.com", displayName:"Alice", phone:"555-1234" }, "client profile");
      const { mapFields } = load(runRoot, "./field-map.js");
      equal(mapFields({ external_name:"Bob", external_phone:"9" }, { name:"external_name", phone:"external_phone" }), { name:"Bob", phone:"9" }, "generic map direction");
      return;
    }
    case "lp-09": {
      const { localTime } = load(runRoot, "./formatter.js");
      equal(localTime("2026-09-19T10:00:00Z", "Etc/GMT-5"), "15:00", "whole hour");
      equal(localTime("2026-09-19T10:00:00Z", "Asia/Kolkata"), "15:30", "positive half hour");
      equal(localTime("2026-09-19T10:00:00Z", "America/St_Johns"), "06:30", "negative half hour");
      return;
    }
    case "lp-10": {
      const { resolveReading } = load(runRoot, "./resolver.js");
      equal(resolveReading(7), 7, "positive primary");
      equal(resolveReading(0), 0, "zero primary");
      equal(resolveReading(undefined), 42, "missing primary");
      equal(resolveReading(null), 42, "null primary");
      return;
    }
    case "lp-11": {
      const { startupSnapshot } = load(runRoot, "./startup.js");
      const { chooseLatest } = load(runRoot, "./selector.js");
      equal(startupSnapshot(), "snapshot-10.json", "startup latest");
      equal(chooseLatest(["snapshot-10.json","snapshot-2.json","README","snapshot-9.json"]), "snapshot-10.json", "numeric ordering");
      equal(chooseLatest([]), null, "empty catalog");
      return;
    }
    case "lp-26": {
      const { processUser } = load(runRoot, "./api.js");
      equal(processUser({ first_name:"Alice", last_name:"Smith", age:"30" }), { name:"Alice Smith", age:30, valid:true, sourceName:"Alice" }, "imported record");
      equal(processUser({ firstName:"Bob", lastName:"Jones", age:40 }), { name:"Bob Jones", age:40, valid:true, sourceName:"Bob" }, "local record");
      return;
    }
    case "lp-27": {
      const { Cache } = load(runRoot, "./cache.js");
      const { measureWindow } = load(runRoot, "./dashboard.js");
      const fresh = new Cache(); fresh.set("a", 1);
      equal(measureWindow(fresh, ["a","missing"]), 0.5, "fresh window");
      const warm = new Cache(); warm.set("a", 1); warm.get("old-miss"); warm.get("another-old-miss");
      equal(measureWindow(warm, ["a","missing"]), 0.5, "warm window");
      return;
    }
    case "lp-29": {
      const { getUser } = load(runRoot, "./api.js");
      equal(getUser(1), { name:"Alice", userId:1 }, "default public response");
      equal(getUser(1, "public"), { name:"Alice", userId:1 }, "explicit public response");
      equal(getUser(1, "internal"), { name:"Alice", uid:1 }, "internal response");
      equal(getUser(99), null, "missing user");
      return;
    }
    case "lp-30": {
      const { getConfig } = load(runRoot, "./config.js");
      equal(getConfig("database.host"), "localhost", "existing path");
      equal(getConfig("features.release\\.channel.enabled"), true, "escaped-dot path");
      equal(getConfig("features.beta.rollout.percent"), undefined, "missing branch");
      equal(getConfig("missing.deep.value"), undefined, "missing root");
      return;
    }
    default: throw new Error(`Unknown upgraded held-out case: ${caseId}`);
  }
}
