# Decisions and host enforcement

`GO` allows a candidate. `DELIBERATE` requests a strategy reconsideration. `VERIFY` requests evidence before proceeding or claiming completion. `BLOCK` rejects an unsafe or policy-violating candidate when enforcement is active.

A cognitive decision is not the same as host enforcement. In observe mode, ATHENA records the honest decision and UI displays **WOULD DELIBERATE**, **WOULD VERIFY**, or **WOULD BLOCK**, while the host continues. In enforce mode, the historical intervention behavior is authoritative.
