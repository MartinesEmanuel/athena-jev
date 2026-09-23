# Tool Router

Tool Router asks a different question from Cognitive Control: **what capabilities should the model see for its next reasoning step?** It classifies generic families (`INSPECT`, `SEARCH`, `EDIT`, `EXECUTE`, `WEB`, `EXTERNAL`, `OTHER`), then deterministic policy maps them to host descriptors.

`off` skips routing. `observe` predicts a subset but exposes all tools. `active` applies the allowlist. Routing fails open: malformed, uncertain, or failed Jev calls expose the full original set. Keeping an extra tool is less harmful than hiding a needed tool; no token saving is claimed from tool count alone.
