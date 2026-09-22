/** Copy text in modern browsers and older/in-app webviews with an explicit failure. */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error('There is no text to copy yet.');

  if (typeof navigator !== 'undefined' && navigator.clipboard && globalThis.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') throw new Error('Clipboard access is unavailable.');
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  try {
    textArea.focus();
    textArea.select();
    if (!document.execCommand('copy')) throw new Error('The browser blocked clipboard access.');
  } finally {
    textArea.remove();
  }
}
