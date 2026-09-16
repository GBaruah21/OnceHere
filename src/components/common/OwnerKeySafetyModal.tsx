import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, KeyRound, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { Archive } from '../../types';
import { downloadRecoveryKeyFile, SessionStorage } from '../../lib/security';

interface OwnerKeySafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  archive: Archive;
}

export const OwnerKeySafetyModal: React.FC<OwnerKeySafetyModalProps> = ({ isOpen, onClose, archive }) => {
  const [backupKey, setBackupKey] = useState(() => SessionStorage.getBackupRecoveryKey(archive.id) || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'master' | 'backup' | null>(null);

  const masterKey = useMemo(() => SessionStorage.getRecoveryKey(archive.id) || '', [archive.id, isOpen]);

  if (!isOpen) return null;

  const copy = async (value: string, kind: 'master' | 'backup') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setMessage('Copy failed. Select the key text manually or download its backup file.');
    }
  };

  const createOrReplaceBackup = async () => {
    if (busy) return;
    const proceed = window.confirm(
      'Create a new Backup Owner Key? If an older backup key exists, only that backup key will stop working. Your original Master Owner Key will remain valid permanently.'
    );
    if (!proceed) return;

    try {
      setBusy(true);
      setMessage('');
      const token = SessionStorage.getOwnerToken(archive.id) || SessionStorage.getWorkspaceToken(archive.workspaceSlug);
      const response = await fetch(`/api/archives/${encodeURIComponent(archive.id)}/auth/recovery/regenerate`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || typeof data.recoveryKey !== 'string') {
        throw new Error(data.error || 'Could not create the backup owner key.');
      }
      SessionStorage.setBackupRecoveryKey(archive.id, data.recoveryKey);
      setBackupKey(data.recoveryKey);
      setMessage(data.replacedPreviousBackup
        ? 'Backup Owner Key replaced. The original Master Owner Key still works.'
        : 'Backup Owner Key created. The original Master Owner Key still works.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the backup owner key.');
    } finally {
      setBusy(false);
    }
  };

  const KeyRow = ({
    label,
    value,
    kind,
    description
  }: {
    label: string;
    value: string;
    kind: 'master' | 'backup';
    description: string;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/80 p-4 space-y-3">
      <div>
        <div className="text-sm font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span>{label}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{description}</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] font-mono text-amber-200 break-all select-all min-h-11">
        {value || (kind === 'master'
          ? 'Master key is not cached in this tab. Recover with the original master key to reveal/download it here.'
          : 'No backup key is cached in this tab. You may create or replace one below.')}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy(value, kind)}
          disabled={!value}
          className="min-h-11 px-3 rounded-xl border border-white/15 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40 flex items-center gap-1.5"
        >
          {copied === kind ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied === kind ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => downloadRecoveryKeyFile(archive.title, value, kind === 'master' ? 'Master Owner Recovery Key' : 'Backup Owner Recovery Key')}
          disabled={!value}
          className="min-h-11 px-3 rounded-xl border border-amber-400/30 text-xs font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-40 flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md sm:p-4">
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/15 bg-neutral-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/95 px-4 sm:px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2 text-white font-bold">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Owner Key Safety</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Only an authenticated owner session can change the backup key.</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 grid place-items-center rounded-xl text-neutral-300 hover:bg-white/10" aria-label="Close owner key safety">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-xs leading-relaxed text-emerald-100">
            <strong>Your first key cannot be replaced.</strong> The Master Owner Key created with this archive remains valid permanently. Creating a new Backup Owner Key never changes or disables it. Contributor and viewer PINs cannot create or replace owner keys.
          </div>

          <KeyRow
            label="Permanent Master Owner Key"
            value={masterKey}
            kind="master"
            description="The first recovery key. OnceHere stores only its hash. It remains valid even after backup-key replacement."
          />

          <KeyRow
            label="Current Backup Owner Key"
            value={backupKey}
            kind="backup"
            description="Optional secondary owner credential. Replacing it invalidates only the previous backup key, never the master key."
          />

          <button
            type="button"
            onClick={() => void createOrReplaceBackup()}
            disabled={busy}
            className="w-full min-h-12 rounded-2xl bg-amber-400 text-neutral-950 font-bold text-sm hover:bg-amber-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Saving backup key securely…' : 'Create / Replace Backup Owner Key'}
          </button>

          {message && (
            <div role="status" aria-live="polite" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-neutral-200">
              {message}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-neutral-500">
            Save the master key somewhere separate from contributor PINs. A backup key is useful for a second trusted owner device, but anyone holding either owner key can recover full owner access.
          </p>
        </div>
      </div>
    </div>
  );
};
