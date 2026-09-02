import React, { useEffect, useMemo, useState } from 'react';
import { Album, Archive, MediaItem, Member, Section, ShareActivity, TimelineEvent, WallPost } from '../../types';
import { ArchivePublicView } from '../archive/ArchivePublicView';
import {
  ArrowLeft, CalendarDays, ExternalLink, Eye, EyeOff, FileText,
  Save, Search, Share2, ShieldCheck, Trash2, X
} from 'lucide-react';

type Settings = { instagram?: string; email?: string; displayHandle?: string };
type ArchiveFilter = 'all' | 'draft' | 'deployed' | 'unpublished' | 'hidden';
type AdminPreview = {
  archive: Archive;
  sections: Section[];
  timeline: TimelineEvent[];
  members: Member[];
  media: MediaItem[];
  wall: WallPost[];
  albums: Album[];
  readOnly: true;
};
type AdminShareActivity = ShareActivity & { archiveTitle: string; archiveSlug: string };

const formatDate = (value?: string) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export function OwnerTools({ ownerKey, onClose }: { ownerKey: string; onClose: () => void }) {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [preview, setPreview] = useState<AdminPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [shareActivity, setShareActivity] = useState<AdminShareActivity[]>([]);

  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'x-platform-admin-key': ownerKey, ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Owner action failed.');
    return data;
  };

  const load = async () => {
    try {
      const [archiveData, settingsData, shareData] = await Promise.all([
        request('/api/admin/archives'),
        fetch('/api/platform-settings').then((response) => response.json()),
        request('/api/admin/share-activity')
      ]);
      setArchives(archiveData.archives || []);
      setSettings(settingsData.settings || {});
      setShareActivity(shareData.activity || []);
    } catch (error: any) {
      setNotice(error.message || 'Unable to open Owner Tools.');
    }
  };

  useEffect(() => { void load(); }, []);

  const saveSettings = async () => {
    try {
      await request('/api/admin/platform-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setNotice('Public contact links saved.');
    } catch (error: any) {
      setNotice(error.message || 'Unable to save changes.');
    }
  };

  const archiveAction = async (archive: Archive, action: 'delete' | 'toggle-explore') => {
    const isHidden = Boolean(archive.isHiddenFromExplore) || archive.deploymentStatus === 'unpublished';
    const label = action === 'delete' ? 'delete' : isHidden ? 'restore to Explore' : 'hide from Explore';
    if (!window.confirm(`Do you want to ${label} "${archive.title}"?`)) return;
    try {
      const isExploreAction = action === 'toggle-explore';
      await request(`/api/admin/archives/${archive.id}${isExploreAction ? '/explore-visibility' : ''}`, {
        method: isExploreAction ? 'POST' : 'DELETE',
        headers: isExploreAction ? { 'Content-Type': 'application/json' } : undefined,
        body: isExploreAction ? JSON.stringify({ isHiddenFromExplore: !isHidden }) : undefined
      });
      setNotice(action === 'delete'
        ? 'Archive deleted successfully.'
        : `Archive ${isHidden ? 'restored to' : 'hidden from'} Explore successfully.`);
      await load();
    } catch (error: any) {
      setNotice(error.message || 'Unable to change the archive.');
    }
  };

  const openPreview = async (archive: Archive) => {
    setPreviewLoadingId(archive.id);
    setNotice('');
    try {
      setPreview(await request(`/api/admin/archives/${archive.id}/preview`) as AdminPreview);
    } catch (error: any) {
      setNotice(error.message || 'Unable to preview this archive.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const counts = useMemo(() => ({
    total: archives.length,
    drafts: archives.filter((archive) => archive.deploymentStatus === 'draft').length,
    deployed: archives.filter((archive) => archive.deploymentStatus === 'deployed').length,
    private: archives.filter((archive) => archive.visibility === 'private').length
  }), [archives]);

  const filteredArchives = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...archives]
      .filter((archive) => {
        if (filter === 'hidden') return Boolean(archive.isHiddenFromExplore);
        if (filter !== 'all') return archive.deploymentStatus === filter;
        return true;
      })
      .filter((archive) => !normalizedQuery || [
        archive.title, archive.organizationName, archive.slug,
        archive.workspaceSlug, archive.archiveType
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [archives, filter, query]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-4 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest">Private Owner Access</p>
            <h1 className="text-3xl font-serif font-bold mt-2">OnceHere Owner Tools</h1>
            <p className="text-sm text-neutral-400 mt-2">Inspect creator archives, preview drafts, and manage Explore visibility.</p>
          </div>
          <button onClick={onClose} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15">
            <ArrowLeft className="w-4 h-4" />Return
          </button>
        </div>

        {notice && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
          <h2 className="text-lg font-bold">Public contact links</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input value={settings.displayHandle || ''} onChange={(e) => setSettings({ ...settings, displayHandle: e.target.value })} placeholder="Display handle" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
            <input value={settings.instagram || ''} onChange={(e) => setSettings({ ...settings, instagram: e.target.value })} placeholder="Instagram URL" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
            <input value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="Email address" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
          </div>
          <button onClick={() => void saveSettings()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 text-neutral-950 text-sm font-bold">
            <Save className="w-4 h-4" />Save links
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">Recent archive share activity</h2>
          </div>
          <p className="text-xs text-neutral-500">
            This records use of OnceHere share controls. Instagram and WhatsApp do not tell a website whether the person finally published the story or post.
          </p>
          {shareActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-neutral-500">No share activity recorded yet.</div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {shareActivity.slice(0, 50).map((entry) => (
                <div key={entry.id} className="rounded-xl bg-neutral-900 border border-white/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{entry.archiveTitle}</div>
                    <div className="text-[11px] text-neutral-500 font-mono truncate">{entry.archiveSlug || entry.archiveId}</div>
                  </div>
                  <div className="text-xs text-neutral-400 sm:text-right shrink-0">
                    <div className="capitalize">{entry.channel.replaceAll('_', ' ')} · {entry.action}</div>
                    <div className="text-neutral-600 mt-0.5">{new Date(entry.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <h2 className="text-xl font-bold">All creator archives</h2>
              </div>
              <p className="text-sm text-neutral-400 mt-1">Admin-only Explore view. Draft, private, and unlisted archives stay off the public Explore page.</p>
              <p className="text-xs text-neutral-500 mt-1">OnceHere is account-free, so a creator’s real name or email is not collected unless they put it inside their archive.</p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, workspace or type" className="w-full rounded-xl bg-neutral-900 border border-white/10 pl-9 pr-3 py-2.5 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total archives', value: counts.total, icon: FileText },
              { label: 'Drafts', value: counts.drafts, icon: CalendarDays },
              { label: 'Deployed', value: counts.deployed, icon: ExternalLink },
              { label: 'Private', value: counts.private, icon: ShieldCheck }
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <Icon className="w-4 h-4 text-amber-400" />
                <div className="text-2xl font-bold mt-2">{value}</div>
                <div className="text-xs text-neutral-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All'], ['draft', 'Drafts'], ['deployed', 'Deployed'],
              ['unpublished', 'Unpublished'], ['hidden', 'Hidden from Explore']
            ] as Array<[ArchiveFilter, string]>).map(([value, label]) => (
              <button key={value} onClick={() => setFilter(value)}
                className={`px-3 py-2 rounded-lg text-xs border transition-colors ${filter === value
                  ? 'bg-amber-400 text-neutral-950 border-amber-400 font-bold'
                  : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredArchives.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-neutral-500">No archives match this filter.</div>
            )}
            {filteredArchives.map((archive) => {
              const isHidden = Boolean(archive.isHiddenFromExplore) || archive.deploymentStatus === 'unpublished';
              const isDemo = archive.id.startsWith('demo-');
              const hasPublicPage = archive.deploymentStatus === 'deployed' && Boolean(archive.slug);
              return (
                <article key={archive.id} className="rounded-2xl bg-neutral-900 border border-white/10 p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base truncate">{archive.title}</h3>
                        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-white/10 text-neutral-300">{archive.deploymentStatus}</span>
                        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-amber-400/10 text-amber-300">{archive.visibility}</span>
                        {isHidden && <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-rose-500/10 text-rose-200">Hidden</span>}
                        {isDemo && <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-sky-500/10 text-sky-200">Protected demo</span>}
                      </div>
                      <p className="text-sm text-neutral-400 mt-1">{archive.organizationName}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 mt-3">
                        <span>Created {formatDate(archive.createdAt)}</span>
                        <span>Updated {formatDate(archive.updatedAt)}</span>
                        <span>{archive.membersCount || 0} members</span>
                        <span>{archive.mediaCount || 0} media</span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-600 mt-2 break-all">
                        Workspace: {archive.workspaceSlug} {archive.slug ? `· Public slug: ${archive.slug}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button onClick={() => void openPreview(archive)} disabled={previewLoadingId === archive.id}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-amber-400 text-neutral-950 font-bold disabled:opacity-60">
                        <Eye className="w-3.5 h-3.5" />
                        {previewLoadingId === archive.id ? 'Loading…' : archive.deploymentStatus === 'draft' ? 'Preview Draft' : 'Preview Page'}
                      </button>
                      {hasPublicPage && (
                        <button onClick={() => window.open(`/s/${archive.slug}`, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/10">
                          <ExternalLink className="w-3.5 h-3.5" />Public link
                        </button>
                      )}
                      {!isDemo && (
                        <>
                          <button onClick={() => void archiveAction(archive, 'toggle-explore')} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/10">
                            {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            {isHidden ? 'Unhide' : 'Hide'}
                          </button>
                          <button onClick={() => void archiveAction(archive, 'delete')} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-200">
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md p-2 sm:p-5">
          <div className="h-full max-w-7xl mx-auto rounded-2xl border border-white/15 bg-neutral-950 overflow-hidden flex flex-col shadow-2xl">
            <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-neutral-950">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />Admin-only read-only preview
                </div>
                <div className="text-sm text-neutral-300 truncate mt-1">{preview.archive.title}</div>
              </div>
              <button onClick={() => setPreview(null)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 inline-flex items-center justify-center" aria-label="Close archive preview">
                <X className="w-5 h-5" />
              </button>
            </header>
            <div data-archive-preview-scroll className="flex-1 overflow-y-auto">
              <ArchivePublicView
                archive={preview.archive}
                sections={preview.sections}
                timeline={preview.timeline}
                members={preview.members}
                media={preview.media}
                wall={preview.wall}
                albums={preview.albums}
                isPreviewMode
                readOnly
                onBackToPlatform={() => setPreview(null)}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
