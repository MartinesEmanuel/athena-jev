# ATHENA Tool Router

ATHENA Tool Router uses Jev to identify the smallest useful capability set for the agent’s next reasoning step, reducing unnecessary tool exposure while failing open whenever routing is uncertain.

It is separate from Cognitive Control: the router minimizes what the model sees before inference; Cognitive Control remains responsible for GO, DELIBERATE, VERIFY, and BLOCK when an action is proposed.

`toolRouter.mode` defaults to `observe`. `off` makes no router calls, `observe` records the predicted subset without changing host tools, and `active` applies the deterministic allowlist. It reports structural tool-count reduction only, not token savings.

OpenCode V2 uses the official mutable `session.context` hook. V1 is preserved unchanged because its compatible API does not provide an equivalent safe pre-model mutable tool context.
