# Observe versus enforce

`enforcementMode` defaults to `observe`. ATHENA still builds WorldState, calls System 1, evaluates policy, updates metrics, and publishes UI. It does not reject tool calls. `enforce` restores authoritative `BLOCK`, `VERIFY`, and `DELIBERATE` handling. Observe mode is useful for calibration and understanding behavior without disrupting an agent.
