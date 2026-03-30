import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateNarrativeMap, performScriptVerification } from '../scripting';
import { generateStoryboard } from '../storyboard';
import { StyleProfile, ResearchData, NarrativeMap, ScriptOutput } from '../../types';

// Mock the AI adapter
const mockGenerateText = vi.fn();
vi.mock('../core', () => ({
  getAIAdapter: vi.fn(() => ({
    generateText: mockGenerateText
  }))
}));

vi.mock('../../lib/utils', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    withFallback: vi.fn(async (primary) => await primary()),
    withQuotaFallback: vi.fn(async (fn, model) => await fn(model)),
    cleanJson: (str: string) => str // simplified for tests
  };
});

describe('StyleProfile Workflow Control Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Prompt Injection Verification: audioStyle is injected into the prompt', async () => {
    // Setup a specific audioStyle
    const styleProfile: StyleProfile = {
      visualStyle: 'Cinematic',
      tone: 'Dramatic',
      targetAudience: 'General',
      pacing: 'medium',
      audioStyle: {
        genre: '8-bit chiptune death metal',
        mood: 'Aggressive',
        tempo: 'Fast',
        intensity: 5
      }
    } as any;

    // Mock the response to return a valid JSON array
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([{ narrative: 'Test', visualPrompt: 'Test', estimatedDuration: 5 }])
    });

    await generateStoryboard('Topic', styleProfile, 'Test script', {});

    // Assert that the prompt contains our injected string
    const callArgs = mockGenerateText.mock.calls[0];
    const prompt = callArgs[1];
    
    expect(prompt).toContain('8-bit chiptune death metal');
    expect(prompt).toContain('Aggressive');
    expect(prompt).toContain("Use the Audio Style to inform the 'sound' production spec");
  });

  it('2. Output Structure Verification: NarrativeMap respects narrativeStructure length', async () => {
    const styleProfile: StyleProfile = {
      narrativeStructure: ['Hook', 'Body 1', 'Body 2', 'Body 3', 'Conclusion'], // 5 sections
      wordsPerMinute: 150,
      targetAudience: 'General',
      tone: 'Neutral',
      sourceDuration: 60
    } as any;

    const researchData: ResearchData = {
      facts: [{ id: '1', content: 'Fact 1', aggConfidence: 0.9 }]
    } as any;

    // Mock the LLM to return exactly 5 sections as requested
    const mockResponse = [
      { sectionTitle: 'Hook', description: '...', estimatedDuration: 10, targetWordCount: 25 },
      { sectionTitle: 'Body 1', description: '...', estimatedDuration: 15, targetWordCount: 37 },
      { sectionTitle: 'Body 2', description: '...', estimatedDuration: 15, targetWordCount: 37 },
      { sectionTitle: 'Body 3', description: '...', estimatedDuration: 10, targetWordCount: 25 },
      { sectionTitle: 'Conclusion', description: '...', estimatedDuration: 10, targetWordCount: 25 }
    ];

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(mockResponse)
    });

    const result = await generateNarrativeMap('Topic', styleProfile, researchData);

    // Verify the structure length matches the StyleProfile
    expect(result.length).toBe(5);
    
    // Verify the prompt explicitly asked for 5 sections
    const prompt = mockGenerateText.mock.calls[0][1];
    expect(prompt).toContain('Target Sequence Count: Exactly 5 sections');
  });

  it('3. A/B Causal Verification: Pacing and FaceRatio affect Storyboard scene duration', async () => {
    // Group A: Slow pacing, low face ratio -> longer scenes
    const profileA: StyleProfile = {
      visualStyle: 'Documentary',
      tone: 'Serious',
      targetAudience: 'Adults',
      pacing: 'slow' // Slow pacing -> 12s base
    } as any;

    // Group B: Fast pacing, high face ratio -> shorter scenes
    const profileB: StyleProfile = {
      visualStyle: 'TikTok',
      tone: 'Energetic',
      targetAudience: 'Teens',
      pacing: 'fast' // Fast pacing -> 4s base
    } as any;

    mockGenerateText.mockResolvedValue({ text: '[]' }); // We just care about the prompt calculation

    // 100 words at 150 WPM = 40 seconds total duration
    const script = new Array(100).fill('word').join(' ');

    await generateStoryboard('Topic', profileA, script, {});
    const promptA = mockGenerateText.mock.calls[0][1];

    mockGenerateText.mockClear();

    await generateStoryboard('Topic', profileB, script, {});
    const promptB = mockGenerateText.mock.calls[0][1];

    // Extract the calculated target scene duration from the prompts
    const durationMatchA = promptA.match(/~\d+s\/scene/);
    const durationMatchB = promptB.match(/~\d+s\/scene/);

    const durationA = parseInt(durationMatchA[0].replace(/\D/g, ''));
    const durationB = parseInt(durationMatchB[0].replace(/\D/g, ''));

    // Assert that Group A (Slow/Low Face) has significantly longer scenes than Group B (Fast/High Face)
    expect(durationA).toBeGreaterThan(durationB);
    expect(durationA).toBe(14); // 12 * 1.15 = 13.8 -> rounded to 14
    expect(durationB).toBe(3);  // 4 * 0.8 = 3.2 -> rounded to 3
  });

  it('4. Automated Regression Testing: performScriptVerification accurately scores deviations', () => {
    const styleProfile: StyleProfile = {} as any;
    
    const narrativeMap: NarrativeMap = [
      { sectionTitle: 'A', description: '', estimatedDuration: 10, targetWordCount: 50, factReferences: ['1'] },
      { sectionTitle: 'B', description: '', estimatedDuration: 10, targetWordCount: 50, factReferences: ['2'] }
    ]; // Total target words = 100

    // Script with exactly 100 words (0 deviation)
    const perfectScript: ScriptOutput = {
      scriptText: new Array(100).fill('word').join(' '),
      scenes: [
        { script_text: new Array(50).fill('word').join(' ') },
        { script_text: new Array(50).fill('word').join(' ') }
      ]
    } as any;

    const resultPerfect = performScriptVerification(perfectScript, narrativeMap, styleProfile);
    expect(resultPerfect.durationStatus).toBe('pass');
    expect(resultPerfect.durationDeviation).toBe(0);

    // Script with 140 words (40% deviation)
    const badScript: ScriptOutput = {
      scriptText: new Array(140).fill('word').join(' '),
      scenes: [
        { script_text: new Array(70).fill('word').join(' ') },
        { script_text: new Array(70).fill('word').join(' ') }
      ]
    } as any;

    const resultBad = performScriptVerification(badScript, narrativeMap, styleProfile);
    expect(resultBad.durationStatus).toBe('fail');
    expect(resultBad.durationDeviation).toBeCloseTo(0.4);
    expect(resultBad.maxBeatDeviation).toBeCloseTo(0.4);
  });
});
