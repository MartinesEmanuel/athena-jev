# Cognitive runtime

The OpenCode runtime captures a bounded prompt, assesses each candidate through `CognitiveRuntime.before`, records tool observations through `after`, and projects sanitized UI snapshots. Provider and UI failures are isolated from UI observers.

Related: [documentation index](../README.md)
