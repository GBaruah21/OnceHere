import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Sparkles, Heart, Film, Users, Camera, ShieldCheck, Pin, Terminal, Sparkle, Flame } from 'lucide-react';
import { PLATFORM_CONFIG } from '../../config/platform';
import { THEMES } from '../../config/themes';
import { ThemeId } from '../../types';
import { ThemeInteractiveBackdrop } from '../common/ThemeInteractiveBackdrop';

interface HeroSectionProps {
  onCreateClick: () => void;
  onViewDemoClick: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onCreateClick, onViewDemoClick }) => {
  const [activePreviewTheme, setActivePreviewTheme] = useState<ThemeId>('midnight-cinema');
  const currentTheme = THEMES[activePreviewTheme];

  const themeList: ThemeId[] = [
    'midnight-cinema',
    'aurora-glass',
    'paper-polaroids',
    'neon-afterglow',
    'forest-chronicle',
    'heritage-noir'
  ];

  return (
    <section className="relative pt-12 pb-20 lg:pt-20 lg:pb-32 overflow-hidden">
      
      {/* Background ambient lighting & subtle grain */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-amber-500/15 via-rose-500/10 to-indigo-500/10 blur-[130px] rounded-full" />
        <div className="absolute top-10 right-10 w-96 h-96 bg-amber-500/5 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Top announcement pill */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-amber-500/20 text-neutral-300 text-xs sm:text-sm shadow-inner backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-serif italic text-amber-200">The Multi-Tenant Memory Platform</span>
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-400">Schools · Colleges · Teams · Trips</span>
          </div>
        </motion.div>

        {/* Headline & Emotional Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.2, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-4xl mx-auto space-y-6"
        >
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold font-serif tracking-tight text-white leading-[1.1]">
            {PLATFORM_CONFIG.tagline}
          </h1>

          <p className="text-base sm:text-xl text-neutral-300 max-w-2xl mx-auto font-sans font-light leading-relaxed">
            Build and deploy an everlasting digital memory home for your graduating batch, university department, sports team, or reunion. Complete with collaborative timelines, yearbook profiles, private media vaults, and scribble walls.
          </p>

          {/* Action CTAs */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onCreateClick}
              id="hero-create-archive-btn"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-xl shadow-amber-500/25 active:scale-95 transition-all flex items-center justify-center gap-3 group cursor-pointer"
            >
              <span>Create Your Archive</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform text-neutral-950" />
            </button>

            <button
              onClick={onViewDemoClick}
              id="hero-view-demo-btn"
              className="w-full sm:w-auto px-7 py-4 rounded-2xl text-base font-medium text-neutral-200 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 backdrop-blur-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Film className="w-4 h-4 text-amber-400" />
              <span>Explore Demo Archive</span>
            </button>
          </div>

          {/* Trust badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-neutral-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>PIN-protected collaboration</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>6 Curated aesthetic themes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              <span>Instant preview before domain claim</span>
            </div>
          </div>
        </motion.div>

        {/* Interactive Live Memory Archive Stage Mockup (Intersection Observer Reveal) */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 1.25, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-14 lg:mt-20 max-w-5xl mx-auto"
        >
          <div className="relative rounded-2xl sm:rounded-3xl p-1 bg-gradient-to-b from-white/20 via-white/5 to-transparent shadow-2xl shadow-black/80">
            
            {/* Window chrome header */}
            <div className="bg-neutral-900/95 rounded-t-xl sm:rounded-t-2xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between border-b border-white/10 gap-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-neutral-400 hidden sm:inline">
                  marys-convent-2026.oncehere.app
                </span>
              </div>

              {/* Dynamic Theme selector tabs with per-theme accent styling */}
              <div className="flex items-center gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10 text-xs overflow-x-auto">
                <span className="text-[11px] text-neutral-400 px-2 font-mono hidden md:inline">Theme:</span>
                {themeList.map((tId) => {
                  const t = THEMES[tId];
                  const isActive = activePreviewTheme === tId;
                  return (
                    <button
                      key={tId}
                      onClick={() => setActivePreviewTheme(tId)}
                      className={`px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? t.styleClasses.themeTabActive
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: t.palette.accent }}
                      />
                      <span>{t.name.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic preview content area with interactive mouse-following backdrop */}
            <div
              className={`relative p-6 sm:p-10 rounded-b-xl sm:rounded-b-2xl transition-all duration-500 overflow-hidden ${
                activePreviewTheme === 'paper-polaroids' ? 'bg-[#fbf8f1] text-[#1c1917]' :
                activePreviewTheme === 'aurora-glass' ? 'bg-[#040714] text-[#f8fafc]' :
                activePreviewTheme === 'neon-afterglow' ? 'bg-[#06060a] text-white' :
                activePreviewTheme === 'forest-chronicle' ? 'bg-[#05130b] text-[#f4f7f5]' :
                activePreviewTheme === 'heritage-noir' ? 'bg-[#100d0a] text-[#fdfbf7]' :
                'bg-[#070913] text-[#fdfbf7]'
              }`}
            >
              {/* Real interactive textured background layer with cursor tracking */}
              <ThemeInteractiveBackdrop
                themeId={activePreviewTheme}
                intensity="mockup"
                interactive={true}
              />

              {/* Content Grid */}
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                
                {/* 1. IMAGE / POLAROID / GLASS CARD (Order 1 on mobile, 2 on desktop) */}
                <motion.div
                  key={`media-${activePreviewTheme}`}
                  initial={{ opacity: 0, scale: 0.94, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="order-1 md:order-2 md:col-span-5 relative flex items-center justify-center py-4"
                >
                  {/* Distinct Card Styles depending on Theme */}

                  {/* A. Paper & Polaroids Theme Card */}
                  {activePreviewTheme === 'paper-polaroids' && (
                    <div className="w-64 bg-white p-3.5 pb-6 rounded-xl shadow-2xl shadow-amber-950/20 rotate-[-2.5deg] text-stone-900 border-2 border-[#e3d8c4] transition-transform hover:rotate-0 washi-tape-top relative">
                      <div className="aspect-[4/3] rounded-lg bg-stone-900 overflow-hidden relative border border-stone-200">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover sepia-[0.15]"
                        />
                        <span className="absolute bottom-2 right-2 bg-stone-900/80 text-amber-100 text-[10px] px-2 py-0.5 rounded font-serif italic">
                          Farewell Day ’26
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-handwriting text-stone-800 text-center leading-relaxed font-bold text-sm">
                        “We didn’t realize we were making memories, we just knew we were having fun.”
                      </p>
                      
                      {/* Pinned Yellow Sticky Note */}
                      <div className="absolute -bottom-4 -left-4 bg-[#fef08a] text-stone-900 p-2.5 rounded-lg shadow-lg rotate-[6deg] max-w-[170px] border border-amber-300 text-xs">
                        <div className="font-bold flex items-center gap-1 text-[11px] text-amber-900">
                          <Pin className="w-3 h-3 text-red-500" /> Scribble Wall
                        </div>
                        <p className="mt-0.5 text-[11px] font-handwriting font-bold leading-tight text-stone-800">
                          See you all in 10 years! Don’t change. - Aanya
                        </p>
                      </div>
                    </div>
                  )}

                  {/* B. Aurora Liquid Glass Theme Card */}
                  {activePreviewTheme === 'aurora-glass' && (
                    <div className="w-64 bg-slate-900/60 p-3.5 pb-5 rounded-3xl backdrop-blur-2xl border border-white/30 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_16px_40px_rgba(0,0,0,0.6)] transition-all hover:border-cyan-400/50 relative">
                      <div className="aspect-[4/3] rounded-2xl overflow-hidden relative border border-white/20">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 right-2 bg-sky-500/30 backdrop-blur-md border border-white/20 text-white text-[10px] px-2.5 py-0.5 rounded-full font-mono">
                          Live Vault ’26
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-minimal-body text-slate-200 text-center leading-relaxed">
                        “Moments refracted through time, preserved in liquid glass.”
                      </p>

                      {/* VisionOS Frosted Sticky Pill */}
                      <div className="absolute -bottom-3 -left-3 bg-sky-950/80 backdrop-blur-xl border border-sky-400/40 text-sky-200 p-2.5 rounded-2xl shadow-[0_0_20px_rgba(56,189,248,0.3)] max-w-[170px] text-xs">
                        <div className="font-bold flex items-center gap-1 text-[10px] text-sky-300">
                          <Sparkle className="w-3 h-3 text-sky-400 animate-pulse" /> Glass Memory
                        </div>
                        <p className="mt-0.5 text-[10px] leading-tight text-slate-200">
                          See you all in 10 years! - Aanya
                        </p>
                      </div>
                    </div>
                  )}

                  {/* C. Neon Afterglow Theme Card */}
                  {activePreviewTheme === 'neon-afterglow' && (
                    <div className="w-64 bg-[#0d0d18] p-3.5 pb-5 rounded-2xl border-2 border-cyan-400/60 text-white shadow-[0_0_30px_rgba(0,240,255,0.25)] transition-all hover:border-pink-500 hover:shadow-[0_0_35px_rgba(255,0,127,0.35)] relative">
                      <div className="aspect-[4/3] rounded-xl overflow-hidden relative border border-cyan-500/40">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover contrast-125 saturate-110"
                        />
                        <span className="absolute bottom-2 right-2 bg-black/90 border border-fuchsia-500 text-fuchsia-300 text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                          NODE // 2026
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-tech-body text-cyan-200 text-center leading-relaxed">
                        &gt; MEMORY_LOG_COMPILED_SUCCESSFULLY
                      </p>

                      {/* Cyber Terminal Sticky Card */}
                      <div className="absolute -bottom-3 -left-3 bg-[#130d22] border-2 border-pink-500 text-pink-200 p-2.5 rounded-xl shadow-[0_0_15px_rgba(255,0,127,0.4)] max-w-[170px] text-xs font-mono">
                        <div className="font-bold flex items-center gap-1 text-[10px] text-cyan-400">
                          <Terminal className="w-3 h-3 text-cyan-400" /> MATRIX_WALL
                        </div>
                        <p className="mt-0.5 text-[10px] leading-tight text-white">
                          echo "Stay golden." - Aanya
                        </p>
                      </div>
                    </div>
                  )}

                  {/* D. Forest Chronicle Theme Card */}
                  {activePreviewTheme === 'forest-chronicle' && (
                    <div className="w-64 bg-[#0a2015]/95 p-3.5 pb-5 rounded-2xl border-2 border-emerald-500/30 text-emerald-50 shadow-2xl shadow-emerald-950/80 transition-all hover:border-amber-500/40 relative">
                      <div className="aspect-[4/3] rounded-xl overflow-hidden relative border border-emerald-500/30">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 right-2 bg-emerald-950/90 border border-amber-500/50 text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full font-serif italic">
                          Evergreen ’26
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-serif italic text-emerald-200 text-center leading-relaxed">
                        “Roots grounded in friendship, branches reaching toward the future.”
                      </p>

                      {/* Copper Forest Note */}
                      <div className="absolute -bottom-3 -left-3 bg-[#0d2a1c] border border-amber-500/50 text-amber-200 p-2.5 rounded-xl shadow-lg max-w-[170px] text-xs">
                        <div className="font-bold flex items-center gap-1 text-[10px] text-emerald-300">
                          <Flame className="w-3 h-3 text-amber-400" /> Campfire Wall
                        </div>
                        <p className="mt-0.5 text-[10px] leading-tight text-emerald-100">
                          See you all under the pines! - Aanya
                        </p>
                      </div>
                    </div>
                  )}

                  {/* E. Heritage Noir Theme Card */}
                  {activePreviewTheme === 'heritage-noir' && (
                    <div className="w-64 bg-[#18130f]/95 p-4 pb-6 rounded-2xl border-2 border-[#e5c158]/40 text-[#fdfbf7] shadow-2xl shadow-black relative">
                      <div className="aspect-[4/3] rounded-lg overflow-hidden relative border-2 border-[#e5c158]/30 p-0.5">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover sepia-[0.25]"
                        />
                        <span className="absolute bottom-2 right-2 bg-[#18130f]/90 border border-[#e5c158]/60 text-amber-200 text-[10px] px-2.5 py-0.5 rounded font-editorial-heading italic">
                          Archival Batch ’26
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-editorial-heading italic text-[#e5c158] text-center leading-relaxed">
                        “Etched into history, celebrated through generations.”
                      </p>

                      {/* Antique Museum Note */}
                      <div className="absolute -bottom-3 -left-3 bg-[#241c14] border-2 border-[#e5c158]/50 text-amber-100 p-2.5 rounded-xl shadow-xl max-w-[170px] text-xs">
                        <div className="font-bold flex items-center gap-1 text-[10px] text-[#e5c158]">
                          <span>📜</span> Registry Wall
                        </div>
                        <p className="mt-0.5 text-[10px] font-editorial-body leading-tight text-amber-100">
                          To our timeless fellowship. - Aanya
                        </p>
                      </div>
                    </div>
                  )}

                  {/* F. Midnight Cinema Default Card */}
                  {activePreviewTheme === 'midnight-cinema' && (
                    <div className="w-64 bg-[#0d1424]/95 p-3.5 pb-5 rounded-2xl shadow-2xl shadow-black/80 rotate-[-2deg] text-neutral-100 border border-amber-500/30 transition-transform hover:rotate-0 relative">
                      <div className="aspect-[4/3] rounded-lg bg-neutral-900 overflow-hidden relative border border-amber-500/20">
                        <img
                          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80"
                          alt="Class of 2026"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-amber-300 text-[10px] px-2 py-0.5 rounded font-mono border border-amber-500/30">
                          Farewell Day ’26
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-serif italic text-amber-100/90 text-center leading-relaxed">
                        “We didn’t realize we were making memories, we just knew we were having fun.”
                      </p>

                      {/* Golden Cinema Note */}
                      <div className="absolute -bottom-3 -left-3 bg-amber-950/90 text-amber-200 p-2.5 rounded-xl shadow-lg rotate-[4deg] max-w-[170px] border border-amber-500/40 text-xs">
                        <div className="font-bold flex items-center gap-1 text-[10px] text-amber-300">
                          <span>🎬</span> Scribble Wall
                        </div>
                        <p className="mt-0.5 text-[10px] leading-snug text-neutral-200">
                          See you all in 10 years! Don’t change. - Aanya
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* 2. DYNAMIC TEXT & METRICS MATCHING SELECTED THEME */}
                <motion.div
                  key={`text-${activePreviewTheme}`}
                  initial={{ opacity: 0, y: 25 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="order-2 md:order-1 md:col-span-7 space-y-4"
                >
                  {/* Dynamic Badge */}
                  <div className={`inline-flex items-center gap-2 ${currentTheme.styleClasses.badge}`}>
                    <span>St. Mary’s Convent High School</span>
                    <span>·</span>
                    <span>2014 – 2026</span>
                  </div>

                  {/* Dynamic Heading styled specifically for this theme */}
                  <h2 className={`text-2xl sm:text-4xl ${currentTheme.headingClass}`}>
                    Mary’s Convent — Class of 2026
                  </h2>

                  {/* Dynamic Subtitle */}
                  <p className={`text-sm sm:text-base leading-relaxed opacity-85 ${currentTheme.bodyClass}`}>
                    “Twelve years of laughter, late-night cramming, canteen samosas, and memories etched in stone.”
                  </p>

                  {/* Theme-Styled Section Stats Pills */}
                  <div className="pt-2 grid grid-cols-3 gap-2.5 sm:gap-3">
                    <div className={currentTheme.styleClasses.statBox}>
                      <div className={currentTheme.styleClasses.statNumber}>120</div>
                      <div className="text-[10px] sm:text-[11px] opacity-75 mt-0.5">Graduates</div>
                    </div>
                    <div className={currentTheme.styleClasses.statBox}>
                      <div className={currentTheme.styleClasses.statNumber}>28</div>
                      <div className="text-[10px] sm:text-[11px] opacity-75 mt-0.5">Milestones</div>
                    </div>
                    <div className={currentTheme.styleClasses.statBox}>
                      <div className={currentTheme.styleClasses.statNumber}>340+</div>
                      <div className="text-[10px] sm:text-[11px] opacity-75 mt-0.5">Vault Photos</div>
                    </div>
                  </div>

                  {/* Dynamic CTA Button */}
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={onViewDemoClick}
                      className={`px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer ${currentTheme.styleClasses.buttonPrimary}`}
                    >
                      <Film className="w-4 h-4" />
                      <span>Open Live Interactive Archive</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>

              </div>

            </div>

          </div>
        </motion.div>

      </div>
    </section>
  );
};

