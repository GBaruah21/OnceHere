import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Lock,
  Save,
  Rocket,
  Edit3,
  RefreshCw,
  Clock,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { AccessHistoryEntry } from '../../types';

interface AccessHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  archiveId: string;
  archiveTitle: string;
  ownerToken?: string;
}

export const AccessHistoryModal: React.FC<AccessHistoryModalProps> = ({
  isOpen,
  onClose,
  archiveId,
  archiveTitle,
  ownerToken
}) => {
  const [logs, setLogs] = useState<AccessHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/archives/${archiveId}/access-history?limit=5`, {
        headers: { Authorization: `Bearer ${ownerToken || ''}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
      } else {
        setErrorMsg(data.error || 'Failed to fetch access history.');
      }
    } catch {
      setErrorMsg('Network error fetching access history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, archiveId, ownerToken]);

  if (!isOpen) return null;

  const getActionBadge = (action: AccessHistoryEntry['action']) => {
    switch (action) {
      case 'pin_entry':
        return {
          label: 'PIN Verified',
          icon: <KeyRound className="w-3.5 h-3.5 text-emerald-400" />,
          bgColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
        };
      case 'recovery_key_unlock':
        return {
          label: 'Owner Key Unlock',
          icon: <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />,
          bgColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        };
      case 'editor_save':
        return {
          label: 'Settings Saved',
          icon: <Save className="w-3.5 h-3.5 text-blue-400" />,
          bgColor: 'bg-blue-500/10 text-blue-300 border-blue-500/30'
        };
      case 'content_edit':
        return {
          label: 'Content Edit',
          icon: <Edit3 className="w-3.5 h-3.5 text-purple-400" />,
          bgColor: 'bg-purple-500/10 text-purple-300 border-purple-500/30'
        };
      case 'deploy_attempt':
        return {
          label: 'Published',
          icon: <Rocket className="w-3.5 h-3.5 text-amber-400" />,
          bgColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        };
      default:
        return {
          label: 'Access Event',
          icon: <Lock className="w-3.5 h-3.5 text-neutral-400" />,
          bgColor: 'bg-white/10 text-neutral-300 border-white/15'
        };
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let relative = '';
      if (diffMins < 1) relative = 'Just now';
      else if (diffMins < 60) relative = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      else if (diffHours < 24) relative = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      else relative = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return {
        relative,
        exact: date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      };
    } catch {
      return { relative: 'Recently', exact: isoString };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/15 rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl overflow-hidden sm:my-8 flex flex-col max-h-[100dvh] sm:max-h-[90vh] pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-neutral-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-white flex items-center gap-2">
                <span>Access History</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                  Last 5 Entries
                </span>
              </h2>
              <p className="text-xs text-neutral-400 truncate max-w-xs sm:max-w-md">
                Transparency log for “{archiveTitle}”
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              title="Refresh Access Logs"
              className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Informational Sub-header */}
        <div className="px-6 py-3 bg-neutral-950/40 border-b border-white/5 flex items-center gap-2 text-xs text-neutral-300">
          <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>
            Strict transparency: Tracks every successful PIN verification, master key unlock, and workspace edit.
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-neutral-400 space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-amber-400" />
              <p>Loading recent access events...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 space-y-2">
              <ShieldAlert className="w-8 h-8 mx-auto text-neutral-600" />
              <p className="font-semibold text-neutral-300">No Access Logs Recorded Yet</p>
              <p className="text-[11px] text-neutral-500">
                Subsequent PIN unlocks and workspace saves will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {logs.map((log, index) => {
                const badge = getActionBadge(log.action);
                const time = formatTime(log.timestamp);
                const isMobile = (log.deviceInfo || '').toLowerCase().includes('phone') || (log.deviceInfo || '').toLowerCase().includes('ios') || (log.deviceInfo || '').toLowerCase().includes('android');

                return (
                  <div
                    key={log.id || index}
                    className="p-4 rounded-2xl bg-neutral-950/60 border border-white/10 hover:border-white/20 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border ${badge.bgColor}`}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>

                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-neutral-300">
                          {log.actorRole}
                        </span>

                        {log.success && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Verified</span>
                          </span>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-semibold text-white">{time.relative}</span>
                        <div className="text-[10px] font-mono text-neutral-500">{time.exact}</div>
                      </div>
                    </div>

                    <div className="text-xs font-medium text-neutral-200">
                      {log.summary}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 pt-1 border-t border-white/5">
                      <span className="flex items-center gap-1">
                        {isMobile ? <Smartphone className="w-3 h-3 text-neutral-400" /> : <Laptop className="w-3 h-3 text-neutral-400" />}
                        <span>{log.deviceInfo || 'Web Client'}</span>
                      </span>

                      {log.ipHint && (
                        <span className="font-mono text-[10px] text-neutral-400">
                          IP: {log.ipHint}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-950/80 border-t border-white/10 flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Updated in real-time on every authenticated action</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
