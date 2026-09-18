# Policies

Policy maps probabilities to `allow`, `ask`, `deny`, or `replan`. Thresholds live in `.athena/config.json`. Shadow records would-be decision. Guardian intervenes for hard rules and very high risk. Balanced applies all enabled decisions.

Semantic scores must be valid probabilities. Very high scores may intervene in guardian or balanced mode; uncertain scores remain observed unless configured threshold is crossed. Per-session Jev budget and stagnation scheduling prevent pathological calls. Replan cooldown requires further meaningful actions before another recommendation.
