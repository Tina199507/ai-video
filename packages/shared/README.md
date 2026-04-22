# @ai-video/shared

Cross-package TypeScript type definitions shared by the backend (`apps/server`), the React UI (`apps/ui-shell`), and the Electron desktop shell (`apps/desktop`).

---

## Overview

This package has **no runtime dependencies and no internal workspace dependencies**. It contains only type definitions and a small set of runtime constants that must be consistent across all layers of the application.

| Module | Description |
|--------|-------------|
| `types` | Core domain types: `PipelineProject`, `PipelineScene`, `PipelineStage`, `ProcessStatus`, `PipelineEvent`, `ModelOverrides`, … |
| `dashboardStatus` | UI dashboard status helpers (`DashboardStatus`, `stageToStatus`) |
| `bootPhase` | Server boot-phase discriminated union (used for startup progress reporting) |

---

## Installation

Consumed via workspace symlink — no separate install needed.

```typescript
import type { PipelineProject, PipelineStage, ProcessStatus } from '@ai-video/shared';
import type { DashboardStatus } from '@ai-video/shared/dashboardStatus.js';
```

---

## Key Types

### `PipelineStage`

Union of all 15 built-in pipeline stage identifiers, plus any registered custom stages:

```typescript
type PipelineStage =
  | 'CAPABILITY_ASSESSMENT'
  | 'STYLE_EXTRACTION'
  | 'RESEARCH'
  | 'NARRATIVE_MAP'
  | 'SCRIPT_GENERATION'
  | 'QA_REVIEW'
  | 'STORYBOARD'
  | 'REFERENCE_IMAGE'
  | 'SUBJECT_ISOLATION'
  | 'KEYFRAME_GEN'
  | 'VIDEO_GEN'
  | 'TTS'
  | 'ASSEMBLY'
  | 'FINAL_RISK_GATE'
  | 'REFINEMENT';
```

### `ProcessStatus`

```typescript
type ProcessStatus = 'pending' | 'processing' | 'completed' | 'error' | 'skipped' | 'paused';
```

### `PipelineProject`

The canonical project shape shared by all layers. The backend uses `FullPipelineProject` (extends this) which adds server-side fields.

### `PipelineEvent`

Discriminated union of all SSE events emitted by the pipeline engine:

```typescript
type PipelineEvent =
  | { type: 'stage';    payload: { stage: PipelineStage; status: ProcessStatus; … } }
  | { type: 'artifact'; payload: { stage: PipelineStage; filename: string } }
  | { type: 'error';    payload: { stage: PipelineStage; message: string } }
  | { type: 'log';      payload: LogEntry };
```

---

## Adding New Shared Types

1. Add your type to `packages/shared/src/types.ts` (or a new sub-module if the type is large).
2. Re-export it from `packages/shared/src/index.ts`.
3. Both `apps/server` and `apps/ui-shell` will pick up the change automatically via the workspace symlink.

Keep this package **purely declarative** — no logic, no async code, no Node.js built-ins.
