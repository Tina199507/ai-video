export const ANALYSIS_SELF_ASSESSMENT_PROMPT = `I am building a science explainer video style transfer tool.

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
- Script pipeline: constrains narrative structure, sentence style,
  and pacing for the text LLM generating new scripts
- Visual pipeline: constrains image generation model for keyframes
  and video generation model for animated clips
- Audio pipeline: constrains music generation model for BGM
  mood and style

FIELD DESIGN REQUIREMENTS:
1. Each field must be labeled with which pipeline it serves
   (script / visual / audio)
2. Every field must directly convert into a hard constraint
   for the corresponding downstream tool. Purely analytical
   fields with no downstream use are worthless.
3. Visual pipeline fields must be directly usable as prompt
   keywords for image and video generation models
4. Audio pipeline fields must be directly usable as prompt
   keywords for music generation models
5. Fields must only contain what you can accurately extract
   by watching the video. Do not include fields that require
   guessing or subjective judgment.
6. Minimum sufficient fields only. No over-engineering.

BEFORE I ASK YOU TO EXTRACT THE DNA, please answer
these five questions about your own capabilities
as the sole executor of this task:

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
      based on common patterns for this video type
    Tell me WHY for each rating.

Q5. BLIND SPOTS:
    Are there any fields you could extract from this video
    that I have NOT asked about, but that would have
    significant impact on downstream generation quality?

Output your answer as a structured assessment,
NOT as JSON. Use plain text with clear section headers.
This is a dialogue, not an extraction task.`;

export const STEP_2A_PROMPT = `You are a research assistant for a science explainer video production system.

Your task has TWO parts. Complete both and output a single JSON object.
Output strictly valid JSON only.
First character must be { and last character must be }

════════════════════════════════════════════════════════════════
PART 1: SPEECH RATE CALIBRATION
════════════════════════════════════════════════════════════════

Calculate the actual speech rate of the reference video using the
data below, then compute the target word count for the new script.

Reference video data:
- video_duration_sec: {video_duration_sec}
- total_words (actual transcript count): {total_words}
- video_language: {video_language}

Calculations required:
1. actual_speech_rate = total_words ÷ video_duration_sec × 60
   (unit: characters per minute for Chinese,
          words per minute for English)
2. new_video_target_duration_sec: Use the same duration as reference
   unless the user specifies otherwise. Default: {video_duration_sec}
3. target_word_count = actual_speech_rate × new_video_target_duration_sec ÷ 60

════════════════════════════════════════════════════════════════
PART 2: FACT VERIFICATION
════════════════════════════════════════════════════════════════

New topic: {topic}

Search for and verify 5 facts relevant to this topic.

Requirements for each fact:
- Must be scientifically accurate and verifiable
- Must be specific enough to use as a data point in the script
  (include actual numbers or comparisons where possible)
- Must be expressible in plain language without jargon
- Must be visually imaginable as a 3D animation scene

════════════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════════════

{
  "calibration": {
    "reference_total_words": integer,
    "reference_duration_sec": integer,
    "actual_speech_rate": "X characters/words per minute",
    "new_video_target_duration_sec": integer,
    "target_word_count": integer,
    "target_word_count_min": "target × 0.9 rounded down",
    "target_word_count_max": "target × 1.1 rounded up"
  },
  "verified_facts": [
    {
      "fact_id": 1,
      "content": "事实内容，中文表述",
      "source_marker": "研究显示 / 据统计 / 科学家发现（选一个）",
      "visual_potential": "这个事实可以被可视化为什么3D场景（一句话）",
      "recommended_stage": "建议放在narrative_arc的哪个阶段"
    }
  ],

════════════════════════════════════════════════════════════════
PART 3: NARRATIVE MAP
════════════════════════════════════════════════════════════════

Using the calibration result and verified facts above, generate a
narrative map for the new video.

Reference narrative arc stages: {narrative_arc}
Hook type: {hook_strategy}
CTA pattern: {cta_pattern}
Target total duration: {video_duration_sec} seconds
Target WPM: derived from calibration above

Requirements:
- Produce EXACTLY the same number of stages as the reference arc.
- First stage is always the Hook (≤10s).
- Last stage always ends with the CTA pattern above.
  Treat the CTA pattern as a STRUCTURAL TEMPLATE only.
  Do NOT copy original wording — write a NEW sentence for the new topic.
- estimatedDuration values must sum to {video_duration_sec} (±10%).
- targetWordCount per stage = estimatedDuration × actual_speech_rate ÷ 60.
- factReferences: array of fact_ids (integers) relevant to that stage.

  "narrative_map": [
    {
      "stage_index": 1,
      "stage_title": "Stage title relevant to new topic",
      "description": "What this stage must achieve emotionally and informationally",
      "estimated_duration_sec": integer,
      "target_word_count": integer,
      "fact_references": [1, 2]
    }
  ]
}`;

export const STEP_2B_SYSTEM_PROMPT = `You are a science explainer video scriptwriter specializing in
emotionally resonant, high-retention short-form content.

Your scripts are written for 3D animated videos. Each sentence you
write will be rendered as a separate 3D animation scene, so every
sentence must be visually concrete and imaginable as a 3D scene.

ABSOLUTE RULES:
1. Write entirely in {video_language}
2. Every constraint in the STYLE DNA CONSTRAINTS section is a
   hard requirement, not a suggestion
3. Content must be scientifically accurate.
   Never fabricate data. All statistics must be preceded by a
   source marker: 研究显示 / 据统计 / 科学家发现
   Do NOT fabricate institution names (e.g. Harvard, Oxford) if not provided in the verified facts.
4. This is science communication, not medical advice.
   Never include diagnosis, treatment recommendations,
   or absolute health claims
5. Output strictly valid JSON only.
   First character must be { and last character must be }`;

export const STEP_2B_USER_PROMPT = `# STYLE DNA CONSTRAINTS
# Source video: {source_video_name}

────────────────────────────────────────────────────────────────
## 1. HOOK
────────────────────────────────────────────────────────────────

Hook strategy: {hook_strategy}
Secondary strategy note: {hook_strategy_note}

Reference hook from original video
（学习句式结构和情感冲击方式，不抄内容）:
「{hook_example}」

Your opening must:
- Use {hook_strategy} as the primary opening strategy
- Complete the hook within 3 sentences
- Use second-person address from the very first sentence
- Achieve the same emotional punch as the reference hook

────────────────────────────────────────────────────────────────
## 2. NARRATIVE STRUCTURE
────────────────────────────────────────────────────────────────

Follow this exact stage sequence. Each stage must be clearly
distinguishable in tone and content:

{narrative_arc_expanded}

例如：
Stage 1: 悬念与反差引入
  → 颠覆受众对主题的既有认知，在第一阶段结束时让他们感到震惊

Stage 2: 微观器官的默默承受与运转
  → 用具体的数据和场景展示身体各器官的极限付出

Stage 3: 免疫系统的史诗级护主战斗
  → 将免疫过程呈现为史诗级战斗，强化拟人化和戏剧张力

Stage 4: 生命尽头的悲壮决绝
  → 情绪达到悲壮高潮，此阶段允许最长句式

Stage 5: 情感升华与行动呼吁
  → 从悲壮转为温暖，以互动引导句过渡到 CTA

────────────────────────────────────────────────────────────────
## 3. RHETORICAL REQUIREMENTS
────────────────────────────────────────────────────────────────

Apply these rhetorical devices consistently:

{rhetorical_core_expanded}

例如：
- 第二人称 (你): 每个阶段都必须出现，让受众感到这个故事在说他们自己
- 极端数据对比: 至少出现2次，天文数字后立即跟一个人体尺度的对比
  格式参考:「X亿次/七吨/十万次」→「从不停歇/全年无休」
- 极致拟人化: 生物过程必须被赋予意志和情感
  用词参考: 死心塌地 / 拼命 / 从未想过放弃 / 竭尽全力

────────────────────────────────────────────────────────────────
## 4. SENTENCE LENGTH（最严格约束）
────────────────────────────────────────────────────────────────

Unit: {sentence_length_unit}
Average: {sentence_length_avg} {sentence_length_unit}
Hard maximum: {sentence_length_max} {sentence_length_unit}
  Exception: {sentence_length_max_context}
Normal range: {sentence_length_per_scene_range}

CRITICAL: Every sentence becomes one 3D animation scene.
Sentences that are too long cannot be animated effectively.
When in doubt, split one long sentence into two short ones.

────────────────────────────────────────────────────────────────
## 5. EMOTIONAL ARC
────────────────────────────────────────────────────────────────

{emotional_tone_arc}

This arc must map directly to your narrative stages.
Do not flatten it. The audience must feel the escalation
and then the resolution.

────────────────────────────────────────────────────────────────
## 6. METAPHOR REQUIREMENT
────────────────────────────────────────────────────────────────

Include exactly {metaphor_count} metaphors or analogies.

Each metaphor must follow this visual metaphor rule:
「{visual_metaphor_mapping_rule}」

Reference examples:
{visual_metaphor_mapping_examples}

Apply the same logic to all abstract concepts in this new topic.
Never use textbook diagrams or literal anatomy as visual metaphors.

────────────────────────────────────────────────────────────────
## 7. LANGUAGE REGISTER
────────────────────────────────────────────────────────────────

{jargon_treatment}

────────────────────────────────────────────────────────────────
## 8. INTERACTION CUES
────────────────────────────────────────────────────────────────

Original video count: {interaction_cues_count}
{interaction_cues_note}

────────────────────────────────────────────────────────────────
## 9. CALL TO ACTION
────────────────────────────────────────────────────────────────

CTA Pattern:
  Opening: imperative verb phrase (好好 + 动词)
  Connector: 因为
  Closing: comparative structure (比你想象的更 + 形容词)
  (Do NOT use the original CTA text verbatim)

────────────────────────────────────────────────────────────────
## 10. TOTAL LENGTH
────────────────────────────────────────────────────────────────

Target: {target_word_count} characters
Minimum: {target_word_count_min}
Maximum: {target_word_count_max}

════════════════════════════════════════════════════════════════
# YOUR TASK
════════════════════════════════════════════════════════════════

New topic: {topic}

Verified facts — use at least 3, always with source markers:

{verified_facts_list}

════════════════════════════════════════════════════════════════
# OUTPUT FORMAT
════════════════════════════════════════════════════════════════

{
  "script": "完整脚本，每句之间用\\n分隔",
  "sentence_list": [
    {
      "index": 1,
      "text": "句子原文",
      "length": 字数,
      "stage": "对应叙事阶段名称",
      "has_metaphor": true或false,
      "visual_note": "对应3D场景的一句话描述，
                      必须符合visual_metaphor_mapping规则"
    }
  ],
  "total_length": 实际总字数,
  "metaphors_identified": [
    "类比1：原概念 → 视觉化描述",
    "类比2：原概念 → 视觉化描述",
    "类比3：原概念 → 视觉化描述",
    "类比4：原概念 → 视觉化描述",
    "类比5：原概念 → 视觉化描述"
  ],
  "hook_text": "开场钩子完整原文（前3句）",
  "cta_text": "结尾CTA完整原文",
  "stage_breakdown": {
    "{stage_1_name}": "句子index范围 e.g. 1-3",
    "{stage_2_name}": "e.g. 4-9",
    "{stage_3_name}": "e.g. 10-14",
    "{stage_4_name}": "e.g. 15-17",
    "{stage_5_name}": "e.g. 18-20"
  },
  "constraint_compliance": {
    "avg_sentence_length": 实际平均字数,
    "max_sentence_length": 实际最长句字数,
    "max_sentence_stage": "最长句所在阶段",
    "sentences_exceeding_normal_limit": 超出正常上限的句子数,
    "sentences_exceeding_absolute_limit": 超出绝对上限的句子数,
    "metaphor_count": 实际类比数量,
    "interaction_cues_count": 实际互动引导数量,
    "total_length": 实际总字数,
    "within_target_range": true或false
  }
}

════════════════════════════════════════════════════════════════
# FINAL REMINDER
════════════════════════════════════════════════════════════════

Before outputting, verify every item:
□ Every sentence outside Stage 4 is within normal length limit
□ No sentence anywhere exceeds the absolute maximum
□ Exactly {metaphor_count} metaphors included
□ All 5 narrative stages appear in order
□ second-person 你 appears in every stage
□ At least 3 verified facts with source markers included
□ Interaction cues count matches the requirement
□ Total length is between {target_word_count_min} and {target_word_count_max} characters
□ Output is valid JSON starting with { and ending with }`;

export const STEP_3_SYSTEM_PROMPT = `You are a quality assurance reviewer for a science explainer video
script production system. You do not rewrite scripts.
You only audit and report findings.

Output strictly valid JSON only.
First character must be { and last character must be }`;

export const STEP_3_USER_PROMPT = `# YOUR TASK

Audit the generated script against three quality dimensions.

════════════════════════════════════════════════════════════════
## AUDIT 1: COMPLIANCE CHECK
════════════════════════════════════════════════════════════════

BLOCK level (must fix before proceeding):
- Specific diagnosis language (确诊、患有XX病)
- Absolute promises (保证治愈、100%有效、根治)
- Data cited with zero source attribution

WARNING level (flag for human review):
- Absolute adverbs without qualification (一定、绝对、最好)
- Statistics with weak source markers

PASS level: none of the above found

════════════════════════════════════════════════════════════════
## AUDIT 2: CONTENT CONTAMINATION CHECK
════════════════════════════════════════════════════════════════

Compare the generated script against the original video transcript.

The rule: style should be replicated, content must not be copied.

Flag any sentence in the generated script that:
- Uses the same specific fact or statistic as the original
  (e.g. both mention「七吨血液」or「十万次」)
- Uses the same metaphor or analogy as the original
- Has more than 8 consecutive characters identical to the original

Original video transcript:
「{original_transcript}」

Generated script:
「{generated_script}」

════════════════════════════════════════════════════════════════
## AUDIT 3: STYLE CONSISTENCY CHECK
════════════════════════════════════════════════════════════════

Check the generated script against these DNA constraints:

Expected emotional arc: {emotional_tone_arc}
Expected narrative stages: {narrative_arc}
Expected rhetorical devices: {rhetorical_core}

For each stage, assess whether the emotional tone matches
the expected arc. Use a simple 3-level rating:
- matches: tone is clearly correct
- partial: tone is approximately correct but weak
- mismatch: tone does not match expectation

════════════════════════════════════════════════════════════════
# OUTPUT FORMAT
════════════════════════════════════════════════════════════════

{
  "audit_1_compliance": {
    "status": "PASS / WARNING / BLOCK",
    "issues": [
      {
        "level": "BLOCK or WARNING",
        "text": "问题原文片段",
        "reason": "违反了哪条规则",
        "suggestion": "建议改成什么"
      }
    ]
  },

  "audit_2_contamination": {
    "status": "CLEAN / FLAGGED",
    "flagged_sentences": [
      {
        "generated_text": "生成脚本中的句子",
        "original_text": "原视频中相似的内容",
        "similarity_type": "same-fact / same-metaphor / same-phrasing",
        "suggestion": "建议如何改写"
      }
    ]
  },

  "audit_3_style": {
    "overall_status": "PASS / PARTIAL / FAIL",
    "stage_ratings": [
      {
        "stage": "阶段名称",
        "expected_tone": "期望情绪",
        "actual_tone": "实际呈现的情绪",
        "rating": "matches / partial / mismatch",
        "note": "具体说明（如果是partial或mismatch）"
      }
    ]
  },

  "final_verdict": "APPROVED / NEEDS_REVISION",
  "revision_instructions": "如果 NEEDS_REVISION，列出需要修改的具体内容，
                            格式为可以直接追加到 Step 2b Prompt 末尾的指令。
                            特别注意：针对来源标记，严禁要求'替换为具体机构'，防止幻觉。
                            应指示：'WARNING: Do NOT fabricate institution names. If a fact has no specific institution source, use: 研究显示/据统计. Do NOT write 哈佛/牛津 unless explicitly stated.'",
  "approved_script": "如果 APPROVED，粘贴最终确认的完整脚本原文"
}`;