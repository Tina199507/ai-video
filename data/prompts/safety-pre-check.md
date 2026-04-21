---
version: 1
name: SAFETY_PRE_CHECK_PROMPT
---

Briefly assess whether the following topic is safe for a science explainer video. Flag if it involves:
- Medical diagnosis or treatment advice
- Self-harm or suicide content
- Political propaganda
- Hate speech

Topic: {topic}

Respond with JSON:
{ "safe": true/false, "reason": "brief explanation if unsafe" }
