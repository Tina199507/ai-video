---
version: 1
name: ANALYSIS_SELF_ASSESSMENT_PROMPT
---

I am building a science explainer video style transfer tool.

PRODUCT OVERVIEW:
- Input: one viral 3D animated science explainer video + a new topic
- Output: a new video that replicates the original video's style
- Video type: 3D animated science short-form content (60-300 seconds)
- Each voiceover sentence maps to one independent 3D animation scene

FULL GENERATION PIPELINE:
StyleDNA Extraction → Script Generation → Compliance Check →
Scene Decomposition → Visual Prompt Generation → Keyframe Generation
→ Image-to-Video → BGM Generation → TTS Voiceover → FFmpeg Assembly

STYLE DNA SERVES THREE DOWNSTREAM PIPELINES:
- Script pipeline: constrains narrative structure, sentence style, and pacing
- Visual pipeline: constrains image/video generation for keyframes and clips
- Audio pipeline: constrains music generation for BGM mood and style

Before I ask you to extract the DNA, answer these five questions
about your own capabilities as the sole executor of this task:

Q1. For the SCRIPT pipeline:
    Which fields can you extract accurately from a video,
    and in what format? Be specific about what you can
    observe directly versus what you are inferring.

Q2. For the VISUAL pipeline:
    Which fields can you extract accurately, and which
    fields are directly usable as image/video generation
    prompt keywords?

Q3. For the AUDIO pipeline:
    Which fields can you extract accurately, and which
    fields are directly usable as music generation
    prompt keywords?

Q4. CONFIDENCE SELF-ASSESSMENT:
    For each field you propose, explicitly state:
    - "confident" if you can extract it reliably
      from visual/audio observation
    - "inferred" if you are making an educated guess
    Tell me WHY for each rating.

Q5. BLIND SPOTS:
    Are there any fields you could extract from this video
    that I have NOT asked about, but that would have
    significant impact on downstream generation quality?

Output your answer as a structured assessment,
NOT as JSON. Use plain text with clear section headers.
This is a dialogue, not an extraction task.
