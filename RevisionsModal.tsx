import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, CheckCircle2, AlertCircle, Clock, Shield } from 'lucide-react';
import { Revision } from '../../types';

interface RevisionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  archiveId: string;
  ownerToken?: string;
  onRevisionRestored: () => void;
}

export const RevisionsModal: React.FC<RevisionsModalProps> = ({
  isOpen,
  onClose,
  archiveId,
  ownerToken,
  onRevisionRestored
}) => {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchRevisions() {
      try {
        setLoading(true);
        const res = await fetch(`/api/archives/${archiveId}/revisions`, {
          headers: { Authorization: `Bearer ${ownerToken || ''}` }
        });
        const data = await res.json();
        if (res.ok) {
          setRevisions(data.revisions || []);
        } else {
          setErrorMsg(data.error || 'Failed to load revision history.');
        }
      } catch {
        setErrorMsg('Network error fetching revisions.');
      } finally {
        setLoading(false);
      }
    }
    fetchRevisions();
  }, [isOpen, archiveId, ownerToken]);

  const handleRestore = async (revId: string) => {
    if (!confirm('Are you sure you want to restore this revision snapshot? Any unsaved edits will be replaced.')) {
      return;
    }

    try {
      setRestoringId(revId);
      setErrorMsg(null);
      const res = await fetch(`/api/archives/${archiveId}/revisions/${revId}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore revision.');

      setSuccessMsg('Snapshot restored successfully! Reloading studio canvas...');
      setTimeout(() => {
        onRevisionRestored();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/15 rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-white">Revision History</h2>
              <p className="text-xs text-neutral-400">Recent snapshots & point-in-time recovery</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-neutral-400 text-xs flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading revision snapshots...</span>
            </div>
          ) : revisions.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 text-sm">
              No revisions recorded yet. Revisions are created automatically whenever changes are saved.
            </div>
          ) : (
            <div className="space-y-2.5">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 flex items-center justify-between gap-4 transition-all"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <span>{rev.summary}</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-amber-300">
                        {rev.entityType}
                      </span>
                    </div>

                    <div className="text-[11px] text-neutral-400 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        {new Date(rev.createdAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-neutral-500" />
                        {rev.actorType}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestore(rev.id)}
                    disabled={restoringId === rev.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-amber-400 hover:text-neutral-950 text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{restoringId === rev.id ? 'Restoring...' : 'Restore'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-neutral-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-300 hover:text-white bg-white/5"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
