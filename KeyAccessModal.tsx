import React, { useState } from 'react';
import {
  KeyRound,
  X,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Sparkles,
  AlertCircle,
  FileText,
  Lock,
  ShieldAlert
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

  const isPin = /^\d{4,8}$/.test(archiveKey.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!archiveKey.trim()) {
      setErrorMsg('Please enter your Recovery Key or PIN.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch('/api/archives/auth/key-access', {
        method: 'POST',
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
      }

      onSuccess(data.archive, data.workspaceSlug, data.token);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not verify Archive Key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseDemoKey = () => {
    setArchiveKey('mc_rec_sample_key_123');
    setIdentifier('marys-convent-2025');
    setErrorMsg(null);
  };

  const handleSelectPreset = (key: string, idSlug: string) => {
    setArchiveKey(key);
    setIdentifier(idSlug);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-neutral-900 border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-serif text-white">Access Archive with Key or PIN</h3>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>Owner Recovery Key or PIN *</span>
                <span className="text-[11px] font-normal text-amber-400/90 font-mono">
                  {isPin ? 'PIN Mode' : 'Recovery Key'}
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={archiveKey}
                  onChange={(e) => {
                    setArchiveKey(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="e.g. once-rec-9f8a2b... or 4-digit PIN (e.g. 2026)"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-950 border border-white/15 text-sm font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
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

          {/* Quick Demo & Help Section */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-neutral-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>{showHelp ? 'Hide instructions' : 'How does Key & PIN security work?'}</span>
              </button>

              <button
                type="button"
                onClick={handleUseDemoKey}
                className="text-amber-400/90 hover:text-amber-300 flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Fill Sample Demo Key</span>
              </button>
            </div>

            {/* Quick Demo Shortcuts */}
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
              <div className="text-[11px] font-medium text-neutral-400">Quick Test Credentials:</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('mc_rec_sample_key_123', 'marys-convent-2025')}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-amber-400/20 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors cursor-pointer"
                >
                  Mary's (Master Key)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('202525', 'marys-convent-2025')}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-amber-400/20 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors cursor-pointer"
                >
                  Mary's (PIN: 202525)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('202626', 'riverdale-2026')}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-amber-400/20 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors cursor-pointer"
                >
                  Riverdale (PIN: 202626)
                </button>
              </div>
            </div>

            {showHelp && (
              <div className="p-4 rounded-2xl bg-neutral-950/80 border border-white/10 text-xs text-neutral-300 space-y-2.5 animate-in fade-in">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Security & Collision Protection:</span>
                </div>
                <ul className="list-disc pl-4 space-y-2 text-[11px] text-neutral-400 leading-relaxed">
                  <li>
                    <strong className="text-neutral-200">256-bit Recovery Key:</strong> Generated when you create an archive (e.g. <code>mc_rec_...</code>). Because it is mathematically unique, pasting it opens your studio immediately from anywhere.
                  </li>
                  <li>
                    <strong className="text-neutral-200">PIN Protection:</strong> A 4 or 6 digit PIN (e.g. <code>202525</code>) lets editors collaborate safely.
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !archiveKey.trim()}
              className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
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
