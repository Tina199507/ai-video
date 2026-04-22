# @ai-video/pipeline-video

Built-in 15-pass video pipeline stage definitions and Compiler Intermediate Representation (CIR) types. This package registers all video-generation stages with `@ai-video/pipeline-core` as a side-effect of being imported.

---

## Overview

This package has two responsibilities:

1. **Stage definitions** — each of the 15 compilation passes is defined here and registered with `StageRegistry` at import time.
2. **CIR (Compiler Intermediate Representation)** — strict JSON schemas and TypeScript types for the machine-readable intermediate files produced and consumed across stages.

---

## Stage Groups

### Analysis stages (`stages/defs/analysisStages.ts`)

| Stage | Output artifact |
|-------|----------------|
| `CAPABILITY_ASSESSMENT` | `capability-assessment.json` |
| `STYLE_EXTRACTION` | `style-profile.json`, `format-signature.json` |
| `RESEARCH` | `research.json`, `research.cir.json` |

### Creation stages (`stages/defs/creationStages.ts`)

| Stage | Output artifact |
|-------|----------------|
| `NARRATIVE_MAP` | `narrative-map.json` |
| `SCRIPT_GENERATION` | `script.json`, `script.cir.json` |
| `QA_REVIEW` | `qa-review.json` |

### Visual stages (`stages/defs/visualStages.ts`)

| Stage | Output artifact |
|-------|----------------|
| `STORYBOARD` | `storyboard.cir.json`, `scenes.json` |
| `REFERENCE_IMAGE` | `reference_sheet.png` |
| `SUBJECT_ISOLATION` | `subject-isolation.json` |
| `KEYFRAME_GEN` | `assets/image_scene_N.png` |
| `VIDEO_GEN` | `assets/video_scene_N.mp4` |

### Production stages (`stages/defs/productionStages.ts`)

| Stage | Output artifact |
|-------|----------------|
| `TTS` | `assets/audio_scene_N.wav` |
| `ASSEMBLY` | `assets/final.mp4` |
| `FINAL_RISK_GATE` | `final-risk-gate.json` |
| `REFINEMENT` | `refinement.json` |

---

## Usage

Import the package as a side-effect to register all stages. Do this once at application startup, before creating a `PipelineService`:

```typescript
import '@ai-video/pipeline-video';  // registers all 15 stages

import { PipelineService } from '@ai-video/pipeline-core';
const service = new PipelineService(config);
```

The pipeline engine will then find all registered stages via `getStageDefinitions()`.

---

## CIR — Compiler Intermediate Representation

CIR files carry strict, machine-readable schemas between stages. They are validated at load time by `CIRValidationError`.

Key CIR modules:

| Module | Description |
|--------|-------------|
| `cir/types.ts` | TypeScript types for all CIR schemas |
| `cir/contracts.ts` | Runtime validation contracts |
| `cir/loader.ts` | `loadCIR<T>(path)` helper — reads + validates a CIR file |
| `cir/parsers.ts` | LLM-response → CIR parsing utilities |
| `cir/errors.ts` | `CIRValidationError` class |

### Reading a CIR in a downstream stage

```typescript
import { loadCIR } from '@ai-video/pipeline-video/cir/loader.js';
import type { ScriptCIR } from '@ai-video/pipeline-video/cir/types.js';

const script = loadCIR<ScriptCIR>(ctx.assetsDir, 'script.cir.json');
// Throws CIRValidationError if the file is missing or schema-invalid
```

---

## Adding a New Stage

See [`docs/extending.md`](../../docs/extending.md#2-adding-a-new-pipeline-stage) for the full step-by-step guide.

---

## Testing

```bash
npx vitest run packages/pipeline-video/src
```

Coverage thresholds:
- `cir/**`: 85% lines / 95% functions
- `stages/**`: 70% lines / 75% functions
