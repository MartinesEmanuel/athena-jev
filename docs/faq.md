# FAQ

## Does ATHENA replace OpenCode?
No. It is a host-integrated control layer.

## Does it read chain-of-thought?
No. ATHENA is designed not to store or request it.

## Why observe mode?
It enables measurement without interrupting agents.

## Can it block actions?
Yes, only when enforcement is `enforce`.

## What if Jev fails?
Router failure exposes all tools; cognitive assessment failure enters its documented degraded/error path.

## Does Tool Router save tokens?
It can reduce exposed tool count, but no token saving claim is made without host accounting.

## Why is the V2 TODO panel missing?
The installed official V2 API does not expose tasks. V1 exposes `state.session.todo(sessionID)`, but ATHENA will not invent V2 support.

## Is ATHENA scientifically validated?
Not as a general performance claim. See [current evidence](research/current-evidence.md).

## How do I remove it?
Run `athena uninstall --purge`.
