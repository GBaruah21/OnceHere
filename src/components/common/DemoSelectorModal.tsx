import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowRight, BookOpen, Layers, Users, Camera, ShieldCheck, GraduationCap } from 'lucide-react';
import { THEMES } from '../../config/themes';
import { ThemeId } from '../../types';

export interface DemoItem {
  id: string;
  slug: string;
  title: string;
  organizationName: string;
  batchLabel: string;
  themeId: ThemeId;
  tagline: string;
  description: string;
  coverImage: string;
  memberCount: number;
  highlightPills: string[];
}

export const DEMO_ARCHIVES: DemoItem[] = [
  {
    id: 'demo-sistec-2026',
    slug: 'sistec-batch-2026',
    title: 'Batch 2022—26 · A Journey We’ll Always Carry',
    organizationName: 'SISTec Bhopal',
    batchLabel: 'Batch 2022—26',
    themeId: 'heritage-noir',
    tagline: 'Warm sepia-charcoal canvas & gold editorial serifs',
    description: 'Inspired by the modern retrospective archive. Features the alternating image/story timeline, major department filter pills, interactive zoom vault, and taped reflection sticky notes.',
    coverImage: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
    memberCount: 8,
    highlightPills: ['Alternating Journey', 'Major Filters', 'Taped Notes', 'Touch-Zoom Vault']
  },
  {
    id: 'demo-riverdale-2026',
    slug: 'riverdale-tech-2026',
    title: 'Riverdale Institute of Technology — Class of 2026',
    organizationName: 'Riverdale Institute of Technology',
    batchLabel: 'Batch of 2026',
    themeId: 'midnight-cinema',
    tagline: 'Deep navy, antique gold & cinematic film spotlight',
    description: 'The definitive engineering class archive featuring 34 realistic classmates, hackathon all-nighters, tapri tea stories, and digital convocation caps.',
    coverImage: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80',
    memberCount: 34,
    highlightPills: ['Cinematic Gold', '34 Classmates', 'Hackathons', 'Scribble Day']
  },
  {
    id: 'demo-marys-convent-2025',
    slug: 'marys-convent-2025',
    title: 'Mary’s Convent High School — Class of 2025',
    organizationName: 'Mary’s Convent High School',
    batchLabel: 'Batch of 2025',
    themeId: 'paper-polaroids',
    tagline: 'Tactile cream paper, polaroid frames & nostalgic scrapbook charm',
    description: 'Twelve years from kindergarten bells to graduation ties. Features polaroid photo frames, house shields, tea-stained notes, and school memory scribbles.',
    coverImage: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80',
    memberCount: 6,
    highlightPills: ['Scrapbook Paper', 'Polaroids', 'School Houses', 'Autographs']
  },
  {
    id: 'demo-st-thomas-2024',
    slug: 'st-thomas-2024',
    title: 'St. Thomas Senior Secondary School — Class of 2024',
    organizationName: 'St. Thomas Senior Secondary School',
    batchLabel: 'Batch of 2024',
    themeId: 'aurora-glass',
    tagline: 'iOS frosted liquid glass & luminous aurora refractions',
    description: 'Ultra-translucent frosted glass refractions, stone quadrangle assemblies, choir rehearsals, and inter-school debate crowns.',
    coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    memberCount: 6,
    highlightPills: ['Liquid Glass', 'Aurora Glow', 'Choir & Sports', 'Prefect Council']
  }
];

interface DemoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDemo: (slug: string) => void;
}

export const DemoSelectorModal: React.FC<DemoSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectDemo
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-4xl bg-neutral-900/95 border border-white/15 rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl overflow-hidden z-10 sm:my-auto text-neutral-100 max-h-[100dvh]"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore Interactive Demos</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight">
                Select a Demo Archive to Explore
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-xl">
                Choose any pre-built, fully populated archive to experience its theme aesthetics, timeline storytelling, yearbook member cards, zoomable media vaults, and memory wall interactions.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer border border-white/10"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Demos Grid */}
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-h-[70vh] overflow-y-auto no-scrollbar">
            {DEMO_ARCHIVES.map((demo) => {
              const theme = THEMES[demo.themeId];
              const isLightCard = demo.themeId === 'paper-polaroids';

              return (
                <motion.div
                  key={demo.id}
                  whileHover={{ y: -4 }}
                  onClick={() => {
                    onSelectDemo(demo.slug);
                    onClose();
                  }}
                  className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden shadow-lg hover:shadow-2xl ${
                    isLightCard
                      ? 'bg-[#faf6ee] text-stone-900 border-amber-900/20 hover:border-amber-700/50 hover:shadow-amber-950/20'
                      : 'border-white/15 hover:border-white/30'
                  }`}
                  style={{
                    backgroundColor: isLightCard ? '#faf6ee' : theme.palette.bgCard,
                    borderColor: isLightCard ? '#d6c5aa' : `${theme.palette.accent}35`
                  }}
                >
                  {/* Subtle top banner preview image */}
                  <div className="relative w-full h-36 rounded-xl overflow-hidden mb-4 border border-black/10">
                    <img
                      src={demo.coverImage}
                      alt={demo.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                    
                    {/* Theme badge floating over image */}
                    <div className="absolute top-3 left-3">
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide shadow-md border"
                        style={{
                          backgroundColor: `${theme.palette.accent}35`,
                          color: isLightCard ? '#ffffff' : theme.palette.accent,
                          borderColor: `${theme.palette.accent}80`,
                          backdropFilter: 'blur(8px)'
                        }}
                      >
                        {theme.name}
                      </span>
                    </div>

                    {/* Batch year */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
                      <span className="font-semibold drop-shadow-md">{demo.organizationName}</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm border border-white/20 font-bold">
                        {demo.batchLabel}
                      </span>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="space-y-2.5 flex-1">
                    <h3
                      className={`text-lg font-bold ${theme.headingFont} transition-colors line-clamp-1 ${
                        isLightCard
                          ? 'text-stone-900 group-hover:text-amber-800'
                          : 'text-white group-hover:text-amber-300'
                      }`}
                    >
                      {demo.title}
                    </h3>
                    <p
                      className={`text-xs leading-relaxed line-clamp-2 ${
                        isLightCard ? 'text-stone-700 font-normal' : 'text-neutral-300'
                      }`}
                    >
                      {demo.description}
                    </p>

                    {/* Highlight Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {demo.highlightPills.map((pill, pIdx) => (
                        <span
                          key={pIdx}
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            isLightCard
                              ? 'bg-amber-900/10 border-amber-900/20 text-amber-950 font-semibold'
                              : 'bg-white/5 border-white/10 text-neutral-300'
                          }`}
                        >
                          {pill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Launch button footer */}
                  <div
                    className={`pt-4 mt-4 border-t flex items-center justify-between ${
                      isLightCard ? 'border-amber-900/15' : 'border-white/10'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-mono font-medium ${
                        isLightCard ? 'text-stone-600' : 'text-neutral-400'
                      }`}
                    >
                      /{demo.slug}
                    </span>
                    
                    <button
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md group-hover:brightness-110 cursor-pointer"
                      style={{
                        backgroundColor: isLightCard ? '#92400e' : theme.palette.accent,
                        color: '#ffffff'
                      }}
                    >
                      <span>Open Archive</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-neutral-950/80 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-amber-400" />
              <span>All demos support instant search, media vault zoom, custom notes, and social exports.</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-200 transition-colors cursor-pointer border border-white/10"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
