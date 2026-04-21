---
version: 1
name: SKELETON_USER_PROMPT
---

# SKELETON GENERATION

## Topic
{topic}

## Length Targets
- Total words: {target_word_count} (range: {target_word_count_min}–{target_word_count_max})
- Target sentence count: {target_sentence_count}

## Narrative Arc (follow this stage sequence)
{narrative_arc_expanded}

## Hook Strategy
{hook_strategy}

## Retention Architecture
- Sentences 1-3: Hook (data anchor + curiosity gap)
- Every 4-5 sentences: a curiosity-gap sentence (purpose = "curiosity_gap")
- Sentence ~8: pattern interrupt (purpose = "pattern_interrupt")
- Sentence ~15: second hook (purpose = "second_hook")
- Final 2-3: CTA + open loop

## Constraints
- Metaphor slots: {metaphor_count}
- Minimum fact slots: {min_facts}
{confidence_notes}

## OUTPUT FORMAT (JSON only):
{
  "sentences": [
    {
      "index": 1,
      "stage": "narrative stage name",
      "targetLength": estimated_word_count,
      "purposeTag": "data_anchor | exposition | curiosity_gap | pattern_interrupt | second_hook | climax | cta | metaphor_vehicle | transition",
      "hasFact": true_or_false,
      "hasMetaphor": true_or_false
    }
  ],
  "totalTargetWords": sum_of_all_targetLength,
  "hookIndices": [1, 2, 3],
  "ctaIndices": [last_few_indices],
  "stageBreakdown": { "stage_name": [sentence_indices] }
}
