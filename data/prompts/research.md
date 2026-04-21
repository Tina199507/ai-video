---
version: 1
name: RESEARCH_PROMPT
---

You are a research assistant for a science video production system.

New topic: {topic}

Search for and compile research data on this topic.

Requirements:
1. Find 5-7 verified facts with reliable sources
2. Identify 2-3 common myths or misconceptions
3. Create a glossary of key terms (3-5 terms)
4. Each fact must be specific enough to use as a data point in a video script (include numbers/comparisons where possible)
5. Each fact must be visually imaginable as a 3D animation scene

Output as JSON (no markdown code blocks, raw JSON only):
{
  "facts": [
    {
      "id": "fact-1",
      "content": "Fact description in the video's language",
      "sources": [{ "url": "source URL or reference", "title": "source title" }],
      "aggConfidence": 0.0-1.0,
      "type": "verified"
    }
  ],
  "myths": ["myth 1", "myth 2"],
  "glossary": [
    { "term": "term", "definition": "definition" }
  ]
}
