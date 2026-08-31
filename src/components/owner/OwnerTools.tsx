import React, { useEffect, useState } from 'react';
import { Archive } from '../../types';
import { ArrowLeft, EyeOff, Save, Trash2 } from 'lucide-react';

type Settings = { instagram?: string; email?: string; displayHandle?: string };

export function OwnerTools({ ownerKey, onClose }: { ownerKey: string; onClose: () => void }) {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [notice, setNotice] = useState('');

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
      const [archiveData, settingsData] = await Promise.all([
        request('/api/admin/archives'),
        fetch('/api/platform-settings').then((response) => response.json())
      ]);
      setArchives(archiveData.archives || []);
      setSettings(settingsData.settings || {});
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

  const archiveAction = async (archive: Archive, action: 'delete' | 'unpublish') => {
    const label = action === 'delete' ? 'delete' : 'hide from Explore';
    if (!window.confirm(`Do you want to ${label} "${archive.title}"?`)) return;
    try {
      await request(`/api/admin/archives/${archive.id}${action === 'unpublish' ? '/unpublish' : ''}`, {
        method: action === 'unpublish' ? 'POST' : 'DELETE'
      });
      setNotice(`Archive ${action === 'delete' ? 'deleted' : 'hidden'} successfully.`);
      await load();
    } catch (error: any) {
      setNotice(error.message || 'Unable to change the archive.');
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-4 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-amber-400 text-xs font-bold uppercase tracking-widest">Private Owner Access</p><h1 className="text-3xl font-serif font-bold mt-2">OnceHere Owner Tools</h1><p className="text-sm text-neutral-400 mt-2">Manage simple public settings and archive visibility.</p></div>
          <button onClick={onClose} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15"><ArrowLeft className="w-4 h-4" />Return</button>
        </div>
        {notice && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
          <h2 className="text-lg font-bold">Public contact links</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input value={settings.displayHandle || ''} onChange={(e) => setSettings({ ...settings, displayHandle: e.target.value })} placeholder="Display handle" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
            <input value={settings.instagram || ''} onChange={(e) => setSettings({ ...settings, instagram: e.target.value })} placeholder="Instagram URL" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
            <input value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="Email address" className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2.5 text-sm" />
          </div>
          <button onClick={() => void saveSettings()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 text-neutral-950 text-sm font-bold"><Save className="w-4 h-4" />Save links</button>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="text-lg font-bold">Archive management</h2><p className="text-sm text-neutral-400 mt-1 mb-4">Delete test archives or hide an archive from Explore. Demo archives are protected.</p>
          <div className="space-y-3">{archives.map((archive) => <div key={archive.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-neutral-900 border border-white/10 p-4"><div><div className="font-semibold">{archive.title}</div><div className="text-xs text-neutral-400 mt-1">{archive.organizationName} · {archive.deploymentStatus}</div></div>{archive.id.startsWith('demo-') ? <span className="text-xs text-neutral-500">Protected demo</span> : <div className="flex gap-2"><button onClick={() => void archiveAction(archive, 'unpublish')} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/10"><EyeOff className="w-3.5 h-3.5" />Hide</button><button onClick={() => void archiveAction(archive, 'delete')} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-200"><Trash2 className="w-3.5 h-3.5" />Delete</button></div>}</div>)}</div>
        </section>
      </div>
    </main>
  );
}
