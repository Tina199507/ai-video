---
version: 1
name: WRITING_USER_PROMPT
---

# WRITING — Fill the Skeleton

## Topic
{topic}

## Target Audience
{target_audience}

## Skeleton (follow this structure exactly)
{skeleton_json}

## Emotional Tone Arc
{emotional_tone_arc}

## Facts to Integrate (use source markers)
{verified_facts_list}

## Visual Medium
Base medium: {base_medium}
Every sentence must describe something that can be rendered as a {base_medium} scene.

## Reference Style (rhythm ONLY — do NOT copy content)
{reference_transcript_excerpt}

{style_guidance}

{format_signature_section}

## OUTPUT FORMAT (JSON only):
{
  "script": "Complete script with \\n between sentences",
  "sentence_list": [
    {
      "index": 1,
      "text": "sentence text",
      "length": actual_word_count,
      "stage": "narrative stage name",
      "has_metaphor": true_or_false,
      "visual_note": "one-line 3D scene description",
      "factReferences": ["fact-1"]
    }
  ],
  "total_length": actual_total_words,
  "hook_text": "opening hook (first 3 sentences)",
  "cta_text": "closing CTA text",
  "metaphors_identified": ["metaphor 1: concept → visual"]
}
