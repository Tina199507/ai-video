# Service Contracts Documentation

This document defines the interface contracts for the core services in the Video Studio AI pipeline. All services must adhere to these signatures to ensure type safety and predictable behavior in the Workflow Orchestrator.

## 1. Analysis Service (`src/services/analysis.ts`)

Responsible for extracting style DNA from input video or text.

```typescript
export async function analyzeStyle(
  videoInput: File | string | null,
  referenceText: string = "",
  topic: string = "",
  onProgress?: (msg: string) => void,
  language: string = 'en',
  modelName: string = ModelType.ANALYSIS
): Promise<StyleProfile>
```

**Output:** `StyleProfile` (see `src/types/models.ts`)

## 2. Planning Service (`src/services/planning.ts`)

Responsible for determining video structure, pacing, and duration based on style.

```typescript
export function planGeneration(styleProfile: StyleProfile): GenerationPlan
```

**Output:** `GenerationPlan` { factsCount, sequenceCount, estimatedSceneCount, targetSceneDuration, targetWPM, audienceFactor, reasoning }

## 3. Research Service (`src/services/research.ts`)

Responsible for gathering facts and arbitrating truth.

```typescript
export async function performResearch(
    topic: string, 
    language: string = 'en', 
    modelName: string = ModelType.RESEARCH, 
    styleProfile?: StyleProfile
): Promise<ResearchData>

export async function extractClaims(scriptText: string, modelName?: string): Promise<string[]>
export async function validateClaims(claims: string[], trustedFacts: Fact[], modelName?: string): Promise<{ valid: string[], conflicts: string[] }>
```

**Output:** `ResearchData` { facts, myths, glossary, rawGroundingMetadata }

## 4. Scripting Service (`src/services/scripting.ts`)

Responsible for narrative structure and script generation.

```typescript
export async function generateNarrativeMap(
  topic: string,
  styleProfile: StyleProfile,
  researchData: ResearchData,
  language: string = 'en',
  modelName: string = ModelType.SCRIPTING
): Promise<NarrativeMap>

export async function generateDraftScript(
  topic: string,
  styleProfile: StyleProfile,
  researchData: ResearchData,
  narrativeMap: NarrativeMap,
  language: string = 'en',
  modelName: string = ModelType.SCRIPTING
): Promise<ScriptOutput>

export async function generateStoryboard(
  topic: string,
  styleProfile: StyleProfile,
  scriptText: string,
  language: string = 'en',
  modelName: string = ModelType.SCRIPTING
): Promise<Scene[]>
```

**Output:** `ScriptOutput` { scriptText, scenes, safetyMetadata, ... }

## 5. Production Service (`src/services/production.ts`)

Responsible for visual asset generation.

```typescript
export async function generateReferenceSheet(
  topic: string,
  styleProfile: StyleProfile,
  aspectRatio: "16:9" | "9:16" = "16:9",
  modelName: string = ModelType.IMAGE_GEN,
  onProgress?: (msg: string) => void
): Promise<string> // Returns URL

export async function generateSceneImage(
  visualPrompt: string,
  aspectRatio: "16:9" | "9:16",
  isCharacterFocused: boolean,
  referenceSheetUrl: string | undefined,
  styleProfile: StyleProfile,
  topic: string,
  useFastMode: boolean = false,
  modelName: string = ModelType.IMAGE_GEN,
  onProgress?: (msg: string) => void
): Promise<string> // Returns URL

export async function generateSceneVideoWithKeyframe(
  visualPrompt: string,
  existingKeyframeUrl: string | undefined,
  referenceSheetUrl: string | undefined,
  onProgress: ((msg: string) => void) | undefined,
  styleProfile: StyleProfile,
  topic: string,
  useFastMode: boolean = false,
  videoModelName: string = "veo-3.1-generate-preview",
  imageModelName: string = ModelType.IMAGE_GEN
): Promise<{ videoUrl: string, keyframeUrl: string }>
```

## 6. Model Strategy Service (`src/services/modelStrategy.ts`)

Responsible for selecting the appropriate model for each stage.

```typescript
export class ModelStrategy {
  static getModelForStage(stage: PipelineStage, quality: QualityLevel): ModelSelection
  static getFallbackModel(stage: PipelineStage, currentModel: string): ModelSelection | null
}
```

## 7. Observability Service (`src/services/observability.ts`)

Responsible for logging and monitoring.

```typescript
export class ObservabilityService {
  logLLMCall(stage: string, model: string, latencyMs: number, success: boolean, metadata?: any): void
  logQualityMetric(metric: string, value: number, context?: string): void
  logSafety(category: string, isRisk: boolean, details?: string): void
}
```

## 8. Storage Service (`src/services/storage.ts`)

Responsible for persistence and versioning.

```typescript
export async function saveVersionedScript(scriptId: string, content: any, tag?: string): Promise<string>
export async function getScriptHistory(scriptId: string): Promise<ScriptVersion[]>
export async function rollbackScript(versionId: string): Promise<any | null>
export async function saveProjectCheckpoint(state: AppState): Promise<void>
```
