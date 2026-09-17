import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Archive, CheckCircle2, Cloud, Database,
  Gauge, HardDrive, RefreshCw, ShieldCheck, TriangleAlert
} from 'lucide-react';

type Issue = { level: 'critical' | 'warning' | 'info'; message: string };

type AdminHealth = {
  status: 'healthy' | 'attention' | 'degraded';
  checkedAt: string;
  deployment: { provider: string; buildCommit: string; environment: string };
  services: {
    databaseConfigured: boolean;
    databaseIndexLoaded: boolean;
    sessionSigning: boolean;
    objectStorageConfigured: boolean;
    objectStorageConnected: boolean;
    mediaCdnEnabled: boolean;
  };
  storage: {
    provider: string;
    usedBytes: number;
    objectCount: number;
    referenceBytes: number | null;
    remainingBytes: number | null;
    usedPercent: number | null;
    referenceSource: string;
    referenceNote?: string;
    perArchiveLimitBytes: number;
  };
  limits: {
    imageBytes: number;
    videoBytes: number;
    archiveVideos: number;
    vaultAttachments: number;
    journeyAttachments: number;
    yearbookPortraits: number;
    wallImageAttachments: number;
  };
  archives: {
    total: number;
    deployed: number;
    draft: number;
    unpublished: number;
    public: number;
    unlisted: number;
    private: number;
    hiddenFromExplore: number;
  };
  feedback: { emailConfigured: boolean; instagramConfigured: boolean; reportPage: string };
  monitoring: { liveDependencyChecks: boolean; persistentRuntimeErrorHistory: boolean; note: string };
  issues: Issue[];
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unit]}`;
}

function statusTone(status: AdminHealth['status']) {
  if (status === 'healthy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'attention') return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
}

function ServiceBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5">
      <span className="text-xs text-neutral-300">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <TriangleAlert className="w-3.5 h-3.5" />}
        {ok ? 'OK' : 'Issue'}
      </span>
    </div>
  );
}

export function AdminHealthPanel({ ownerKey }: { ownerKey: string }) {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHealth = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
        headers: { 'x-platform-admin-key': ownerKey }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to read platform health.');
      setHealth(data as AdminHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read platform health.');
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void loadHealth();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadHealth();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadHealth]);

  const storagePercent = health?.storage.usedPercent;
  const storageWidth = `${Math.max(0, Math.min(100, storagePercent ?? 0))}%`;
  const issueCounts = useMemo(() => ({
    critical: health?.issues.filter((issue) => issue.level === 'critical').length || 0,
    warning: health?.issues.filter((issue) => issue.level === 'warning').length || 0,
    info: health?.issues.filter((issue) => issue.level === 'info').length || 0
  }), [health]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-5" aria-labelledby="admin-health-title">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <h2 id="admin-health-title" className="text-lg font-bold">System health & capacity</h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">Live operational checks for OnceHere. Sensitive provider credentials are never returned to this page.</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadHealth(); }}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" />Health check unavailable</div>
          <p className="text-xs text-rose-200/80 mt-1">{error}</p>
        </div>
      )}

      {!health && loading && (
        <div className="rounded-xl border border-white/10 bg-neutral-900 p-5 text-sm text-neutral-400">Checking database, storage and deployment health…</div>
      )}

      {health && (
        <>
          <div className={`rounded-xl border px-4 py-3 ${statusTone(health.status)}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold capitalize">
                {health.status === 'healthy' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                {health.status === 'healthy' ? 'All live checks healthy' : health.status === 'attention' ? 'Platform needs attention' : 'Platform degraded'}
              </div>
              <div className="text-[11px] opacity-75">Checked {new Date(health.checkedAt).toLocaleString()}</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <div className="text-2xl font-bold mt-2">{formatBytes(health.storage.usedBytes)}</div>
              <div className="text-xs text-neutral-500">Media stored · {health.storage.objectCount} objects</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <Gauge className="w-4 h-4 text-amber-400" />
              <div className="text-2xl font-bold mt-2">{storagePercent == null ? '—' : `${storagePercent}%`}</div>
              <div className="text-xs text-neutral-500">Storage reference used</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <Cloud className="w-4 h-4 text-amber-400" />
              <div className="text-lg font-bold mt-2 truncate">{formatBytes(health.storage.remainingBytes)}</div>
              <div className="text-xs text-neutral-500">Reference remaining</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <Archive className="w-4 h-4 text-amber-400" />
              <div className="text-2xl font-bold mt-2">{health.archives.total}</div>
              <div className="text-xs text-neutral-500">Active archives</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-400 mb-2">
              <span>{health.storage.referenceSource}</span>
              <span>{formatBytes(health.storage.usedBytes)} / {formatBytes(health.storage.referenceBytes)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden" aria-label="Storage reference usage">
              <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: storagePercent == null ? '0%' : storageWidth }} />
            </div>
            {health.storage.referenceNote && <p className="text-[11px] leading-relaxed text-neutral-600 mt-2">{health.storage.referenceNote}</p>}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm"><Database className="w-4 h-4 text-amber-400" />Live services</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <ServiceBadge ok={health.services.databaseConfigured && health.services.databaseIndexLoaded} label="Turso database" />
                <ServiceBadge ok={health.services.sessionSigning} label="Session signing" />
                <ServiceBadge ok={health.services.objectStorageConfigured && health.services.objectStorageConnected} label={health.storage.provider} />
                <ServiceBadge ok={true} label={health.services.mediaCdnEnabled ? 'Media CDN enabled' : 'Direct signed media'} />
              </div>
              <div className="text-[11px] text-neutral-600 break-all">{health.deployment.provider} · {health.deployment.environment} · build {health.deployment.buildCommit}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm"><ShieldCheck className="w-4 h-4 text-amber-400" />Current product limits</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-neutral-500">Image file</span><span className="text-right">{formatBytes(health.limits.imageBytes)}</span>
                <span className="text-neutral-500">Video file</span><span className="text-right font-semibold text-amber-300">{formatBytes(health.limits.videoBytes)}</span>
                <span className="text-neutral-500">Videos / archive</span><span className="text-right">{health.limits.archiveVideos}</span>
                <span className="text-neutral-500">Storage / archive</span><span className="text-right">{formatBytes(health.storage.perArchiveLimitBytes)}</span>
                <span className="text-neutral-500">Vault attachments</span><span className="text-right">{health.limits.vaultAttachments}</span>
                <span className="text-neutral-500">Journey attachments</span><span className="text-right">{health.limits.journeyAttachments}</span>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ['Deployed', health.archives.deployed],
              ['Draft', health.archives.draft],
              ['Public', health.archives.public],
              ['Private', health.archives.private],
              ['Unlisted', health.archives.unlisted],
              ['Unpublished', health.archives.unpublished],
              ['Hidden', health.archives.hiddenFromExplore],
              ['Reports', health.feedback.reportPage ? 'Enabled' : 'Unavailable']
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5">
                <div className="text-sm font-semibold">{value}</div>
                <div className="text-[11px] text-neutral-600">{label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-neutral-900 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="font-semibold text-sm">Operational issues</div>
              <div className="text-[11px] text-neutral-500">{issueCounts.critical} critical · {issueCounts.warning} warnings · {issueCounts.info} info</div>
            </div>
            {health.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="w-4 h-4" />No live configuration or capacity issues detected.</div>
            ) : (
              <div className="space-y-2">
                {health.issues.map((issue, index) => (
                  <div key={`${issue.level}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${issue.level === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    : issue.level === 'warning'
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                      : 'border-sky-400/20 bg-sky-400/10 text-sky-100'}`}>
                    <span className="font-bold uppercase text-[10px] tracking-wider mr-2">{issue.level}</span>{issue.message}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-neutral-600">{health.monitoring.note}</p>
          </div>

          <div className="text-[11px] text-neutral-600">
            Feedback channels: email {health.feedback.emailConfigured ? 'configured' : 'not configured'} · Instagram {health.feedback.instagramConfigured ? 'configured' : 'not configured'} · content reports {health.feedback.reportPage ? 'enabled' : 'not configured'}.
          </div>
        </>
      )}
    </section>
  );
}
