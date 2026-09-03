import React, { useState, useEffect } from 'react';
import {
  X,
  Rocket,
  Globe,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Copy,
  ExternalLink,
  ShieldCheck,
  Share2,
  RefreshCw,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Settings
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Archive, Section, TimelineEvent, Member, MediaItem, WallPost, Album } from '../../types';
import { sanitizeSlug, validateSlug } from '../../lib/tenant';
import { PLATFORM_CONFIG } from '../../config/platform';
import { THEMES } from '../../config/themes';
import { ArchivePublicView } from '../archive/ArchivePublicView';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'configure' | 'preview';
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
  initialTab = 'configure',
  archive,
  sections = [],
  timeline = [],
  members = [],
  media = [],
  wall = [],
  albums = [],
  ownerToken,
  onDeploySuccess
}) => {
  // Active View Tab in Deploy Modal: 'configure' | 'preview'
  const [modalTab, setModalTab] = useState<'configure' | 'preview'>('configure');

  useEffect(() => {
    if (isOpen) setModalTab(initialTab);
  }, [isOpen, initialTab]);

  // Preview device simulation state
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Address configuration
  const [addressType, setAddressType] = useState<'path' | 'subdomain' | 'custom'>('path');
  const [slugInput, setSlugInput] = useState(() => archive.slug || sanitizeSlug(archive.title));
  const [customDomainInput, setCustomDomainInput] = useState(archive.customDomain || '');

  // Availability check states
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [suggestedAlternatives, setSuggestedAlternatives] = useState<string[]>([]);

  // Custom domain check state
  const [dnsStatus, setDnsStatus] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedData, setDeployedData] = useState<{ publicUrl: string; subdomainUrl: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Debounced availability check
  useEffect(() => {
    if (!isOpen) return;

    const clean = sanitizeSlug(slugInput);
    if (!clean) {
      setIsSlugAvailable(null);
      setSlugError('Please enter an address slug.');
      return;
    }

    const val = validateSlug(clean);
    if (!val.valid) {
      setIsSlugAvailable(false);
      setSlugError(val.error || 'Invalid address format.');
      return;
    }

    setCheckingSlug(true);
    setSlugError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/domains/check-slug?slug=${encodeURIComponent(clean)}&archiveId=${archive.id}`);
        const data = await res.json();
        setCheckingSlug(false);
        setIsSlugAvailable(data.available);
        if (!data.available) {
          setSlugError(data.reason || 'This address is already taken.');
          if (data.suggestedAlternatives) {
            setSuggestedAlternatives(data.suggestedAlternatives);
          }
        } else {
          setSlugError(null);
          setSuggestedAlternatives([]);
        }
      } catch {
        setCheckingSlug(false);
        setIsSlugAvailable(null);
        setSlugError('Network error checking address availability.');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slugInput, archive.id, isOpen]);

  // Verify custom domain simulator
  const handleVerifyCustomDomain = async () => {
    if (!customDomainInput.trim()) return;
    setDnsStatus('checking');
    try {
      const res = await fetch('/api/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: customDomainInput, archiveId: archive.id })
      });
      const data = await res.json();
      if (data.verified) {
        setDnsStatus('verified');
      } else {
        setDnsStatus('failed');
      }
    } catch {
      setDnsStatus('failed');
    }
  };

  // Perform Final Deployment
  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      setDeployError(null);
      const clean = sanitizeSlug(slugInput);

      const res = await fetch(`/api/archives/${archive.id}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`,
          'x-workspace-slug': archive.workspaceSlug || '',
          'x-archive-id': archive.id
        },
        body: JSON.stringify({
          finalSlug: clean,
          customDomain: addressType === 'custom' ? customDomainInput : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to deploy archive.');
      }

      // Fire celebratory confetti!
      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {
        // Safe fallback
      }

      setDeployedData({
        publicUrl: data.publicUrl || `/s/${clean}`,
        subdomainUrl: data.subdomainUrl || `https://${clean}.oncehere.app`
      });
      onDeploySuccess(data.archive);
      setModalTab('configure');
    } catch (err: any) {
      setDeployError(err.message || 'Deployment failed. Please check your slug and try again.');
    } finally {
      setIsDeploying(false);
    }
  };

  const currentTheme = THEMES[archive.themeId] || THEMES['midnight-cinema'];
  const fullLiveUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/s/${sanitizeSlug(slugInput)}`
      : `https://oncehere.app/s/${sanitizeSlug(slugInput)}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div
        className={`w-full transition-all duration-300 bg-neutral-900 border border-white/15 rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl shadow-black/90 overflow-hidden sm:my-auto max-h-[100dvh] ${
          modalTab === 'preview' ? 'max-w-6xl h-[92vh] flex flex-col' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-400 text-neutral-950 shadow-md shadow-amber-400/20">
              <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-amber-400">
                {modalTab === 'preview' ? 'Live Interactive Preview' : 'Final Step Before Going Live'}
              </div>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white">
                {deployedData
                  ? '🎉 Archive Successfully Deployed!'
                  : modalTab === 'preview'
                  ? 'Preview Archive Before Deploy'
                  : 'Choose Address & Deploy'}
              </h2>
            </div>
          </div>

          {/* Mode Switcher Tabs (Only if not already deployed) */}
          {!deployedData && (
            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 rounded-xl bg-neutral-800 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setModalTab('configure')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    modalTab === 'configure'
                      ? 'bg-amber-400 text-neutral-950 font-bold shadow'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Settings & Deploy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('preview')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    modalTab === 'preview'
                      ? 'bg-amber-400 text-neutral-950 font-bold shadow'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors ml-1 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {deployedData && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/* TAB 1: LIVE INTERACTIVE PREVIEW BEFORE DEPLOY                */}
        {/* ============================================================ */}
        {modalTab === 'preview' && !deployedData && (
          <div className="flex-1 flex flex-col min-h-0 bg-neutral-950">
            {/* Preview Toolbar */}
            <div className="px-4 py-2.5 bg-neutral-900 border-b border-white/10 flex items-center justify-between text-xs text-neutral-300 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-neutral-400">Viewport Simulation:</span>
                <div className="flex items-center p-0.5 rounded-lg bg-neutral-950 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`p-1.5 rounded-md transition-colors ${
                      previewViewport === 'desktop' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                    title="Desktop Preview (100%)"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('tablet')}
                    className={`p-1.5 rounded-md transition-colors ${
                      previewViewport === 'tablet' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                    title="Tablet Preview (768px)"
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`p-1.5 rounded-md transition-colors ${
                      previewViewport === 'mobile' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                    title="Mobile Preview (390px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-amber-300 hidden md:inline">
                  Simulated address: /s/{sanitizeSlug(slugInput) || 'your-slug'}
                </span>
                <button
                  type="button"
                  onClick={() => setModalTab('configure')}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <span>Ready to Deploy</span>
                  <Rocket className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Frame Container */}
            <div data-archive-preview-scroll className="flex-1 overflow-y-auto p-3 sm:p-6 flex justify-center bg-neutral-950">
              <div
                className={`w-full transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-neutral-950 ${
                  previewViewport === 'mobile'
                    ? 'max-w-[390px] min-h-[720px]'
                    : previewViewport === 'tablet'
                    ? 'max-w-[768px] min-h-[850px]'
                    : 'max-w-full'
                }`}
              >
                <ArchivePublicView
                  archive={{
                    ...archive,
                    slug: sanitizeSlug(slugInput) || archive.slug
                  }}
                  sections={sections}
                  timeline={timeline}
                  members={members}
                  media={media}
                  wall={wall}
                  albums={albums}
                  ownerToken={ownerToken}
                  isPreviewMode={true}
                  onBackToPlatform={() => setModalTab('configure')}
                />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: CONFIGURE ADDRESS & DEPLOY                            */}
        {/* ============================================================ */}
        {modalTab === 'configure' && (
          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[75vh]">
            {/* If already successfully deployed */}
            {deployedData ? (
              <div className="text-center space-y-6 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold font-serif text-white">Your Archive is Live!</h3>
                  <p className="text-sm text-neutral-300 max-w-md mx-auto font-light">
                    Your digital memory website has been published to the world. Share this permanent address with your batch and friends:
                  </p>
                </div>

                {/* Copyable link card */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="font-mono text-sm text-amber-400 font-semibold truncate max-w-full text-left">
                    {fullLiveUrl}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(fullLiveUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors flex items-center gap-1.5 w-full sm:w-auto justify-center"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <a
                      href={deployedData.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-md shadow-amber-400/20 transition-all flex items-center gap-1.5 w-full sm:w-auto justify-center"
                    >
                      <span>Visit Live Site</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Attribution verification reminder */}
                <div className="text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Centralized attribution footer active on all pages</span>
                </div>
              </div>
            ) : (
              <>
                {/* Address type selection */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-neutral-300">Choose Address Format</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAddressType('path')}
                      className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        addressType === 'path'
                          ? 'bg-amber-500/15 border-amber-400 text-white font-medium'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-white mb-0.5">1. Path Address (Instant)</div>
                      <div className="font-mono text-[11px] text-amber-400">/s/your-batch</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddressType('subdomain')}
                      className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        addressType === 'subdomain'
                          ? 'bg-amber-500/15 border-amber-400 text-white font-medium'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-white mb-0.5">2. Subdomain</div>
                      <div className="font-mono text-[11px] text-cyan-400">your-batch.oncehere.app</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddressType('custom')}
                      className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        addressType === 'custom'
                          ? 'bg-amber-500/15 border-amber-400 text-white font-medium'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-white mb-0.5">3. Custom Domain</div>
                      <div className="font-mono text-[11px] text-emerald-400">memories.school.edu</div>
                    </button>
                  </div>
                </div>

                {/* Slug Input with Live Validation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-neutral-300">
                      Platform Public Address Slug <span className="text-amber-400">*</span>
                    </label>
                    <span className="font-mono text-neutral-400 text-[11px]">
                      {sanitizeSlug(slugInput).length}/50 chars
                    </span>
                  </div>

                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">
                      /s/
                    </div>
                    <input
                      type="text"
                      value={slugInput}
                      onChange={(e) => setSlugInput(e.target.value)}
                      placeholder="e.g. marys-convent-2026"
                      maxLength={50}
                      className="w-full pl-10 pr-28 py-3 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono placeholder:text-neutral-600 focus:outline-none focus:border-amber-400"
                    />

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {checkingSlug ? (
                        <span className="text-neutral-400 flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </span>
                      ) : isSlugAvailable ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Available</span>
                        </span>
                      ) : slugError ? (
                        <span className="text-rose-400 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Unavailable</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Slug Error & Alternative suggestions */}
                  {slugError && <p className="text-xs text-rose-400 font-medium">{slugError}</p>}

                  {suggestedAlternatives.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] text-neutral-400">Available alternatives:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedAlternatives.map((alt) => (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => setSlugInput(alt)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-400/20 text-neutral-300 hover:text-amber-300 border border-white/10 text-xs font-mono transition-colors"
                          >
                            {alt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom domain input & DNS simulator (if custom domain chosen) */}
                {addressType === 'custom' && (
                  <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-3">
                    <div className="text-xs font-semibold text-neutral-200">Connect Custom Domain</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customDomainInput}
                        onChange={(e) => setCustomDomainInput(e.target.value)}
                        placeholder="e.g. memories.stmarys.org"
                        className="flex-1 px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/15 text-xs text-white placeholder:text-neutral-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyCustomDomain}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 cursor-pointer"
                      >
                        {dnsStatus === 'checking' ? 'Checking...' : 'Verify DNS'}
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 text-[11px] text-neutral-400 space-y-1 font-mono">
                      <div>
                        CNAME Record: <strong>cname.oncehere.app</strong>
                      </div>
                      <div>
                        Status:{' '}
                        <span className={dnsStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>
                          {dnsStatus.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error banner if deploy failed */}
                {deployError && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{deployError}</span>
                  </div>
                )}

                {/* Pre-deployment confirmation review checklist */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-3 text-neutral-300">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-white">Pre-Deployment Overview:</div>
                    <button
                      type="button"
                      onClick={() => setModalTab('preview')}
                      className="px-3 py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview Live Site First</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <div className="text-neutral-400 text-[10px]">Theme</div>
                      <div className="font-bold text-white truncate">{currentTheme.name}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <div className="text-neutral-400 text-[10px]">Milestones</div>
                      <div className="font-bold text-white">{timeline.length} Events</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <div className="text-neutral-400 text-[10px]">People</div>
                      <div className="font-bold text-white">{members.length} Members</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <div className="text-neutral-400 text-[10px]">Media</div>
                      <div className="font-bold text-white">{media.length} Vault Photos</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 text-[11px] text-neutral-400">
                    By publishing, your memory archive will become instantly accessible at{' '}
                    <strong className="text-amber-300">/s/{sanitizeSlug(slugInput)}</strong>.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer Controls */}
        {modalTab === 'configure' && (
          <div className="px-6 sm:px-8 py-4 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between shrink-0">
            {deployedData ? (
              <div className="w-full flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
                >
                  Done & Return to Studio
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-neutral-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalTab('preview')}
                    className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-200 bg-white/10 hover:bg-white/15 border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Preview First</span>
                  </button>

                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying || !isSlugAvailable}
                    id="final-deploy-confirm-btn"
                    className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {isDeploying ? (
                      <>
                        <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Deploying Archive...</span>
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4" />
                        <span>Publish & Deploy Live</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
