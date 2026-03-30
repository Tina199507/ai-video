// research.ts
import { ResearchData, ModelType, Fact, FactSource } from "../types";
import { getAIAdapter } from "./core";
import { withRetry, withFallback, withQuotaFallback } from "../lib/utils";
import { Logger } from "../lib/logger";
import { Observability } from "./observability";

// Validation function
const validateResearchData = (data: any): data is ResearchData => {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.facts)) return false;
    if (data.facts.length === 0) return false;
    
    // Check if at least one fact has valid structure
    const hasValidFact = data.facts.some((f: any) => 
        f.content && typeof f.content === 'string'
    );
    
    return hasValidFact;
};

/* -------------------------
   Fact Arbitration Layer
   ------------------------- */

/**
 * Extract verifiable claims from a script text.
 * Uses LLM to identify specific factual assertions.
 */
export const extractClaims = async (scriptText: string, modelName: string = ModelType.RESEARCH): Promise<string[]> => {
    const ai = getAIAdapter();
    const prompt = `Extract all specific factual claims (dates, numbers, names, events) from the following text. Return as a JSON array of strings.
    
    Text:
    """${scriptText.substring(0, 3000)}"""`;

    try {
        const start = Date.now();
        const response = await withQuotaFallback(
            (model) => ai.generateText(model, prompt),
            modelName,
            undefined,
            "Extract Claims"
        );
        Observability.logLLMCall('RESEARCH_EXTRACT_CLAIMS', modelName, Date.now() - start, true);
        
        const json = JSON.parse(response.text.replace(/```json|```/g, "").trim());
        return Array.isArray(json) ? json : [];
    } catch (e) {
        Observability.logLLMCall('RESEARCH_EXTRACT_CLAIMS', modelName, 0, false, { error: e });
        return [];
    }
};

/**
 * Score the reliability of a fact source.
 * Heuristic-based scoring (0-1).
 */
export const scoreFactReliability = (source: string): number => {
    if (!source) return 0.1;
    const s = source.toLowerCase();
    if (s.includes('gov') || s.includes('edu') || s.includes('journal') || s.includes('report')) return 0.9;
    if (s.includes('news') || s.includes('times') || s.includes('post')) return 0.8;
    if (s.includes('blog') || s.includes('wiki') || s.includes('forum')) return 0.4;
    if (s.includes('ai knowledge') || s.includes('general knowledge')) return 0.3;
    return 0.5;
};

/**
 * Validate claims against a set of trusted facts.
 * Returns valid claims and conflicts.
 */
export const validateClaims = async (claims: string[], trustedFacts: Fact[], modelName: string = ModelType.RESEARCH): Promise<{ valid: string[], conflicts: string[] }> => {
    if (claims.length === 0 || trustedFacts.length === 0) return { valid: claims, conflicts: [] };

    const ai = getAIAdapter();
    const factsContext = trustedFacts.map(f => `- ${f.content} (Sources: ${f.sources.map(s => s.title || s.url).join(', ')})`).join('\n');
    const claimsContext = claims.map((c, i) => `${i+1}. ${c}`).join('\n');

    const prompt = `Validate the following claims against the provided trusted facts.
    
    Trusted Facts:
    ${factsContext}
    
    Claims to Validate:
    ${claimsContext}
    
    Task: Identify which claims contradict the trusted facts.
    Return JSON: { "conflicts": ["claim text that contradicts..."] }
    If a claim is not mentioned in facts, assume it is NOT a conflict (open world assumption). Only flag direct contradictions.`;

    try {
        const start = Date.now();
        const response = await withQuotaFallback(
            (model) => ai.generateText(model, prompt),
            modelName,
            undefined,
            "Validate Claims"
        );
        Observability.logLLMCall('RESEARCH_VALIDATE_CLAIMS', modelName, Date.now() - start, true);
        
        const json = JSON.parse(response.text.replace(/```json|```/g, "").trim());
        const conflicts = Array.isArray(json.conflicts) ? json.conflicts : [];
        const valid = claims.filter(c => !conflicts.includes(c));
        return { valid, conflicts };
    } catch (e) {
        return { valid: claims, conflicts: [] };
    }
};

/**
 * Resolve conflicts between facts.
 * Prioritizes higher reliability sources.
 */
export const resolveConflicts = (facts: Fact[]): Fact[] => {
    // Simple deduplication and reliability sorting
    // In a real system, this would use LLM to merge conflicting info
    const uniqueFacts = new Map<string, Fact>();
    
    for (const fact of facts) {
        // Simple key based on first 20 chars
        const key = fact.content.substring(0, 20).toLowerCase();
        if (uniqueFacts.has(key)) {
            const existing = uniqueFacts.get(key)!;
            const existingScore = existing.aggConfidence;
            const newScore = fact.aggConfidence;
            
            if (newScore > existingScore) {
                uniqueFacts.set(key, fact);
            }
        } else {
            uniqueFacts.set(key, fact);
        }
    }
    return Array.from(uniqueFacts.values());
};

/* -------------------------
   Main Research Function
   ------------------------- */

export const performResearch = async (
    topic: string, language: string = 'en', modelName: string = ModelType.RESEARCH, styleProfile?: any
): Promise<ResearchData> => {
  const ai = getAIAdapter();
  
  // Input validation
  if (!topic || topic.trim().length < 3) {
      throw new Error("Topic is too short. Please provide a more descriptive topic.");
  }

  let audienceContext = "";
  let factCountRequest = "5-7"; // Default

  if (styleProfile) {
      if (styleProfile.targetAudience) {
          audienceContext = `Target Audience: ${styleProfile.targetAudience}. Adjust the complexity and depth of facts accordingly.`;
      }
      
      // Use explicit target if provided (from Planning phase)
      if (styleProfile._targetFactsCount) {
          factCountRequest = `${styleProfile._targetFactsCount}`;
      } 
      // Use sourceFactCount from Analysis phase if available
      else if (styleProfile.sourceFactCount) {
          factCountRequest = `${styleProfile.sourceFactCount}`;
      }
      // Fallback: Scale fact count based on source duration using formula
      else if (styleProfile.meta?.video_duration_sec || styleProfile.sourceDuration) {
          const duration = styleProfile.meta?.video_duration_sec || styleProfile.sourceDuration;
          const baseFacts = Math.max(3, Math.min(15, Math.round(duration / 30)));
          const audienceFactor = styleProfile.targetAudience?.toLowerCase().includes('expert') ? 1.25 : 1.0;
          const targetFacts = Math.max(3, Math.min(15, Math.round(baseFacts * audienceFactor)));
          factCountRequest = `${targetFacts}`;
      }
  }

  let claimsContext = "";
  if (styleProfile && styleProfile.suspiciousNumericClaims && styleProfile.suspiciousNumericClaims.length > 0) {
      const claims = styleProfile.suspiciousNumericClaims.map((c: any) => c.raw || c).join('\n');
      claimsContext = `
      VERIFICATION TASK:
      The following claims were flagged as suspicious in the source material.
      CRITICAL INSTRUCTION: ONLY verify these claims IF they are relevant to the new topic "${topic}".
      If a claim is completely unrelated to "${topic}", ignore it and do not include it in the claimVerifications output.
      
      Claims:
      ${claims}
      
      For each RELEVANT claim, determine if it is true, false (debunked), or unverifiable. Provide a correction if false.
      `;
  }

  const prompt = `Act as a Fact Arbitration Engine. Research the topic "${topic}" deeply.
  Goal: Extract key verifiable facts, debunk common myths, and define technical terms.
  ${claimsContext}

  Process:
  1. Search for high-quality sources.
  2. Extract claims.
  3. Corroborate claims across multiple sources.
  4. Assign a reliability score (0.0 to 1.0) to each fact.
  5. Verify the suspicious claims if provided.

  Output JSON Schema:
  {
    "facts": [
      {
        "id": "fact-1",
        "content": "concise factual statement",
        "sources": [
          { "url": "https://...", "title": "Source Title", "reliability": 0.9 }
        ],
        "aggConfidence": 0.95,
        "type": "verified" // or "disputed", "unverified"
      }
    ],
    "myths": ["myth 1", "myth 2"],
    "glossary": [{ "term": "string", "definition": "string" }],
    "claimVerifications": [
      {
        "claim": "original claim text",
        "verdict": "verified", // or "debunked", "unverifiable"
        "correction": "corrected fact if debunked",
        "source": "url",
        "confidence": 0.9
      }
    ]
  }

  Target Audience: ${audienceContext}
  Fact Count: ${factCountRequest}
  Language: ${language}. Ensure facts are detailed and sources are real URLs found during search.`;

  try {
      const start = Date.now();
      const response = await withQuotaFallback(
          (model) => ai.generateText(model, prompt, { 
              tools: [{ googleSearch: {} }] 
          }),
          modelName,
          undefined,
          "Research"
      );
      Observability.logLLMCall('RESEARCH_MAIN', modelName, Date.now() - start, true);
      
      let cleanText = response.text.replace(/```json|```/g, "").trim();
      // Handle potential markdown wrapping or extra text
      const jsonStart = cleanText.indexOf('{');
      const jsonEnd = cleanText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
      }

      let parsed;
      try {
          parsed = JSON.parse(cleanText);
      } catch (e) {
          Logger.error("Failed to parse research JSON", e);
          throw new Error("Research failed: Invalid JSON response from model.");
      }

      if (!validateResearchData(parsed)) {
          Logger.error("Invalid research data structure", parsed);
          throw new Error("Research failed: Invalid data structure.");
      }
      
      // Normalize facts to ensure they match the Fact interface
      const normalizedFacts = (Array.isArray(parsed.facts) ? parsed.facts : []).map((f: any, index: number) => {
          let content = "";
          let sources: FactSource[] = [];
          let aggConfidence = 0.5;
          let type: 'verified' | 'disputed' | 'unverified' = 'unverified';

          if (typeof f === 'string') {
              content = f;
              sources = [{ url: "", title: "General Knowledge", reliability: 0.5 }];
              aggConfidence = 0.5;
          } else {
              content = f.content || f.fact || "Unknown fact";
              
              // Normalize sources
              if (Array.isArray(f.sources)) {
                  sources = f.sources.map((s: any) => ({
                      url: s.url || "",
                      title: s.title || "Unknown Source",
                      snippet: s.snippet,
                      reliability: typeof s.reliability === 'number' ? s.reliability : scoreFactReliability(s.url || "")
                  }));
              } else if (typeof f.source === 'string') {
                  // Backward compatibility
                  sources = [{ 
                      url: "", 
                      title: f.source, 
                      reliability: scoreFactReliability(f.source) 
                  }];
              }

              aggConfidence = typeof f.aggConfidence === 'number' ? f.aggConfidence : 
                              (typeof f.confidence === 'number' ? f.confidence : 0.7);
              
              type = f.type || (aggConfidence > 0.8 ? 'verified' : 'unverified');
          }

          return { 
              id: f.id || `fact-${index + 1}`,
              content, 
              sources, 
              aggConfidence,
              type,
              originalText: content
          };
      });

      return { 
          facts: normalizedFacts,
          myths: Array.isArray(parsed.myths) ? parsed.myths : [],
          glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
          claimVerifications: Array.isArray(parsed.claimVerifications) ? parsed.claimVerifications : [],
          rawGroundingMetadata: response.groundingMetadata 
      };
  } catch (error) {
      Logger.warn("Research failed", error);
      Observability.logLLMCall('RESEARCH_MAIN', modelName, 0, false, { error });
      throw error; // Re-throw to be handled by the hook
  }
};
