export type ShareChannel = 'instagram_story' | 'instagram_post' | 'whatsapp' | 'whatsapp_status' | 'native' | 'copy_link' | 'other';
export type ShareAction = 'opened' | 'copied' | 'downloaded' | 'shared';

/**
 * Records a privacy-safe share action. It intentionally stores no account,
 * message, PIN, IP address, or other creator/visitor identity.
 *
 * A recorded action means the share control was used. Third-party apps do not
 * tell a website whether the user ultimately published the post or story.
 */
export function recordArchiveShare(archiveId: string, channel: ShareChannel, action: ShareAction) {
  if (!archiveId || typeof fetch === 'undefined') return;
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      eventName: 'archive_share_action',
      archiveId,
      metadata: { channel, action }
    })
  }).catch(() => undefined);
}
