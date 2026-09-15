from pathlib import Path
import re


def exact(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    source = p.read_text()
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {count}: {old[:120]!r}")
    p.write_text(source.replace(old, new, expected))


def regex(path: str, pattern: str, repl: str, expected: int = 1) -> None:
    p = Path(path)
    source = p.read_text()
    updated, count = re.subn(pattern, repl, source, count=expected, flags=re.S)
    if count != expected:
        raise SystemExit(f"{path}: regex expected {expected}, found {count}: {pattern[:120]!r}")
    p.write_text(updated)


# STORAGE / MEDIA RULES
exact(
    "server/r2.ts",
    "  maxVaultImages: 100,\n  maxVideosPerArchive: 5,\n  maxMemberPortraits: 250,\n  maxTimelineAttachments: 20,\n  maxWallImageAttachments: 15,",
    "  // Media Vault: 100 total attachments, of which at most 5 may be videos.\n"
    "  maxVaultAttachments: 100,\n"
    "  maxVaultVideos: 5,\n"
    "  maxMemberPortraits: 250,\n"
    "  // Journey: 20 total attachments, of which at most 3 may be videos.\n"
    "  maxTimelineAttachments: 20,\n"
    "  maxTimelineVideos: 3,\n"
    "  // Memory Notes: optional image only, max 5 image-attached notes.\n"
    "  maxWallImageAttachments: 5,"
)

# RECOVERY KEY: permanent credential, never rotatable.
regex(
    "server/api.ts",
    r"// Rotate the owner recovery key\. The raw replacement is returned exactly once\.\napiRouter\.post\('/archives/:id/auth/recovery/regenerate',[\s\S]*?\n\}\);\n\n// Universal Archive Key Access",
    "// The original owner recovery key is a permanent ownership credential.\n"
    "// Keep this endpoint only so stale clients get an explicit response; never rotate it.\n"
    "apiRouter.post('/archives/:id/auth/recovery/regenerate', (_req: Request, res: Response) => {\n"
    "  return res.status(405).json({\n"
    "    error: 'Recovery key replacement is disabled. Keep the original owner recovery key as the permanent owner credential.'\n"
    "  });\n"
    "});\n\n"
    "// Universal Archive Key Access"
)

# Independent quotas for Vault/Journey and image-only Memory Notes.
regex(
    "server/api.ts",
    r"async function checkUploadQuota\([\s\S]*?\n\}\n\n// Never relay media bytes",
    """async function checkUploadQuota(
  archiveId: string,
  purpose: 'vault' | 'portrait' | 'timeline' | 'wall',
  kind: 'image' | 'video',
  incomingBytes: number
) {
  const media = db.getMediaItems(archiveId);
  const timeline = db.getTimelineEvents(archiveId);
  const wallPosts = db.getWallPosts(archiveId, true);

  if (purpose === 'vault' && media.length >= R2_LIMITS.maxVaultAttachments) {
    return `This archive already has the maximum of ${R2_LIMITS.maxVaultAttachments} Media Vault attachments.`;
  }
  if (purpose === 'vault' && kind === 'video' && vaultVideoCount(archiveId) >= R2_LIMITS.maxVaultVideos) {
    return `The Media Vault already has its maximum of ${R2_LIMITS.maxVaultVideos} videos. Images can still be added until the ${R2_LIMITS.maxVaultAttachments}-attachment total is reached.`;
  }
  if (purpose === 'portrait' && db.getMembers(archiveId).filter((member) => Boolean(member.imageUrl)).length >= R2_LIMITS.maxMemberPortraits) {
    return 'This archive already has the maximum of 250 Yearbook portraits.';
  }
  if (purpose === 'timeline' && timeline.filter((event) => Boolean(event.mediaUrl)).length >= R2_LIMITS.maxTimelineAttachments) {
    return `This archive already has the maximum of ${R2_LIMITS.maxTimelineAttachments} Journey attachments.`;
  }
  if (purpose === 'timeline' && kind === 'video' && journeyVideoCount(archiveId) >= R2_LIMITS.maxTimelineVideos) {
    return `The Journey already has its maximum of ${R2_LIMITS.maxTimelineVideos} videos. Images can still be added until the ${R2_LIMITS.maxTimelineAttachments}-attachment total is reached.`;
  }
  if (purpose === 'wall' && kind !== 'image') {
    return 'Memory Notes accept image attachments only. Videos are not allowed on Memory Notes.';
  }
  if (purpose === 'wall' && wallPosts.filter((post) => Boolean(post.imageUrl)).length >= R2_LIMITS.maxWallImageAttachments) {
    return `This Memory Wall already has ${R2_LIMITS.maxWallImageAttachments} image attachments. You can still post a text-only Memory Note.`;
  }

  const storedBytes = await getArchiveStorageUsage(archiveId);
  if (storedBytes + incomingBytes > R2_LIMITS.maxTotalBytesPerArchive) return 'This archive would exceed its 500 MB total media allowance.';
  return null;
}

function isVideoMediaUrl(url?: string): boolean {
  return Boolean(url && (/^data:video\\//i.test(url) || /\\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(url)));
}

function vaultVideoCount(archiveId: string): number {
  return db.getMediaItems(archiveId).filter((item) => item.type === 'video').length;
}

function journeyVideoCount(archiveId: string, exceptTimelineEventId?: string): number {
  return db.getTimelineEvents(archiveId)
    .filter((event) => event.id !== exceptTimelineEventId && isVideoMediaUrl(event.mediaUrl)).length;
}

// Never relay media bytes"""
)

exact(
    "server/api.ts",
    "  if (isVideoMediaUrl(parsed.data.mediaUrl) && archiveVideoCount(id) >= R2_LIMITS.maxVideosPerArchive) {\n"
    "    return res.status(413).json({ error: 'This archive already has the maximum of 5 videos across the Media Vault and Journey.' });\n"
    "  }",
    "  if (isVideoMediaUrl(parsed.data.mediaUrl) && journeyVideoCount(id) >= R2_LIMITS.maxTimelineVideos) {\n"
    "    return res.status(413).json({ error: `The Journey already has its maximum of ${R2_LIMITS.maxTimelineVideos} videos.` });\n"
    "  }"
)
exact(
    "server/api.ts",
    "  if (mediaUrl !== undefined && isVideoMediaUrl(mediaUrl) && archiveVideoCount(id, eventId) >= R2_LIMITS.maxVideosPerArchive) {\n"
    "    return res.status(413).json({ error: 'This archive already has the maximum of 5 videos across the Media Vault and Journey.' });\n"
    "  }",
    "  if (mediaUrl !== undefined && isVideoMediaUrl(mediaUrl) && journeyVideoCount(id, eventId) >= R2_LIMITS.maxTimelineVideos) {\n"
    "    return res.status(413).json({ error: `The Journey already has its maximum of ${R2_LIMITS.maxTimelineVideos} videos.` });\n"
    "  }"
)

# The direct-upload authorization protects the normal path. These registration checks
# also protect retries, direct API calls and external-URL registration.
exact(
    "server/api.ts",
    "      if (kind === 'image' && db.getMediaItems(id).filter((item) => item.type === 'image').length >= R2_LIMITS.maxVaultImages) return res.status(413).json({ error: 'This archive already has the maximum of 100 Media Vault photos.' });\n"
    "      if (kind === 'video' && archiveVideoCount(id) >= R2_LIMITS.maxVideosPerArchive) return res.status(413).json({ error: 'This archive already has the maximum of 5 videos across the Media Vault and Journey.' });\n",
    ""
)
exact(
    "server/api.ts",
    "  let thumbnailUrl = type === 'video' ? req.body.thumbnailUrl : url;",
    "  const existingVaultItems = db.getMediaItems(id);\n"
    "  const requestedVaultKind = type === 'video' ? 'video' : 'image';\n"
    "  if (existingVaultItems.length >= R2_LIMITS.maxVaultAttachments) {\n"
    "    return res.status(413).json({ error: `This archive already has the maximum of ${R2_LIMITS.maxVaultAttachments} Media Vault attachments.` });\n"
    "  }\n"
    "  if (requestedVaultKind === 'video' && vaultVideoCount(id) >= R2_LIMITS.maxVaultVideos) {\n"
    "    return res.status(413).json({ error: `The Media Vault already has its maximum of ${R2_LIMITS.maxVaultVideos} videos.` });\n"
    "  }\n\n"
    "  let thumbnailUrl = type === 'video' ? req.body.thumbnailUrl : url;"
)

# Memory Note final write guard: images only, max five image-attached notes.
exact(
    "server/api.ts",
    "  if (imageUrl && db.getWallPosts(targetId, true).filter((entry) => Boolean(entry.imageUrl)).length >= R2_LIMITS.maxWallImageAttachments) {\n"
    "    return res.status(413).json({ error: 'This archive already has the maximum of 15 Memory Wall image attachments.' });\n"
    "  }",
    "  if (imageUrl) {\n"
    "    if (typeof imageUrl !== 'string') {\n"
    "      return res.status(400).json({ error: 'Memory Note image reference is invalid.' });\n"
    "    }\n"
    "    if (isVideoMediaUrl(imageUrl)) {\n"
    "      return res.status(400).json({ error: 'Memory Notes accept image attachments only. Videos are not allowed.' });\n"
    "    }\n"
    "    if (db.getWallPosts(targetId, true).filter((entry) => Boolean(entry.imageUrl)).length >= R2_LIMITS.maxWallImageAttachments) {\n"
    "      return res.status(413).json({ error: `This Memory Wall already has ${R2_LIMITS.maxWallImageAttachments} image attachments. You can still post a text-only Memory Note.` });\n"
    "    }\n"
    "  }"
)

# RECOVERY KEY UI
exact("src/components/editor/SectionSettingsPanel.tsx", "  const [, setRecoveryKeyVersion] = useState(0);\n", "")
exact(
    "src/components/editor/SectionSettingsPanel.tsx",
    "  const rotateRecoveryKey = async () => {\n"
    "    const response = await fetch(`/api/archives/${archive.id}/auth/recovery/regenerate`, {\n"
    "      method: 'POST',\n"
    "      headers: { Authorization: `Bearer ${ownerToken || ''}` }\n"
    "    });\n"
    "    const data = await response.json();\n"
    "    if (!response.ok || !data.recoveryKey) throw new Error(data.error || 'Could not replace the recovery key.');\n"
    "    SessionStorage.setRecoveryKey(archive.id, data.recoveryKey);\n"
    "    setRecoveryKeyVersion((value) => value + 1);\n"
    "    setPinMessage('New recovery key created. Download it now; the old key no longer works.');\n"
    "  };",
    "  const saveRecoveryKeyBackup = () => {\n"
    "    const recoveryKey = getOrInitRecoveryKey();\n"
    "    if (!recoveryKey) {\n"
    "      setPinMessage('The original recovery key is not stored on this device. Unlock this archive with the original key first, then save a backup copy.');\n"
    "      return;\n"
    "    }\n"
    "    downloadRecoveryKeyFile(archive.title, recoveryKey);\n"
    "    setPinMessage('Backup saved. This does not change or replace your original owner recovery key.');\n"
    "  };"
)
exact(
    "src/components/editor/SectionSettingsPanel.tsx",
    "{getOrInitRecoveryKey() || 'Hidden for security — replace it to receive a new key'}",
    "{getOrInitRecoveryKey() || 'Hidden for security — unlock with the original owner key on this device to save a backup'}"
)
exact(
    "src/components/editor/SectionSettingsPanel.tsx",
    "                <button type=\"button\" onClick={async () => { try { await rotateRecoveryKey(); } catch (error: any) { setPinMessage(error.message || 'Could not replace key.'); } }} className=\"min-h-11 px-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-xs text-rose-200\">Replace recovery key</button>",
    "                <button type=\"button\" onClick={saveRecoveryKeyBackup} disabled={!getOrInitRecoveryKey()} className=\"min-h-11 px-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40\">Save recovery key backup</button>"
)

# VISITOR MEMORY NOTE PHOTO UPLOAD
exact(
    "src/components/archive/ArchivePublicView.tsx",
    "import { LazyImage } from '../common/LazyImage';",
    "import { LazyImage } from '../common/LazyImage';\nimport { MediaUploader } from '../common/MediaUploader';"
)
exact(
    "src/components/archive/ArchivePublicView.tsx",
    "const COLLECTION_PAGE_SIZE = 12;",
    "const COLLECTION_PAGE_SIZE = 12;\nconst MEMORY_NOTE_IMAGE_LIMIT = 5;"
)
exact(
    "src/components/archive/ArchivePublicView.tsx",
    "  const [newNoteRole, setNewNoteRole] = useState('');\n  const [justAddedNoteId, setJustAddedNoteId] = useState<string | null>(null);",
    "  const [newNoteRole, setNewNoteRole] = useState('');\n"
    "  const [newNoteImageUrl, setNewNoteImageUrl] = useState('');\n"
    "  const [isUploadingNoteImage, setIsUploadingNoteImage] = useState(false);\n"
    "  const [isPostingWallNote, setIsPostingWallNote] = useState(false);\n"
    "  const [newNoteError, setNewNoteError] = useState<string | null>(null);\n"
    "  const [justAddedNoteId, setJustAddedNoteId] = useState<string | null>(null);"
)
exact(
    "src/components/archive/ArchivePublicView.tsx",
    "  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);\n\n  // Synchronize wall posts safely",
    "  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);\n"
    "  const wallImageCount = useMemo(() => wallPosts.filter((post) => Boolean(post.imageUrl)).length, [wallPosts]);\n\n"
    "  // Synchronize wall posts safely"
)

regex(
    "src/components/archive/ArchivePublicView.tsx",
    r"  // Submit Note on Wall with immediate optimistic preview \+ local storage \+ server sync \+ smooth scroll to wall\n  const handlePostNote = async \(e: React\.FormEvent\) => \{[\s\S]*?\n  \};\n\n  // Creator & Editor Moderation: Delete Note Permanently",
    """  // Submit a Memory Note only after the server confirms it. This prevents
  // quota/network failures from being shown as successful notes.
  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || isPostingWallNote || isUploadingNoteImage) return;
    if (!newNoteText.trim()) return;
    if (newNoteImageUrl && wallImageCount >= MEMORY_NOTE_IMAGE_LIMIT) {
      setNewNoteError(`This Memory Wall already has ${MEMORY_NOTE_IMAGE_LIMIT} image attachments. You can still post a text-only Memory Note.`);
      return;
    }

    const author = newNoteAuthor.trim() || 'Classmate';
    const role = newNoteRole.trim() || undefined;
    const text = newNoteText.trim();
    const imageUrl = newNoteImageUrl.trim() || undefined;
    setIsPostingWallNote(true);
    setNewNoteError(null);

    try {
      const targetIdentifier = archive.id || archive.slug;
      const res = await fetch(`/api/archives/${targetIdentifier}/wall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName: author, authorRole: role, text, cardStyle: 'polaroid', imageUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.post) {
        throw new Error(data.error || 'Could not pin this Memory Note. Please retry.');
      }

      const savedPost: WallPost = data.post;
      setWallPosts((prev) => [savedPost, ...prev.filter((post) => post.id !== savedPost.id)]);
      onAddWallPost?.(savedPost);

      if (!isPreviewMode) {
        try {
          const localKey1 = `archive_wall_${archive.id}`;
          const existing1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
          localStorage.setItem(localKey1, JSON.stringify([savedPost, ...existing1.filter((p) => p.id !== savedPost.id)]));
          if (archive.slug) {
            const localKey2 = `archive_wall_${archive.slug}`;
            const existing2: WallPost[] = JSON.parse(localStorage.getItem(localKey2) || '[]');
            localStorage.setItem(localKey2, JSON.stringify([savedPost, ...existing2.filter((p) => p.id !== savedPost.id)]));
          }
        } catch (storageError) {
          console.warn('Could not cache Memory Note locally:', storageError);
        }
      }

      setIsAddingNote(false);
      setJustAddedNoteId(savedPost.id);
      setNoteToastMessage(imageUrl ? '✨ Memory Note + photo pinned to the wall!' : '✨ Memory Note pinned to the wall!');
      setNewNoteAuthor('');
      setNewNoteText('');
      setNewNoteRole('');
      setNewNoteImageUrl('');
      setTimeout(() => setJustAddedNoteId(null), 5000);
      setTimeout(() => setNoteToastMessage(null), 4000);
      setTimeout(() => {
        const wallEl = findElementInView('section-memory-wall');
        if (wallEl) scrollElementInView(wallEl);
      }, 150);
      try {
        confetti({ particleCount: 80, spread: 80, origin: { y: 0.7 } });
      } catch {
        // Posting never depends on the visual celebration.
      }
    } catch (error) {
      setNewNoteError(error instanceof Error ? error.message : 'Could not pin this Memory Note. Please retry.');
    } finally {
      setIsPostingWallNote(false);
    }
  };

  // Creator & Editor Moderation: Delete Note Permanently"""
)

exact(
    "src/components/archive/ArchivePublicView.tsx",
    "              <button\n                type=\"submit\"\n                disabled={!newNoteText.trim()}\n                className=\"w-full py-3 rounded-xl text-xs font-bold shadow-lg active:scale-95 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2\"",
    "              {/* Optional Memory Note photo — image only, max five across this archive wall. */}\n"
    "              <div className=\"space-y-2\">\n"
    "                <div className=\"flex items-center justify-between gap-3\">\n"
    "                  <label className=\"block text-[11px] font-mono uppercase tracking-wider opacity-70\">Optional Photo</label>\n"
    "                  <span className=\"text-[10px] font-mono opacity-60\">{Math.min(wallImageCount, MEMORY_NOTE_IMAGE_LIMIT)}/{MEMORY_NOTE_IMAGE_LIMIT} used</span>\n"
    "                </div>\n"
    "                {wallImageCount >= MEMORY_NOTE_IMAGE_LIMIT && !newNoteImageUrl ? (\n"
    "                  <div className=\"rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-[11px] leading-relaxed\">\n"
    "                    This Memory Wall already has {MEMORY_NOTE_IMAGE_LIMIT} image attachments. You can still post a text-only Memory Note.\n"
    "                  </div>\n"
    "                ) : (\n"
    "                  <MediaUploader\n"
    "                    value={newNoteImageUrl}\n"
    "                    onChange={(url, type) => {\n"
    "                      if (type === 'video') {\n"
    "                        setNewNoteError('Memory Notes accept images only. Videos are not allowed.');\n"
    "                        return;\n"
    "                      }\n"
    "                      setNewNoteImageUrl(url);\n"
    "                      setNewNoteError(null);\n"
    "                    }}\n"
    "                    onClear={() => setNewNoteImageUrl('')}\n"
    "                    acceptMode=\"image\"\n"
    "                    label=\"Memory Note photo\"\n"
    "                    placeholder=\"Paste a direct image URL or choose an image\"\n"
    "                    compact\n"
    "                    directUpload={{ archiveId: archive.id, token: ownerToken, autoRegister: false }}\n"
    "                    uploadPurpose=\"wall\"\n"
    "                    onBusyChange={setIsUploadingNoteImage}\n"
    "                  />\n"
    "                )}\n"
    "                <p className=\"text-[10px] opacity-60\">Images only. Videos stay available in Journey and Media Vault under their separate limits.</p>\n"
    "              </div>\n\n"
    "              {newNoteError && (\n"
    "                <div role=\"alert\" className=\"rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300\">\n"
    "                  {newNoteError}\n"
    "                </div>\n"
    "              )}\n\n"
    "              <button\n"
    "                type=\"submit\"\n"
    "                disabled={!newNoteText.trim() || isPostingWallNote || isUploadingNoteImage}\n"
    "                className=\"w-full py-3 rounded-xl text-xs font-bold shadow-lg active:scale-95 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2\""
)
exact(
    "src/components/archive/ArchivePublicView.tsx",
    "                <PenTool className=\"w-4 h-4\" />\n                <span>Pin Note to Memory Wall</span>",
    "                <PenTool className=\"w-4 h-4\" />\n"
    "                <span>{isPostingWallNote ? 'Pinning Memory Note…' : isUploadingNoteImage ? 'Uploading photo…' : 'Pin Note to Memory Wall'}</span>"
)

# AUDIT / ASSERTIONS: also preserve the already-fixed editor jump behavior.
r2 = Path("server/r2.ts").read_text()
api = Path("server/api.ts").read_text()
panel = Path("src/components/editor/SectionSettingsPanel.tsx").read_text()
public = Path("src/components/archive/ArchivePublicView.tsx").read_text()
editor = Path("src/components/editor/ArchiveEditor.tsx").read_text()

checks = {
    "vault total 100": "maxVaultAttachments: 100" in r2,
    "vault video 5": "maxVaultVideos: 5" in r2,
    "journey total 20": "maxTimelineAttachments: 20" in r2,
    "journey video 3": "maxTimelineVideos: 3" in r2,
    "memory note images 5": "maxWallImageAttachments: 5" in r2,
    "memory note server image only": "Memory Notes accept image attachments only" in api,
    "recovery route cannot rotate": "status(405)" in api,
    "recovery UI cannot rotate": "rotateRecoveryKey" not in panel and "Replace recovery key" not in panel,
    "memory note image uploader": 'uploadPurpose="wall"' in public and 'acceptMode="image"' in public,
    "jump opens inspector section": "setActiveTab(foundSec.id)" in editor,
    "jump scrolls nested preview": "document.getElementById('editor-preview-stage')" in editor and "stage?.scrollTo" in editor,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Constraint verification failed: " + ", ".join(failed))
print("All requested source constraints verified.")
