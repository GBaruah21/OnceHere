import React, { useState, useEffect } from 'react';
import {
  Section,
  Archive,
  TimelineEvent,
  Member,
  MediaItem,
  WallPost,
  ThemeId,
  TimelineLayout,
  AccessHistoryEntry
} from '../../types';
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Edit2,
  Calendar,
  User,
  Quote,
  Sparkles,
  Palette,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Download,
  Lightbulb,
  Wand2,
  Camera,
  RefreshCw,
  Clock,
  Laptop,
  Smartphone,
  CheckCircle2,
  Lock,
  ExternalLink,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Save,
  X,
  Star,
  Hash
} from 'lucide-react';
import { THEMES, FONT_PRESETS } from '../../config/themes';
import { downloadRecoveryKeyFile, SessionStorage, evaluatePin } from '../../lib/security';
import {
  ARCHIVE_SUGGESTIONS,
  MILESTONE_SUGGESTIONS,
  MEMBER_SUGGESTIONS,
  ROLE_SUGGESTIONS,
  QUOTE_SUGGESTIONS,
  NOTE_SUGGESTIONS,
  MEDIA_CAPTION_SUGGESTIONS,
  CLOSING_SUGGESTIONS
} from '../../config/suggestions';
import { ImageAnalyzerModal, ImageAnalysisData } from '../common/ImageAnalyzerModal';
import { MediaUploader } from '../common/MediaUploader';

interface SectionSettingsPanelProps {
  activeTab: string; // section ID or 'settings' | 'theme' | 'access'
  archive: Archive;
  sections: Section[];
  timeline: TimelineEvent[];
  members: Member[];
  media: MediaItem[];
  wall: WallPost[];
  ownerToken?: string;
  onOpenAccessHistory?: () => void;
  onChangeEditorPin?: (pin: string) => Promise<void>;
  onChangeViewerPin?: (pin: string) => Promise<void>;
  onUpdateArchive: (updates: Partial<Archive>) => void;
  onUpdateSections: (sections: Section[]) => void;
  onAddTimelineEvent: (event: Partial<TimelineEvent>) => void;
  onUpdateTimelineEvent: (id: string, updates: Partial<TimelineEvent>) => void;
  onReorderTimeline: (events: TimelineEvent[]) => void;
  onDeleteTimelineEvent: (id: string) => void;
  onAddMember: (member: Partial<Member>) => void;
  onUpdateMember: (id: string, updates: Partial<Member>) => void;
  onDeleteMember: (id: string) => void;
  onAddMedia: (media: Partial<MediaItem>) => void;
  onUpdateMedia: (id: string, updates: Partial<MediaItem>) => void;
  onDeleteMedia: (id: string) => void;
  onAddWallPost?: (post: Partial<WallPost>) => void;
  onDeleteWallPost: (id: string) => void;
  onToggleHideWallPost?: (id: string, isHidden: boolean) => void;
}

export const SectionSettingsPanel: React.FC<SectionSettingsPanelProps> = ({
  activeTab,
  archive,
  sections,
  timeline,
  members,
  media,
  wall,
  ownerToken,
  onOpenAccessHistory,
  onChangeEditorPin,
  onChangeViewerPin,
  onUpdateArchive,
  onUpdateSections,
  onAddTimelineEvent,
  onUpdateTimelineEvent,
  onReorderTimeline,
  onDeleteTimelineEvent,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onAddMedia,
  onUpdateMedia,
  onDeleteMedia,
  onAddWallPost,
  onDeleteWallPost,
  onToggleHideWallPost
}) => {
  // Access History State
  const [accessLogs, setAccessLogs] = useState<AccessHistoryEntry[]>([]);
  const [loadingAccessLogs, setLoadingAccessLogs] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [newEditorPin, setNewEditorPin] = useState('');
  const [newViewerPin, setNewViewerPin] = useState('');
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [, setRecoveryKeyVersion] = useState(0);

  const getOrInitRecoveryKey = (): string => {
    return SessionStorage.getRecoveryKey(archive.id) || (archive.id.startsWith('demo-') ? 'mc_rec_sample_key_123' : '');
  };

  const rotateRecoveryKey = async () => {
    const response = await fetch(`/api/archives/${archive.id}/auth/recovery/regenerate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken || ''}` }
    });
    const data = await response.json();
    if (!response.ok || !data.recoveryKey) throw new Error(data.error || 'Could not replace the recovery key.');
    SessionStorage.setRecoveryKey(archive.id, data.recoveryKey);
    setRecoveryKeyVersion((value) => value + 1);
    setPinMessage('New recovery key created. Download it now; the old key no longer works.');
  };

  useEffect(() => {
    if (activeTab === 'access') {
      const fetchLogs = async () => {
        try {
          setLoadingAccessLogs(true);
          const res = await fetch(`/api/archives/${archive.id}/access-history?limit=5`, {
            headers: { Authorization: `Bearer ${ownerToken || ''}` }
          });
          const data = await res.json();
          if (res.ok && Array.isArray(data.logs)) {
            setAccessLogs(data.logs);
          }
        } catch {
          // ignore transient error
        } finally {
          setLoadingAccessLogs(false);
        }
      };
      fetchLogs();
    }
  }, [activeTab, archive.id, ownerToken]);
  // Local states for new sub-items
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventYear, setNewEventYear] = useState('2024');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventIcon, setNewEventIcon] = useState('📍');
  const [newEventImg, setNewEventImg] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberQuote, setNewMemberQuote] = useState('');
  const [newMemberImg, setNewMemberImg] = useState('');
  const [newMemberTags, setNewMemberTags] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [newMediaType, setNewMediaType] = useState<'image' | 'video'>('image');
  const [newMediaHint, setNewMediaHint] = useState('');
  const [newMediaTags, setNewMediaTags] = useState('');
  const [autoAiOnUpload, setAutoAiOnUpload] = useState(true);
  const [isAiAnalyzingMedia, setIsAiAnalyzingMedia] = useState(false);
  const [aiSuggestedNotes, setAiSuggestedNotes] = useState<Array<{ id: string; authorName: string; text: string; selected: boolean }>>([]);
  const [aiDetectedMood, setAiDetectedMood] = useState<string | null>(null);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editMediaCaption, setEditMediaCaption] = useState('');
  const [editMediaTags, setEditMediaTags] = useState('');
  const [editMediaAltText, setEditMediaAltText] = useState('');
  const [editMediaDate, setEditMediaDate] = useState('');
  const [editMediaFeatured, setEditMediaFeatured] = useState(false);

  // Memory Wall local creation state
  const [newWallAuthor, setNewWallAuthor] = useState('');
  const [newWallRole, setNewWallRole] = useState('');
  const [newWallText, setNewWallText] = useState('');
  const [newWallImg, setNewWallImg] = useState('');

  // Image Analyzer Modal State & Target
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [analyzerTarget, setAnalyzerTarget] = useState<'media' | 'member' | 'timeline' | 'wall'>('media');
  const [analyzerEditingMediaId, setAnalyzerEditingMediaId] = useState<string | null>(null);

  const parseTags = (value: string) => Array.from(new Set(
    value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
  ));

  const resetEventForm = () => {
    setEditingEventId(null);
    setNewEventTitle('');
    setNewEventDesc('');
    setNewEventImg('');
    setNewEventIcon('📍');
  };

  const startEditingEvent = (event: TimelineEvent) => {
    setEditingEventId(event.id);
    setNewEventTitle(event.title);
    setNewEventYear(event.yearLabel);
    setNewEventDesc(event.description);
    setNewEventIcon(event.icon || '📍');
    setNewEventImg(event.mediaUrl || '');
  };

  const moveTimelineEvent = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ordered = [...timeline].sort((a, b) => a.position - b.position);
    const sourceIndex = ordered.findIndex((event) => event.id === sourceId);
    const targetIndex = ordered.findIndex((event) => event.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    onReorderTimeline(ordered);
  };

  const moveTimelineBy = (eventId: string, direction: -1 | 1) => {
    const ordered = [...timeline].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((event) => event.id === eventId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    onReorderTimeline(ordered);
  };

  // Automatic Gemini AI analysis for media uploads
  const handleAnalyzeMediaItem = async (mediaSource: string, customHint?: string) => {
    if (!mediaSource || mediaSource.startsWith('data:video') || mediaSource.endsWith('.mp4')) {
      return;
    }

    try {
      setIsAiAnalyzingMedia(true);
      setAiAnalysisError(null);

      const res = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: mediaSource,
          contextHint: customHint || `${archive.title} · ${archive.organizationName}`,
          archiveType: archive.archiveType
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI captions and notes.');
      }

      if (data.analysis) {
        setNewMediaCaption(data.analysis.caption || '');
        setAiDetectedMood(data.analysis.detectedMood || null);
        setAiTags(data.analysis.tags || []);
        
        const rawNotes = data.analysis.suggestedNotes || [];
        const formattedNotes = rawNotes.map((n: any, idx: number) => ({
          id: `ai-note-${Date.now()}-${idx}`,
          authorName: n.authorName || 'Classmate',
          text: n.text || '',
          selected: idx === 0 // Select first note by default
        }));

        setAiSuggestedNotes(formattedNotes);
      }
    } catch (err: any) {
      console.warn('AI analysis notice:', err);
      setAiAnalysisError(err.message || 'Could not reach Gemini service.');
    } finally {
      setIsAiAnalyzingMedia(false);
    }
  };

  const activeSection = sections.find(
    (s) =>
      s.id === activeTab ||
      s.stableType === activeTab ||
      (activeTab.startsWith('section-') && s.stableType === activeTab.replace('section-', ''))
  );

  // Update specific section property
  const handleUpdateSectionTitle = (title: string) => {
    if (!activeSection) return;
    const updated = sections.map((s) =>
      s.id === activeSection.id || s.stableType === activeSection.stableType ? { ...s, displayTitle: title } : s
    );
    onUpdateSections(updated);
  };

  const handleUpdateSectionDesc = (desc: string) => {
    if (!activeSection) return;
    const updated = sections.map((s) =>
      s.id === activeSection.id || s.stableType === activeSection.stableType ? { ...s, description: desc } : s
    );
    onUpdateSections(updated);
  };

  const handleUpdateTimelineLayout = (layout: TimelineLayout) => {
    const updated = sections.map((s) =>
      s.id === activeSection?.id || s.stableType === 'timeline' ? { ...s, layout } : s
    );
    onUpdateSections(updated);
    if (onUpdateArchive) {
      onUpdateArchive({
        settings: {
          ...archive.settings,
          timelineLayout: layout
        } as any
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6 space-y-6 text-neutral-200">
      
      {/* 1. Global Theme & Typography Switcher */}
      {activeTab === 'theme' && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Visual Themes & Atmosphere</h3>
            <p className="text-xs text-neutral-400">Instantly transform colors, ambient lighting, polaroid borders, and visual styling.</p>
          </div>

          <div className="space-y-2.5">
            {(['midnight-cinema', 'heritage-noir', 'aurora-glass', 'paper-polaroids', 'neon-afterglow', 'forest-chronicle'] as ThemeId[]).map((tId) => {
              const t = THEMES[tId];
              const isSelected = archive.themeId === tId;
              return (
                <div
                  key={tId}
                  onClick={() => onUpdateArchive({ themeId: tId })}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400 text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold font-serif flex items-center gap-2">
                      <span>{t.name}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400">{t.tagline}</div>
                  </div>
                  <span
                    className="w-4 h-4 rounded-full border border-black/40 flex-shrink-0"
                    style={{ backgroundColor: t.palette.accent }}
                  />
                </div>
              );
            })}
          </div>

          {/* Typography & Font Presets */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>Typography & Font Styling</span>
              </h4>
              <p className="text-[11px] text-neutral-400">Choose custom font pairings across headings, quotes, and body text.</p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {FONT_PRESETS.map((preset) => {
                const isPresetSelected = (archive.settings?.fontPresetId || 'editorial-heritage') === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() =>
                      onUpdateArchive({
                        settings: {
                          ...archive.settings,
                          fontPresetId: preset.id
                        }
                      })
                    }
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isPresetSelected
                        ? 'bg-amber-400/15 border-amber-400 text-white'
                        : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-bold ${preset.headingClass}`}>
                        {preset.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {preset.description}
                      </div>
                    </div>
                    {isPresetSelected && (
                      <span className="text-xs font-mono text-amber-400 font-bold">Active</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Access & Permissions Settings */}
      {activeTab === 'access' && (
        <div className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Access & Privacy Settings</h3>
            <p className="text-xs text-neutral-400">Manage visibility and contributor security.</p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-neutral-300">Archive Visibility</label>
            <select
              value={archive.visibility}
              onChange={(e) => onUpdateArchive({ visibility: e.target.value as any })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
            >
              <option value="public">Public (Discoverable)</option>
              <option value="unlisted">Unlisted (Link only)</option>
              <option value="private">Private (Viewer PIN required)</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-neutral-300">Contribution Access Mode</label>
            <select
              value={archive.contributionMode}
              onChange={(e) => onUpdateArchive({ contributionMode: e.target.value as any })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
            >
              <option value="pin-protected">Anyone with PIN (Recommended)</option>
              <option value="owner-only">Owner Only (Private editing)</option>
              <option value="open">Open Contribution (Anyone can post notes/photos)</option>
            </select>
          </div>

          {archive.contributionMode === 'pin-protected' && (
            <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-neutral-300">Change Contributor PIN</label>
              <input
                type="password"
                value={newEditorPin}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter new 4 or 6 digit numeric PIN"
                onChange={(e) => setNewEditorPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full min-h-12 px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/15 text-base text-white font-mono"
              />
              <button
                type="button"
                disabled={!evaluatePin(newEditorPin).isAllowed || !onChangeEditorPin}
                onClick={async () => {
                  try {
                    await onChangeEditorPin?.(newEditorPin);
                    setNewEditorPin('');
                    setPinMessage('Contributor PIN updated.');
                  } catch (error: any) {
                    setPinMessage(error.message || 'Could not update PIN.');
                  }
                }}
                className="w-full min-h-11 rounded-xl bg-amber-400 text-neutral-950 text-sm font-semibold disabled:opacity-40"
              >
                Save Contributor PIN
              </button>
              <p className="text-[11px] text-neutral-500">{newEditorPin ? evaluatePin(newEditorPin).message : 'Must be 4 or 6 numbers.'}</p>
            </div>
          )}

          {archive.visibility === 'private' && (
            <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-neutral-300">Change Private Viewer PIN</label>
              <input
                type="password"
                value={newViewerPin}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="New viewer PIN"
                onChange={(e) => setNewViewerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full min-h-12 px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/15 text-base text-white font-mono"
              />
              <button
                type="button"
                disabled={!evaluatePin(newViewerPin).isAllowed || !onChangeViewerPin}
                onClick={async () => {
                  try {
                    await onChangeViewerPin?.(newViewerPin);
                    setNewViewerPin('');
                    setPinMessage('Viewer PIN updated.');
                  } catch (error: any) {
                    setPinMessage(error.message || 'Could not update PIN.');
                  }
                }}
                className="w-full min-h-11 rounded-xl bg-sky-300 text-neutral-950 text-sm font-semibold disabled:opacity-40"
              >
                Save Viewer PIN
              </button>
              <p className="text-[11px] text-neutral-500">This PIN grants viewing only. Keep it separate from the contributor PIN.</p>
            </div>
          )}
          {pinMessage && <p role="status" className="text-xs text-amber-300">{pinMessage}</p>}

          <div className="pt-4 border-t border-white/10 space-y-3">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Owner Master Recovery Key</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Use this 256-bit cryptographic key to unlock studio rights from any new device.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-neutral-900 border border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-amber-300 select-all break-all">
                  {getOrInitRecoveryKey() || 'Hidden for security — replace it to receive a new key'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const k = getOrInitRecoveryKey();
                    if (!k) return;
                    navigator.clipboard?.writeText(k);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  disabled={!getOrInitRecoveryKey()}
                  className="min-h-11 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-300" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => downloadRecoveryKeyFile(archive.title, getOrInitRecoveryKey())}
                  disabled={!getOrInitRecoveryKey()}
                  className="min-h-11 text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .txt Key File</span>
                </button>
                <button type="button" onClick={async () => { try { await rotateRecoveryKey(); } catch (error: any) { setPinMessage(error.message || 'Could not replace key.'); } }} className="min-h-11 px-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-xs text-rose-200">Replace recovery key</button>
              </div>
            </div>
          </div>

          {/* Access History Log Section */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Access History Log</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Last 5 Entries
                </span>
              </div>

              {onOpenAccessHistory && (
                <button
                  type="button"
                  onClick={onOpenAccessHistory}
                  className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>Full Log</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Provides transparency on who accessed or modified this archive via PIN entry, master recovery keys, or editor sessions.
            </p>

            {loadingAccessLogs ? (
              <div className="p-4 rounded-xl bg-neutral-950/60 border border-white/10 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Loading access log entries...</span>
              </div>
            ) : accessLogs.length === 0 ? (
              <div className="p-4 rounded-xl bg-neutral-950/60 border border-white/10 text-center text-xs text-neutral-500 space-y-1">
                <Lock className="w-4 h-4 mx-auto text-neutral-600 mb-1" />
                <p className="font-medium text-neutral-400">No Access Logs Yet</p>
                <p className="text-[10px]">PIN verifications and edits will be logged here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accessLogs.slice(0, 5).map((log, idx) => {
                  let badge = {
                    label: 'PIN Entry',
                    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                  };
                  if (log.action === 'recovery_key_unlock') {
                    badge = { label: 'Master Key', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
                  } else if (log.action === 'editor_save') {
                    badge = { label: 'Settings', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' };
                  } else if (log.action === 'content_edit') {
                    badge = { label: 'Content Edit', color: 'text-purple-300 bg-purple-500/10 border-purple-500/30' };
                  } else if (log.action === 'deploy_attempt') {
                    badge = { label: 'Published', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
                  }

                  let timeStr = 'Recent';
                  try {
                    const d = new Date(log.timestamp);
                    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
                    if (diffMins < 1) timeStr = 'Just now';
                    else if (diffMins < 60) timeStr = `${diffMins}m ago`;
                    else if (diffMins < 1440) timeStr = `${Math.floor(diffMins / 60)}h ago`;
                    else timeStr = `${Math.floor(diffMins / 1440)}d ago`;
                  } catch {
                    timeStr = 'Recent';
                  }

                  const isMobile = (log.deviceInfo || '').toLowerCase().includes('phone') || (log.deviceInfo || '').toLowerCase().includes('ios') || (log.deviceInfo || '').toLowerCase().includes('android');

                  return (
                    <div
                      key={log.id || idx}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-neutral-400">
                            {log.actorRole}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-neutral-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{timeStr}</span>
                        </span>
                      </div>

                      <div className="text-xs text-neutral-200 font-medium line-clamp-1">
                        {log.summary}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-white/5">
                        <span className="flex items-center gap-1">
                          {isMobile ? <Smartphone className="w-2.5 h-2.5" /> : <Laptop className="w-2.5 h-2.5" />}
                          <span>{log.deviceInfo || 'Web Client'}</span>
                        </span>
                        {log.ipHint && (
                          <span className="font-mono">{log.ipHint}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. HERO Section Editor */}
      {activeSection?.stableType === 'hero' && (
        <div className="space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Hero & Opening Section</h3>
            <p className="text-xs text-neutral-400">Customize the headline and opening aesthetic.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Archive Title</label>
                <span className="text-[10px] text-neutral-400">Suggestions:</span>
              </div>
              <input
                type="text"
                value={archive.title}
                onChange={(e) => onUpdateArchive({ title: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {['Mary’s Convent — Class of 2026', 'The Golden Engineering Batch (2022–2026)', 'IIT Delhi — CSE Legends', 'The Goa Escape ’25'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onUpdateArchive({ title: t })}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 truncate max-w-full text-left"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Organization Name</label>
                <span className="text-[10px] text-neutral-400">Suggestions:</span>
              </div>
              <input
                type="text"
                value={archive.organizationName}
                onChange={(e) => onUpdateArchive({ organizationName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {['Riverdale Institute of Technology', 'St. Mary’s Convent High School', 'Delhi University', 'National Institute of Technology'].map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onUpdateArchive({ organizationName: o })}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400"
                  >
                    + {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Subtitle / Tagline</label>
                <span className="text-[10px] text-neutral-400">Suggestions:</span>
              </div>
              <textarea
                value={archive.subtitle || ''}
                onChange={(e) => onUpdateArchive({ subtitle: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  'Four years of late-night chai, 3 AM debugging, and lifelong bonds.',
                  'Twelve years of laughter, cramming, and memories etched in stone.',
                  'From strangers in the hallway to brothers in the arena.'
                ].map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => onUpdateArchive({ subtitle: sub })}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 text-left"
                  >
                    “{sub}”
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Primary Button Text</label>
                <span className="text-[10px] text-neutral-400">Presets:</span>
              </div>
              <input
                type="text"
                value={archive.settings?.heroButtonText || 'Step Back in Time'}
                onChange={(e) =>
                  onUpdateArchive({
                    settings: { ...archive.settings, heroButtonText: e.target.value }
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {['Step Back in Time', 'Explore Memories', 'Open Time Capsule', 'View Roll Call', 'Begin Journey'].map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() =>
                      onUpdateArchive({
                        settings: { ...archive.settings, heroButtonText: btn }
                      })
                    }
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400"
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TIMELINE Section Editor */}
      {activeSection?.stableType === 'timeline' && (
        <div className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Timeline / Journey Editor</h3>
            <p className="text-xs text-neutral-400">Add milestones and choose presentation layout.</p>
          </div>

          {/* Layout selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">Timeline Layout Style</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'vertical-cinematic', label: 'Vertical Cinematic' },
                { id: 'horizontal-slider', label: 'Horizontal Slider' },
                { id: 'stacked-cards', label: 'Stacked Cards' },
                { id: 'chapter-story', label: 'Story Chapters' }
              ].map((lay) => (
                <button
                  key={lay.id}
                  type="button"
                  onClick={() => handleUpdateTimelineLayout(lay.id as TimelineLayout)}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    (activeSection.layout || 'vertical-cinematic') === lay.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                      : 'bg-white/5 border-white/10 text-neutral-400'
                  }`}
                >
                  {lay.label}
                </button>
              ))}
            </div>
          </div>

          {/* Add new milestone card */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                {editingEventId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingEventId ? 'Edit Milestone' : 'Add New Milestone'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAnalyzerTarget('timeline');
                  setIsAnalyzerOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Camera className="w-3 h-3 text-purple-400" />
                <span>AI Milestone Photo</span>
              </button>
            </div>

            {/* Quick Preset Milestones Chips */}
            <div className="flex flex-wrap gap-1 pb-1">
              {MILESTONE_SUGGESTIONS.slice(0, 4).map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setNewEventIcon(preset.icon);
                    setNewEventYear(preset.year);
                    setNewEventTitle(preset.title);
                    setNewEventDesc(preset.description);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{preset.icon}</span>
                  <span className="truncate max-w-[120px]">{preset.title}</span>
                </button>
              ))}
            </div>

            {/* Emoji Quick Picker */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] text-neutral-400">Icon:</span>
              <div className="flex flex-wrap gap-1">
                {['🎒', '🏫', '☕', '💻', '🏆', '🏖️', '🎸', '📝', '🎓', '🍕'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEventIcon(emoji)}
                    className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                      newEventIcon === emoji ? 'bg-amber-400/30 border border-amber-400' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newEventYear}
                onChange={(e) => setNewEventYear(e.target.value)}
                placeholder="Year (e.g. 2024)"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white font-mono"
              />
              <input
                type="text"
                value={newEventIcon}
                onChange={(e) => setNewEventIcon(e.target.value)}
                placeholder="Emoji 🎒"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
              <input
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Milestone Title *"
                className="col-span-3 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
            </div>

            <textarea
              value={newEventDesc}
              onChange={(e) => setNewEventDesc(e.target.value)}
              placeholder="What made this moment unforgettable?"
              rows={2}
              className="w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
            />

            <MediaUploader
              acceptMode="image-video"
              value={newEventImg}
              onChange={(url) => setNewEventImg(url)}
              label="Milestone Media Attachment (Optional)"
              placeholder="Paste photo/video URL or upload local file..."
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!newEventTitle.trim()) return;
                  const values = {
                    title: newEventTitle.trim(),
                    yearLabel: newEventYear.trim(),
                    description: newEventDesc.trim(),
                    icon: newEventIcon.trim() || '📍',
                    mediaUrl: newEventImg.trim() || undefined
                  };
                  if (editingEventId) onUpdateTimelineEvent(editingEventId, values);
                  else onAddTimelineEvent(values);
                  resetEventForm();
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {editingEventId && <Save className="w-3.5 h-3.5" />}
                {editingEventId ? 'Save Milestone Changes' : 'Add Milestone to Journey'}
              </button>
              {editingEventId && (
                <button type="button" onClick={resetEventForm} className="px-3 rounded-xl border border-white/15 bg-white/5 text-neutral-300 hover:text-white" title="Cancel editing">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* List existing milestones */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-400">Current Milestones ({timeline.length})</div>
            {[...timeline].sort((a, b) => a.position - b.position).map((event, index) => (
              <div
                key={event.id}
                draggable
                onDragStart={() => setDraggedEventId(event.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedEventId) moveTimelineEvent(draggedEventId, event.id);
                  setDraggedEventId(null);
                }}
                onDragEnd={() => setDraggedEventId(null)}
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${draggedEventId === event.id ? 'bg-amber-500/15 border-amber-400/50 opacity-70' : 'bg-white/5 border-white/10'}`}
              >
                <div className="w-full sm:w-auto flex items-center gap-2 min-w-0">
                <GripVertical className="hidden sm:block w-4 h-4 text-neutral-500 cursor-grab active:cursor-grabbing shrink-0" aria-label="Drag to reorder" />
                <div className="truncate flex-1 min-w-0">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{event.icon}</span>
                    <span className="font-mono text-amber-400">[{event.yearLabel}]</span>
                    <span className="truncate">{event.title}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate mt-0.5">{event.description}</div>
                </div>
                </div>

                <div className="grid grid-cols-4 gap-2 shrink-0 w-full sm:w-auto">
                  <button type="button" onClick={() => moveTimelineBy(event.id, -1)} disabled={index === 0} className="min-h-11 min-w-11 p-2 rounded-lg bg-white/5 text-neutral-400 hover:text-white disabled:opacity-20 flex items-center justify-center" title="Move earlier">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => moveTimelineBy(event.id, 1)} disabled={index === timeline.length - 1} className="min-h-11 min-w-11 p-2 rounded-lg bg-white/5 text-neutral-400 hover:text-white disabled:opacity-20 flex items-center justify-center" title="Move later">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => startEditingEvent(event)} className="min-h-11 min-w-11 p-2 rounded-lg text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 flex items-center justify-center" title="Edit milestone">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => onDeleteTimelineEvent(event.id)} className="min-h-11 min-w-11 p-2 rounded-lg text-neutral-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 flex items-center justify-center" title="Delete milestone">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. MEMBERS / YEARBOOK Section Editor */}
      {activeSection?.stableType === 'members' && (
        <div className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Yearbook & Members</h3>
            <p className="text-xs text-neutral-400">Add portraits, yearbook quotes, and roles.</p>
          </div>

          {/* Add Member Card */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                {editingMemberId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingMemberId ? 'Edit Member' : 'Add Classmate / Member'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAnalyzerTarget('member');
                  setIsAnalyzerOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Camera className="w-3 h-3 text-purple-400" />
                <span>AI Analyze Portrait</span>
              </button>
            </div>

            {/* Quick Profile Samples Chips */}
            <div className="flex flex-wrap gap-1 pb-1">
              {MEMBER_SUGGESTIONS.slice(0, 3).map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => {
                    setNewMemberName(sample.name);
                    setNewMemberRole(sample.role);
                    setNewMemberQuote(sample.quote);
                    setNewMemberImg(sample.imageUrl);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>👤</span>
                  <span>{sample.name}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Full Name *"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
              <input
                type="text"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                placeholder="Branch / Role *"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
            </div>

            {/* Role Suggestions */}
            <div className="flex flex-wrap gap-1">
              {ROLE_SUGGESTIONS.slice(0, 6).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNewMemberRole(r)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400"
                >
                  + {r}
                </button>
              ))}
            </div>

            <textarea
              value={newMemberQuote}
              onChange={(e) => setNewMemberQuote(e.target.value)}
              placeholder="Yearbook Quote (e.g. 'Never skip cheese toast on rainy days')"
              rows={2}
              className="w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
            />

            {/* Quote Suggestions */}
            <div className="flex flex-wrap gap-1">
              {QUOTE_SUGGESTIONS.slice(0, 3).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setNewMemberQuote(q)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 truncate max-w-full text-left"
                >
                  “{q.slice(1, 35)}...”
                </button>
              ))}
            </div>

            <MediaUploader
              acceptMode="image"
              value={newMemberImg}
              onChange={(url) => setNewMemberImg(url)}
              label="Portrait Photo / Avatar"
              placeholder="Paste portrait image URL or choose file from device..."
              onOpenAnalyzer={() => {
                setAnalyzerTarget('member');
                setIsAnalyzerOpen(true);
              }}
            />

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300">Profile tags</label>
              <input
                type="text"
                value={newMemberTags}
                onChange={(e) => setNewMemberTags(e.target.value)}
                placeholder="e.g. CSE, Student Council, Backbench Club"
                className="w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!newMemberName.trim()) return;
                  const values = {
                    name: newMemberName.trim(),
                    groupLabel: newMemberRole.trim() || undefined,
                    quote: newMemberQuote.trim() || undefined,
                    imageUrl: newMemberImg.trim() || undefined,
                    tags: parseTags(newMemberTags)
                  };
                  if (editingMemberId) onUpdateMember(editingMemberId, values);
                  else onAddMember(values);
                  setEditingMemberId(null);
                  setNewMemberName('');
                  setNewMemberRole('');
                  setNewMemberQuote('');
                  setNewMemberImg('');
                  setNewMemberTags('');
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-sm transition-all cursor-pointer"
              >
                {editingMemberId ? 'Save Member Changes' : 'Add Member to Yearbook'}
              </button>
              {editingMemberId && (
                <button type="button" onClick={() => {
                  setEditingMemberId(null);
                  setNewMemberName(''); setNewMemberRole(''); setNewMemberQuote(''); setNewMemberImg(''); setNewMemberTags('');
                }} className="px-3 rounded-xl border border-white/15 bg-white/5 text-neutral-300" title="Cancel editing">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* List members */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-400">Classmates in Directory ({members.length})</div>
            {members.map((member) => (
              <div
                key={member.id}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 overflow-hidden flex-shrink-0">
                    <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-white truncate">{member.name}</div>
                    <div className="text-[10px] text-neutral-400 truncate">{member.groupLabel || 'Member'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => {
                    setEditingMemberId(member.id);
                    setNewMemberName(member.name);
                    setNewMemberRole(member.groupLabel || '');
                    setNewMemberQuote(member.quote || '');
                    setNewMemberImg(member.imageUrl || '');
                    setNewMemberTags((member.tags || []).join(', '));
                  }} className="min-w-11 min-h-11 p-2 rounded-lg text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 flex items-center justify-center" title="Edit member">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => onDeleteMember(member.id)} className="min-w-11 min-h-11 p-2 rounded-lg text-neutral-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 flex items-center justify-center" title="Delete member">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. MEDIA VAULT Section Editor */}
      {activeSection?.stableType === 'media-vault' && (
        <div className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Media Vault</h3>
            <p className="text-xs text-neutral-400">High-resolution photo dumps, video highlights, and AI-generated nostalgic captions & notes.</p>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">Memories visible before “Show more”</label>
            <select
              value={archive.settings?.mediaInitialDisplayCount || 12}
              onChange={(e) => onUpdateArchive({
                settings: { ...archive.settings, mediaInitialDisplayCount: Number(e.target.value) }
              })}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
            >
              {[4, 8, 12, 16, 24, 40].map((count) => <option key={count} value={count}>{count} memories</option>)}
            </select>
            <p className="text-[10px] text-neutral-500">Visitors can still filter categories or open the remaining memories.</p>
          </div>

          {/* Add media with Gemini AI integration */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Photo or Video to Vault</span>
              </div>

              {/* Gemini AI Auto-Describe Toggle */}
              <label className="flex items-center gap-1.5 text-[11px] text-purple-300 font-medium cursor-pointer bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-400/30 transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Gemini AI Auto-Caption</span>
                <input
                  type="checkbox"
                  checked={autoAiOnUpload}
                  onChange={(e) => setAutoAiOnUpload(e.target.checked)}
                  className="rounded border-purple-400 text-purple-600 focus:ring-0 ml-1 cursor-pointer"
                />
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-purple-400" /> Tell AI what this memory is
              </label>
              <input
                type="text"
                value={newMediaHint}
                onChange={(e) => setNewMediaHint(e.target.value)}
                placeholder="e.g. Teachers’ Day celebration, farewell group photo, first college trip"
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-purple-400/25 text-xs text-white focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] text-neutral-500">This clue is combined with the image and anything you type in the caption.</p>
            </div>

            <MediaUploader
              acceptMode="image-video"
              value={newMediaUrl}
              onChange={(url, type) => {
                setNewMediaUrl(url);
                if (type) setNewMediaType(type);
                if (url && type !== 'video' && autoAiOnUpload) {
                  handleAnalyzeMediaItem(url, newMediaHint);
                }
              }}
              label="Select Media File or Link"
              placeholder="Paste image/video URL or upload local file..."
              onOpenAnalyzer={() => {
                setAnalyzerTarget('media');
                setIsAnalyzerOpen(true);
              }}
            />

            {/* Manual AI Trigger Button if photo is present */}
            {newMediaUrl && newMediaType !== 'video' && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleAnalyzeMediaItem(newMediaUrl, [newMediaHint, newMediaCaption && `Creator draft: ${newMediaCaption}`].filter(Boolean).join('. '))}
                  disabled={isAiAnalyzingMedia}
                  className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-purple-500/20 via-pink-500/15 to-amber-500/20 hover:from-purple-500/30 hover:to-amber-500/30 border border-purple-400/30 text-purple-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-purple-400 ${isAiAnalyzingMedia ? 'animate-spin' : ''}`} />
                  <span>{isAiAnalyzingMedia ? 'Gemini is Analyzing Photo & Generating Memories...' : '✨ Generate Captions & Suggested Notes with Gemini'}</span>
                </button>
              </div>
            )}

            {/* AI Loading indicator */}
            {isAiAnalyzingMedia && (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-400/20 text-purple-200 text-xs flex items-center gap-2.5 animate-pulse">
                <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
                <div>
                  <div className="font-semibold">Gemini Vision Intelligence Active</div>
                  <div className="text-[10px] text-purple-300/80">Extracting emotion, writing vivid captions, and suggesting classmate notes...</div>
                </div>
              </div>
            )}

            {/* AI Atmosphere Mood Badge */}
            {aiDetectedMood && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Atmosphere:</span>
                <span className="font-semibold">{aiDetectedMood}</span>
              </div>
            )}

            {/* Caption Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center justify-between">
                <span>Descriptive Caption</span>
                {aiDetectedMood && <span className="text-[10px] text-purple-400">✨ Gemini Generated</span>}
              </label>
              <input
                type="text"
                value={newMediaCaption}
                onChange={(e) => setNewMediaCaption(e.target.value)}
                placeholder="Caption (e.g. Late night canteen memories and chai debates)"
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              {newMediaUrl && newMediaType !== 'video' && newMediaCaption.trim() && (
                <button
                  type="button"
                  onClick={() => handleAnalyzeMediaItem(newMediaUrl, [newMediaHint, `Keep the creator's meaning and improve this draft caption: ${newMediaCaption}`].filter(Boolean).join('. '))}
                  disabled={isAiAnalyzingMedia}
                  className="w-full mt-1.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-400/25 text-[11px] text-purple-200 hover:bg-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" /> Improve using my words
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5"><Hash className="w-3 h-3" /> Categories / hashtags</label>
              <input
                type="text"
                value={newMediaTags}
                onChange={(e) => setNewMediaTags(e.target.value)}
                placeholder="Teachers Day, Farewell, Classroom, Friends"
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white"
              />
              <p className="text-[10px] text-neutral-500">Separate tags with commas. Each tag becomes a visitor filter.</p>
            </div>

            {/* Suggested Classmate Notes & Scribbles */}
            {aiSuggestedNotes.length > 0 && (
              <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-purple-400/20">
                <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>AI Suggested Memory Notes (Select to attach):</span>
                </div>
                <div className="space-y-1.5">
                  {aiSuggestedNotes.map((note, idx) => (
                    <label
                      key={note.id}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        note.selected
                          ? 'bg-purple-500/15 border-purple-400/40 text-purple-100'
                          : 'bg-neutral-900/60 border-white/5 text-neutral-400 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={note.selected}
                        onChange={(e) => {
                          const updated = [...aiSuggestedNotes];
                          updated[idx].selected = e.target.checked;
                          setAiSuggestedNotes(updated);
                        }}
                        className="mt-0.5 rounded border-purple-400 text-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-amber-300 mr-1.5">{note.authorName}:</span>
                        <span className="italic">{note.text}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Caption suggestions */}
            <div className="flex flex-wrap gap-1">
              {MEDIA_CAPTION_SUGGESTIONS.slice(0, 3).map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => setNewMediaCaption(item.caption)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 truncate max-w-full text-left"
                >
                  #{item.tag}: {item.caption.slice(0, 30)}...
                </button>
              ))}
            </div>

            {/* Upload Button */}
            <button
              type="button"
              onClick={() => {
                if (!newMediaUrl.trim()) return;
                
                // Formulate notes from AI suggestions if selected
                const attachedNotes = aiSuggestedNotes
                  .filter((n) => n.selected && n.text.trim())
                  .map((n) => ({
                    id: `mn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    authorName: n.authorName,
                    text: n.text,
                    createdAt: new Date().toISOString()
                  }));

                onAddMedia({
                  url: newMediaUrl.trim(),
                  caption: newMediaCaption.trim() || undefined,
                  type: newMediaType,
                  tags: parseTags(newMediaTags).length > 0 ? parseTags(newMediaTags) : (aiTags.length > 0 ? aiTags : ['Memories']),
                  notes: attachedNotes
                });

                setNewMediaUrl('');
                setNewMediaCaption('');
                setNewMediaType('image');
                setAiSuggestedNotes([]);
                setAiDetectedMood(null);
                setAiTags([]);
                setNewMediaHint('');
                setNewMediaTags('');
              }}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-md transition-all cursor-pointer"
            >
              Upload to Memory Vault
            </button>
          </div>

          {editingMediaId && (
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-400/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-sky-200 flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit saved memory</div>
                <button type="button" onClick={() => setEditingMediaId(null)} className="p-1 rounded-lg text-neutral-400 hover:text-white" title="Cancel editing"><X className="w-4 h-4" /></button>
              </div>
              <input value={editMediaCaption} onChange={(e) => setEditMediaCaption(e.target.value)} placeholder="Caption" className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white" />
              <input value={editMediaTags} onChange={(e) => setEditMediaTags(e.target.value)} placeholder="Categories / hashtags, separated by commas" className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white" />
              <input value={editMediaAltText} onChange={(e) => setEditMediaAltText(e.target.value)} placeholder="Image description for accessibility" className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white" />
              <input type="date" value={editMediaDate} onChange={(e) => setEditMediaDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white" />
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <input type="checkbox" checked={editMediaFeatured} onChange={(e) => setEditMediaFeatured(e.target.checked)} className="rounded border-white/20" />
                <Star className="w-3.5 h-3.5 text-amber-400" /> Feature this memory in Highlights
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => {
                  const item = media.find((entry) => entry.id === editingMediaId);
                  if (!item || item.type === 'video') return;
                  setAnalyzerTarget('media');
                  setAnalyzerEditingMediaId(item.id);
                  setIsAnalyzerOpen(true);
                }} className="py-2 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-200 text-xs font-semibold flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Improve with AI
                </button>
                <button type="button" onClick={() => {
                  onUpdateMedia(editingMediaId, {
                    caption: editMediaCaption.trim() || undefined,
                    tags: parseTags(editMediaTags),
                    altText: editMediaAltText.trim() || undefined,
                    eventDate: editMediaDate || undefined,
                    isFeatured: editMediaFeatured
                  });
                  setEditingMediaId(null);
                }} className="py-2 rounded-xl bg-sky-400 text-neutral-950 text-xs font-bold flex items-center justify-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Save changes
                </button>
              </div>
            </div>
          )}

          {/* Gallery items list */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-400">Vault Media Items ({media.length})</div>
            <div className="grid grid-cols-2 gap-2.5">
              {media.map((item) => (
                <div key={item.id} className="relative aspect-video rounded-xl overflow-hidden group border border-white/10 bg-black">
                  {item.type === 'video' || item.url.startsWith('data:video') || item.url.endsWith('.mp4') ? (
                    <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={item.url} alt={item.caption || 'Memory'} className="w-full h-full object-cover" />
                  )}
                  
                  {/* Overlay caption & note count */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-100 transition-opacity p-2 flex flex-col justify-between">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMediaId(item.id);
                          setEditMediaCaption(item.caption || '');
                          setEditMediaTags((item.tags || []).join(', '));
                          setEditMediaAltText(item.altText || '');
                          setEditMediaDate(item.eventDate || '');
                          setEditMediaFeatured(Boolean(item.isFeatured));
                        }}
                        title="Edit memory"
                        className="p-1 rounded-md bg-sky-500/80 text-white hover:bg-sky-500"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMediaId(item.id);
                          setEditMediaCaption(item.caption || '');
                          setEditMediaTags((item.tags || []).join(', '));
                          setEditMediaAltText(item.altText || '');
                          setEditMediaDate(item.eventDate || '');
                          setEditMediaFeatured(Boolean(item.isFeatured));
                          setAnalyzerTarget('media');
                          setAnalyzerEditingMediaId(item.id);
                          setIsAnalyzerOpen(true);
                        }}
                        title="Analyze or rewrite with AI"
                        className="p-1 rounded-md bg-purple-500/80 text-white hover:bg-purple-500 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => onDeleteMedia(item.id)}
                        className="p-1 rounded-md bg-black/70 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] text-neutral-200 truncate">
                      {item.caption || 'Memory Photo'}
                      {item.notes && item.notes.length > 0 && (
                        <span className="ml-1 text-amber-400 font-bold">({item.notes.length} notes)</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. MEMORY WALL Section Editor */}
      {activeSection?.stableType === 'memory-wall' && (
        <div className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Memory Wall & Scribbles</h3>
            <p className="text-xs text-neutral-400">Notes, inside jokes, photo scribbles, and farewell messages.</p>
          </div>

          {/* Add Scribble Note Form */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-3">
            <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Memory Scribble Note</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newWallAuthor}
                onChange={(e) => setNewWallAuthor(e.target.value)}
                placeholder="Author Name *"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
              <input
                type="text"
                value={newWallRole}
                onChange={(e) => setNewWallRole(e.target.value)}
                placeholder="Role / Title (optional)"
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
              />
            </div>

            <textarea
              value={newWallText}
              onChange={(e) => setNewWallText(e.target.value)}
              placeholder="Leave a heartfelt note, funny memory, or farewell message..."
              rows={3}
              className="w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-white"
            />

            {/* Note suggestions */}
            <div className="flex flex-wrap gap-1">
              {NOTE_SUGGESTIONS.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNewWallText(item.text)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 truncate max-w-full text-left"
                >
                  ✨ {item.category}: {item.text.slice(0, 25)}...
                </button>
              ))}
            </div>

            {/* Photo Attachment for Wall Scribble */}
            <MediaUploader
              acceptMode="image"
              value={newWallImg}
              onChange={(url) => setNewWallImg(url)}
              label="Attach Photo to Scribble (Optional)"
              placeholder="Paste image link or upload photo from device..."
              onOpenAnalyzer={() => {
                setAnalyzerTarget('wall');
                setIsAnalyzerOpen(true);
              }}
            />

            <button
              type="button"
              onClick={() => {
                if (!newWallText.trim()) return;
                if (onAddWallPost) {
                  onAddWallPost({
                    authorName: newWallAuthor.trim() || 'Anonymous Friend',
                    authorRole: newWallRole.trim() || undefined,
                    text: newWallText.trim(),
                    imageUrl: newWallImg.trim() || undefined,
                    cardStyle: 'polaroid'
                  });
                }
                setNewWallAuthor('');
                setNewWallRole('');
                setNewWallText('');
                setNewWallImg('');
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 hover:brightness-110 shadow-sm transition-all cursor-pointer"
            >
              Pin Memory Note to Wall
            </button>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
            <div className="font-semibold text-white">Moderation & Approval</div>
            <div className="flex items-center justify-between">
              <span>Allow Anonymous Scribbles</span>
              <input
                type="checkbox"
                checked={archive.settings?.allowAnonymousWall ?? true}
                onChange={(e) =>
                  onUpdateArchive({
                    settings: { ...archive.settings, allowAnonymousWall: e.target.checked }
                  })
                }
                className="rounded accent-amber-400"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-400">
              <span>Live Scribble Cards ({wall.length})</span>
              {wall.filter((p) => p.isHidden).length > 0 && (
                <span className="text-[10px] text-amber-400 font-mono">
                  {wall.filter((p) => p.isHidden).length} hidden
                </span>
              )}
            </div>
            {wall.map((post) => {
              const isHidden = Boolean(post.isHidden);
              return (
                <div
                  key={post.id}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs transition-colors ${
                    isHidden
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-neutral-950 border-white/10'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-amber-300 truncate">{post.authorName}</span>
                      {post.authorRole && (
                        <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded bg-white/5">
                          {post.authorRole}
                        </span>
                      )}
                      {isHidden && (
                        <span className="text-[10px] text-amber-400 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.2 rounded font-mono flex items-center gap-1">
                          <EyeOff className="w-2.5 h-2.5" />
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="text-neutral-300 text-xs leading-relaxed">{post.text}</p>
                    {post.imageUrl && (
                      <div className="w-20 h-16 rounded-lg overflow-hidden border border-white/10 mt-1">
                        <img src={post.imageUrl} alt="Attached scribble" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {onToggleHideWallPost && (
                      <button
                        type="button"
                        onClick={() => onToggleHideWallPost(post.id, isHidden)}
                        title={isHidden ? 'Make visible to all visitors' : 'Hide from visitors'}
                        className={`p-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                          isHidden
                            ? 'text-amber-300 bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40'
                            : 'text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        {isHidden ? <Eye className="w-3.5 h-3.5 text-amber-300" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteWallPost(post.id)}
                      title="Delete note permanently"
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. CLOSING Section Editor */}
      {activeSection?.stableType === 'closing' && (
        <div className="space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold font-serif text-white">Closing / Farewell Tribute</h3>
            <p className="text-xs text-neutral-400">Leave a parting message or poem to conclude the archive.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Closing Title</label>
                <span className="text-[10px] text-neutral-400">Suggestions:</span>
              </div>
              <input
                type="text"
                value={archive.settings?.customClosingTitle || 'Until We Meet Again'}
                onChange={(e) =>
                  onUpdateArchive({
                    settings: { ...archive.settings, customClosingTitle: e.target.value }
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {CLOSING_SUGGESTIONS.titles.map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() =>
                      onUpdateArchive({
                        settings: { ...archive.settings, customClosingTitle: ct }
                      })
                    }
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400"
                  >
                    + {ct}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300">Closing Note / Farewell Dedication</label>
                <span className="text-[10px] text-neutral-400">Suggestions:</span>
              </div>
              <textarea
                value={archive.settings?.customClosingNote || 'Every chapter deserves a place to live.'}
                onChange={(e) =>
                  onUpdateArchive({
                    settings: { ...archive.settings, customClosingNote: e.target.value }
                  })
                }
                rows={3}
                className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {CLOSING_SUGGESTIONS.notes.map((cn) => (
                  <button
                    key={cn}
                    type="button"
                    onClick={() =>
                      onUpdateArchive({
                        settings: { ...archive.settings, customClosingNote: cn }
                      })
                    }
                    className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 border border-white/10 text-neutral-400 text-left"
                  >
                    “{cn.slice(0, 50)}...”
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multimodal AI Image Analyzer Modal */}
      {isAnalyzerOpen && (
        <ImageAnalyzerModal
          isOpen={isAnalyzerOpen}
          onClose={() => {
            setIsAnalyzerOpen(false);
            setAnalyzerEditingMediaId(null);
          }}
          archiveType={archive.archiveType}
          themeId={archive.themeId}
          initialImageUrl={analyzerEditingMediaId ? (media.find((item) => item.id === analyzerEditingMediaId)?.url || '') : (
            analyzerTarget === 'media' ? newMediaUrl : analyzerTarget === 'member' ? newMemberImg : analyzerTarget === 'timeline' ? newEventImg : newWallImg
          )}
          initialContextHint={analyzerEditingMediaId
            ? [editMediaTags, editMediaCaption].filter(Boolean).join('. ')
            : analyzerTarget === 'media'
              ? [newMediaHint, newMediaCaption].filter(Boolean).join('. ')
              : analyzerTarget === 'member'
                ? [newMemberRole, newMemberQuote].filter(Boolean).join('. ')
                : analyzerTarget === 'timeline'
                  ? [newEventYear, newEventTitle, newEventDesc].filter(Boolean).join('. ')
                  : newWallText}
          onApplyToVault={(url, caption, tags) => {
            if (analyzerEditingMediaId) {
              onUpdateMedia(analyzerEditingMediaId, { caption: caption || undefined, tags: tags || undefined });
              setEditMediaCaption(caption || '');
              setEditMediaTags((tags || []).join(', '));
              setEditingMediaId(analyzerEditingMediaId);
              setAnalyzerEditingMediaId(null);
            } else {
              setNewMediaUrl(url);
              setNewMediaCaption(caption || '');
              setNewMediaTags((tags || []).join(', '));
            }
            setIsAnalyzerOpen(false);
          }}
          onApplyToMember={(quote, role, url) => {
            setNewMemberImg(url || newMemberImg);
            setNewMemberRole(role || '');
            setNewMemberQuote(quote || '');
            setIsAnalyzerOpen(false);
          }}
          onApplyToTimeline={(title, desc, url, icon) => {
            setNewEventTitle(title);
            setNewEventDesc(desc);
            setNewEventImg(url || newEventImg);
            setNewEventIcon(icon || '📸');
            setIsAnalyzerOpen(false);
          }}
          onApplyToWall={(text, authorName, url) => {
            setNewWallText(text);
            if (authorName) setNewWallAuthor(authorName);
            if (url) setNewWallImg(url);
            setIsAnalyzerOpen(false);
          }}
        />
      )}
    </div>
  );
};
