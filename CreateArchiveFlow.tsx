import React, { useState } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Download,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Wand2,
  Lightbulb,
  Camera,
  Layers,
  Palette,
  Check
} from 'lucide-react';
import { ArchiveType, ThemeId, Visibility, ContributionMode, Archive } from '../../types';
import { THEMES, getTheme } from '../../config/themes';
import { evaluatePin, generateRecoveryKey, downloadRecoveryKeyFile, SessionStorage } from '../../lib/security';
import { ARCHIVE_SUGGESTIONS } from '../../config/suggestions';
import { PLATFORM_CONFIG } from '../../config/platform';
import { ImageAnalyzerModal } from '../common/ImageAnalyzerModal';
import { ThemeInteractiveBackdrop } from '../common/ThemeInteractiveBackdrop';

interface CreateArchiveFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onArchiveCreated: (archive: Archive, workspaceSlug: string, ownerToken: string) => void;
  initialType?: ArchiveType;
  initialTheme?: ThemeId;
}

export const CreateArchiveFlow: React.FC<CreateArchiveFlowProps> = ({
  isOpen,
  onClose,
  onArchiveCreated,
  initialType = 'school',
  initialTheme = 'midnight-cinema'
}) => {
  const currentYear = new Date().getFullYear();

  // Wizard state
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [archiveType, setArchiveType] = useState<ArchiveType>(initialType);
  const [title, setTitle] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [startYear, setStartYear] = useState<number>(currentYear - 4);
  const [endYear, setEndYear] = useState<number>(currentYear);
  const [batchLabel, setBatchLabel] = useState('');
  const [approxPeopleCount, setApproxPeopleCount] = useState<number>(100);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [themeId, setThemeId] = useState<ThemeId>(initialTheme);
  const [contributionMode, setContributionMode] = useState<ContributionMode>('pin-protected');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Image Analyzer Modal State
  const [isImageAnalyzerOpen, setIsImageAnalyzerOpen] = useState(false);

  // Generated Recovery Key
  const [recoveryKey, setRecoveryKey] = useState<string>(() => generateRecoveryKey());
  const [hasDownloadedKey, setHasDownloadedKey] = useState(false);

  // Active theme configuration for instant visual feedback
  const activeTheme = getTheme(themeId);

  // PIN validation
  const pinEvaluation = evaluatePin(pin);
  const isPinMatching = pin === confirmPin;

  // Auto-fill batch label helper
  const handleEndYearChange = (year: number) => {
    setEndYear(year);
    if (!batchLabel || batchLabel.startsWith('Class of ')) {
      setBatchLabel(`Class of ${year}`);
    }
  };

  // Suggestions helper for current category
  const categorySuggestions = ARCHIVE_SUGGESTIONS[archiveType] || ARCHIVE_SUGGESTIONS.college;

  const handleApplySampleProfile = () => {
    const randomTitle = categorySuggestions.titles[Math.floor(Math.random() * categorySuggestions.titles.length)];
    const randomOrg = categorySuggestions.organizations[Math.floor(Math.random() * categorySuggestions.organizations.length)];
    const randomSubtitle = categorySuggestions.subtitles[Math.floor(Math.random() * categorySuggestions.subtitles.length)];
    const randomBatch = categorySuggestions.batchLabels[Math.floor(Math.random() * categorySuggestions.batchLabels.length)];

    setTitle(randomTitle);
    setOrganizationName(randomOrg);
    setSubtitle(randomSubtitle);
    setBatchLabel(randomBatch);
  };

  // Step navigation validations
  const canProceedStep2 = title.trim().length >= 2 && organizationName.trim().length >= 2 && startYear <= endYear;
  const canProceedStep4 =
    contributionMode !== 'pin-protected' ||
    (pinEvaluation.isAllowed && isPinMatching && confirmPin.length > 0);

  // Final Step 5 Submission: Create Workspace on Server
  const handleCreateWorkspace = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const payload = {
        archiveType,
        title: title.trim(),
        organizationName: organizationName.trim(),
        subtitle: subtitle.trim() || undefined,
        startYear,
        endYear,
        batchLabel: batchLabel.trim() || `Class of ${endYear}`,
        approxPeopleCount: Number(approxPeopleCount) || undefined,
        themeId,
        visibility,
        contributionMode,
        editorPin: contributionMode === 'pin-protected' ? pin.trim() : undefined,
        recoveryKey: recoveryKey.trim()
      };

      const res = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data: any = {};
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${rawText.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize workspace.');
      }

      // Store owner session token and recovery key
      if (data.archive?.id) {
        if (data.ownerToken) {
          SessionStorage.setOwnerToken(data.archive.id, data.ownerToken);
        }
        if (recoveryKey.trim()) {
          SessionStorage.setRecoveryKey(data.archive.id, recoveryKey.trim());
        }
      }

      onArchiveCreated(data.archive, data.workspaceSlug, data.ownerToken);
    } catch (err: any) {
      console.error('Failed to create workspace:', err);
      setErrorMsg(err.message || 'Something went wrong while setting up the workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md flex min-h-full items-center justify-center animate-in fade-in duration-200">
        <div
          className="w-full max-w-3xl border rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/90 overflow-hidden my-auto max-h-[94vh] flex flex-col transition-colors duration-300"
          style={{
            backgroundColor: step === 3 && themeId === 'paper-polaroids' ? '#1c1917' : '#11131a',
            borderColor: activeTheme.palette.border || 'rgba(255, 255, 255, 0.15)'
          }}
        >
          {/* Header */}
          <div className="px-4 sm:px-8 py-3.5 sm:py-5 border-b border-white/10 flex items-center justify-between bg-neutral-950/80 flex-shrink-0">
            <div>
              <div
                className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest transition-colors"
                style={{ color: activeTheme.palette.accent }}
              >
                Step {step} of 5 · Archive Builder
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-serif text-white mt-0.5">
                {step === 1 && 'Choose Archive Type'}
                {step === 2 && 'Group & Batch Details'}
                {step === 3 && 'Choose a Visual Theme'}
                {step === 4 && 'Configure Editing Access'}
                {step === 5 && 'Initialize Studio Workspace'}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/5 h-1.5 flex-shrink-0">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(step / 5) * 100}%`,
                backgroundColor: activeTheme.palette.accent
              }}
            />
          </div>

          {/* Body content per step */}
          <div className="p-4 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto flex-1 scroll-touch">
            {errorMsg && (
              <div className="p-3.5 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* STEP 1: Choose Archive Type */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-neutral-300 font-light">
                  Select the category that best describes your group. This configures initial sections and milestone templates.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                  {[
                    { id: 'school', label: 'School Batch', desc: 'Kindergarten to 12th Grade', icon: '🏫' },
                    { id: 'college', label: 'College Batch', desc: 'Degrees & Depts', icon: '🎓' },
                    { id: 'university', label: 'University Dept', desc: 'Postgrad & Research', icon: '🏛️' },
                    { id: 'trip', label: 'Trip / Vacation', desc: 'Roadtrips & Getaways', icon: '🏖️' },
                    { id: 'team', label: 'Sports Team', desc: 'Roster & Seasons', icon: '🏆' },
                    { id: 'workplace', label: 'Office / Crew', desc: 'Startups & Squads', icon: '💼' },
                    { id: 'reunion', label: 'Alumni Reunion', desc: '10y/25y Celebrations', icon: '🥂' },
                    { id: 'club', label: 'Club / Society', desc: 'Bands, Drama, Tech', icon: '🎭' },
                    { id: 'custom', label: 'Custom Group', desc: 'Any shared story', icon: '✨' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setArchiveType(item.id as ArchiveType)}
                      className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        archiveType === item.id
                          ? 'bg-amber-500/15 border-amber-400 text-white shadow-lg shadow-amber-500/10 scale-[1.02]'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-base mb-1">{item.icon}</div>
                      <div className="text-sm font-bold font-serif">{item.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-1">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Basic Details */}
            {step === 2 && (
              <div className="space-y-4 sm:space-y-5">
                {/* AI Assistant & Sample Suggestion Action Bar */}
                <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-xs text-amber-300">
                    <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>Click any suggestion below, auto-fill samples, or analyze a photo!</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsImageAnalyzerOpen(true)}
                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5 text-purple-400" />
                      <span>📸 AI Photo Analyzer</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplySampleProfile}
                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>✨ Auto-Fill Samples</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-300">
                        Archive Title <span className="text-amber-400">*</span>
                      </label>
                      <span className="text-[10px] text-neutral-400">Suggestions:</span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Mary’s Convent — Class of 2026"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
                    />
                    {/* Title suggestions chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {categorySuggestions.titles.slice(0, 3).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTitle(t)}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 hover:border-amber-400/40 text-neutral-400 transition-all text-left cursor-pointer"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-300">
                        Organization / Group Name <span className="text-amber-400">*</span>
                      </label>
                      <span className="text-[10px] text-neutral-400">Suggestions:</span>
                    </div>
                    <input
                      type="text"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="e.g. St. Mary’s Convent High School"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
                    />
                    {/* Org suggestions chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {categorySuggestions.organizations.slice(0, 3).map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setOrganizationName(o)}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 hover:border-amber-400/40 text-neutral-400 transition-all text-left cursor-pointer"
                        >
                          + {o}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-300">Subtitle / Tagline (Optional)</label>
                    <span className="text-[10px] text-neutral-400">Click to insert:</span>
                  </div>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="e.g. Twelve years of laughter, cramming, and memories etched in stone."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
                  />
                  {/* Subtitle suggestions chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {categorySuggestions.subtitles.slice(0, 2).map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setSubtitle(sub)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 hover:border-amber-400/40 text-neutral-400 transition-all text-left cursor-pointer"
                      >
                        “{sub}”
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year range & Batch label */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300">Start Year</label>
                    <input
                      type="number"
                      value={startYear}
                      onChange={(e) => setStartYear(parseInt(e.target.value) || 2020)}
                      min={1950}
                      max={2100}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300">End Year</label>
                    <input
                      type="number"
                      value={endYear}
                      onChange={(e) => handleEndYearChange(parseInt(e.target.value) || currentYear)}
                      min={1950}
                      max={2100}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300">Batch Label</label>
                    <input
                      type="text"
                      value={batchLabel}
                      onChange={(e) => setBatchLabel(e.target.value)}
                      placeholder={`Class of ${endYear}`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white"
                    />
                    {/* Batch suggestions */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {categorySuggestions.batchLabels.slice(0, 2).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBatchLabel(b)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 cursor-pointer"
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* People count & Visibility */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-300">Approx. Number of People</label>
                      <div className="flex gap-1">
                        {[30, 60, 120, 300].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setApproxPeopleCount(num)}
                            className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                              approxPeopleCount === num
                                ? 'bg-amber-400 text-black font-bold'
                                : 'bg-white/5 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      value={approxPeopleCount}
                      onChange={(e) => setApproxPeopleCount(parseInt(e.target.value) || 50)}
                      min={1}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300">Initial Visibility</label>
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as Visibility)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="public">Public (Discoverable)</option>
                      <option value="unlisted">Unlisted (Anyone with link)</option>
                      <option value="private">Private (Viewer PIN required)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Select Visual Theme WITH INSTANT LIVE PREVIEW */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm text-neutral-300 font-light">
                    Select a theme to see the <strong className="text-amber-300">live atmosphere update instantly</strong> below:
                  </p>
                  <span
                    className="text-[11px] px-2.5 py-1 rounded-full font-mono font-semibold"
                    style={{
                      backgroundColor: `${activeTheme.palette.accent}20`,
                      color: activeTheme.palette.accent,
                      border: `1px solid ${activeTheme.palette.accent}40`
                    }}
                  >
                    Active: {activeTheme.name}
                  </span>
                </div>

                {/* Theme Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {(['heritage-noir', 'midnight-cinema', 'aurora-glass', 'paper-polaroids', 'neon-afterglow', 'forest-chronicle'] as ThemeId[]).map(
                    (tId) => {
                      const t = THEMES[tId];
                      const isSelected = themeId === tId;
                      return (
                        <div
                          key={tId}
                          onClick={() => setThemeId(tId)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'scale-[1.02] shadow-xl'
                              : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                          }`}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: `${t.palette.accent}15`,
                                  borderColor: t.palette.accent,
                                  color: '#ffffff'
                                }
                              : undefined
                          }
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-bold ${t.headingFont}`}>{t.name}</span>
                            <div className="flex items-center gap-1">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: t.palette.accent }}
                              />
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-neutral-400 leading-snug line-clamp-2">{t.tagline}</p>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* INSTANT LIVE THEME PREVIEW STAGE */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span className="font-semibold flex items-center gap-1.5 text-neutral-200">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Instant Live Archive Theme Preview</span>
                    </span>
                    <span className="font-mono text-[10px]">Real-time Typography & Style Mockup</span>
                  </div>

                  {/* Rendered Live Simulation Card */}
                  <div
                    className="p-5 sm:p-6 rounded-3xl border transition-all duration-300 shadow-2xl relative overflow-hidden"
                    style={{
                      backgroundColor: activeTheme.palette.bg,
                      borderColor: activeTheme.palette.border,
                      color: activeTheme.palette.text
                    }}
                  >
                    {/* Interactive Theme Backdrop */}
                    <ThemeInteractiveBackdrop themeId={themeId} intensity="mockup" interactive={true} />

                    {/* Simulation Header */}
                    <div className="relative z-10 flex items-center justify-between pb-4 border-b" style={{ borderColor: activeTheme.palette.border }}>
                      <div>
                        <div
                          className="text-[10px] font-mono uppercase tracking-widest"
                          style={{ color: activeTheme.palette.accent }}
                        >
                          {organizationName || 'St. Mary’s Convent High'} · {batchLabel || `Class of ${endYear}`}
                        </div>
                        <h3 className={`text-xl sm:text-2xl font-bold mt-1 ${activeTheme.headingFont}`}>
                          {title || 'Mary’s Convent — Class of 2026'}
                        </h3>
                        <p className="text-xs opacity-75 mt-1 max-w-lg font-light">
                          {subtitle || 'Twelve years of laughter, cramming, and memories etched in stone.'}
                        </p>
                      </div>

                      <div
                        className="px-3 py-1 rounded-full text-xs font-semibold border hidden sm:block"
                        style={{
                          backgroundColor: `${activeTheme.palette.accent}20`,
                          color: activeTheme.palette.accent,
                          borderColor: activeTheme.palette.accent
                        }}
                      >
                        {activeTheme.name}
                      </div>
                    </div>

                    {/* Simulation Content Row (Yearbook Card + Polaroid + Wall Note) */}
                    <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                      {/* Sample Yearbook Member */}
                      <div
                        className="p-3 rounded-2xl border transition-all"
                        style={{
                          backgroundColor: activeTheme.palette.bgCard,
                          borderColor: activeTheme.palette.border
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                            alt="Sample portrait"
                            className="w-9 h-9 rounded-full object-cover border"
                            style={{ borderColor: activeTheme.palette.accent }}
                          />
                          <div className="truncate">
                            <div className={`text-xs font-bold truncate ${activeTheme.headingFont}`}>Ananya Sharma</div>
                            <div className="text-[10px] opacity-70">Tech Lead & Debater</div>
                          </div>
                        </div>
                        <div className="text-[11px] italic opacity-85 mt-2 line-clamp-2 font-serif">
                          “Debugging is just looking for the comma you forgot at 3 AM.”
                        </div>
                      </div>

                      {/* Sample Memory Photo Frame */}
                      <div
                        className="p-2.5 rounded-2xl border flex flex-col justify-between"
                        style={{
                          backgroundColor: activeTheme.palette.bgCard,
                          borderColor: activeTheme.palette.border
                        }}
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden mb-2">
                          <img
                            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=400&q=80"
                            alt="Canteen sample"
                            className="w-full h-full object-cover"
                          />
                          <span
                            className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded-md font-mono"
                            style={{
                              backgroundColor: activeTheme.palette.bg,
                              color: activeTheme.palette.text
                            }}
                          >
                            Vault Photo
                          </span>
                        </div>
                        <div className="text-[10px] opacity-80 truncate">Canteen Chai Session ☕</div>
                      </div>

                      {/* Sample Scribble Card */}
                      <div
                        className="p-3 rounded-2xl border flex flex-col justify-between"
                        style={{
                          backgroundColor: activeTheme.palette.bgCard,
                          borderColor: activeTheme.palette.border
                        }}
                      >
                        <div>
                          <div className="text-[10px] font-bold" style={{ color: activeTheme.palette.accent }}>
                            Rohan V. scribbled:
                          </div>
                          <div className="text-[11px] mt-1 opacity-90 leading-snug">
                            “Promise me we meet every December without excuses!”
                          </div>
                        </div>
                        <div className="flex justify-end pt-2">
                          <span
                            className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${activeTheme.palette.accent}25`,
                              color: activeTheme.palette.accent
                            }}
                          >
                            Live Wall Post
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button Preview in Theme Style */}
                    <div className="pt-4 flex items-center justify-between border-t mt-4" style={{ borderColor: activeTheme.palette.border }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] opacity-75">Theme Palette:</span>
                        <div className="flex gap-1">
                          {[
                            activeTheme.palette.bg,
                            activeTheme.palette.bgCard,
                            activeTheme.palette.accent,
                            activeTheme.palette.accentSecondary
                          ].map((color, idx) => (
                            <span
                              key={idx}
                              className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                        style={{
                          backgroundColor: activeTheme.palette.accent,
                          color: '#000000'
                        }}
                      >
                        Sample Theme Action Button
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Editing Access & PIN */}
            {step === 4 && (
              <div className="space-y-5">
                <p className="text-xs sm:text-sm text-neutral-300 font-light">
                  How would you like classmates and friends to contribute stories, photographs, and notes?
                </p>

                {/* Mode cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'pin-protected',
                      label: 'Anyone with PIN',
                      badge: 'Recommended',
                      desc: 'Classmates enter a 4 or 6-digit numeric PIN to contribute.'
                    },
                    {
                      id: 'owner-only',
                      label: 'Owner Only',
                      badge: 'Private',
                      desc: 'Only you as the archive creator can add or edit content.'
                    },
                    {
                      id: 'open',
                      label: 'Open Contribution',
                      badge: 'Public',
                      desc: 'Anyone who visits can submit wall notes and upload media.'
                    }
                  ].map((mode) => (
                    <div
                      key={mode.id}
                      onClick={() => setContributionMode(mode.id as ContributionMode)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        contributionMode === mode.id
                          ? 'bg-amber-500/15 border-amber-400 text-white shadow-md'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold">{mode.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-amber-400">
                            {mode.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{mode.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* PIN Configuration Fields (if pin-protected) */}
                {contributionMode === 'pin-protected' && (
                  <div className="p-5 rounded-2xl bg-neutral-950/80 border border-white/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Set Contributor Access PIN (4 or 6 digits)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showPin ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[11px] text-neutral-400">Enter PIN</label>
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="e.g. 202626"
                          maxLength={6}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/15 text-sm text-white font-mono tracking-widest text-center"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-neutral-400">Confirm PIN</label>
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Confirm PIN"
                          maxLength={6}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/15 text-sm text-white font-mono tracking-widest text-center"
                        />
                      </div>
                    </div>

                    {/* PIN Suggestions Helper */}
                    <div className="flex items-center gap-2 text-xs pt-1">
                      <span className="text-[10px] text-neutral-400">Quick PIN presets:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {['2026', '202626', '1234', '8888', '7777'].map((suggestedPin) => (
                          <button
                            key={suggestedPin}
                            type="button"
                            onClick={() => {
                              setPin(suggestedPin);
                              setConfirmPin(suggestedPin);
                            }}
                            className="px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 font-mono text-[11px] transition-colors cursor-pointer"
                          >
                            {suggestedPin}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* PIN Strength Feedback */}
                    {pin.length > 0 && (
                      <div className="pt-1 flex items-center justify-between text-xs">
                        <span className={`text-[11px] ${pinEvaluation.isAllowed ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {pinEvaluation.message}
                        </span>
                        {confirmPin.length > 0 && (
                          <span className={`text-[11px] font-semibold ${isPinMatching ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPinMatching ? '✓ PIN matches' : '✗ PINs do not match'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 5: Workspace Creation & Owner Recovery Key */}
            {step === 5 && (
              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-amber-200">Owner Recovery Key Generated</div>
                    <p className="mt-1 text-neutral-300 leading-relaxed font-light">
                      Because OnceHere does not require email accounts or passwords, your recovery key is the <strong>only way</strong> to regain owner access if your browser cache is cleared.
                    </p>
                  </div>
                </div>

                {/* Recovery key display box */}
                <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-white/15 text-center space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-mono">
                    Your Archive Recovery Key
                  </div>
                  <div className="text-base sm:text-lg font-mono font-bold text-amber-400 select-all p-3 rounded-xl bg-neutral-900 border border-amber-500/20 break-all">
                    {recoveryKey}
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        downloadRecoveryKeyFile(title || 'Archive', recoveryKey);
                        setHasDownloadedKey(true);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>{hasDownloadedKey ? 'Key Downloaded (Download Again)' : 'Download Recovery Key (.txt)'}</span>
                    </button>
                  </div>
                </div>

                {/* Summary card */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2 text-neutral-300">
                  <div className="font-semibold text-white mb-2">Workspace Summary:</div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Title:</span>
                    <span className="font-medium text-white">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Organization:</span>
                    <span>{organizationName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Years:</span>
                    <span>{startYear} – {endYear}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Theme:</span>
                    <span className="capitalize">{THEMES[themeId].name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Contribution:</span>
                    <span className="capitalize">{contributionMode.replace('-', ' ')}</span>
                  </div>
                  <div className="pt-2 border-t border-white/5 text-[11px] text-amber-300/80">
                    ⚡ Note: You can customize everything inside the editor. Publishing to your custom address is always 1-click away.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Navigation Controls */}
          <div className="px-4 sm:px-8 py-3.5 sm:py-4 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between flex-shrink-0">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <button
                onClick={() => {
                  if (step === 2) {
                    if (!title.trim() || !organizationName.trim()) {
                      setErrorMsg('Please enter an Archive Title and Organization Name (or click "Auto-Fill Samples").');
                      return;
                    }
                    if (startYear > endYear) {
                      setErrorMsg('Start year cannot be after End year.');
                      return;
                    }
                  }
                  if (step === 4 && contributionMode === 'pin-protected') {
                    if (!pin.trim() || pin.trim().length < 4) {
                      setErrorMsg('Please enter a 4-to-6 digit numeric PIN.');
                      return;
                    }
                    if (pin.trim() !== confirmPin.trim()) {
                      setErrorMsg('The PINs do not match.');
                      return;
                    }
                  }
                  setErrorMsg(null);
                  setStep(step + 1);
                }}
                className="px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: activeTheme.palette.accent,
                  color: '#000000'
                }}
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreateWorkspace}
                disabled={isSubmitting}
                id="confirm-create-workspace-btn"
                className="px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: activeTheme.palette.accent,
                  color: '#000000'
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Setting up Studio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Open Studio Workspace</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Image Analyzer Modal Launcher from Step 2 */}
      {isImageAnalyzerOpen && (
        <ImageAnalyzerModal
          isOpen={isImageAnalyzerOpen}
          onClose={() => setIsImageAnalyzerOpen(false)}
          archiveType={archiveType}
          onApplyToVault={(url, caption) => {
            if (!title) setTitle(caption.slice(0, 40));
            if (!subtitle) setSubtitle(caption);
            setIsImageAnalyzerOpen(false);
          }}
          onApplyToWall={(text) => {
            if (!subtitle) setSubtitle(text);
            setIsImageAnalyzerOpen(false);
          }}
        />
      )}
    </>
  );
};

