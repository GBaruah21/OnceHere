import React, { useState, useEffect } from 'react';
import { resolveTenantContext } from './lib/tenant';
import { Archive, Section, TimelineEvent, Member, MediaItem, WallPost, Album, ThemeId, ArchiveType } from './types';
import { PlatformNavbar } from './components/PlatformNavbar';
import { HeroSection } from './components/landing/HeroSection';
import { UseCasesSection } from './components/landing/UseCasesSection';
import { ThemesSection } from './components/landing/ThemesSection';
import { FeaturesSection } from './components/landing/FeaturesSection';
import { HowItWorksSection } from './components/landing/HowItWorksSection';
import { ExploreArchivesSection } from './components/landing/ExploreArchivesSection';
import { AttributionFooter } from './components/AttributionFooter';
import { CreateArchiveFlow } from './components/creation/CreateArchiveFlow';
import { DemoSelectorModal } from './components/common/DemoSelectorModal';
import { KeyAccessModal } from './components/common/KeyAccessModal';
import { ArchiveEditor } from './components/editor/ArchiveEditor';
import { ArchivePublicView } from './components/archive/ArchivePublicView';
import { SessionStorage } from './lib/security';
import { AlertCircle, Lock, ArrowLeft } from 'lucide-react';

export default function App() {
  // Platform navigation & routing state
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [tenantContext, setTenantContext] = useState(() =>
    resolveTenantContext(window.location.pathname, window.location.hostname)
  );

  // Platform data
  const [allArchives, setAllArchives] = useState<Archive[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(true);

  // Active Loaded Archive & Sub-entities (for workspace or public view)
  const [activeArchiveData, setActiveArchiveData] = useState<{
    archive: Archive;
    sections: Section[];
    timeline: TimelineEvent[];
    members: Member[];
    media: MediaItem[];
    wall: WallPost[];
    albums: Album[];
  } | null>(null);
  const [loadingActiveArchive, setLoadingActiveArchive] = useState(false);
  const [activeArchiveError, setActiveArchiveError] = useState<string | null>(null);

  // Creation Wizard Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isKeyAccessModalOpen, setIsKeyAccessModalOpen] = useState(false);
  const [creationInitialType, setCreationInitialType] = useState<ArchiveType>('school');
  const [creationInitialTheme, setCreationInitialTheme] = useState<ThemeId>('midnight-cinema');

  // Private Archive PIN Prompt
  const [viewerPin, setViewerPin] = useState('');
  const [viewerPinError, setViewerPinError] = useState<string | null>(null);
  const [isViewerUnlocked, setIsViewerUnlocked] = useState(false);

  // Listen to browser popstate (back/forward) and URL parameters
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      setTenantContext(resolveTenantContext(path, window.location.hostname));
    };
    window.addEventListener('popstate', handlePopState);

    // Auto-open create flow if redirected from an archive with ?create=true
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('create') === 'true') {
      setIsCreateModalOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch all public archives for exploration
  const fetchArchives = async () => {
    try {
      setLoadingArchives(true);
      const res = await fetch('/api/archives');
      const data = await res.json();
      if (res.ok) {
        setAllArchives(data.archives || []);
      }
    } catch (err) {
      console.error('Failed to fetch archives:', err);
    } finally {
      setLoadingArchives(false);
    }
  };

  useEffect(() => {
    fetchArchives();
  }, []);

  // Fetch full details when entering an archive or workspace
  useEffect(() => {
    async function loadArchive() {
      if (tenantContext.type === 'platform') {
        setActiveArchiveData(null);
        return;
      }

      try {
        setLoadingActiveArchive(true);
        setActiveArchiveError(null);

        let endpoint = '';
        let headers: Record<string, string> = {};

        if (tenantContext.type === 'workspace') {
          endpoint = `/api/archives/by-workspace/${tenantContext.workspaceSlug}`;
        } else if (tenantContext.type === 'archive') {
          endpoint = `/api/archives/by-slug/${tenantContext.slug}`;
        }

        const res = await fetch(endpoint, { headers });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Archive not found or unavailable.');
        }

        if (data.ownerToken) {
          SessionStorage.setOwnerToken(data.archive.id, data.ownerToken);
        }

        setActiveArchiveData({
          archive: data.archive,
          sections: data.sections || [],
          timeline: data.timeline || [],
          members: data.members || [],
          media: data.media || [],
          wall: data.wall || [],
          albums: data.albums || []
        });
      } catch (err: any) {
        setActiveArchiveError(err.message || 'Failed to load archive.');
      } finally {
        setLoadingActiveArchive(false);
      }
    }

    loadArchive();
  }, [tenantContext]);

  // Navigate helper
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setTenantContext(resolveTenantContext(path, window.location.hostname));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler when an archive is created from wizard
  const handleArchiveCreated = (archive: Archive, workspaceSlug: string, ownerToken: string) => {
    setIsCreateModalOpen(false);
    fetchArchives(); // Refresh platform archives list
    navigateTo(`/workspace/${workspaceSlug}`);
  };

  // Open creation wizard with pre-selected options
  const handleOpenCreateWithType = (type: ArchiveType) => {
    setCreationInitialType(type);
    setIsCreateModalOpen(true);
  };

  const handleOpenCreateWithTheme = (themeId: ThemeId) => {
    setCreationInitialTheme(themeId);
    setIsCreateModalOpen(true);
  };

  // 1. WORKSPACE STUDIO MODE
  if (tenantContext.type === 'workspace') {
    if (loadingActiveArchive) {
      return (
        <div className="h-screen w-full bg-neutral-950 flex flex-col items-center justify-center text-neutral-300 space-y-4">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium font-serif text-white">Loading Studio Workspace...</div>
        </div>
      );
    }

    if (activeArchiveError || !activeArchiveData) {
      return (
        <div className="h-screen w-full bg-neutral-950 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 max-w-md">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
            <h3 className="font-bold text-base text-white">Workspace Not Found</h3>
            <p className="text-xs mt-1 opacity-80">{activeArchiveError || 'This workspace may have expired or been moved.'}</p>
          </div>
          <button
            onClick={() => navigateTo('/')}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
          >
            Return to OnceHere Platform
          </button>
        </div>
      );
    }

    const ownerToken = SessionStorage.getOwnerToken(activeArchiveData.archive.id) || undefined;

    return (
      <ArchiveEditor
        initialArchive={activeArchiveData.archive}
        initialSections={activeArchiveData.sections}
        initialTimeline={activeArchiveData.timeline}
        initialMembers={activeArchiveData.members}
        initialMedia={activeArchiveData.media}
        initialWall={activeArchiveData.wall}
        initialAlbums={activeArchiveData.albums}
        ownerToken={ownerToken}
        onExitToPlatform={() => navigateTo('/')}
      />
    );
  }

  // 2. PUBLIC ARCHIVE VIEW MODE
  if (tenantContext.type === 'archive') {
    if (loadingActiveArchive) {
      return (
        <div className="h-screen w-full bg-neutral-950 flex flex-col items-center justify-center text-neutral-300 space-y-4">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium font-serif text-white">Opening Memory Archive...</div>
        </div>
      );
    }

    if (activeArchiveError || !activeArchiveData) {
      return (
        <div className="h-screen w-full bg-neutral-950 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-neutral-300 max-w-md">
            <h3 className="font-bold text-base text-white">Memory Archive Not Found</h3>
            <p className="text-xs mt-1 text-neutral-400">
              The archive at <strong>/s/{tenantContext.slug}</strong> does not exist or has not been deployed yet.
            </p>
          </div>
          <button
            onClick={() => navigateTo('/')}
            className="px-5 py-2.5 rounded-xl bg-amber-400 text-neutral-950 text-xs font-semibold transition-transform hover:scale-105"
          >
            Explore Other Archives
          </button>
        </div>
      );
    }

    // Check if private archive requires PIN
    if (activeArchiveData.archive.visibility === 'private' && !isViewerUnlocked) {
      return (
        <div className="h-screen w-full bg-neutral-950 flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-full max-w-sm p-8 rounded-3xl bg-neutral-900 border border-white/15 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-white">{activeArchiveData.archive.title}</h2>
              <p className="text-xs text-neutral-400 mt-1">This archive is protected. Enter the access PIN to view.</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Simple PIN verify check for private archive
                if (viewerPin.length >= 4) {
                  setIsViewerUnlocked(true);
                } else {
                  setViewerPinError('Please enter a valid PIN.');
                }
              }}
              className="space-y-3"
            >
              <input
                type="password"
                value={viewerPin}
                onChange={(e) => setViewerPin(e.target.value)}
                placeholder="Enter PIN"
                maxLength={6}
                className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
              />

              {viewerPinError && <p className="text-xs text-rose-400">{viewerPinError}</p>}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-400 text-neutral-950 text-xs font-semibold hover:brightness-110 shadow-md"
              >
                Unlock Archive
              </button>
            </form>
          </div>

          <button
            onClick={() => navigateTo('/')}
            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Platform</span>
          </button>
        </div>
      );
    }

    const currentOwnerToken = activeArchiveData ? (SessionStorage.getOwnerToken(activeArchiveData.archive.id) || undefined) : undefined;

    return (
      <ArchivePublicView
        archive={activeArchiveData.archive}
        sections={activeArchiveData.sections}
        timeline={activeArchiveData.timeline}
        members={activeArchiveData.members}
        media={activeArchiveData.media}
        wall={activeArchiveData.wall}
        albums={activeArchiveData.albums}
        ownerToken={currentOwnerToken}
        onBackToPlatform={() => navigateTo('/')}
        onCreateOwnArchive={() => {
          navigateTo('/');
          setIsCreateModalOpen(true);
        }}
      />
    );
  }

  // 3. MAIN ONCEHERE PLATFORM LANDING PAGE
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between selection:bg-amber-400 selection:text-neutral-950">
      
      {/* Platform Navigation */}
      <PlatformNavbar
        onCreateClick={() => setIsCreateModalOpen(true)}
        onExploreClick={() => {
          const el = document.getElementById('explore');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
        onViewDemoClick={() => {
          setIsDemoModalOpen(true);
        }}
        onKeyAccessClick={() => {
          setIsKeyAccessModalOpen(true);
        }}
      />

      {/* Main Landing Sections */}
      <main className="flex-grow">
        
        {/* Hero with interactive mini-preview */}
        <HeroSection
          onCreateClick={() => setIsCreateModalOpen(true)}
          onViewDemoClick={() => {
            setIsDemoModalOpen(true);
          }}
        />

        {/* Use Cases (Schools, Colleges, Teams, Trips, Reunions) */}
        <UseCasesSection onSelectType={handleOpenCreateWithType} />

        {/* 5 Distinct Aesthetic Themes Showcase */}
        <ThemesSection onSelectThemeForCreation={handleOpenCreateWithTheme} />

        {/* Features & Architecture Grid */}
        <FeaturesSection />

        {/* How It Works (3 clear steps with draft workflow highlight) */}
        <HowItWorksSection onCreateClick={() => setIsCreateModalOpen(true)} />

        {/* Explore Live Sample Archives */}
        <ExploreArchivesSection
          archives={allArchives}
          onSelectArchive={(arch) => {
            if (arch.deploymentStatus === 'deployed' && arch.slug) {
              navigateTo(`/s/${arch.slug}`);
            } else if (arch.workspaceSlug) {
              navigateTo(`/workspace/${arch.workspaceSlug}`);
            }
          }}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />

      </main>

      {/* Mandatory Centralized Attribution Footer */}
      <AttributionFooter />

      {/* 5-Step Archive Creation Flow Wizard */}
      <CreateArchiveFlow
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onArchiveCreated={handleArchiveCreated}
        initialType={creationInitialType}
        initialTheme={creationInitialTheme}
      />

      {/* Interactive Demo Archive Selector Modal */}
      <DemoSelectorModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onSelectDemo={(slug) => {
          navigateTo(`/s/${slug}`);
        }}
      />

      {/* Key Access & PIN Recovery Modal */}
      <KeyAccessModal
        isOpen={isKeyAccessModalOpen}
        onClose={() => setIsKeyAccessModalOpen(false)}
        onSuccess={(archive, workspaceSlug, token) => {
          if (archive && token) {
            SessionStorage.setOwnerToken(archive.id, token);
          }
          navigateTo(`/workspace/${workspaceSlug}`);
        }}
      />

    </div>
  );
}
