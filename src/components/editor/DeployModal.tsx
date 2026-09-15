import React, { useEffect, useState } from 'react';
import {
  X,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Archive, Section, TimelineEvent, Member, MediaItem, WallPost, Album } from '../../types';
import { sanitizeSlug, validateSlug } from '../../lib/tenant';
import { THEMES } from '../../config/themes';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  archive: Archive;
  sections?: Section[];
  timeline?: TimelineEvent[];
  members?: Member[];
  media?: MediaItem[];
  wall?: WallPost[];
  albums?: Album[];
  ownerToken?: string;
  onDeploySuccess: (updatedArchive: Archive) => void;
}

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  onClose,
  archive,
  sections = [],
  timeline = [],
  members = [],
  media = [],
  ownerToken,
  onDeploySuccess
}) => {
  const [addressType, setAddressType] = useState<'path' | 'subdomain'>('path');
  const [slugInput, setSlugInput] = useState(() => archive.slug || sanitizeSlug(archive.title));
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [suggestedAlternatives, setSuggestedAlternatives] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedData, setDeployedData] = useState<{ publicUrl: string; subdomainUrl: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSlugInput(archive.slug || sanitizeSlug(archive.title));
    setDeployError(null);
    setDeployedData(null);
  }, [archive.slug, archive.title, isOpen]);

  useEffect(() => {
    if (!isOpen || deployedData) return;
    const clean = sanitizeSlug(slugInput);
    if (!clean) {
      setIsSlugAvailable(null);
      setSlugError('Please enter an address slug.');
      return;
    }

    const validation = validateSlug(clean);
    if (!validation.valid) {
      setIsSlugAvailable(false);
      setSlugError(validation.error || 'Invalid address format.');
      return;
    }

    setCheckingSlug(true);
    setSlugError(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/domains/check-slug?slug=${encodeURIComponent(clean)}&archiveId=${archive.id}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not check this address.');
        setIsSlugAvailable(Boolean(data.available));
        if (data.available) {
          setSlugError(null);
          setSuggestedAlternatives([]);
        } else {
          setSlugError(data.reason || 'This address is already taken.');
          setSuggestedAlternatives(Array.isArray(data.suggestedAlternatives) ? data.suggestedAlternatives : []);
        }
      } catch (error) {
        setIsSlugAvailable(null);
        setSlugError(error instanceof Error ? error.message : 'Network error checking address availability.');
      } finally {
        setCheckingSlug(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [archive.id, deployedData, isOpen, slugInput]);

  const handleDeploy = async () => {
    const clean = sanitizeSlug(slugInput);
    const validation = validateSlug(clean);
    if (!validation.valid) {
      setDeployError(validation.error || 'Choose a valid public address first.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      setIsDeploying(true);
      setDeployError(null);
      const response = await fetch(`/api/archives/${archive.id}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`,
          'x-workspace-slug': archive.workspaceSlug || '',
          'x-archive-id': archive.id
        },
        body: JSON.stringify({ finalSlug: clean }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to deploy archive.');

      try {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      } catch {
        // Celebration is optional; deployment is already complete.
      }

      setDeployedData({
        publicUrl: data.publicUrl || `/s/${clean}`,
        subdomainUrl: data.subdomainUrl || `https://${clean}.oncehere.app`
      });
      if (data.archive) onDeploySuccess(data.archive);
    } catch (error: any) {
      setDeployError(error?.name === 'AbortError'
        ? 'Deployment took too long. Your archive is still a safe draft; retry when the connection is stable.'
        : error?.message || 'Deployment failed. Your archive is still a safe draft; try again.');
    } finally {
      window.clearTimeout(timeout);
      setIsDeploying(false);
    }
  };

  const currentTheme = THEMES[archive.themeId] || THEMES['midnight-cinema'];
  const fullLiveUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/s/${sanitizeSlug(slugInput)}`
    : `https://oncehere.app/s/${sanitizeSlug(slugInput)}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-neutral-900 border border-white/15 rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl shadow-black/90 overflow-hidden sm:my-auto max-h-[100dvh] flex flex-col">
        <div className="px-5 sm:px-8 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-400 text-neutral-950 shadow-md shadow-amber-400/20 shrink-0">
              <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-amber-400">
                {deployedData ? 'Published' : 'Final Step Before Going Live'}
              </div>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white truncate">
                {deployedData ? '🎉 Archive Successfully Deployed!' : 'Choose Address & Deploy'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-11 min-h-11 p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-8 space-y-6 overflow-y-auto">
          {deployedData ? (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold font-serif text-white">Your Archive is Live!</h3>
                <p className="text-sm text-neutral-300 max-w-md mx-auto font-light">
                  The archive has been published. Open the real live page to review it exactly as visitors will see it.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-950 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="font-mono text-sm text-amber-400 font-semibold truncate max-w-full text-left">{fullLiveUrl}</div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(fullLiveUrl);
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="min-h-11 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors flex items-center gap-1.5 flex-1 sm:flex-none justify-center"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                  <a
                    href={deployedData.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-md shadow-amber-400/20 transition-all flex items-center gap-1.5 flex-1 sm:flex-none justify-center"
                  >
                    <span>Visit Live Site</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="text-xs text-neutral-400 flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Centralized attribution footer active on all pages</span>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-neutral-300 leading-5">
                Review the archive in the Studio preview while you build it. When it is ready, choose its public address here and publish; after publishing, use <strong className="text-white">Visit Live Site</strong> to verify the visitor view.
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-neutral-300">Choose Address Format</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAddressType('path')}
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${addressType === 'path' ? 'bg-amber-500/15 border-amber-400 text-white font-medium' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}
                  >
                    <div className="font-bold text-white mb-0.5">1. Path Address</div>
                    <div className="font-mono text-[11px] text-amber-400">/s/your-batch</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddressType('subdomain')}
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${addressType === 'subdomain' ? 'bg-amber-500/15 border-amber-400 text-white font-medium' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}
                  >
                    <div className="font-bold text-white mb-0.5">2. Subdomain</div>
                    <div className="font-mono text-[11px] text-cyan-400">your-batch.oncehere.app</div>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="p-3 rounded-xl border text-left text-xs bg-white/[0.03] border-white/10 text-neutral-500 opacity-70 cursor-not-allowed"
                  >
                    <div className="font-bold text-neutral-300 mb-0.5">3. Custom Domain</div>
                    <div className="font-mono text-[11px]">Not configured yet</div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs gap-3">
                  <label className="font-semibold text-neutral-300">Public Address Slug <span className="text-amber-400">*</span></label>
                  <span className="font-mono text-neutral-400 text-[11px]">{sanitizeSlug(slugInput).length}/50</span>
                </div>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">/s/</div>
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(event) => setSlugInput(event.target.value)}
                    placeholder="e.g. marys-convent-2026"
                    maxLength={50}
                    className="w-full pl-10 pr-28 py-3 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono placeholder:text-neutral-600 focus:outline-none focus:border-amber-400"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {checkingSlug ? (
                      <span className="text-neutral-400 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Checking...</span></span>
                    ) : isSlugAvailable ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /><span>Available</span></span>
                    ) : slugError ? (
                      <span className="text-rose-400 font-semibold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>Unavailable</span></span>
                    ) : null}
                  </div>
                </div>
                {slugError && <p className="text-xs text-rose-400 font-medium">{slugError}</p>}
                {suggestedAlternatives.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] text-neutral-400">Available alternatives:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedAlternatives.map((alternative) => (
                        <button
                          key={alternative}
                          type="button"
                          onClick={() => setSlugInput(alternative)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-400/20 text-neutral-300 hover:text-amber-300 border border-white/10 text-xs font-mono transition-colors"
                        >
                          {alternative}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {deployError && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div>{deployError}</div>
                    <div className="mt-1 text-rose-200/75">Nothing was published. Your draft remains safe.</div>
                  </div>
                </div>
              )}

              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-3 text-neutral-300">
                <div className="font-semibold text-white">Pre-Deployment Overview</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5"><div className="text-neutral-400 text-[10px]">Theme</div><div className="font-bold text-white truncate">{currentTheme.name}</div></div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5"><div className="text-neutral-400 text-[10px]">Sections</div><div className="font-bold text-white">{sections.filter((section) => section.isVisible !== false).length} Visible</div></div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5"><div className="text-neutral-400 text-[10px]">Milestones</div><div className="font-bold text-white">{timeline.length} Events</div></div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5"><div className="text-neutral-400 text-[10px]">People / Media</div><div className="font-bold text-white">{members.length} / {media.length}</div></div>
                </div>
                <div className="pt-2 border-t border-white/5 text-[11px] text-neutral-400">
                  Publishing makes the archive accessible at <strong className="text-amber-300">/s/{sanitizeSlug(slugInput) || 'your-address'}</strong>.
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between gap-3 shrink-0">
          {deployedData ? (
            <div className="w-full flex justify-end">
              <button onClick={onClose} className="min-h-11 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all">Done & Return to Studio</button>
            </div>
          ) : (
            <>
              <button onClick={onClose} className="min-h-11 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-neutral-400 hover:text-white">Cancel</button>
              <button
                onClick={() => void handleDeploy()}
                disabled={isDeploying || !isSlugAvailable}
                id="final-deploy-confirm-btn"
                className="min-h-11 px-5 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isDeploying ? (
                  <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span>Deploying Archive...</span></>
                ) : (
                  <><Rocket className="w-4 h-4" /><span>Publish & Deploy Live</span></>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
