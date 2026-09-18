import { Plugin } from "@opencode/plugin/tui";
import { createSignal, onCleanup, Show, For } from "solid-js";
import { athenaRpc } from "./rpc.js";

type StatusResponse = { mode: string; provider: string; providerHealthy: boolean; jevCalls: number; jevFailures: number; medianLatency: number; budgetUsed: number; budgetLimit: number };
type RecentEvent = { type: string; timestamp: string; metadata?: Record<string, unknown> };

// Event data types matching athenaRpc.events schemas
type ReflexEventData = { sessionID: string; reflex: string; decision: string; scores?: Record<string, number>; latencyMs: number };
type ReplanEventData = { replanId: string; sessionID: string; stagnationScore?: number };
type ModeChangedEventData = { mode: string };

function formatTime(ts: string): string { try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ts.slice(11, 16); } }

export default Plugin.define({
  id: "athena-tui",
  async setup(ctx) {
    const [status, setStatus] = createSignal<StatusResponse | null>(null);
    const [recentEvents, setRecentEvents] = createSignal<RecentEvent[]>([]);

    // Get typed RPC client for ATHENA server plugin
    const rpc = ctx.client.rpc(athenaRpc);

    // Subscribe to RPC events — cast event.data from unknown to typed
    const unsubReflex = rpc.events.on("reflex", (event) => {
      const d = event.data as ReflexEventData;
      setRecentEvents((prev) => [...prev.slice(-19), { type: `REFLEX ${d.reflex.toUpperCase()}`, timestamp: new Date().toISOString(), metadata: { decision: d.decision, reflex: d.reflex } }]);
    });

    const unsubReplanQueued = rpc.events.on("replanQueued", (event) => {
      const d = event.data as ReplanEventData;
      setRecentEvents((prev) => [...prev.slice(-19), { type: "REPLAN QUEUED", timestamp: new Date().toISOString(), metadata: { replanId: d.replanId } }]);
      ctx.ui.toast.show({ title: "ATHENA / METIS", message: "Semantic stagnation detected — replanning next reasoning cycle.", variant: "warning", duration: 5000 });
    });

    const unsubReplanInjected = rpc.events.on("replanInjected", (event) => {
      const d = event.data as ReplanEventData;
      setRecentEvents((prev) => [...prev.slice(-19), { type: "REPLAN INJECTED", timestamp: new Date().toISOString(), metadata: { replanId: d.replanId } }]);
    });

    const unsubModeChanged = rpc.events.on("modeChanged", (event) => {
      const d = event.data as ModeChangedEventData;
      setRecentEvents((prev) => [...prev.slice(-19), { type: "MODE CHANGED", timestamp: new Date().toISOString(), metadata: { mode: d.mode } }]);
      ctx.ui.toast.show({ title: "ATHENA", message: `Mode changed: ${d.mode.toUpperCase()}`, variant: "info", duration: 3000 });
    });

    // Poll status periodically
    const pollInterval = setInterval(async () => {
      try {
        const s = await rpc.status({});
        setStatus(s as StatusResponse);
      } catch { /* server unavailable — TUI continues */ }
    }, 5000);

    // Initial fetch
    rpc.status({}).then((s) => setStatus(s as StatusResponse)).catch(() => {});

    onCleanup(() => {
      clearInterval(pollInterval);
      unsubReflex();
      unsubReplanQueued();
      unsubReplanInjected();
      unsubModeChanged();
    });

    // Register slash commands
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "athena.open",
          title: "ATHENA: Open Control Panel",
          group: "ATHENA",
          palette: true,
          slash: { name: "athena" },
          run: () => { ctx.ui.panel.open("athena.control"); },
        },
        {
          id: "athena.status",
          title: "ATHENA: Show Status",
          group: "ATHENA",
          palette: true,
          run: () => {
            const s = status();
            const msg = s ? `ATHENA · ${s.mode.toUpperCase()} · JEV ${s.providerHealthy ? "✓" : "!"}\nCalls: ${s.jevCalls}/${s.budgetLimit} · Latency: ${s.medianLatency}ms` : "ATHENA · offline";
            ctx.ui.toast.show({ title: "ATHENA Status", message: msg, variant: "info", duration: 4000 });
          },
        },
        {
          id: "athena.mode",
          title: "ATHENA: Set Mode",
          group: "ATHENA",
          palette: true,
          slash: { name: "athena-mode", arguments: true },
          run: async (input?: string) => {
            const mode = input?.trim();
            if (mode === "shadow" || mode === "guardian" || mode === "balanced") {
              await rpc.setMode({ mode });
              setStatus({ ...status()!, mode });
              ctx.ui.toast.show({ title: "ATHENA", message: `Mode changed: ${mode.toUpperCase()}`, variant: "success", duration: 3000 });
            }
          },
        },
      ],
    }));

    // Register footer status
    ctx.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const s = status();
        return (
          <span>
            {"ATHENA"} · {(s?.mode ?? "offline").toUpperCase()} · {"JEV"} {s ? (s.providerHealthy ? "✓" : "!") : "OFF"}
            <Show when={s && s.jevCalls > 0}>
              {" "}S {s!.medianLatency}ms
            </Show>
          </span>
        );
      },
    });

    // Register panel
    ctx.ui.router.register({
      name: "athena.control",
      render: () => {
        const s = status();
        const events = recentEvents();
        return (
          <div>
            <div>{"ATHENA"} — {"Give coding agents reflexes."}</div>
            <div>{""}</div>
            <div>{"MODE"}</div>
            <div>{(s?.mode ?? "—").toUpperCase()}</div>
            <div>{""}</div>
            <div>{"PROVIDER"}</div>
            <div>{"Jev"}           {s ? (s.providerHealthy ? "Healthy" : "Degraded") : "—"}</div>
            <div>{"Median"}        {s ? `${s.medianLatency} ms` : "—"}</div>
            <div>{"Calls"}         {s ? `${s.jevCalls} / ${s.budgetLimit}` : "—"}</div>
            <div>{""}</div>
            <div>{"RECENT REFLEXES"}</div>
            <For each={events.slice(-10)}>
              {(e) => <div>{formatTime(e.timestamp)}  {e.type}</div>}
            </For>
            <Show when={events.length === 0}>
              <div>{"—"}</div>
            </Show>
          </div>
        );
      },
    });
  },
});
