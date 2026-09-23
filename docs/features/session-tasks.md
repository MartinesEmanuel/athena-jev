# Session tasks — blocked by OpenCode V2 host API

The installed official OpenCode V2 plugin and client APIs do **not** expose session todo/task state or task events. ATHENA therefore does not render a V2 task list. It refuses to scrape private internals, poll undocumented state, or maintain a duplicate todo store.

The installed V1 TUI declaration exposes `state.session.todo(sessionID)`, but V2 has no equivalent official surface. ATHENA will not force a V1-only architecture into V2. This feature is planned and blocked by host API.

Related: [documentation index](../README.md)
