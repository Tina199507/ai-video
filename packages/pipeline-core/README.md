# @ai-video/pipeline-core

## Port Lifecycle Convention

`pipeline-core` external capability ports follow a strict three-phase lifecycle:

1. Configure phase (startup only): call `configurePipelineCorePorts(...)`.
2. Freeze phase (once): call `freezePipelineCorePorts()`.
3. Runtime phase: any `set*Port` / `reset*Port` call throws by design.

This protects runtime stability by preventing accidental hot replacement after server bootstrap.
