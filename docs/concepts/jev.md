# Jev and typed semantic judgment

ATHENA uses TypeSafe Jev as System 1, not as a generic chat model. It asks narrow typed questions over compact redacted state. **Noul** is the probability a proposition holds; `0.5` means uncertainty, not medium severity. **Score** is an ordered degree and is normalized by deterministic code. **Choice** selects among defined alternatives; it is a TypeSafe primitive but current ATHENA cognitive assessment primarily uses Noul and Score.

ATHENA does not ask Jev to execute tools, calculate thresholds, count tokens, reveal reasoning, or make final policy decisions. Deterministic code validates responses and applies policy.
