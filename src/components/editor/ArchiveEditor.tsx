import React, { useState, useEffect } from 'react';
import {
  Section,
  Archive,
  TimelineEvent,
  Member,
  MediaItem,
  WallPost,
  Album
} from '../../types';
import {
  Sparkles,
  Rocket,
  History,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  Save,
  RotateCcw,
  Palette,
  KeyRound,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Layout,
  Plus,
  Camera,
  Edit3,
  SlidersHorizontal,
  ShieldCheck
} from 'lucide-react';
import { SectionSettingsPanel } from './SectionSettingsPanel';
import { DeployModal } from './DeployModal';
import { RevisionsModal } from './RevisionsModal';
import { AccessHistoryModal } from './AccessHistoryModal';
import { ImageAnalyzerModal } from '../common/ImageAnalyzerModal';
import { ArchivePublicView } from '../archive/ArchivePublicView';
import { AttributionFooter } from '../AttributionFooter';
import { PLATFORM_CONFIG } from '../../config/platform';

interface ArchiveEditorProps {
  initialArchive: Archive;
  initialSections: Section[];
  initialTimeline: TimelineEvent[];
  initialMembers: Member[];
  initialMedia: MediaItem[];
  initialWall: WallPost[];
  initialAlbums?: Album[];
  ownerToken?: string;
  onExitToPlatform: () => void;
}

export const ArchiveEditor: React.FC<ArchiveEditorProps> = ({
  initialArchive,
  initialSections,
  initialTimeline,
  initialMembers,
  initialMedia,
  initialWall,
  initialAlbums = [],
  ownerToken,
  onExitToPlatform
}) => {
  // Live State
  const [archive, setArchive] = useState<Archive>(initialArchive);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(initialTimeline);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const [wall, setWall] = useState<WallPost[]>(initialWall);

  // Active section or settings tab in right inspector
  const [activeTab, setActiveTab] = useState<string>(() => initialSections[0]?.id || 'theme');

  // Mobile / Tablet studio view mode
  const [mobileStudioTab, setMobileStudioTab] = useState<'preview' | 'inspector' | 'sections'>('preview');

  // Viewport mode
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
  );

  // Modals
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [deployModalInitialTab, setDeployModalInitialTab] = useState<'configure' | 'preview'>('configure');
  const [isRevisionsModalOpen, setIsRevisionsModalOpen] = useState(false);
  const [isAccessHistoryModalOpen, setIsAccessHistoryModalOpen] = useState(false);
  const [isImageAnalyzerOpen, setIsImageAnalyzerOpen] = useState(false);

  // Save states
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Debounced Autosave to backend
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/archives/${archive.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken || ''}`
          },
          body: JSON.stringify(archive)
        });

        if (res.ok) {
          setSaveStatus('saved');
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [archive, ownerToken]);

  const handleUpdateSections = async (updated: Section[]) => {
    setSections(updated);
    setSaveStatus('saving');

    try {
      const response = await fetch(`/api/archives/${archive.id}/sections`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        },
        body: JSON.stringify({ sections: updated })
      });

      setSaveStatus(response.ok ? 'saved' : 'error');
    } catch {
      setSaveStatus('error');
    }
  };

  // Section operations
  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= sections.length) return;

    const list = [...sections];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);
    const updated = list.map((s, i) => ({ ...s, position: i }));
    void handleUpdateSections(updated);
  };

  const handleToggleSectionVisibility = (sectionId: string) => {
    const updated = sections.map((s) => (s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s));
    void handleUpdateSections(updated);
  };

  // Sub-entity mutations
  const handleAddTimelineEvent = async (eventData: Partial<TimelineEvent>) => {
    let res: Response;
    try {
      res = await fetch(`/api/archives/${archive.id}/timeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        },
        body: JSON.stringify(eventData)
      });
    } catch {
      throw new Error('Network error while saving the milestone. Check your connection and retry.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.event) throw new Error(data.error || 'Could not save the milestone. Your details have not been cleared.');
    setTimeline((current) => [...current, data.event]);
  };

  const handleUpdateTimelineEvent = async (id: string, updates: Partial<TimelineEvent>) => {
    const previous = timeline;
    setTimeline((current) => current.map((event) => (event.id === id ? { ...event, ...updates } : event)));
    const res = await fetch(`/api/archives/${archive.id}/timeline/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      setTimeline(previous);
      setSaveStatus('error');
      return;
    }
    const data = await res.json();
    if (data.event) setTimeline((current) => current.map((event) => (event.id === id ? data.event : event)));
    setSaveStatus('saved');
  };

  const handleReorderTimeline = async (ordered: TimelineEvent[]) => {
    const previous = timeline;
    const normalized = ordered.map((event, position) => ({ ...event, position }));
    setTimeline(normalized);
    setSaveStatus('saving');
    try {
      const responses = await Promise.all(normalized.map((event) => fetch(`/api/archives/${archive.id}/timeline/${event.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        },
        body: JSON.stringify({ position: event.position })
      })));
      if (responses.some((response) => !response.ok)) throw new Error('Could not save milestone order.');
      setSaveStatus('saved');
    } catch {
      setTimeline(previous);
      setSaveStatus('error');
    }
  };

  const handleDeleteTimelineEvent = async (id: string) => {
    await fetch(`/api/archives/${archive.id}/timeline/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken || ''}` }
    });
    setTimeline(timeline.filter((e) => e.id !== id));
  };

  const handleAddMember = async (memberData: Partial<Member>) => {
    const res = await fetch(`/api/archives/${archive.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify(memberData)
    });
    const data = await res.json();
    if (data.success && data.member) {
      setMembers((current) => [...current, data.member]);
    }
  };

  const handleUpdateMember = async (id: string, updates: Partial<Member>) => {
    const previous = members;
    setMembers((current) => current.map((member) => (member.id === id ? { ...member, ...updates } : member)));
    const res = await fetch(`/api/archives/${archive.id}/members/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      setMembers(previous);
      setSaveStatus('error');
      return;
    }
    const data = await res.json();
    if (data.member) setMembers((current) => current.map((member) => (member.id === id ? data.member : member)));
    setSaveStatus('saved');
  };

  const handleDeleteMember = async (id: string) => {
    await fetch(`/api/archives/${archive.id}/members/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken || ''}` }
    });
    setMembers(members.filter((m) => m.id !== id));
  };

  const handleAddMedia = async (mediaData: Partial<MediaItem>) => {
    let res: Response;
    try {
      res = await fetch(`/api/archives/${archive.id}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        },
        body: JSON.stringify(mediaData)
      });
    } catch {
      throw new Error('Network error while uploading. Check your connection and retry.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.item) throw new Error(data.error || 'Upload failed. Your selected media has not been removed.');
    setMedia((current) => [data.item, ...current]);
  };

  const handleUpdateMedia = async (id: string, updates: Partial<MediaItem>) => {
    const previous = media;
    setMedia((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    const res = await fetch(`/api/archives/${archive.id}/media/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      setMedia(previous);
      setSaveStatus('error');
      return;
    }
    const data = await res.json();
    if (data.item) setMedia((current) => current.map((item) => (item.id === id ? data.item : item)));
    setSaveStatus('saved');
  };

  const handleDeleteMedia = async (id: string) => {
    await fetch(`/api/archives/${archive.id}/media/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken || ''}` }
    });
    setMedia(media.filter((m) => m.id !== id));
  };

  const handleAddWallPost = async (wallData: Partial<WallPost>) => {
    const res = await fetch(`/api/archives/${archive.id}/wall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify(wallData)
    });
    const data = await res.json();
    if (data.success && data.post) {
      setWall([data.post, ...wall]);
    }
  };

  const handleDeleteWallPost = async (id: string) => {
    await fetch(`/api/archives/${archive.id}/wall/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken || ''}` }
    });
    setWall(wall.filter((w) => w.id !== id));
  };

  const handleToggleHideWallPost = async (id: string, isHidden: boolean) => {
    await fetch(`/api/archives/${archive.id}/wall/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify({ isHidden })
    });
    setWall(wall.map((w) => (w.id === id ? { ...w, isHidden } : w)));
  };

  const updateAccessPin = async (field: 'editorPin' | 'viewerPin', pin: string) => {
    const response = await fetch(`/api/archives/${archive.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken || ''}`
      },
      body: JSON.stringify({ [field]: pin })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update PIN.');
  };

  return (
    <div className="archive-editor h-[100dvh] w-full flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      
      {/* Top Studio Bar */}
      <header className="h-16 bg-neutral-900/90 border-b border-white/10 px-3 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">
        
        {/* Left: Exit & Archive Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onExitToPlatform}
            className="p-2 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer flex-shrink-0"
            title="Return to Main Platform"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Platform</span>
          </button>

          <div className="h-5 w-px bg-white/10 hidden sm:block flex-shrink-0" />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-bold font-serif text-white truncate max-w-[120px] sm:max-w-xs">
                {archive.title}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 flex-shrink-0">
                {archive.deploymentStatus === 'deployed' ? 'Live' : 'Draft'}
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 flex items-center gap-1.5 truncate">
              <span className="font-mono truncate">{archive.workspaceSlug}</span>
              <span>·</span>
              <span className="text-[10px] flex-shrink-0">
                {saveStatus === 'saving' && '⏳ Saving...'}
                {saveStatus === 'saved' && '✓ Saved'}
                {saveStatus === 'error' && '⚠️ Retry'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Viewport Mode Switcher (Desktop Only) */}
        <div className="hidden lg:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setViewport('desktop')}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              viewport === 'desktop' ? 'bg-amber-400 text-neutral-950 font-semibold' : 'text-neutral-400 hover:text-white'
            }`}
            title="Desktop View (100%)"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              viewport === 'tablet' ? 'bg-amber-400 text-neutral-950 font-semibold' : 'text-neutral-400 hover:text-white'
            }`}
            title="Tablet View (768px)"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              viewport === 'mobile' ? 'bg-amber-400 text-neutral-950 font-semibold' : 'text-neutral-400 hover:text-white'
            }`}
            title="Mobile View (375px)"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        {/* Right: AI Analyzer, History & Choose Domain / Deploy button */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsImageAnalyzerOpen(true)}
            className="hidden lg:flex p-2 rounded-xl text-purple-200 hover:text-white bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-xs font-semibold items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            title="AI Multimodal Photo & Note Analyzer"
          >
            <Camera className="w-4 h-4 text-purple-400" />
            <span className="hidden md:inline">AI Analyzer</span>
          </button>

          <button
            onClick={() => setIsAccessHistoryModalOpen(true)}
            className="hidden lg:flex p-2 rounded-xl text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            title="View Security & Access History (Last 5 PIN/Edit Events)"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Access Log</span>
          </button>

          <button
            onClick={() => setIsRevisionsModalOpen(true)}
            className="hidden lg:flex p-2 rounded-xl text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium items-center gap-1.5 cursor-pointer"
            title="View Revision Snapshots"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">Revisions</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeployModalInitialTab('preview');
              setIsDeployModalOpen(true);
            }}
            className="hidden lg:flex p-2 rounded-xl text-amber-200 hover:text-white bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-xs font-medium items-center gap-1.5 cursor-pointer"
            title="Open Full Live Preview"
          >
            <Eye className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">Live Preview</span>
          </button>

          {/* Primary Deployment Action */}
          <button
            onClick={() => {
              setDeployModalInitialTab('configure');
              setIsDeployModalOpen(true);
            }}
            id="open-deploy-modal-btn"
            className="px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
          >
            <Rocket className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            <span className="hidden sm:inline">{archive.deploymentStatus === 'deployed' ? 'Domain & Update' : 'Choose Domain & Deploy'}</span>
            <span className="sm:hidden">Deploy</span>
          </button>
        </div>

      </header>

      {/* Mobile / Tablet Studio Navigation Switcher Tab Bar */}
      <nav aria-label="Mobile editor" className="lg:hidden fixed inset-x-0 bottom-0 flex items-center justify-around bg-neutral-900/95 border-t border-white/10 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 backdrop-blur-xl shadow-[0_-12px_30px_rgba(0,0,0,.45)]">
        <button
          onClick={() => setMobileStudioTab('preview')}
          className={`min-h-12 flex-1 max-w-28 flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
            mobileStudioTab === 'preview' ? 'bg-amber-400 text-neutral-950 shadow-md' : 'text-neutral-400 hover:text-white bg-white/5'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Preview</span>
        </button>

        <button
          onClick={() => setMobileStudioTab('inspector')}
          className={`min-h-12 flex-1 max-w-28 flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
            mobileStudioTab === 'inspector' ? 'bg-amber-400 text-neutral-950 shadow-md' : 'text-neutral-400 hover:text-white bg-white/5'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        <button
          onClick={() => setMobileStudioTab('sections')}
          className={`min-h-12 flex-1 max-w-28 flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
            mobileStudioTab === 'sections' ? 'bg-amber-400 text-neutral-950 shadow-md' : 'text-neutral-400 hover:text-white bg-white/5'
          }`}
        >
          <Layout className="w-3.5 h-3.5" />
          <span>Sections</span>
        </button>
      </nav>

      {/* Main Studio Workspace */}
      <div className="flex-1 flex overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        
        {/* LEFT SIDEBAR: Sections List & Global Settings */}
        <aside className={`w-full lg:w-64 bg-neutral-900/90 lg:bg-neutral-900/60 border-r border-white/10 flex-col justify-between flex-shrink-0 ${
          mobileStudioTab === 'sections' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="p-4 space-y-4 overflow-y-auto">
            
            {/* Global Settings Links */}
            <div className="space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-1">
                Global Customization
              </div>
              <button
                onClick={() => {
                  setActiveTab('theme');
                  setMobileStudioTab('inspector');
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'theme' ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Visual Themes</span>
                </span>
                <span className="text-[10px] font-mono capitalize">{archive.themeId.split('-')[0]}</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('access');
                  setMobileStudioTab('inspector');
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'access' ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Access & Privacy</span>
                </span>
                <span className="text-[10px] font-mono capitalize">{archive.visibility}</span>
              </button>
            </div>

            {/* Sections Management */}
            <div className="space-y-1 pt-3 border-t border-white/10">
              <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-1 flex items-center justify-between">
                <span>Archive Sections</span>
                <span className="text-[10px]">{sections.length} sections</span>
              </div>

              <div className="space-y-1">
                {sections.map((sec, index) => {
                  const isActive = activeTab === sec.id;
                  return (
                    <div
                      key={sec.id}
                      className={`group rounded-xl p-2 transition-all flex items-center justify-between text-xs cursor-pointer ${
                        isActive
                          ? 'bg-amber-400/15 border border-amber-400/30 text-amber-200'
                          : 'bg-white/[0.02] hover:bg-white/5 border border-white/5 text-neutral-300'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setActiveTab(sec.id);
                          setMobileStudioTab('inspector');
                        }}
                        className="flex-1 text-left truncate flex items-center gap-2 font-medium"
                      >
                        <Layout className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="truncate">{sec.displayTitle || sec.navigationLabel}</span>
                      </button>

                      {/* Reorder and visibility icons */}
                      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSectionVisibility(sec.id);
                          }}
                          className="p-1 text-neutral-400 hover:text-white"
                          title={sec.isVisible ? 'Hide section' : 'Show section'}
                        >
                          {sec.isVisible ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSection(index, 'up');
                          }}
                          disabled={index === 0}
                          className="p-1 text-neutral-400 hover:text-white disabled:opacity-20"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSection(index, 'down');
                          }}
                          disabled={index === sections.length - 1}
                          className="p-1 text-neutral-400 hover:text-white disabled:opacity-20"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Footer of left sidebar */}
          <div className="p-4 pb-6 border-t border-white/10 bg-neutral-950/60 text-[11px] text-neutral-400 space-y-3">
            <div className="grid grid-cols-3 gap-2 lg:hidden">
              <button type="button" onClick={() => setIsImageAnalyzerOpen(true)} className="min-h-11 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-200 flex flex-col items-center justify-center gap-1"><Camera className="w-4 h-4" /><span>AI</span></button>
              <button type="button" onClick={() => setIsAccessHistoryModalOpen(true)} className="min-h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 flex flex-col items-center justify-center gap-1"><ShieldCheck className="w-4 h-4" /><span>Access</span></button>
              <button type="button" onClick={() => setIsRevisionsModalOpen(true)} className="min-h-11 rounded-xl bg-white/5 border border-white/10 text-neutral-200 flex flex-col items-center justify-center gap-1"><History className="w-4 h-4" /><span>History</span></button>
            </div>
            <div>Owner Studio Active</div>
            <div className="text-amber-400/80 font-mono mt-0.5 truncate">/workspace/{archive.workspaceSlug}</div>
          </div>
        </aside>

        {/* CENTER: Live Interactive Preview Stage */}
        <main
          id="editor-preview-stage"
          data-archive-preview-scroll
          className={`flex-1 bg-neutral-950 flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 lg:p-6 custom-scrollbar scroll-smooth overscroll-contain ${
            mobileStudioTab === 'preview' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Quick Preview Section Jumper Bar */}
          <div className="w-full max-w-4xl mb-3.5 flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl bg-neutral-900/95 border border-white/10 text-xs shadow-xl backdrop-blur-md sticky top-0 z-30">
            <span className="text-[11px] font-mono uppercase text-amber-400 font-semibold flex items-center gap-1.5 shrink-0">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Jump Section:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: 'hero', label: 'Hero Cover' },
                { id: 'timeline', label: 'Journey' },
                { id: 'members', label: 'Yearbook' },
                { id: 'media-vault', label: 'Media Vault' },
                { id: 'memory-wall', label: 'Memory Wall' },
                { id: 'closing', label: 'Farewell' }
              ].map((item) => {
                const isItemActive = activeTab === item.id || sections.find((s) => s.id === activeTab)?.stableType === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      const foundSec = sections.find((s) => s.stableType === item.id);
                      if (foundSec) {
                        setActiveTab(foundSec.id);
                      } else {
                        setActiveTab(item.id);
                      }
                      const el = document.getElementById(`section-${item.id}`) || document.getElementById(item.id);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className={`px-3 py-1 rounded-xl text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isItemActive
                        ? 'bg-amber-400 text-neutral-950 font-bold shadow-md'
                        : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Scroll to Top button */}
            <button
              onClick={() => {
                const stage = document.getElementById('editor-preview-stage');
                if (stage) stage.scrollTo({ top: 0, behavior: 'smooth' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              title="Scroll to Top"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-amber-400 text-xs transition-colors shrink-0 cursor-pointer"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* Device Mockup Shell */}
          <div
            className={`w-full transition-all duration-300 rounded-3xl overflow-hidden shadow-2xl border bg-neutral-950 flex flex-col ${
              viewport === 'mobile'
                ? 'max-w-[400px] border-neutral-700 ring-8 ring-neutral-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] my-2'
                : viewport === 'tablet'
                ? 'max-w-[800px] border-neutral-700 ring-6 ring-neutral-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] my-2'
                : 'max-w-full border-white/15'
            }`}
          >
            {/* Simulated Device Top Notch for Mobile/Tablet */}
            {viewport === 'mobile' && (
              <div className="bg-neutral-900 py-2.5 px-6 flex items-center justify-between text-[11px] text-neutral-400 font-mono border-b border-neutral-800 shrink-0">
                <span>9:41</span>
                <div className="w-24 h-4 rounded-full bg-neutral-950 border border-neutral-800 mx-auto" />
                <div className="flex items-center gap-1.5 text-neutral-400">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>
            )}
            {viewport === 'tablet' && (
              <div className="bg-neutral-900 py-1.5 px-6 flex items-center justify-between text-[10px] text-neutral-400 font-mono border-b border-neutral-800 shrink-0">
                <span>Tablet Preview (768px)</span>
                <div className="w-16 h-2 rounded-full bg-neutral-950 border border-neutral-800" />
                <span>100%</span>
              </div>
            )}

            {/* Live Interactive Public View Component inside Preview Frame */}
            <div className="w-full flex-1 overflow-x-hidden">
              <ArchivePublicView
                archive={archive}
                sections={sections}
                timeline={timeline}
                members={members}
                media={media}
                wall={wall}
                albums={initialAlbums}
                ownerToken={ownerToken}
                isPreviewMode={true}
                focusedSectionId={activeTab}
                onUpdateArchive={(up) => setArchive((prev) => ({ ...prev, ...up }))}
                onAddWallPost={(post) => setWall((prev) => [post, ...prev])}
                onDeleteWallPost={handleDeleteWallPost}
                onToggleHideWallPost={handleToggleHideWallPost}
              />
            </div>
          </div>
        </main>

        {/* RIGHT PANEL: Active Inspector & Section Settings */}
        <aside className={`w-full lg:w-96 bg-neutral-900/95 lg:bg-neutral-900/80 border-l border-white/10 flex-col flex-shrink-0 ${
          mobileStudioTab === 'inspector' ? 'flex' : 'hidden lg:flex'
        }`}>
          <SectionSettingsPanel
            activeTab={activeTab}
            archive={archive}
            sections={sections}
            timeline={timeline}
            members={members}
            media={media}
            wall={wall}
            ownerToken={ownerToken}
            onOpenAccessHistory={() => setIsAccessHistoryModalOpen(true)}
            onChangeEditorPin={(pin) => updateAccessPin('editorPin', pin)}
            onChangeViewerPin={(pin) => updateAccessPin('viewerPin', pin)}
            onUpdateArchive={(up) => setArchive({ ...archive, ...up })}
            onUpdateSections={(updated) => void handleUpdateSections(updated)}
            onAddTimelineEvent={handleAddTimelineEvent}
            onUpdateTimelineEvent={handleUpdateTimelineEvent}
            onReorderTimeline={handleReorderTimeline}
            onDeleteTimelineEvent={handleDeleteTimelineEvent}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onDeleteMember={handleDeleteMember}
            onAddMedia={handleAddMedia}
            onUpdateMedia={handleUpdateMedia}
            onDeleteMedia={handleDeleteMedia}
            onAddWallPost={handleAddWallPost}
            onDeleteWallPost={handleDeleteWallPost}
            onToggleHideWallPost={handleToggleHideWallPost}
          />
        </aside>

      </div>

      {/* Access History Modal (Transparency Log: Last 5 Entries) */}
      <AccessHistoryModal
        isOpen={isAccessHistoryModalOpen}
        onClose={() => setIsAccessHistoryModalOpen(false)}
        archiveId={archive.id}
        archiveTitle={archive.title}
        ownerToken={ownerToken}
      />

      {/* Deploy & Domain Selection Modal (With Interactive Live Preview) */}
      <DeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        initialTab={deployModalInitialTab}
        archive={archive}
        sections={sections}
        timeline={timeline}
        members={members}
        media={media}
        wall={wall}
        albums={initialAlbums}
        ownerToken={ownerToken}
        onDeploySuccess={(updated) => setArchive(updated)}
      />

      {/* Revision History Modal */}
      <RevisionsModal
        isOpen={isRevisionsModalOpen}
        onClose={() => setIsRevisionsModalOpen(false)}
        archiveId={archive.id}
        ownerToken={ownerToken}
        onRevisionRestored={() => {
          // Re-fetch archive data after snapshot restoration
          fetch(`/api/archives/${archive.id}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.archive) setArchive(d.archive);
              if (d.sections) setSections(d.sections);
              if (d.timeline) setTimeline(d.timeline);
              if (d.members) setMembers(d.members);
              if (d.media) setMedia(d.media);
              if (d.wall) setWall(d.wall);
            });
        }}
      />

      {/* Multimodal AI Image & Note Analyzer Modal */}
      {isImageAnalyzerOpen && (
        <ImageAnalyzerModal
          isOpen={isImageAnalyzerOpen}
          onClose={() => setIsImageAnalyzerOpen(false)}
          archiveType={archive.archiveType}
          themeId={archive.themeId}
          onApplyToVault={(url, caption, tags) => {
            handleAddMedia({
              url,
              caption: caption || undefined,
              tags: tags || undefined
            });
            setIsImageAnalyzerOpen(false);
          }}
          onApplyToMember={(quote, role, url) => {
            handleAddMember({
              name: 'Classmate',
              imageUrl: url,
              groupLabel: role || undefined,
              quote: quote || undefined
            });
            setIsImageAnalyzerOpen(false);
          }}
          onApplyToTimeline={(title, desc, url, icon) => {
            handleAddTimelineEvent({
              title,
              yearLabel: String(new Date().getFullYear()),
              description: desc,
              mediaUrl: url || undefined,
              icon: icon || '📸'
            });
            setIsImageAnalyzerOpen(false);
          }}
          onApplyToWall={(text) => {
            setIsImageAnalyzerOpen(false);
          }}
        />
      )}

    </div>
  );
};
