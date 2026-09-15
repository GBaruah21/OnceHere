from pathlib import Path

path = Path('server/api.ts')
source = path.read_text()
old = """  const existing = db.getTimelineEvents(id).find((event) => event.id === eventId);
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  if (mediaUrl !== undefined && isVideoMediaUrl(mediaUrl) && journeyVideoCount(id, eventId) >= R2_LIMITS.maxTimelineVideos) {
    return res.status(413).json({ error: `The Journey already has its maximum of ${R2_LIMITS.maxTimelineVideos} videos.` });
  }
"""
new = """  const existing = db.getTimelineEvents(id).find((event) => event.id === eventId);
  if (!existing) return res.status(404).json({ error: 'Event not found.' });

  // Replacing an existing attachment is allowed, but editing a text-only
  // milestone into a 21st attached milestone must obey the same Journey quota
  // as new milestones and signed uploads.
  const isAddingAttachment = mediaUrl !== undefined && Boolean(mediaUrl) && !existing.mediaUrl;
  if (
    isAddingAttachment &&
    db.getTimelineEvents(id).filter((entry) => Boolean(entry.mediaUrl)).length >= R2_LIMITS.maxTimelineAttachments
  ) {
    return res.status(413).json({
      error: `This archive already has the maximum of ${R2_LIMITS.maxTimelineAttachments} Journey attachments.`
    });
  }
  if (mediaUrl !== undefined && isVideoMediaUrl(mediaUrl) && journeyVideoCount(id, eventId) >= R2_LIMITS.maxTimelineVideos) {
    return res.status(413).json({ error: `The Journey already has its maximum of ${R2_LIMITS.maxTimelineVideos} videos.` });
  }
"""
count = source.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one Journey PATCH block, found {count}.')
source = source.replace(old, new)
path.write_text(source)

check = path.read_text()
assert 'const isAddingAttachment = mediaUrl !== undefined && Boolean(mediaUrl) && !existing.mediaUrl;' in check
assert 'R2_LIMITS.maxTimelineAttachments' in check
assert 'journeyVideoCount(id, eventId) >= R2_LIMITS.maxTimelineVideos' in check
print('Journey PATCH quota guard applied and verified.')
