---
version: 1
name: SCRIPT_USER_PROMPT
---

# SCRIPT GENERATION — STYLE DNA CONSTRAINTS

## Section 1: Topic & Target
Target topic: {topic}
Target audience: {target_audience}

## Section 2: Length Calibration
Target word count: {target_word_count} (HARD range: {target_word_count_min} - {target_word_count_max})
Target duration: {target_duration_sec} seconds
Reference speech rate: {speech_rate}
Target sentence count: {target_sentence_count} (HARD requirement — each sentence becomes one video scene)

────────────────────────────────────────────────────────────────
## Section 3: Hook
────────────────────────────────────────────────────────────────
Hook strategy: {hook_strategy}

Reference hook from original video（学习句式结构和情感冲击方式，不抄内容）:
「{hook_example}」

Your opening must:
- Use {hook_strategy} as the primary opening strategy
- Complete the hook within 3 sentences
- Use second-person address from the very first sentence
- Achieve the same emotional punch as the reference hook

────────────────────────────────────────────────────────────────
## Section 3.5: Retention Architecture
────────────────────────────────────────────────────────────────
Short-form video viewers drop off at predictable points.
Your script MUST embed retention devices at these beats:

1. **Sentence 1-3 (0-5s)**: Cognitive dissonance hook — present an
   unexpected fact + implicit "why?" that creates an information gap.
   The viewer must feel "that can't be right" or "I need to know more".

2. **Sentence ~8 (15-20s)**: Pattern interrupt — break the established
   rhythm with a short punchy sentence, a rhetorical question, or a
   surprising pivot. This counters the 15s attention cliff.

3. **Every 4-5 sentences**: Curiosity gap — plant an unresolved question
   or tease ("但这还不是最可怕的部分", "接下来的发现彻底颠覆了认知").
   NEVER go more than 5 consecutive sentences without a forward pull.

4. **Sentence ~15 (30-40s)**: Second hook — re-engage with a new
   surprising angle or escalation. Viewers who reach 30s will likely
   finish, but only if momentum is maintained.

5. **Final 3 sentences**: Payoff + open loop — deliver the emotional
   climax, then end with a thought that lingers (question, implication,
   or call to reflection). Do NOT let the ending feel "closed".

CRITICAL: These retention beats are NON-NEGOTIABLE. A script that
lacks curiosity gaps will be rejected by quality validation.

────────────────────────────────────────────────────────────────
## Section 4: Narrative Structure
────────────────────────────────────────────────────────────────
Follow this exact stage sequence. Each stage must be clearly
distinguishable in tone and content:

{narrative_arc_expanded}

Emotional tone arc: {emotional_tone_arc}

This arc must map directly to your narrative stages.
Do not flatten it. The audience must feel the escalation
and then the resolution.

────────────────────────────────────────────────────────────────
## Section 5: Rhetorical Requirements
────────────────────────────────────────────────────────────────
Apply these rhetorical devices consistently:

{rhetorical_core_expanded}

────────────────────────────────────────────────────────────────
## Section 6: Sentence Length
────────────────────────────────────────────────────────────────
Unit: {sentence_length_unit}
Average: {sentence_length_avg} {sentence_length_unit}
Hard maximum: {sentence_length_max} {sentence_length_unit}
  Exception context: {sentence_length_max_context}
Interaction cues target: {interaction_cues_count}
Jargon treatment: {jargon_treatment}

CRITICAL: Every sentence becomes one 3D animation scene.
Sentences that are too long cannot be animated effectively.
When in doubt, split one long sentence into two short ones.

Pacing: {pacing}
Emotional intensity: {emotional_intensity} (1-5 scale)

────────────────────────────────────────────────────────────────
## Section 7: Reference Style Example
────────────────────────────────────────────────────────────────
The following is a MASKED transcript excerpt from the reference video.
Content-specific entities are replaced with placeholders to prevent contamination.

⚠️ ANTI-PLAGIARISM DIRECTIVE:
- You may ONLY learn: sentence length pattern, punctuation rhythm, narrative pacing, emotional progression
- You must NOT copy: any phrase (>6 chars), facts, statistics, metaphors, examples, or topic-specific vocabulary
- Every sentence you write must be 100% original, about the NEW topic ({topic})
- If in doubt, DO NOT reference this excerpt at all — the structural constraints above are sufficient

Reference style sample (for rhythm analysis ONLY):
---
{reference_transcript_excerpt}
---

────────────────────────────────────────────────────────────────
## Section 7.5: Format Signature (HARD STRUCTURAL CONSTRAINTS)
────────────────────────────────────────────────────────────────
{format_signature_section}

────────────────────────────────────────────────────────────────
## Section 8: Metaphor & Visual Rule
────────────────────────────────────────────────────────────────
Include exactly {metaphor_count} metaphors or analogies.

Each metaphor must follow this visual metaphor rule:
「{visual_metaphor_mapping_rule}」

Reference examples from the source video:
{visual_metaphor_mapping_examples}

Apply the same logic to all abstract concepts in this new topic.
Never use textbook diagrams or literal anatomy as visual metaphors.

────────────────────────────────────────────────────────────────
## Section 9: Call to Action
────────────────────────────────────────────────────────────────
CTA structural template:
{cta_pattern}
（Do NOT use the original CTA text verbatim — follow the pattern structure with new topic content）

────────────────────────────────────────────────────────────────
## Section 10: Fact Integration
────────────────────────────────────────────────────────────────
Verified facts to use (use at least 3 with source markers):
{verified_facts_list}

────────────────────────────────────────────────────────────────
## Section 11: Visual Compatibility
────────────────────────────────────────────────────────────────
Base medium: {base_medium}
Every sentence must describe something that can be rendered as a {base_medium} scene.

────────────────────────────────────────────────────────────────
## Section 12: Narrative Map (follow this structure)
────────────────────────────────────────────────────────────────
{narrative_map}

════════════════════════════════════════════════════════════════
## SELF-CHECK (perform before output)
════════════════════════════════════════════════════════════════
Before outputting, verify every item:
□ Total word count is within [{target_word_count_min}, {target_word_count_max}]
□ Sentence count is exactly {target_sentence_count} (±2 allowed)
□ Every sentence can be filmed independently as a 3D scene
□ At least 3 verified facts are used with source markers
□ Metaphor count matches target ±1
□ Hook follows the specified strategy and uses second-person address
□ Emotional arc progresses as specified
□ No fabricated statistics or claims without source markers
□ CTA follows the structural template, not copied verbatim
□ No phrase >6 characters matches the reference transcript — every sentence is 100% original
□ All facts and statistics are about the NEW topic, none carried over from the reference
□ Output is valid JSON starting with { and ending with }

## OUTPUT FORMAT (JSON only, no markdown):
{
  "script": "Complete script with \\n between sentences",
  "sentence_list": [
    {
      "index": 1,
      "text": "sentence text",
      "length": word_count,
      "stage": "narrative stage name",
      "has_metaphor": true_or_false,
      "visual_note": "one-line 3D scene description matching visual_metaphor_mapping rule",
      "factReferences": ["fact-1"]
    }
  ],
  "total_length": actual_total_words,
  "hook_text": "opening hook (first 3 sentences)",
  "cta_text": "closing CTA text",
  "stage_breakdown": { "stage_name": "sentence index range" },
  "metaphors_identified": [
    "metaphor 1: abstract concept → visual representation"
  ],
  "constraint_compliance": {
    "avg_sentence_length": actual_avg,
    "max_sentence_length": actual_max,
    "max_sentence_stage": "stage of longest sentence",
    "metaphor_count": actual_count,
    "interaction_cues_count": actual_count,
    "total_length": actual_total,
    "within_target_range": true_or_false
  },
  "self_check": {
    "word_count_in_range": true/false,
    "all_sentences_filmable": true/false,
    "fact_count": number,
    "metaphor_count": number,
    "issues": ["any issues found during self-check"]
  }
}
