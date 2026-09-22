import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '../src/lib/clipboard';

describe('clipboard sharing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the secure clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('isSecureContext', true);

    await copyTextToClipboard('https://oncehere.vercel.app/s/example');
    expect(writeText).toHaveBeenCalledWith('https://oncehere.vercel.app/s/example');
  });

  it('does not report success when no clipboard mechanism exists', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('isSecureContext', false);
    await expect(copyTextToClipboard('memory')).rejects.toThrow('Clipboard access is unavailable');
  });
});
