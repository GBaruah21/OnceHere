import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'motion/react';
import {
  Archive,
  Section,
  TimelineEvent,
  Member,
  MediaItem,
  WallPost,
  Album,
  ThemeId
} from '../../types';
import { THEMES, FONT_PRESETS, getFontPreset, FontPreset } from '../../config/themes';
import { NOTE_SUGGESTIONS } from '../../config/suggestions';
import { AttributionFooter } from '../AttributionFooter';
import { SocialShareModal } from './SocialShareModal';
import { PreConfiguredShareBar } from './PreConfiguredShareBar';
import { InstagramStoryModal } from './InstagramStoryModal';
import { ImageAnalyzerModal } from '../common/ImageAnalyzerModal';
import { LazyImage } from '../common/LazyImage';
import { TimelineSectionView } from './TimelineSectionView';
import { useDynamicArchiveMeta } from '../../hooks/useDynamicArchiveMeta';
import { ThemeInteractiveBackdrop } from '../common/ThemeInteractiveBackdrop';
import {
  Calendar,
  Users,
  Menu,
  Send,
  Image as ImageIcon,
  MessageSquareHeart,
  Search,
  Heart,
  Plus,
  Share2,
  Lock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  Music,
  Download,
  ExternalLink,
  Volume2,
  VolumeX,
  Copy,
  Check,
  QrCode,
  ArrowUp,
  Instagram,
  ArrowUpDown,
  Clock,
  Flame,
  Camera,
  LayoutGrid,
  Grid3X3,
  SlidersHorizontal,
  Shuffle,
  Filter,
  Eye,
  EyeOff,
  Shield,
  PenTool,
  ArrowRight,
  Type,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageCircle,
  FileText,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ArchivePublicViewProps {
  archive: Archive;
  sections: Section[];
  timeline: TimelineEvent[];
  members: Member[];
  media: MediaItem[];
  wall: WallPost[];
  albums?: Album[];
  ownerToken?: string;
  isPreviewMode?: boolean;
  focusedSectionId?: string;
  onBackToPlatform?: () => void;
  onCreateOwnArchive?: () => void;
  onUpdateArchive?: (update: Partial<Archive>) => void;
  onAddWallPost?: (post: WallPost) => void;
  onDeleteWallPost?: (postId: string) => void;
  onToggleHideWallPost?: (postId: string, isHidden: boolean) => void;
}

interface HeroSectionProps {
  archive: Archive;
  members: Member[];
  media: MediaItem[];
  theme: any;
  cardBg: string;
  fontPreset: FontPreset;
  onOpenShareModal: () => void;
  onOpenInstagramModal: (mode: 'story' | 'post') => void;
  onQuickCopy: () => void;
  quickCopied: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  archive,
  members,
  media,
  theme,
  cardBg,
  fontPreset,
  onOpenShareModal,
  onOpenInstagramModal,
  onQuickCopy,
  quickCopied
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start']
  });

  const isLight = archive.themeId === 'paper-polaroids';

  // High-end parallax transforms mirroring classof2022-26
  const titleY = useTransform(scrollYProgress, [0, 1], [0, 45]);
  const badgeY = useTransform(scrollYProgress, [0, 1], [0, 20]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.15]);
  const bgGlowScale = useTransform(scrollYProgress, [0, 1], [1, 1.35]);
  const orb1Y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const orb2Y = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <motion.section
      ref={heroRef}
      id="section-hero"
      style={{ opacity: heroOpacity }}
      className="pt-20 sm:pt-28 pb-16 px-4 sm:px-8 max-w-5xl mx-auto text-center space-y-8 relative"
    >
      {/* Ambient Parallax Glow Orbs & Lighting */}
      <motion.div
        style={{
          scale: bgGlowScale,
          y: orb1Y,
          background: `radial-gradient(circle, ${theme.palette.accent}25 0%, transparent 70%)`
        }}
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[550px] h-[320px] rounded-full blur-3xl opacity-40 -z-10"
      />
      <motion.div
        style={{
          y: orb2Y,
          background: `radial-gradient(circle, #ec489920 0%, transparent 70%)`
        }}
        className="pointer-events-none absolute top-1/3 -right-20 w-[280px] h-[280px] rounded-full blur-2xl opacity-30 -z-10"
      />

      {/* Batch Badge with spring entrance */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          y: badgeY,
          borderColor: isLight ? '#d97706' : `${theme.palette.accent}60`,
          backgroundColor: isLight ? '#fef3c7' : `${theme.palette.accent}20`,
          color: isLight ? '#92400e' : theme.palette.accent
        }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-md"
      >
        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
        <span>{archive.organizationName}</span>
        <span>·</span>
        <span>{archive.batchLabel || `${archive.startYear}–${archive.endYear}`}</span>
      </motion.div>

      {/* Hero Title with Subtle Parallax & Spring Reveal */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        style={{ y: titleY }}
        className={`text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] max-w-4xl mx-auto drop-shadow-sm ${fontPreset.headingClass} ${
          isLight ? 'text-stone-950' : 'text-neutral-50'
        }`}
      >
        {archive.title}
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={`text-base sm:text-xl font-normal max-w-2xl mx-auto leading-relaxed ${fontPreset.bodyClass} ${
          isLight ? 'text-stone-700 font-medium' : 'text-neutral-200/90 font-light'
        }`}
      >
        {archive.subtitle || 'Every laughter, milestone, inside joke, and shared struggle—preserved forever in our chapter of time.'}
      </motion.p>

      {/* Quick Stats Badges with Staggered Entrance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-4 text-xs font-mono font-medium"
      >
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-sm ${
          isLight ? 'bg-white border-stone-300 text-stone-800 font-semibold' : 'bg-white/10 border-white/15 text-neutral-100 backdrop-blur-md'
        }`}>
          <Calendar className="w-4 h-4" style={{ color: isLight ? '#b45309' : theme.palette.accent }} />
          <span>{archive.startYear === archive.endYear ? archive.startYear : `${archive.startYear} to ${archive.endYear}`}</span>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-sm ${
          isLight ? 'bg-white border-stone-300 text-stone-800 font-semibold' : 'bg-white/10 border-white/15 text-neutral-100 backdrop-blur-md'
        }`}>
          <Users className="w-4 h-4" style={{ color: isLight ? '#b45309' : theme.palette.accent }} />
          <span>{members.length} Yearbook Members</span>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-sm ${
          isLight ? 'bg-white border-stone-300 text-stone-800 font-semibold' : 'bg-white/10 border-white/15 text-neutral-100 backdrop-blur-md'
        }`}>
          <ImageIcon className="w-4 h-4" style={{ color: isLight ? '#b45309' : theme.palette.accent }} />
          <span>{media.length} Vault Photos</span>
        </div>
      </motion.div>

      {/* Hero CTA buttons (with Journey & Story triggers) */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="pt-4 flex flex-wrap items-center justify-center gap-3"
      >
        <motion.a
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          href="#section-timeline"
          data-cursor="hover"
          data-cursor-text="EXPLORE"
          className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-lg active:scale-95 transition-all cursor-pointer"
          style={{
            backgroundColor: isLight ? '#92400e' : theme.palette.accent,
            color: isLight ? '#ffffff' : (archive.themeId === 'heritage-noir' ? '#0a0a0a' : '#000000')
          }}
        >
          {archive.settings?.heroButtonText || 'Begin Journey Through Time'}
        </motion.a>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onOpenInstagramModal('story')}
          data-cursor="hover"
          data-cursor-text="STORY"
          className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
            isLight
              ? 'bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-950'
              : 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/40 text-pink-200'
          }`}
        >
          <Instagram className="w-4 h-4" />
          <span>Instagram Story</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={onQuickCopy}
          data-cursor="hover"
          data-cursor-text="COPY"
          title="Copy direct share link"
          className={`px-3.5 py-3 rounded-2xl text-xs font-mono font-semibold border active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
            isLight
              ? 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
              : 'bg-white/10 border-white/20 text-neutral-100 hover:bg-white/15'
          }`}
        >
          {quickCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{quickCopied ? 'Link Copied!' : 'Copy Link'}</span>
        </motion.button>
      </motion.div>

    </motion.section>
  );
};

export const ArchivePublicView: React.FC<ArchivePublicViewProps> = ({
  archive,
  sections,
  timeline,
  members,
  media,
  wall,
  albums = [],
  ownerToken,
  isPreviewMode = false,
  focusedSectionId,
  onBackToPlatform,
  onCreateOwnArchive,
  onUpdateArchive,
  onAddWallPost,
  onDeleteWallPost,
  onToggleHideWallPost
}) => {
  const theme = THEMES[archive.themeId] || THEMES['midnight-cinema'];

  // 1. Scroll Progress Hook & Spring Physics
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 30,
    restDelta: 0.001
  });

  // Active navigation tab & section tracking
  const [activeNavTab, setActiveNavTab] = useState<string>('journey'); // 'journey' | 'yearbook' | 'vault' | 'wall' | 'all'
  const [activeScrollSection, setActiveScrollSection] = useState<string>('timeline');
  const [viewMode, setViewMode] = useState<'flow' | 'focus'>('flow'); // continuous flow vs focused section
  const [isCreatePromptDismissed, setIsCreatePromptDismissed] = useState(false);

  // Synchronize when focusedSectionId prop changes (e.g. from editor inspector or sidebar)
  useEffect(() => {
    if (!focusedSectionId) return;
    const targetSec = (sections || []).find((s) => s.id === focusedSectionId);
    const targetType = targetSec ? targetSec.stableType : focusedSectionId.replace('section-', '');
    const el =
      document.getElementById(`section-${targetType}`) ||
      document.getElementById(`section-${focusedSectionId}`) ||
      document.getElementById(focusedSectionId) ||
      document.getElementById(targetType);

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveScrollSection(targetType);
      setActiveNavTab(targetType);
    }
  }, [focusedSectionId, sections]);

  // Local media list state (for instant addition of photo notes)
  const [currentMediaList, setCurrentMediaList] = useState<MediaItem[]>(media);
  useEffect(() => {
    setCurrentMediaList(media);
  }, [media]);

  // Typography font customization:
  // ONLY for Editors, Creators, and Demo Viewers. For actual created page viewers, the typography is FIXED by the creator.
  const isDemoArchive = Boolean(
    archive.id?.startsWith('demo-') ||
    (archive.slug && ['sistec-batch-2026', 'riverdale-tech-2026', 'marys-convent-2025', 'st-thomas-2024'].includes(archive.slug)) ||
    archive.slug?.startsWith('demo-')
  );
  const isEditorOrCreator = Boolean(isPreviewMode || ownerToken || isDemoArchive);
  const canChangeTypography = isDemoArchive || isEditorOrCreator;

  const [selectedFontPresetId, setSelectedFontPresetId] = useState<string>(() => {
    if (archive.settings?.fontPresetId) return archive.settings.fontPresetId;
    if (archive.settings?.fontPreset) return archive.settings.fontPreset;
    if (archive.themeId === 'cyber-grid') return 'cyber-code';
    if (archive.themeId === 'retro-arcade') return 'cyber-code';
    if (archive.themeId === 'scrapbook-journal') return 'scrapbook-nostalgia';
    if (archive.themeId === 'aurora-glass') return 'modern-minimal';
    return 'editorial-heritage';
  });

  useEffect(() => {
    if (archive.settings?.fontPresetId) {
      setSelectedFontPresetId(archive.settings.fontPresetId);
    }
  }, [archive.settings?.fontPresetId]);

  const [isFontSelectorOpen, setIsFontSelectorOpen] = useState(false);
  const activeFontPreset = useMemo(() => getFontPreset(selectedFontPresetId), [selectedFontPresetId]);

  // Handler for creator/editor/demo font selection
  const handleSelectFontPreset = (presetId: string) => {
    setSelectedFontPresetId(presetId);
    setIsFontSelectorOpen(false);

    // If editor or creator, persist font choice to archive settings
    if (isEditorOrCreator) {
      if (onUpdateArchive) {
        onUpdateArchive({
          settings: {
            ...archive.settings,
            fontPresetId: presetId
          }
        });
      } else if (ownerToken) {
        fetch(`/api/archives/${archive.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`
          },
          body: JSON.stringify({
            settings: {
              ...archive.settings,
              fontPresetId: presetId
            }
          })
        }).catch((err) => console.warn('Could not save typography preset:', err));
      }
    }
  };

  // Lightbox Touch-Zoom and Notes states
  const [photoZoom, setPhotoZoom] = useState<number>(1);
  const [mediaNoteAuthor, setMediaNoteAuthor] = useState('');
  const [mediaNoteText, setMediaNoteText] = useState('');
  const [isPostingMediaNote, setIsPostingMediaNote] = useState(false);

  // Helper to trigger creation flow seamlessly
  const handleCreateOwn = () => {
    if (onCreateOwnArchive) {
      onCreateOwnArchive();
    } else {
      window.location.href = '/?create=true';
    }
  };

  // Local interaction states
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberGroup, setSelectedMemberGroup] = useState<string>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Reset zoom when lightbox photo changes
  useEffect(() => {
    setPhotoZoom(1);
    setMediaNoteText('');
  }, [lightboxIndex]);

  // Handle posting note to a media photograph with instant optimistic feedback
  const handlePostMediaNote = async (mediaId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaNoteText.trim()) return;

    const author = mediaNoteAuthor.trim() || 'Classmate';
    const noteText = mediaNoteText.trim();
    const tempNoteId = `mn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const optimisticNote = {
      id: tempNoteId,
      authorName: author,
      text: noteText,
      createdAt: new Date().toISOString()
    };

    // 1. Instant Optimistic State Update
    setCurrentMediaList((prev) =>
      prev.map((m) => {
        if (m.id === mediaId) {
          return {
            ...m,
            notes: [...(m.notes || []), optimisticNote]
          };
        }
        return m;
      })
    );

    setMediaNoteText('');
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 }
    });

    setIsPostingMediaNote(true);

    try {
      const response = await fetch(`/api/archives/${archive.id}/media/${mediaId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName: author, text: noteText })
      });

      if (response.ok) {
        const data = await response.json();
        const serverNote = data.note || data.item?.notes?.slice(-1)[0] || optimisticNote;
        
        setCurrentMediaList((prev) =>
          prev.map((m) => {
            if (m.id === mediaId) {
              const currentNotes = m.notes || [];
              const updatedNotes = currentNotes.map((n) => (n.id === tempNoteId ? serverNote : n));
              return {
                ...m,
                notes: updatedNotes
              };
            }
            return m;
          })
        );
      }
    } catch (err) {
      console.error('Photo note saved locally (offline/preview fallback):', err);
    } finally {
      setIsPostingMediaNote(false);
    }
  };

  // Handle deleting a note from a media photograph
  const handleDeleteMediaNote = async (mediaId: string, noteId: string) => {
    setCurrentMediaList((prev) =>
      prev.map((m) => {
        if (m.id === mediaId) {
          return {
            ...m,
            notes: (m.notes || []).filter((n) => n.id !== noteId)
          };
        }
        return m;
      })
    );

    try {
      await fetch(`/api/archives/${archive.id}/media/${mediaId}/notes/${noteId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Failed to delete note from server:', err);
    }
  };

  // Media Vault sorting & filter states
  const [mediaSort, setMediaSort] = useState<'newest' | 'oldest' | 'highlights' | 'random'>('newest');
  const [mediaCategory, setMediaCategory] = useState<string>('all');
  const [mediaLayout, setMediaLayout] = useState<'grid' | 'masonry' | 'polaroid'>('grid');
  const [mediaSearch, setMediaSearch] = useState<string>('');

  // Social sharing modal & quick copy toast
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [instagramMode, setInstagramMode] = useState<'story' | 'post'>('story');
  const [quickCopied, setQuickCopied] = useState(false);
  const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);

  // Memory Wall States
  const [wallPosts, setWallPosts] = useState<WallPost[]>(() => {
    try {
      const localKey1 = `archive_wall_${archive.id}`;
      const localKey2 = archive.slug ? `archive_wall_${archive.slug}` : null;
      const localPosts1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
      const localPosts2: WallPost[] = localKey2 ? JSON.parse(localStorage.getItem(localKey2) || '[]') : [];
      const combinedLocal = [...localPosts1, ...localPosts2];
      
      const idMap = new Map<string, WallPost>();
      (wall || []).forEach((p) => idMap.set(p.id, p));
      combinedLocal.forEach((p) => {
        if (!idMap.has(p.id)) idMap.set(p.id, p);
      });
      return Array.from(idMap.values()).sort(
        (a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return wall || [];
    }
  });
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isImageAnalyzerOpen, setIsImageAnalyzerOpen] = useState(false);
  const [newNoteAuthor, setNewNoteAuthor] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteRole, setNewNoteRole] = useState('');
  const [justAddedNoteId, setJustAddedNoteId] = useState<string | null>(null);
  const [noteToastMessage, setNoteToastMessage] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Synchronize wall posts safely with incoming server wall props & local storage
  useEffect(() => {
    try {
      const localKey1 = `archive_wall_${archive.id}`;
      const localKey2 = archive.slug ? `archive_wall_${archive.slug}` : null;
      const localPosts1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
      const localPosts2: WallPost[] = localKey2 ? JSON.parse(localStorage.getItem(localKey2) || '[]') : [];
      const combinedLocal = [...localPosts1, ...localPosts2];
      
      setWallPosts((prev) => {
        const idMap = new Map<string, WallPost>();
        // Add server wall items
        (wall || []).forEach((p) => idMap.set(p.id, p));
        // Preserve any optimistic notes already in state
        prev.forEach((p) => {
          if (!idMap.has(p.id)) idMap.set(p.id, p);
        });
        // Include any localStorage notes
        combinedLocal.forEach((p) => {
          if (!idMap.has(p.id)) idMap.set(p.id, p);
        });
        return Array.from(idMap.values()).sort(
          (a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    } catch {
      if (wall) setWallPosts(wall);
    }
  }, [wall, archive.id, archive.slug]);

  // Audio ambience state
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);

  // Dynamic SEO & Social Meta-Tag Management
  useDynamicArchiveMeta({ archive, media });

  // Visible sections sorted by position with defensive default fallback
  const visibleSections = useMemo(() => {
    let list = [...sections];
    if (list.length === 0) {
      list = [
        { id: `sec-${archive.id}-1`, archiveId: archive.id, stableType: 'hero', navigationLabel: 'Home', displayTitle: archive.title, description: archive.subtitle, position: 0, isVisible: true },
        { id: `sec-${archive.id}-2`, archiveId: archive.id, stableType: 'timeline', navigationLabel: 'Our Journey', displayTitle: 'Our Journey', description: 'Milestones and memories.', position: 1, isVisible: true },
        { id: `sec-${archive.id}-3`, archiveId: archive.id, stableType: 'members', navigationLabel: 'People', displayTitle: 'The People', description: 'Faces and names.', position: 2, isVisible: true },
        { id: `sec-${archive.id}-4`, archiveId: archive.id, stableType: 'media-vault', navigationLabel: 'Media Vault', displayTitle: 'The Memory Vault', description: 'Photographs and recordings.', position: 3, isVisible: true },
        { id: `sec-${archive.id}-5`, archiveId: archive.id, stableType: 'memory-wall', navigationLabel: 'Memory Wall', displayTitle: 'The Memory Wall', description: 'Leave your notes, inside jokes, and heartfelt messages.', position: 4, isVisible: true },
        { id: `sec-${archive.id}-6`, archiveId: archive.id, stableType: 'closing', navigationLabel: 'Farewell', displayTitle: 'The Closing Note', description: 'A final tribute.', position: 5, isVisible: true }
      ];
    }
    return list
      .filter((s) => s.isVisible)
      .sort((a, b) => a.position - b.position);
  }, [sections, archive.id, archive.title, archive.subtitle]);

  // Scroll spy to update active section tab automatically (works in standard window and editor preview containers)
  useEffect(() => {
    const sectionIds = ['hero', 'timeline', 'members', 'media-vault', 'memory-wall', 'closing'];
    const elements: HTMLElement[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (el) elements.push(el);
    });

    if (elements.length === 0) return;

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const sectionType = entry.target.id.replace('section-', '');
              setActiveScrollSection(sectionType);
            }
          });
        },
        {
          threshold: [0.1, 0.4],
          rootMargin: '-5% 0px -30% 0px'
        }
      );

      elements.forEach((el) => observer.observe(el));
      return () => {
        elements.forEach((el) => observer.unobserve(el));
        observer.disconnect();
      };
    } else {
      const handleScroll = () => {
        const scrollPos = window.scrollY + 200;
        for (let i = elements.length - 1; i >= 0; i--) {
          const item = elements[i];
          if (item && item.offsetTop <= scrollPos) {
            setActiveScrollSection(item.id.replace('section-', ''));
            break;
          }
        }
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [visibleSections]);

  // Group tags for members
  const memberGroups = useMemo(() => {
    return Array.from(new Set(members.map((m) => m.groupLabel).filter(Boolean))) as string[];
  }, [members]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        (m.quote && m.quote.toLowerCase().includes(memberSearch.toLowerCase())) ||
        (m.nickname && m.nickname.toLowerCase().includes(memberSearch.toLowerCase()));
      const matchesGroup = selectedMemberGroup === 'all' || m.groupLabel === selectedMemberGroup;
      return matchesSearch && matchesGroup;
    });
  }, [members, memberSearch, selectedMemberGroup]);

  // Extract unique media categories & tags
  const mediaCategories = useMemo(() => {
    const tagsSet = new Set<string>();
    currentMediaList.forEach((item) => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((t) => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet);
  }, [currentMediaList]);

  // Sorted and filtered media items (with Newest First, Oldest First, Highlights)
  const sortedAndFilteredMedia = useMemo(() => {
    let list = [...currentMediaList];

    // Search filter
    if (mediaSearch.trim()) {
      const q = mediaSearch.toLowerCase();
      list = list.filter((m) =>
        (m.caption && m.caption.toLowerCase().includes(q)) ||
        (m.tags && m.tags.some((t) => t.toLowerCase().includes(q))) ||
        (m.eventDate && m.eventDate.includes(q))
      );
    }

    // Category filter
    if (mediaCategory !== 'all') {
      list = list.filter((m) =>
        (m.tags && m.tags.includes(mediaCategory)) ||
        (m.caption && m.caption.toLowerCase().includes(mediaCategory.toLowerCase()))
      );
    }

    // Sorting algorithm
    if (mediaSort === 'newest') {
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (a.year ? parseInt(a.year, 10) * 10000 : 0);
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (b.year ? parseInt(b.year, 10) * 10000 : 0);
        return timeB - timeA;
      });
    } else if (mediaSort === 'oldest') {
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (a.year ? parseInt(a.year, 10) * 10000 : 0);
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (b.year ? parseInt(b.year, 10) * 10000 : 0);
        return timeA - timeB;
      });
    } else if (mediaSort === 'highlights') {
      list.sort((a, b) => (b.caption?.length || 0) - (a.caption?.length || 0));
    } else if (mediaSort === 'random') {
      // Deterministic pseudo-random shuffle
      list.sort((a, b) => (a.id > b.id ? 1 : -1));
    }

    return list;
  }, [currentMediaList, mediaSort, mediaCategory, mediaSearch]);

  // Tab navigation handler: Smooth scroll or section focus (works in window and nested editor preview containers)
  const handleSelectTab = (tabId: string, sectionStableType?: string) => {
    setActiveNavTab(tabId);
    setActiveScrollSection(tabId);
    if (viewMode === 'focus') {
      const heroEl = document.getElementById('section-hero') || document.body;
      heroEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const targetType = sectionStableType || tabId;
      const el =
        document.getElementById(`section-${targetType}`) ||
        document.getElementById(`section-${tabId}`) ||
        document.getElementById(targetType) ||
        document.getElementById(tabId);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const previewStage = document.getElementById('editor-preview-stage');
        if (previewStage) {
          previewStage.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    }
  };

  // Quick Copy URL handler
  const handleQuickCopyLink = async () => {
    try {
      const origin = window.location.origin;
      const url = archive.slug ? `${origin}/s/${archive.slug}` : window.location.href;
      
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setQuickCopied(true);
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.1 }
      });
      setTimeout(() => setQuickCopied(false), 2500);
    } catch (err) {
      setIsShareModalOpen(true);
    }
  };

  // Handle Like on Wall Post
  const handleLikePost = async (postId: string) => {
    if (likedPosts.has(postId)) return;

    // Optimistic update
    setLikedPosts((prev) => new Set(prev).add(postId));
    setWallPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, likesCount: (p.likesCount || 0) + 1 } : p))
    );

    // Call API
    try {
      await fetch(`/api/archives/${archive.id}/wall/${postId}/like`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Note on Wall with immediate optimistic preview + local storage + server sync + smooth scroll to wall
  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    const author = newNoteAuthor.trim() || 'Classmate';
    const role = newNoteRole.trim() || undefined;
    const text = newNoteText.trim();
    const style = 'polaroid';

    const optimisticPost: WallPost = {
      id: `wp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      archiveId: archive.id,
      authorName: author,
      authorRole: role,
      text: text,
      cardStyle: style,
      isPinned: false,
      isApproved: true,
      likesCount: 0,
      createdAt: new Date().toISOString()
    };

    // 1. Immediately update UI state & close modal
    setWallPosts((prev) => [optimisticPost, ...prev]);
    setIsAddingNote(false);
    setJustAddedNoteId(optimisticPost.id);
    setNoteToastMessage('✨ Memory Note pinned to the wall!');
    setNewNoteAuthor('');
    setNewNoteText('');
    setNewNoteRole('');

    // Trigger parent sync callback if present (e.g. Editor workspace)
    if (onAddWallPost) {
      onAddWallPost(optimisticPost);
    }

    // Clear highlight and toast after duration
    setTimeout(() => setJustAddedNoteId(null), 5000);
    setTimeout(() => setNoteToastMessage(null), 4000);

    // 2. Smoothly scroll directly to the Memory Wall section
    setTimeout(() => {
      const wallEl = document.getElementById('section-memory-wall');
      if (wallEl) {
        wallEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    // 3. Play celebratory confetti
    try {
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.7 }
      });
    } catch {
      // Safe fallback
    }

    // 4. Persist in local browser storage so it survives refresh
    try {
      const localKey1 = `archive_wall_${archive.id}`;
      const existing1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
      localStorage.setItem(localKey1, JSON.stringify([optimisticPost, ...existing1.filter((p) => p.id !== optimisticPost.id)]));

      if (archive.slug) {
        const localKey2 = `archive_wall_${archive.slug}`;
        const existing2: WallPost[] = JSON.parse(localStorage.getItem(localKey2) || '[]');
        localStorage.setItem(localKey2, JSON.stringify([optimisticPost, ...existing2.filter((p) => p.id !== optimisticPost.id)]));
      }
    } catch (err) {
      console.warn('Could not save note to localStorage:', err);
    }

    // 5. Send to server backend with archive.id, falling back to slug
    try {
      const targetIdentifier = archive.id || archive.slug;
      const res = await fetch(`/api/archives/${targetIdentifier}/wall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: author,
          authorRole: role,
          text: text,
          cardStyle: style
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.post) {
          setWallPosts((prev) => prev.map((p) => (p.id === optimisticPost.id ? data.post : p)));
          try {
            const localKey1 = `archive_wall_${archive.id}`;
            const existing1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
            localStorage.setItem(localKey1, JSON.stringify(existing1.map((p) => (p.id === optimisticPost.id ? data.post : p))));
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.warn('Note submitted locally, backend sync deferred:', err);
    }
  };

  // Creator & Editor Moderation: Delete Note Permanently
  const handleDeletePost = async (postId: string) => {
    setWallPosts((prev) => prev.filter((p) => p.id !== postId));
    setDeletingPostId(null);

    if (onDeleteWallPost) {
      onDeleteWallPost(postId);
    }

    try {
      const localKey1 = `archive_wall_${archive.id}`;
      const existing1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
      localStorage.setItem(localKey1, JSON.stringify(existing1.filter((p) => p.id !== postId)));

      if (archive.slug) {
        const localKey2 = `archive_wall_${archive.slug}`;
        const existing2: WallPost[] = JSON.parse(localStorage.getItem(localKey2) || '[]');
        localStorage.setItem(localKey2, JSON.stringify(existing2.filter((p) => p.id !== postId)));
      }
    } catch (err) {
      console.warn('Could not update localStorage after post deletion:', err);
    }

    try {
      const targetIdentifier = archive.id || archive.slug;
      await fetch(`/api/archives/${targetIdentifier}/wall/${postId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken || ''}`
        }
      });
      setNoteToastMessage('Memory note permanently deleted.');
      setTimeout(() => setNoteToastMessage(null), 3500);
    } catch (err) {
      console.error('Failed to delete note from server:', err);
    }
  };

  // Creator & Editor Moderation: Toggle Hide/Unhide Note
  const handleToggleHidePost = async (postId: string, currentHidden: boolean) => {
    const nextHidden = !currentHidden;

    setWallPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isHidden: nextHidden } : p))
    );

    if (onToggleHideWallPost) {
      onToggleHideWallPost(postId, nextHidden);
    }

    try {
      const localKey1 = `archive_wall_${archive.id}`;
      const existing1: WallPost[] = JSON.parse(localStorage.getItem(localKey1) || '[]');
      localStorage.setItem(
        localKey1,
        JSON.stringify(existing1.map((p) => (p.id === postId ? { ...p, isHidden: nextHidden } : p)))
      );

      if (archive.slug) {
        const localKey2 = `archive_wall_${archive.slug}`;
        const existing2: WallPost[] = JSON.parse(localStorage.getItem(localKey2) || '[]');
        localStorage.setItem(
          localKey2,
          JSON.stringify(existing2.map((p) => (p.id === postId ? { ...p, isHidden: nextHidden } : p)))
        );
      }
    } catch (err) {
      console.warn('Could not update localStorage after post hide toggle:', err);
    }

    try {
      const targetIdentifier = archive.id || archive.slug;
      await fetch(`/api/archives/${targetIdentifier}/wall/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken || ''}`
        },
        body: JSON.stringify({ isHidden: nextHidden })
      });
      setNoteToastMessage(nextHidden ? 'Note hidden from visitors.' : 'Note is now visible to all visitors.');
      setTimeout(() => setNoteToastMessage(null), 3500);
    } catch (err) {
      console.error('Failed to update note visibility on server:', err);
    }
  };

  // Filtered wall posts for display: Creators see all (with status badges), visitors see only visible/approved notes
  const displayedWallPosts = useMemo(() => {
    if (isEditorOrCreator) {
      return wallPosts;
    }
    return wallPosts.filter((p) => !p.isHidden && p.isApproved !== false);
  }, [wallPosts, isEditorOrCreator]);
  // Theme-specific class names and atmospheric textures
  const themeBg = theme.styleClasses.container || (
    archive.themeId === 'paper-polaroids'
      ? 'theme-texture-paper text-stone-900'
      : archive.themeId === 'heritage-noir'
      ? 'theme-texture-heritage text-amber-50'
      : archive.themeId === 'aurora-glass'
      ? 'theme-texture-aurora text-slate-100'
      : archive.themeId === 'neon-afterglow'
      ? 'theme-texture-neon text-white'
      : archive.themeId === 'forest-chronicle'
      ? 'theme-texture-forest text-emerald-50'
      : 'theme-texture-midnight text-[#fdfbf7]'
  );

  const cardBg = theme.styleClasses.card || (
    archive.themeId === 'paper-polaroids'
      ? 'bg-white border-2 border-[#e3d8c4] shadow-xl text-stone-900'
      : archive.themeId === 'heritage-noir'
      ? 'bg-[#18130f]/95 border-2 border-[#e5c158]/35 text-amber-50 backdrop-blur-md shadow-2xl'
      : archive.themeId === 'aurora-glass'
      ? 'bg-slate-900/60 border border-white/20 text-slate-100 backdrop-blur-2xl shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.4),0_16px_40px_0_rgba(0,0,0,0.6)]'
      : archive.themeId === 'neon-afterglow'
      ? 'bg-[#0f0f1c]/95 border-2 border-cyan-500/40 text-white backdrop-blur-md shadow-[0_0_24px_rgba(0,240,255,0.15)]'
      : archive.themeId === 'forest-chronicle'
      ? 'bg-[#0e2418]/90 border border-emerald-500/25 text-emerald-50 backdrop-blur-xl shadow-2xl'
      : 'bg-[#0d1424]/90 border border-amber-500/25 text-[#fdfbf7] backdrop-blur-xl shadow-2xl'
  );

  // Slow graceful scroll-loading animation variants for cinematic reveals
  const sectionRevealVariants = {
    hidden: { opacity: 0, y: 48 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 1.15,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  };

  const staggerGridVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.18,
        delayChildren: 0.12
      }
    }
  };

  const staggerCardVariants = {
    hidden: { opacity: 0, y: 42, scale: 0.96 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.95,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  };

  // Nav tabs matching classof2022-26 & image.png reference
  const navTabs = [
    { id: 'timeline', label: 'The Journey', icon: Calendar },
    { id: 'members', label: 'Yearbook', icon: Users },
    { id: 'media-vault', label: 'Media Vault', icon: ImageIcon },
    { id: 'memory-wall', label: 'The Wall', icon: MessageSquareHeart },
  ];

  return (
    <div
      className={`min-h-screen w-full transition-colors duration-500 ${themeBg} ${activeFontPreset.bodyClass} relative selection:bg-amber-400 selection:text-neutral-950 overflow-x-hidden`}
      style={{ fontFamily: activeFontPreset.bodyFamily }}
    >
      
      {/* Theme-Reactive Ambient Background with cursor tracking & textures */}
      <ThemeInteractiveBackdrop
        themeId={archive.themeId}
        intensity="vibrant"
        interactive={true}
        className={`${isPreviewMode ? 'absolute' : 'fixed'} inset-0 z-0 pointer-events-none`}
      />

      {/* Aurora Liquid Glass Background Ambient Glows */}
      {archive.themeId === 'aurora-glass' && (
        <div className={`${isPreviewMode ? 'absolute' : 'fixed'} inset-0 pointer-events-none z-0 overflow-hidden`}>
          <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-sky-500/15 rounded-full blur-[140px] animate-pulse" />
          <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[160px]" />
          <div className="absolute bottom-10 left-1/3 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[130px]" />
        </div>
      )}

      {/* 0. FIXED SCROLL PROGRESS INDICATOR (High-Precision Spring Physics) */}
      {!isPreviewMode && (
        <motion.div
          style={{ scaleX }}
          className={`fixed top-0 left-0 right-0 h-[3px] z-[60] origin-left pointer-events-none ${
            archive.themeId === 'aurora-glass'
              ? 'bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 shadow-[0_0_14px_rgba(56,189,248,0.9)]'
              : archive.themeId === 'paper-polaroids'
              ? 'bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700 shadow-[0_0_10px_rgba(217,119,6,0.6)]'
              : 'bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.9)]'
          }`}
        />
      )}

      {/* QUICK COPY FLOATING TOAST */}
      {quickCopied && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-500 text-neutral-950 font-bold text-xs shadow-2xl flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Archive link copied to clipboard! Ready to share.</span>
        </motion.div>
      )}

      {/* 0. DEMO ARCHIVE PERSISTENT TOP BAR WITH BACK BUTTON (Standalone visitor mode only) */}
      {!isPreviewMode && (
        <div className="bg-neutral-950/95 border-b border-amber-400/30 px-3 sm:px-6 py-2.5 flex items-center justify-between text-xs backdrop-blur-lg z-50 sticky top-0 sm:relative shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => {
                if (onBackToPlatform) {
                  onBackToPlatform();
                } else if (typeof window !== 'undefined') {
                  window.location.href = '/';
                }
              }}
              title="Return to OnceHere Platform & Explore other archives"
              className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← Back to Platform</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 text-neutral-300 truncate">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="truncate text-xs font-mono">
                Viewing Archive: <strong className="text-amber-300 font-semibold">{archive.title}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (onBackToPlatform) {
                  onBackToPlatform();
                } else if (typeof window !== 'undefined') {
                  window.location.href = '/';
                }
              }}
              className="text-xs text-amber-300 hover:text-amber-200 font-medium underline underline-offset-2 flex items-center gap-1 cursor-pointer"
            >
              <span>Explore All Demos</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. ARCHIVE STICKY NAVIGATION BAR (Matching classof2022-26 & image.png) */}
      <nav className={`sticky top-0 sm:top-0 z-40 px-3 sm:px-8 py-3.5 border-b backdrop-blur-xl flex items-center justify-between transition-colors ${
        archive.themeId === 'paper-polaroids'
          ? 'bg-[#faf6ee]/95 border-stone-300 text-stone-900 shadow-sm'
          : archive.themeId === 'aurora-glass'
          ? 'bg-black/40 backdrop-blur-2xl border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] text-slate-100'
          : 'bg-black/75 border-white/10 text-neutral-100'
      }`}>
        {/* Left: Back Button & Branding */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => {
              if (onBackToPlatform) {
                onBackToPlatform();
              } else if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
            title="Return to Platform"
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer border shrink-0 ${
              archive.themeId === 'paper-polaroids'
                ? 'bg-stone-200 hover:bg-stone-300 text-stone-900 border-stone-300'
                : 'bg-white/10 hover:bg-amber-400 hover:text-neutral-950 text-neutral-200 border-white/15'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <a
            href="#section-hero"
            onClick={(e) => {
              e.preventDefault();
              const heroEl = document.getElementById('section-hero');
              if (heroEl) {
                heroEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                const previewStage = document.getElementById('editor-preview-stage');
                if (previewStage) {
                  previewStage.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }
            }}
            data-cursor="hover"
            data-cursor-text="TOP"
            className={`font-bold text-sm sm:text-base lg:text-lg tracking-tight hover:opacity-80 transition-opacity truncate max-w-[130px] sm:max-w-[220px] md:max-w-[300px] ${activeFontPreset.headingClass} ${
              archive.themeId === 'paper-polaroids' ? 'text-stone-950' : ''
            }`}
          >
            {archive.title}
          </a>
          <span
            className={`hidden sm:inline-block text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wider shrink-0 ${
              archive.themeId === 'paper-polaroids' ? 'bg-amber-100 text-amber-900 border border-amber-300' : ''
            }`}
            style={archive.themeId !== 'paper-polaroids' ? { backgroundColor: `${theme.palette.accent}20`, color: theme.palette.accent } : undefined}
          >
            {archive.batchLabel || `${archive.startYear}–${archive.endYear}`}
          </span>
        </div>

        {/* Center: 4 Primary High-End Navigation Tabs */}
        <div className={`hidden md:flex items-center gap-1 sm:gap-2 px-3 py-1 rounded-full border backdrop-blur-md ${
          archive.themeId === 'paper-polaroids' ? 'bg-stone-200/70 border-stone-300' : 'bg-white/5 border-white/10'
        }`}>
          {navTabs.map((tab) => {
            const isTabActive = activeScrollSection === tab.id;
            const TabIcon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id, tab.id)}
                data-cursor="hover"
                data-cursor-text={tab.label.toUpperCase()}
                className={`relative px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                  archive.themeId === 'paper-polaroids'
                    ? isTabActive
                      ? 'text-amber-900 font-bold bg-amber-100/90 shadow-sm'
                      : 'text-stone-700 hover:text-stone-950 hover:bg-stone-200/80'
                    : isTabActive
                    ? 'text-amber-400 font-semibold shadow-sm'
                    : 'text-neutral-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <TabIcon className={`w-3.5 h-3.5 ${
                  archive.themeId === 'paper-polaroids'
                    ? isTabActive ? 'text-amber-800' : 'text-stone-600'
                    : isTabActive ? 'text-amber-400' : 'opacity-60'
                }`} />
                <span>{tab.label}</span>

                {/* Golden Animated Active Underline Bar */}
                {isTabActive && (
                  <motion.div
                    layoutId="activeNavTabIndicator"
                    className={`absolute -bottom-1 left-2 right-2 h-[2px] rounded-full ${
                      archive.themeId === 'paper-polaroids'
                        ? 'bg-amber-800 shadow-[0_0_8px_rgba(146,64,14,0.5)]'
                        : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                    }`}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Actions (Font Switcher for Editors/Demo + Create Yours + SIGN NOTE) */}
        <div className="flex items-center gap-2 sm:gap-3 relative">
          
          {/* Typography / Font Selector Dropdown (Visible ONLY to Creators, Editors, and Demo Viewers) */}
          {canChangeTypography && (
            <div className="relative">
              <button
                onClick={() => setIsFontSelectorOpen(!isFontSelectorOpen)}
                data-cursor="hover"
                data-cursor-text="FONTS"
                title={isEditorOrCreator ? 'Change & Save Typography Preset' : 'Explore Typography Presets (Demo Mode)'}
                className={`px-2.5 py-1.5 rounded-full text-xs font-mono border active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ${
                  archive.themeId === 'paper-polaroids'
                    ? 'border-stone-300 hover:bg-stone-200 text-stone-800'
                    : 'border-white/20 hover:bg-white/10 text-neutral-300 hover:text-white'
                }`}
              >
                <Type className={`w-3.5 h-3.5 ${archive.themeId === 'paper-polaroids' ? 'text-amber-800' : 'text-amber-400'}`} />
                <span className="hidden lg:inline text-[11px]">{isEditorOrCreator ? 'Typography' : 'Font'}</span>
              </button>

              {isFontSelectorOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-64 p-2.5 rounded-2xl border backdrop-blur-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 text-left ${
                    archive.themeId === 'paper-polaroids'
                      ? 'bg-stone-50 border-stone-300 text-stone-900'
                      : 'bg-neutral-900/98 border-white/15 text-neutral-100'
                  }`}
                >
                  <div className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-bold border-b mb-1.5 flex items-center justify-between ${
                    archive.themeId === 'paper-polaroids' ? 'text-amber-900 border-stone-200' : 'text-amber-400 border-white/10'
                  }`}>
                    <span>{isEditorOrCreator ? 'Creator Typography' : 'Demo Typography'}</span>
                    {isEditorOrCreator && <span className="text-[9px] opacity-70">Autosaves</span>}
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                    {FONT_PRESETS.map((preset) => {
                      const isSelected = selectedFontPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectFontPreset(preset.id)}
                          className={`w-full px-2.5 py-2 rounded-xl text-xs text-left transition-all flex flex-col gap-0.5 cursor-pointer ${
                            isSelected
                              ? archive.themeId === 'paper-polaroids'
                                ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              : archive.themeId === 'paper-polaroids'
                              ? 'hover:bg-stone-200 text-stone-800'
                              : 'hover:bg-white/10 text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{preset.name}</span>
                            {isSelected && <span className="text-[10px] font-mono text-amber-500 font-bold">Active</span>}
                          </div>
                          <span className="text-[10px] opacity-60 line-clamp-1">{preset.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtle Create Your Own Archive Button */}
          {!isPreviewMode && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleCreateOwn}
              data-cursor="create"
              data-cursor-text="CREATE"
              title="Create a Memory Archive for your own batch or group"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ${
                archive.themeId === 'paper-polaroids'
                  ? 'bg-stone-800 hover:bg-stone-900 text-white border border-stone-700'
                  : 'bg-amber-400/90 hover:bg-amber-300 text-neutral-950 border border-amber-300/60'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${archive.themeId === 'paper-polaroids' ? 'text-amber-300' : 'text-neutral-950'}`} />
              <span className="hidden sm:inline">Create Yours</span>
              <span className="sm:hidden">Create</span>
            </motion.button>
          )}

          {/* Prominent SIGN NOTE Pill Button (matching classof2022-26 high reference) */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsAddingNote(true)}
            data-cursor="note"
            data-cursor-text="SIGN NOTE"
            className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border ${
              archive.themeId === 'paper-polaroids'
                ? 'border-amber-700 text-amber-950 bg-amber-100 hover:bg-amber-200'
                : 'border-amber-400/40 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20'
            }`}
          >
            <PenTool className={`w-3.5 h-3.5 ${archive.themeId === 'paper-polaroids' ? 'text-amber-900' : 'text-amber-400'}`} />
            <span>SIGN NOTE</span>
          </motion.button>
        </div>
      </nav>

      {/* Mobile/Tablet Sub-Navigation Sticky Bar */}
      <div className={`md:hidden sticky top-[65px] z-30 px-3 py-2 backdrop-blur-md border-b overflow-x-auto no-scrollbar flex items-center gap-2 justify-start shadow-md ${
        archive.themeId === 'paper-polaroids'
          ? 'bg-[#faf6ee]/95 border-stone-300 text-stone-900'
          : 'bg-neutral-950/85 border-white/10 text-neutral-100'
      }`}>
        {navTabs.map((tab) => {
          const isTabActive = activeScrollSection === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleSelectTab(tab.id, tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                archive.themeId === 'paper-polaroids'
                  ? isTabActive
                    ? 'bg-amber-800 text-white font-bold shadow-sm'
                    : 'bg-stone-200 text-stone-800 border border-stone-300 hover:bg-stone-300'
                  : isTabActive
                  ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm'
                  : 'bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. RENDER SECTIONS DYNAMICALLY */}
      <main className="space-y-12 sm:space-y-16 lg:space-y-20 pb-16 relative z-10">
        
        {visibleSections.map((section) => {
          
          {/* HERO SECTION WITH SUBTLE PARALLAX */}
          if (section.stableType === 'hero') {
            return (
              <HeroSection
                key={section.id}
                archive={archive}
                members={members}
                media={media}
                theme={theme}
                cardBg={cardBg}
                fontPreset={activeFontPreset}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                onOpenInstagramModal={(mode) => {
                  setInstagramMode(mode);
                  setIsInstagramModalOpen(true);
                }}
                onQuickCopy={handleQuickCopyLink}
                quickCopied={quickCopied}
              />
            );
          }

          {/* TIMELINE / JOURNEY SECTION (Supports Vertical Cinematic, Horizontal Slider, Stacked Cards, Story Chapters) */}
          if (section.stableType === 'timeline') {
            return (
              <TimelineSectionView
                key={section.id}
                section={section}
                timeline={timeline}
                theme={theme}
                activeFontPreset={activeFontPreset}
                cardBg={cardBg}
                sectionRevealVariants={sectionRevealVariants}
                staggerGridVariants={staggerGridVariants}
                staggerCardVariants={staggerCardVariants}
                archive={archive}
              />
            );
          }

          {/* MEMBERS / YEARBOOK SECTION */}
          if (section.stableType === 'members') {
            return (
              <motion.section
                key={section.id}
                id="section-members"
                variants={sectionRevealVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.01 }}
                className="px-4 sm:px-8 max-w-6xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <span className="text-xs font-mono uppercase tracking-widest opacity-60">Directory</span>
                  <h2 className={`text-3xl sm:text-4xl font-bold ${activeFontPreset.headingClass}`}>{section.displayTitle || 'Class of Distinction'}</h2>
                  {section.description && <p className={`text-xs sm:text-sm opacity-75 ${activeFontPreset.bodyClass}`}>{section.description}</p>}
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  
                  {/* Group Filter Tabs with Dynamic Counts */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedMemberGroup('all');
                      }}
                      data-cursor="hover"
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                        selectedMemberGroup === 'all'
                          ? 'bg-amber-400 text-neutral-950 font-bold shadow-md scale-105'
                          : 'bg-white/5 opacity-75 hover:opacity-100 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      All ({members.length})
                    </button>
                    {memberGroups.map((g) => {
                      const count = members.filter((m) => m.groupLabel === g).length;
                      return (
                        <button
                          key={g}
                          onClick={() => {
                            setSelectedMemberGroup(g);
                          }}
                          data-cursor="hover"
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-sm ${
                            selectedMemberGroup === g
                              ? 'bg-amber-400 text-neutral-950 font-bold shadow-md scale-105'
                              : 'bg-white/5 opacity-75 hover:opacity-100 border border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {g} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Search input */}
                  <div className="w-full sm:w-64 relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Find a classmate..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>

                {/* Members Grid with Instant Smooth Reveal on Filter Change */}
                <motion.div
                  key={selectedMemberGroup + memberSearch}
                  variants={staggerGridVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  {filteredMembers.map((member) => (
                    <motion.div
                      key={member.id}
                      variants={staggerCardVariants}
                      whileHover={{ y: -6, transition: { duration: 0.2 } }}
                      onClick={() => setSelectedMember(member)}
                      data-cursor="profile"
                      data-cursor-text="EXPLORE"
                      className={`p-6 rounded-2xl border ${cardBg} transition-all duration-300 cursor-pointer flex flex-col items-center text-center justify-between group hover:shadow-2xl`}
                    >
                      <div>
                        {/* Portrait */}
                        <div
                          className="w-24 h-24 rounded-full overflow-hidden border-2 mb-4 group-hover:scale-105 transition-transform shadow-md"
                          style={{ borderColor: theme.palette.accent }}
                        >
                          <LazyImage
                            src={member.imageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'}
                            alt={member.name}
                            containerClassName="w-full h-full rounded-full"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <h3 className={`text-base font-bold ${activeFontPreset.headingClass} ${archive.themeId === 'paper-polaroids' ? 'text-stone-900' : 'text-white'} tracking-wide`}>
                          {member.name}
                        </h3>
                        {member.nickname && (
                          <div className="text-[12px] text-amber-300 font-medium italic mt-0.5">
                            “{member.nickname}”
                          </div>
                        )}
                        {member.groupLabel && (
                          <div className="text-[11px] font-bold mt-1 tracking-wide" style={{ color: theme.palette.accent }}>
                            {member.groupLabel}
                          </div>
                        )}

                        {member.quote && (
                          <p className={`text-xs italic ${archive.themeId === 'paper-polaroids' ? 'text-stone-700' : 'text-neutral-200'} mt-3 ${activeFontPreset.accentClass} line-clamp-3 leading-relaxed`}>
                            “{member.quote}”
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/10 w-full text-[11px] font-semibold flex items-center justify-center gap-1 group-hover:gap-1.5 transition-all" style={{ color: theme.palette.accent }}>
                        <span>View Profile & Note</span>
                        <span>→</span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {filteredMembers.length === 0 && (
                  <div className="py-12 text-center space-y-3 bg-white/5 rounded-3xl border border-white/10 p-8 max-w-lg mx-auto">
                    <div className="text-3xl">🔍</div>
                    <div className="text-sm font-semibold text-neutral-200">No classmates found</div>
                    <p className="text-xs text-neutral-400">Try searching with another name or resetting the category filter.</p>
                    <button
                      onClick={() => {
                        setSelectedMemberGroup('all');
                        setMemberSearch('');
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-400 text-neutral-950 font-bold text-xs cursor-pointer hover:bg-amber-300 transition-all shadow-md"
                    >
                      Show All Classmates ({members.length})
                    </button>
                  </div>
                )}
              </motion.section>
            );
          }

          {/* MEDIA VAULT SECTION (With Sorting Buttons & Categories) */}
          if (section.stableType === 'media-vault') {
            return (
              <motion.section
                key={section.id}
                id="section-media-vault"
                variants={sectionRevealVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.08, margin: '0px 0px -40px 0px' }}
                className="px-4 sm:px-8 max-w-6xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <span className="text-xs font-mono uppercase tracking-widest opacity-60">Archive Gallery</span>
                  <h2 className={`text-3xl sm:text-4xl font-bold ${activeFontPreset.headingClass}`}>{section.displayTitle || 'Media Vault'}</h2>
                  <p className={`text-xs sm:text-sm opacity-75 ${activeFontPreset.bodyClass}`}>
                    {section.description || 'Curated photos, high-resolution memories, and candid moments.'}
                  </p>
                </div>

                {/* Controls Bar: Sort Buttons, Search, and Category Filters */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md space-y-4 max-w-4xl mx-auto">
                  
                  {/* Top Controls Row */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    
                    {/* Sort Options Buttons (Newest First, Oldest First, Highlights) */}
                    <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                      <span className="text-[11px] font-mono uppercase opacity-50 mr-1 flex items-center gap-1">
                        <ArrowUpDown className="w-3 h-3" /> Sort:
                      </span>

                      {/* Newest First Button */}
                      <button
                        onClick={() => setMediaSort('newest')}
                        data-cursor="hover"
                        className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          mediaSort === 'newest'
                            ? 'bg-amber-400 text-neutral-950 shadow-md scale-105'
                            : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Newest First</span>
                      </button>

                      {/* Oldest First Button */}
                      <button
                        onClick={() => setMediaSort('oldest')}
                        data-cursor="hover"
                        className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          mediaSort === 'oldest'
                            ? 'bg-amber-400 text-neutral-950 shadow-md scale-105'
                            : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <Clock className="w-3 h-3 rotate-180" />
                        <span>Oldest First</span>
                      </button>

                      {/* Highlights Button */}
                      <button
                        onClick={() => setMediaSort('highlights')}
                        data-cursor="hover"
                        className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          mediaSort === 'highlights'
                            ? 'bg-amber-400 text-neutral-950 shadow-md scale-105'
                            : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <Flame className="w-3 h-3" />
                        <span>Highlights</span>
                      </button>

                      {/* Shuffle Button */}
                      <button
                        onClick={() => setMediaSort('random')}
                        data-cursor="hover"
                        title="Shuffle memories"
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                          mediaSort === 'random'
                            ? 'bg-amber-400 text-neutral-950 shadow-md'
                            : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <Shuffle className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Media Search Input */}
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                      <input
                        type="text"
                        placeholder="Search photos & tags..."
                        value={mediaSearch}
                        onChange={(e) => setMediaSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-black/40 border border-white/10 focus:outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>

                  </div>

                  {/* Category Filter Pills (if tags exist) */}
                  {mediaCategories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5 text-xs">
                      <span className="text-[10px] font-mono opacity-50 uppercase mr-1">Filter:</span>
                      <button
                        onClick={() => setMediaCategory('all')}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                          mediaCategory === 'all'
                            ? 'bg-white/20 text-white font-semibold'
                            : 'bg-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        All Photos ({media.length})
                      </button>
                      {mediaCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMediaCategory(cat)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                            mediaCategory === cat
                              ? 'bg-amber-400 text-black font-semibold'
                              : 'bg-white/5 text-neutral-400 hover:text-white'
                          }`}
                        >
                          #{cat}
                        </button>
                      ))}
                    </div>
                  )}

                </div>

                {/* Media Grid with Staggered Scroll-Triggered Reveal Animation */}
                <motion.div
                  key={mediaSort + mediaCategory + mediaSearch}
                  variants={staggerGridVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6"
                >
                  {sortedAndFilteredMedia.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      variants={staggerCardVariants}
                      whileHover={{ scale: 1.04, y: -4, transition: { duration: 0.25 } }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setLightboxIndex(idx)}
                      data-cursor="view"
                      data-cursor-text="ZOOM & NOTE"
                      className="group relative aspect-square rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 cursor-pointer shadow-lg hover:shadow-2xl hover:border-amber-400/50 transition-all duration-300 bg-neutral-900/60"
                    >
                      <LazyImage
                        src={item.url}
                        alt={item.caption || 'Memory snapshot'}
                        containerClassName="w-full h-full"
                        className="w-full h-full object-cover group-hover:scale-115 group-active:scale-125 transition-transform duration-700 ease-out"
                      />
                      
                      {/* Top badge indicators: Notes count & Category tag */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-none">
                        {item.notes && item.notes.length > 0 ? (
                          <div className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/75 text-amber-300 border border-amber-400/40 backdrop-blur-md flex items-center gap-1 shadow-md">
                            <MessageSquareHeart className="w-3 h-3 text-amber-400" />
                            <span>{item.notes.length}</span>
                          </div>
                        ) : <div />}

                        <div className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/60 text-white/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <ZoomIn className="w-2.5 h-2.5 text-amber-400" />
                          <span>Touch to Zoom</span>
                        </div>
                      </div>

                      {/* Gradient overlay with caption, note count, and year */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent opacity-95 group-hover:opacity-100 transition-opacity p-3.5 sm:p-4 flex flex-col justify-end text-xs text-white">
                        <span className={`font-bold text-white line-clamp-2 text-sm drop-shadow-md ${activeFontPreset.headingClass}`}>
                          {item.caption || 'Memory Snapshot'}
                        </span>
                        <div className="flex items-center justify-between text-[11px] text-amber-200 font-mono mt-1.5 pt-1.5 border-t border-white/20">
                          <span className="font-semibold">{item.eventDate || item.year || 'Archive'}</span>
                          {item.tags && item.tags[0] && (
                            <span className="text-amber-300 font-bold bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-400/30">
                              #{item.tags[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {sortedAndFilteredMedia.length === 0 && (
                  <div className="text-center py-12 text-neutral-400 text-xs">
                    No memories found matching your search criteria.
                  </div>
                )}
              </motion.section>
            );
          }

          {/* MEMORY WALL & SCRIBBLE BOARD */}
          if (section.stableType === 'memory-wall') {
            return (
              <motion.section
                key={section.id}
                id="section-memory-wall"
                variants={sectionRevealVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.08, margin: '0px 0px -40px 0px' }}
                className="px-4 sm:px-8 max-w-6xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <span className="text-xs font-mono uppercase tracking-widest opacity-60">Community Board</span>
                  <h2 className={`text-3xl sm:text-4xl font-bold ${activeFontPreset.headingClass}`}>{section.displayTitle || 'The Memory Wall'}</h2>
                  <p className={`text-xs sm:text-sm opacity-75 ${activeFontPreset.bodyClass}`}>Scribbles, inside jokes, and parting thoughts.</p>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setIsAddingNote(true)}
                    data-cursor="note"
                    data-cursor-text="PIN"
                    className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer border"
                    style={{
                      backgroundColor: theme.palette.accent,
                      color: archive.themeId === 'paper-polaroids' ? '#fff' : '#000',
                      borderColor: archive.themeId === 'paper-polaroids' ? '#b45309' : 'rgba(251,191,36,0.5)'
                    }}
                  >
                    <PenTool className="w-4 h-4" />
                    <span>Pin Your Memory Note</span>
                  </motion.button>

                  {/* Creator / Editor Mode Indicator & Visibility Counts */}
                  {isEditorOrCreator && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 text-[11px] font-mono">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Creator & Editor Controls Active — Click Hide or Delete on any note</span>
                      </div>
                      {wallPosts.filter((p) => p.isHidden).length > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-900 border border-amber-500/30 text-amber-300 text-[11px] font-mono shadow-xs">
                          <EyeOff className="w-3 h-3 text-amber-400" />
                          <span>{wallPosts.filter((p) => p.isHidden).length} hidden from visitors</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dynamic Masonry-Style Scribbles Grid with Smooth Layout Animations */}
                {displayedWallPosts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {displayedWallPosts.map((post) => {
                        const isLiked = likedPosts.has(post.id);
                        const isJustAdded = justAddedNoteId === post.id;
                        const isHidden = Boolean(post.isHidden);
                        
                        // Refined aesthetic card style based on active theme
                        const isLightPaper = archive.themeId === 'paper-polaroids';
                        const cardCustomClass = isLightPaper
                          ? isHidden
                            ? 'bg-stone-50 text-stone-900 border-2 border-dashed border-amber-500/60 shadow-md rotate-[-0.6deg] hover:rotate-0 opacity-85'
                            : 'bg-white text-stone-900 border-stone-300 shadow-md rotate-[-0.6deg] hover:rotate-0'
                          : isHidden
                          ? 'bg-neutral-900/70 text-neutral-200 border-2 border-dashed border-amber-500/50 shadow-xl hover:border-amber-400 hover:bg-neutral-900/90 opacity-85'
                          : 'bg-neutral-900/90 text-neutral-100 border-white/15 shadow-xl hover:border-amber-400/50 hover:bg-neutral-900';
                        const tapeColor = isLightPaper
                          ? 'bg-amber-300/80 border-amber-400/50'
                          : 'bg-amber-400/40 border-amber-300/30';

                        return (
                          <motion.div
                            key={post.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            whileHover={{ y: -6, transition: { duration: 0.2 } }}
                            data-cursor="note"
                            data-cursor-text="NOTE"
                            className={`relative p-6 rounded-2xl border transition-all duration-300 flex flex-col justify-between space-y-4 shadow-md hover:shadow-2xl ${cardCustomClass} ${
                              isJustAdded ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-neutral-950 scale-[1.02] shadow-2xl animate-pulse' : ''
                            }`}
                          >
                            {/* Washi Tape Strip at the Top of the Card */}
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-5 rotate-[-1deg] rounded-sm backdrop-blur-xs border shadow-xs pointer-events-none opacity-85 z-10 overflow-hidden">
                              <div className={`w-full h-full ${tapeColor}`} />
                            </div>

                            {/* Hidden Status Tag for Editors & Creators */}
                            {isHidden && isEditorOrCreator && (
                              <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-semibold">
                                <span className="flex items-center gap-1.5">
                                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  Hidden from Visitors
                                </span>
                                <span className="text-[10px] opacity-80">(Only you can see this)</span>
                              </div>
                            )}

                            {post.imageUrl && (
                              <div className="w-full aspect-video rounded-xl overflow-hidden border border-current/10 my-2">
                                <LazyImage
                                  src={post.imageUrl}
                                  alt={post.authorName}
                                  containerClassName="w-full h-full"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            <p className={`text-sm ${activeFontPreset.accentClass} leading-relaxed italic opacity-95 pt-1`}>
                              “{post.text}”
                            </p>

                            <div className="pt-3 border-t border-current/15 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="min-w-0 flex-1">
                                <span className={`font-bold block truncate ${activeFontPreset.headingClass}`}>{post.authorName}</span>
                                {post.authorRole && <span className="text-[10px] opacity-75 font-mono truncate block">{post.authorRole}</span>}
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLikePost(post.id);
                                  }}
                                  data-cursor="hover"
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
                                    isLiked
                                      ? 'bg-rose-500/20 text-rose-500 font-bold scale-105 border border-rose-400/40'
                                      : 'bg-black/5 hover:bg-black/10 border border-current/10 opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                                  <span>{post.likesCount}</span>
                                </button>

                                {/* CREATOR / EDITOR ACTIONS: HIDE & DELETE */}
                                {isEditorOrCreator && (
                                  <div className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-current/15">
                                    {/* Hide / Unhide Toggle */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleHidePost(post.id, isHidden);
                                      }}
                                      title={isHidden ? 'Make visible to all visitors' : 'Hide note from visitors'}
                                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${
                                        isHidden
                                          ? 'bg-amber-400/25 text-amber-300 border border-amber-400/50 hover:bg-amber-400/35 font-bold shadow-xs'
                                          : 'bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white border border-current/15'
                                      }`}
                                    >
                                      {isHidden ? (
                                        <>
                                          <Eye className="w-3 h-3 text-amber-300" />
                                          <span>Unhide</span>
                                        </>
                                      ) : (
                                        <>
                                          <EyeOff className="w-3 h-3 text-neutral-400" />
                                          <span>Hide</span>
                                        </>
                                      )}
                                    </button>

                                    {/* Delete with inline confirmation */}
                                    {deletingPostId === post.id ? (
                                      <div className="flex items-center gap-1 bg-rose-950/90 border border-rose-500/60 rounded-lg p-0.5 shadow-sm">
                                        <span className="text-[10px] text-rose-300 font-bold px-1">Delete?</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeletePost(post.id);
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                                        >
                                          Yes
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingPostId(null);
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-neutral-300 text-[10px] cursor-pointer transition-colors"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletingPostId(post.id);
                                        }}
                                        title="Delete note permanently"
                                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition-all cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className={`p-8 sm:p-12 rounded-3xl border text-center space-y-4 max-w-lg mx-auto ${cardBg}`}>
                    <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-400 mx-auto flex items-center justify-center">
                      <PenTool className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold">No Memory Notes Yet</h3>
                      <p className="text-xs opacity-75">Be the first to pin a heartfelt farewell note, inside joke, or class memory!</p>
                    </div>
                    <button
                      onClick={() => setIsAddingNote(true)}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 text-neutral-950 font-bold text-xs hover:brightness-110 shadow-lg transition-all cursor-pointer"
                    >
                      Pin the First Note
                    </button>
                  </div>
                )}
              </motion.section>
            );
          }

          {/* CLOSING SECTION */}
          if (section.stableType === 'closing') {
            return (
              <motion.section
                key={section.id}
                id="section-closing"
                variants={sectionRevealVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.08, margin: '0px 0px -40px 0px' }}
                className="px-4 sm:px-8 max-w-4xl mx-auto text-center space-y-8 pt-8"
              >
                <div className="w-16 h-1 bg-current opacity-20 mx-auto rounded-full" />
                
                <div className="space-y-4">
                  <h2 className={`text-3xl sm:text-5xl font-bold ${activeFontPreset.headingClass}`}>
                    {archive.settings?.customClosingTitle || 'Until We Meet Again'}
                  </h2>
                  <p className={`text-base sm:text-lg font-light opacity-80 max-w-xl mx-auto leading-relaxed italic ${activeFontPreset.accentClass}`}>
                    {archive.settings?.customClosingNote || 'Every chapter deserves a place to live. May our paths cross again on sunny days and familiar corridors.'}
                  </p>
                  <div className="text-xs opacity-50 font-mono">
                    {archive.organizationName} · {archive.batchLabel || `${archive.startYear}–${archive.endYear}`}
                  </div>
                </div>

                {/* Lower Pre-Configured Social Channels Bar (WhatsApp, IG Stories, Twitter, FB, Copy) */}
                <div className="max-w-2xl mx-auto pt-6 text-left">
                  <PreConfiguredShareBar
                    archive={archive}
                    media={media}
                    variant="card"
                    onOpenGeneralShare={() => setIsShareModalOpen(true)}
                  />
                </div>

              </motion.section>
            );
          }

          return null;
        })}

        {/* INSPIRATION & CREATE YOUR OWN ARCHIVE CARD */}
        {!isPreviewMode && (
          <motion.section
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={sectionRevealVariants}
            className="max-w-3xl mx-auto px-4 sm:px-6 pt-6"
          >
            <div className={`p-8 sm:p-10 rounded-3xl border text-center relative overflow-hidden ${cardBg} shadow-2xl`}>
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-400 mb-4 shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>

              <h3 className={`text-2xl sm:text-3xl font-bold tracking-tight ${activeFontPreset.headingClass}`}>
                Create a Memory Archive for Your Own Batch
              </h3>
              <p className={`text-xs sm:text-sm opacity-80 mt-2 max-w-md mx-auto leading-relaxed ${activeFontPreset.bodyClass}`}>
                Immortalize memories, milestones, yearbook portraits, and goodbye notes for your class, team, or journey in minutes.
              </p>

              <div className="pt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleCreateOwn}
                  className="px-6 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs sm:text-sm shadow-xl hover:shadow-amber-500/20 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Create Your Free Archive</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.section>
        )}

      </main>

      {/* 3. ANIMATED EXPANDABLE FLOATING ACTION DOCK */}
      <div className="fixed bottom-5 right-4 sm:right-6 z-40 flex flex-col items-end">
        {/* Backdrop dismiss when floating menu is open */}
        {isFloatingMenuOpen && (
          <div
            onClick={() => setIsFloatingMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs transition-opacity sm:bg-transparent"
          />
        )}

        {/* Animated Popout Actions Menu */}
        <AnimatePresence>
          {isFloatingMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
              className="relative z-40 mb-3 flex flex-col items-end gap-2.5 p-3 rounded-3xl bg-neutral-950/95 text-white backdrop-blur-2xl border border-white/20 shadow-2xl shadow-black/80 max-w-[280px] sm:max-w-xs"
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 px-2 pt-1 pb-0.5 w-full flex items-center justify-between border-b border-white/10">
                <span>Quick Actions</span>
                <span className="text-amber-400 font-sans font-bold">⚡ Archive</span>
              </div>

              {/* 0. Return / Back to Platform */}
              <button
                onClick={() => {
                  setIsFloatingMenuOpen(false);
                  if (onBackToPlatform) {
                    onBackToPlatform();
                  } else if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 transition-all text-xs cursor-pointer group active:scale-98 border border-amber-400/30 font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-amber-400 text-neutral-950 group-hover:scale-110 transition-all">
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span>Back to Explore</span>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">Home</span>
              </button>

              {/* 1. Scroll to Top / Move Up button */}
              <button
                onClick={() => {
                  const heroEl = document.getElementById('section-hero');
                  if (heroEl) {
                    heroEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    const previewStage = document.getElementById('editor-preview-stage');
                    if (previewStage) {
                      previewStage.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }
                  setIsFloatingMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white transition-all text-xs cursor-pointer group active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-white/10 text-neutral-300 group-hover:text-white group-hover:scale-110 transition-all">
                    <ArrowUp className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Move to Top</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">Top</span>
              </button>

              {/* 2. Quick Copy Link */}
              <button
                onClick={() => {
                  handleQuickCopyLink();
                  setTimeout(() => setIsFloatingMenuOpen(false), 900);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white transition-all text-xs cursor-pointer group active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:scale-110 transition-all">
                    {quickCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </div>
                  <span className="font-medium">{quickCopied ? 'Link Copied!' : 'Copy Archive Link'}</span>
                </div>
                <span className="text-[10px] text-emerald-400/80 font-mono">URL</span>
              </button>

              {/* 3. Share Modal Trigger */}
              <button
                onClick={() => {
                  setIsShareModalOpen(true);
                  setIsFloatingMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white transition-all text-xs cursor-pointer group active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-sky-500/15 text-sky-400 group-hover:scale-110 transition-all">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Share Archive</span>
                </div>
                <span className="text-[10px] text-sky-400/80 font-mono">WhatsApp/QR</span>
              </button>

              {/* 4. Instagram Story Creator */}
              <button
                onClick={() => {
                  setInstagramMode('story');
                  setIsInstagramModalOpen(true);
                  setIsFloatingMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white transition-all text-xs cursor-pointer group active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-pink-500/15 text-pink-400 group-hover:scale-110 transition-all">
                    <Instagram className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Instagram Story Card</span>
                </div>
                <span className="text-[10px] text-pink-400/80 font-mono">Story</span>
              </button>

              {/* 5. Pin Memory Note */}
              <button
                onClick={() => {
                  setIsAddingNote(true);
                  setIsFloatingMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white transition-all text-xs cursor-pointer group active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-amber-500/15 text-amber-400 group-hover:scale-110 transition-all">
                    <MessageSquareHeart className="w-4 h-4" />
                  </div>
                  <span className="font-medium">Pin a Memory Note</span>
                </div>
                <span className="text-[10px] text-amber-400/80 font-mono">Wall</span>
              </button>

              {/* 6. Create Mine */}
              {!isPreviewMode && (
                <button
                  onClick={() => {
                    handleCreateOwn();
                    setIsFloatingMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-bold text-xs shadow-lg active:scale-98 transition-all cursor-pointer mt-1"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>Create Your Own</span>
                  </div>
                  <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded-md font-mono">Free</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Master Floating Trigger Button */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsFloatingMenuOpen(!isFloatingMenuOpen)}
          title={isFloatingMenuOpen ? 'Close Menu' : 'Open Quick Actions Menu'}
          className={`relative z-40 p-3.5 sm:p-4 rounded-full shadow-2xl backdrop-blur-xl border transition-all duration-300 flex items-center justify-center cursor-pointer ${
            isFloatingMenuOpen
              ? 'bg-neutral-900 text-white border-white/30 rotate-90 shadow-amber-500/20'
              : 'bg-gradient-to-tr from-neutral-900 via-neutral-950 to-neutral-900 text-amber-400 border-amber-500/40 hover:border-amber-400 shadow-amber-500/25 ring-2 ring-amber-400/20'
          }`}
        >
          {isFloatingMenuOpen ? (
            <X className="w-5 h-5 text-neutral-200" />
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline text-xs font-bold font-serif text-white tracking-wide pr-1">
                Explore & Share
              </span>
            </div>
          )}
        </motion.button>
      </div>

      {/* 4. LIGHTBOX & MEDIA VAULT ANNOTATION MODAL (With Touch-Zoom & Creator Notes) */}
      {lightboxIndex !== null && sortedAndFilteredMedia[lightboxIndex] && (() => {
        const activeItem = sortedAndFilteredMedia[lightboxIndex];
        const hasNotes = activeItem.notes && activeItem.notes.length > 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            
            {/* Close Button */}
            <button
              onClick={() => setLightboxIndex(null)}
              data-cursor="hover"
              className="absolute top-4 right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 z-50 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Prev Button */}
            <button
              onClick={() => setLightboxIndex((lightboxIndex - 1 + sortedAndFilteredMedia.length) % sortedAndFilteredMedia.length)}
              data-cursor="hover"
              className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 z-50 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Right Next Button */}
            <button
              onClick={() => setLightboxIndex((lightboxIndex + 1) % sortedAndFilteredMedia.length)}
              data-cursor="hover"
              className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 z-50 transition-all cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* Modal Body: 2-Column Split on Desktop */}
            <div className="w-full max-w-5xl max-h-[92vh] bg-neutral-900/90 border border-white/15 rounded-3xl overflow-hidden flex flex-col lg:flex-row shadow-2xl">
              
              {/* Left Column: Image Canvas with Touch/Controls Zoom */}
              <div className="flex-1 bg-black/80 flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-hidden min-h-[300px] sm:min-h-[450px]">
                
                {/* Zoom Toolbar */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 p-1.5 rounded-full bg-neutral-950/80 border border-white/20 backdrop-blur-md text-white">
                  <button
                    onClick={() => setPhotoZoom((z) => Math.max(1, z - 0.3))}
                    disabled={photoZoom <= 1}
                    title="Zoom Out"
                    className="p-1.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono px-1 font-semibold">{Math.round(photoZoom * 100)}%</span>
                  <button
                    onClick={() => setPhotoZoom((z) => Math.min(2.8, z + 0.3))}
                    disabled={photoZoom >= 2.8}
                    title="Zoom In"
                    className="p-1.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  {photoZoom > 1 && (
                    <button
                      onClick={() => setPhotoZoom(1)}
                      title="Reset Zoom"
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-black font-bold ml-1 cursor-pointer"
                    >
                      100%
                    </button>
                  )}
                </div>

                {/* Photo with dynamic zoom transform */}
                <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                  <motion.img
                    src={activeItem.url}
                    alt={activeItem.caption || 'Media item'}
                    animate={{ scale: photoZoom }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="max-h-[60vh] max-w-full object-contain rounded-xl select-none cursor-zoom-in"
                    onClick={() => setPhotoZoom((z) => (z > 1.2 ? 1 : 1.8))}
                  />
                </div>

                {/* Bottom Photo Metadata */}
                <div className="w-full flex items-center justify-between text-xs text-neutral-400 font-mono mt-2 pt-2 border-t border-white/10">
                  <span>Photo {lightboxIndex + 1} of {sortedAndFilteredMedia.length}</span>
                  <span className="text-amber-400 font-sans">{activeItem.eventDate || activeItem.year || 'Vault Record'}</span>
                </div>
              </div>

              {/* Right Column: Photo Details & Note Annotation Section */}
              <div className="w-full lg:w-96 p-5 sm:p-6 bg-neutral-900 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto max-h-[50vh] lg:max-h-[90vh]">
                
                <div className="space-y-4">
                  {/* Photo Title & Caption */}
                  <div>
                    <h3 className={`text-xl font-bold text-white ${activeFontPreset.headingClass}`}>
                      {activeItem.caption || 'Archive Photograph'}
                    </h3>
                    {activeItem.tags && activeItem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {activeItem.tags.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-amber-400/30 text-amber-300 bg-amber-400/10">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes & Scribbles Stream attached to this photograph */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1.5">
                        <MessageSquareHeart className="w-3.5 h-3.5 text-amber-400" />
                        <span>Memory Notes & Annotations</span>
                      </span>
                      {hasNotes && (
                        <span className="text-[10px] font-mono text-amber-300">{activeItem.notes?.length} notes</span>
                      )}
                    </div>

                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {hasNotes ? (
                        activeItem.notes?.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1.5 hover:border-amber-400/30 transition-all group/note relative"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold text-[10px] flex items-center justify-center border border-amber-400/30">
                                  {n.authorName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-amber-300 font-mono">{n.authorName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMediaNote(activeItem.id, n.id)}
                                  title="Delete Note"
                                  className="opacity-0 group-hover/note:opacity-100 hover:text-rose-400 text-neutral-500 transition-opacity p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <p className="text-neutral-200 leading-relaxed font-sans text-xs">{n.text}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-2xl bg-white/5 border border-dashed border-white/15 text-center text-xs text-neutral-400 space-y-1">
                          <p className="font-semibold text-neutral-300">No notes on this photo yet</p>
                          <p className="text-[11px] opacity-75">Be the first to attach a memory or inside story below!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Creator / Classmate Add Note Form */}
                <form
                  onSubmit={(e) => handlePostMediaNote(activeItem.id, e)}
                  className="mt-4 pt-3.5 border-t border-white/10 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-amber-300 uppercase tracking-wider font-semibold flex items-center gap-1">
                      <PenTool className="w-3 h-3 text-amber-400" />
                      <span>Attach Note to Photo</span>
                    </span>
                    {isPostingMediaNote && (
                      <span className="text-[10px] text-amber-300 animate-pulse font-mono">Saving...</span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={mediaNoteAuthor}
                    onChange={(e) => setMediaNoteAuthor(e.target.value)}
                    placeholder="Your Name (e.g., Alex / Classmate)"
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />

                  <textarea
                    rows={2}
                    value={mediaNoteText}
                    onChange={(e) => setMediaNoteText(e.target.value)}
                    placeholder="Add an inside joke, story, or memory about this photo..."
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 resize-none transition-colors"
                    required
                  />

                  <button
                    type="submit"
                    disabled={isPostingMediaNote || !mediaNoteText.trim()}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-40 text-neutral-950 font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>{isPostingMediaNote ? 'Attaching Note...' : 'Add Note to Photo'}</span>
                  </button>
                </form>

              </div>

            </div>
          </div>
        );
      })()}

      {/* 5. MEMBER PROFILE MODAL */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border ${cardBg} shadow-2xl relative`}>
            <button
              onClick={() => setSelectedMember(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/5 opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4">
              <div
                className="w-28 h-28 rounded-full overflow-hidden border-2 shadow-lg"
                style={{ borderColor: theme.palette.accent }}
              >
                <LazyImage
                  src={selectedMember.imageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'}
                  alt={selectedMember.name}
                  containerClassName="w-full h-full rounded-full"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <h3 className={`text-2xl font-bold ${activeFontPreset.headingClass}`}>{selectedMember.name}</h3>
                {selectedMember.groupLabel && (
                  <span className="text-xs font-semibold" style={{ color: theme.palette.accent }}>
                    {selectedMember.groupLabel}
                  </span>
                )}
              </div>

              {selectedMember.quote && (
                <div className={`p-4 rounded-2xl bg-white/5 border border-current/10 text-xs ${activeFontPreset.accentClass} italic opacity-90 leading-relaxed`}>
                  “{selectedMember.quote}”
                </div>
              )}

              {selectedMember.ambition && (
                <div className={`text-xs opacity-75 ${activeFontPreset.bodyClass}`}>
                  <span className="font-semibold">Future Aspiration:</span> {selectedMember.ambition}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD MEMORY NOTE MODAL (High-Contrast Theme-Aware Board) */}
      {isAddingNote && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-lg p-6 sm:p-8 rounded-3xl border shadow-2xl relative ${
            archive.themeId === 'paper-polaroids'
              ? 'bg-[#fefcf8] border-stone-300 text-stone-900'
              : 'bg-neutral-900/98 border-neutral-700 text-neutral-100'
          }`}>
            <button
              onClick={() => setIsAddingNote(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors cursor-pointer ${
                archive.themeId === 'paper-polaroids'
                  ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-2 flex items-center gap-2">
              <div className={`p-2 rounded-xl ${
                archive.themeId === 'paper-polaroids' ? 'bg-amber-100 text-amber-800' : 'bg-amber-400/20 text-amber-400'
              }`}>
                <PenTool className="w-4 h-4" />
              </div>
              <div>
                <h3 className={`text-xl font-bold ${activeFontPreset.headingClass}`}>Pin a Memory Note</h3>
                <p className={`text-xs opacity-75 ${activeFontPreset.bodyClass}`}>Leave an inside joke, gratitude note, or goodbye scribble.</p>
              </div>
            </div>

            <form onSubmit={handlePostNote} className="space-y-4 mt-4">
              
              {/* Author & Role Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider opacity-70 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={newNoteAuthor}
                    onChange={(e) => setNewNoteAuthor(e.target.value)}
                    placeholder="e.g. Maya Lin (or Anonymous)"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none transition-all ${
                      archive.themeId === 'paper-polaroids'
                        ? 'bg-white border-stone-300 text-stone-900 placeholder-stone-400 focus:border-amber-600'
                        : 'bg-black/50 border-neutral-700 text-white placeholder-neutral-500 focus:border-amber-400'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider opacity-70 mb-1">Role or Nickname</label>
                  <input
                    type="text"
                    value={newNoteRole}
                    onChange={(e) => setNewNoteRole(e.target.value)}
                    placeholder="e.g. Backbencher / Red House"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none transition-all ${
                      archive.themeId === 'paper-polaroids'
                        ? 'bg-white border-stone-300 text-stone-900 placeholder-stone-400 focus:border-amber-600'
                        : 'bg-black/50 border-neutral-700 text-white placeholder-neutral-500 focus:border-amber-400'
                    }`}
                  />
                </div>
              </div>

              {/* Note inspiration templates */}
              <div className="space-y-1">
                <div className="text-[11px] font-mono opacity-70">✨ Need inspiration? Tap to use a template:</div>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1 custom-scrollbar">
                  {NOTE_SUGGESTIONS.slice(0, 5).map((note, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setNewNoteText(note.text);
                        if (!newNoteRole) setNewNoteRole(note.role);
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border text-left transition-colors cursor-pointer line-clamp-1 ${
                        archive.themeId === 'paper-polaroids'
                          ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-200'
                      }`}
                    >
                      “{note.text.slice(0, 42)}...”
                    </button>
                  ))}
                </div>
              </div>

              {/* Memory Text Area */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider opacity-70 mb-1">Your Memory Message *</label>
                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Write your heartfelt memory, inside joke, confession, or goodbye wish..."
                  rows={4}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none leading-relaxed transition-all resize-none ${
                    archive.themeId === 'paper-polaroids'
                      ? 'bg-white border-stone-300 text-stone-900 placeholder-stone-400 focus:border-amber-600'
                      : 'bg-black/50 border-neutral-700 text-white placeholder-neutral-500 focus:border-amber-400'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="w-full py-3 rounded-xl text-xs font-bold shadow-lg active:scale-95 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                style={{
                  backgroundColor: theme.palette.accent,
                  color: archive.themeId === 'paper-polaroids' ? '#fff' : '#000'
                }}
              >
                <PenTool className="w-4 h-4" />
                <span>Pin Note to Memory Wall</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification for Memory Notes */}
      <AnimatePresence>
        {noteToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-amber-400 text-neutral-950 font-bold text-xs shadow-2xl flex items-center gap-2 border border-amber-300"
          >
            <Sparkles className="w-4 h-4 text-neutral-950" />
            <span>{noteToastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. SOCIAL SHARE MODAL */}
      <SocialShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        archive={archive}
        media={media}
      />

      {/* 8. INSTAGRAM STORY & POST HIGHLIGHT STUDIO MODAL */}
      <InstagramStoryModal
        isOpen={isInstagramModalOpen}
        onClose={() => setIsInstagramModalOpen(false)}
        archive={archive}
        media={media}
        defaultMode={instagramMode}
      />

      {/* 9. AI MULTIMODAL IMAGE & NOTE ANALYZER MODAL */}
      {isImageAnalyzerOpen && (
        <ImageAnalyzerModal
          isOpen={isImageAnalyzerOpen}
          onClose={() => setIsImageAnalyzerOpen(false)}
          archiveType={archive.archiveType}
          themeId={archive.themeId}
          onApplyToWall={(text) => {
            setNewNoteText(text);
            setIsImageAnalyzerOpen(false);
          }}
          onApplyToVault={(url, caption) => {
            setNewNoteText(caption ? `${caption}` : 'A photo memory!');
            setIsImageAnalyzerOpen(false);
          }}
        />
      )}

      {/* 10. CENTRALIZED MANDATORY ATTRIBUTION FOOTER */}
      <AttributionFooter themeId={archive.themeId} />

    </div>
  );
};

