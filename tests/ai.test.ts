import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: mocks.generateContent }; },
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' }
}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); mocks.generateContent.mockReset(); });
const result = {
  caption: 'A borrowed notebook and a very long lunch break.', detectedMood: 'Warm', memoryNote: '',
  suggestedNotes: [], quote: '', suggestedMilestoneTitle: 'Lunch', tags: ['Lunch'], altText: 'A notebook on a table'
};
describe('AI caption failure and rewrite behavior', () => {
  it('reports missing configuration instead of repeating a canned suggestion', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { analyzeMemoryImage } = await import('../server/ai');
    await expect(analyzeMemoryImage('data:image/png;base64,dGVzdA==')).rejects.toThrow('not configured');
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4, 5])('passes specific rewrite instructions, iteration %i', async iteration => {
    vi.stubEnv('GEMINI_API_KEY', 'test-only-key');
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify(result) });
    const { analyzeMemoryImage } = await import('../server/ai');
    const hint = `Rewrite ${iteration}: make it shorter, without nostalgia.`;
    expect((await analyzeMemoryImage('data:image/png;base64,dGVzdA==', hint)).caption).toBe(result.caption);
    expect(mocks.generateContent.mock.calls[0][0].config.systemInstruction).toContain(hint);
  });
  it('rejects provider errors and malformed responses instead of claiming successful analysis', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-only-key');
    const { analyzeMemoryImage } = await import('../server/ai');
    mocks.generateContent.mockRejectedValueOnce({ status: 403 });
    await expect(analyzeMemoryImage('data:image/png;base64,dGVzdA==')).rejects.toThrow('authentication');
    mocks.generateContent.mockResolvedValueOnce({ text: '{"caption":""}' });
    await expect(analyzeMemoryImage('data:image/png;base64,dGVzdA==')).rejects.toThrow('could not analyze');
  });
});
