import React, { useState } from 'react';
import {
  KeyRound,
  X,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  AlertCircle,
  FileText,
  Lock,
} from 'lucide-react';
import { SessionStorage } from '../../lib/security';
import { Archive } from '../../types';

interface KeyAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (archive: Archive, workspaceSlug: string, ownerToken: string) => void;
  initialIdentifier?: string;
}

export const KeyAccessModal: React.FC<KeyAccessModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialIdentifier = ''
}) => {
  const [archiveKey, setArchiveKey] = useState('');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!archiveKey.trim()) {
      setErrorMsg('Please enter your complete owner recovery key.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch('/api/archives/auth/key-access', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: archiveKey.trim(),
          identifier: identifier.trim() || undefined
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      // Save token in storage
      if (data.archive && data.token) {
        SessionStorage.setOwnerToken(data.archive.id, data.token);
        SessionStorage.setWorkspaceToken(data.workspaceSlug, data.token);
      }

      onSuccess(data.archive, data.workspaceSlug, data.token);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not verify Archive Key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-t-3xl rounded-b-none sm:rounded-3xl bg-neutral-900 border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10 flex items-center justify-between bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-serif text-white">Recover Owner Access</h3>
              <p className="text-xs text-neutral-400">Unlock your owner studio workspace from any device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>Owner Recovery Key *</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={archiveKey}
                  onChange={(e) => {
                    setArchiveKey(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Paste the complete recovery key"
                  className="w-full min-h-12 px-4 py-3 rounded-xl bg-neutral-950 border border-white/15 text-base font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  autoFocus
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center justify-between">
                <span>
                  Archive Slug, Title, or URL <span className="text-neutral-500 font-normal">(Optional)</span>
                </span>
                <span className="text-[10px] text-neutral-400">Auto-detected if left blank</span>
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="e.g. marys-convent-2026, St. Mary's, or leave blank"
                className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Recovery help */}
          <p className="text-sm text-neutral-300">This screen is for the owner recovery key. To use a contributor PIN, open the archive and choose Contribute. A private archive asks for its viewer PIN before showing content.</p>
          <button type="button" onClick={() => {
            setArchiveKey('mc_rec_sample_key_123');
            setIdentifier('marys-convent-2025');
            setErrorMsg(null);
          }} className="min-h-11 w-full rounded-xl border border-amber-400/30 text-amber-300 text-sm">
            Try sample key — fictional demo only
          </button>
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-neutral-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>{showHelp ? 'Hide instructions' : 'Why is my PIN not used here?'}</span>
              </button>
            </div>

            {showHelp && (
              <div className="p-4 rounded-2xl bg-neutral-950/80 border border-white/10 text-xs text-neutral-300 space-y-2.5 animate-in fade-in">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Security & Collision Protection:</span>
                </div>
                <ul className="list-disc pl-4 space-y-2 text-[11px] text-neutral-400 leading-relaxed">
                  <li>
                    <strong className="text-neutral-200">Owner Recovery Key:</strong> Generated when you create an archive (e.g. <code>mc_rec_...</code>). Keep it private: anyone with this key can recover owner access.
                  </li>
                  <li><strong className="text-neutral-200">Contributor PIN:</strong> enter it through Contribute on the archive. It never grants owner settings.</li>
                  <li><strong className="text-neutral-200">Viewer PIN:</strong> enter it on a private archive. It only grants viewing.</li>
                  <li>After recovery, open Access &amp; Privacy to replace a forgotten PIN.</li>
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 grid grid-cols-1 sm:flex sm:items-center sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 px-4 py-2 rounded-xl text-sm font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer sm:order-1 order-2"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !archiveKey.trim()}
              className="min-h-12 px-6 py-2.5 rounded-xl text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer sm:order-2 order-1"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Unlock & Open Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
