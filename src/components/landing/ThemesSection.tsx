import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Palette, CheckCircle2, Sparkles, Pin, Terminal, Sparkle, Flame } from 'lucide-react';
import { THEMES } from '../../config/themes';
import { ThemeId } from '../../types';
import { ThemeInteractiveBackdrop } from '../common/ThemeInteractiveBackdrop';

interface ThemesSectionProps {
  onSelectThemeForCreation?: (themeId: ThemeId) => void;
}

export const ThemesSection: React.FC<ThemesSectionProps> = ({ onSelectThemeForCreation }) => {
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>('midnight-cinema');
  const activeTheme = THEMES[selectedThemeId];

  const themeKeys: ThemeId[] = [
    'midnight-cinema',
    'aurora-glass',
    'paper-polaroids',
    'neon-afterglow',
    'forest-chronicle',
    'heritage-noir'
  ];

  return (
    <section id="themes" className="py-24 bg-neutral-950 relative overflow-hidden">
      
      {/* Background soft glow */}
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 -left-40 w-96 h-96 bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5" />
            <span>6 Atmospheric Design Systems</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif text-white tracking-tight">
            Original Visual Themes Crafted for Emotion
          </h2>
          <p className="text-base sm:text-lg text-neutral-400 font-light">
            Every theme reimagines typography, textures, cards, and cursor-reactive lighting tokens. Hover your cursor over the preview below to experience the tactile lighting.
          </p>
        </motion.div>

        {/* Theme Selector Tabs (Pills) */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.15, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-12"
        >
          {themeKeys.map((tId) => {
            const t = THEMES[tId];
            const isSelected = selectedThemeId === tId;
            return (
              <button
                key={tId}
                onClick={() => setSelectedThemeId(tId)}
                className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2.5 cursor-pointer ${
                  isSelected
                    ? t.styleClasses.themeTabActive + ' scale-105'
                    : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/30 shadow-inner"
                  style={{ backgroundColor: t.palette.accent }}
                />
                <span>{t.name}</span>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </motion.div>

        {/* Live Interactive Theme Showcase Container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 1.25, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          <div
            className={`relative p-6 sm:p-10 rounded-3xl border transition-all duration-500 shadow-2xl overflow-hidden ${
              selectedThemeId === 'heritage-noir'
                ? 'bg-[#100d0a] text-[#fdfbf7] border-[#e5c158]/35'
                : selectedThemeId === 'paper-polaroids'
                ? 'bg-[#fbf8f1] text-[#1c1917] border-[#e3d8c4]'
                : selectedThemeId === 'aurora-glass'
                ? 'bg-[#040714] text-[#f8fafc] border-cyan-500/30'
                : selectedThemeId === 'neon-afterglow'
                ? 'bg-[#06060a] text-white border-cyan-500/40'
                : selectedThemeId === 'forest-chronicle'
                ? 'bg-[#05130b] text-[#f4f7f5] border-emerald-500/30'
                : 'bg-[#070913] text-[#fdfbf7] border-amber-500/30'
            }`}
          >
            {/* Interactive Theme Backdrop */}
            <ThemeInteractiveBackdrop themeId={selectedThemeId} intensity="mockup" interactive={true} />

            {/* Theme metadata top bar */}
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-current/10 gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-widest opacity-60">Selected Aesthetic</span>
                <h3 className={`text-2xl sm:text-3xl ${activeTheme.headingClass}`}>{activeTheme.name}</h3>
                <p className={`text-xs sm:text-sm opacity-80 mt-1 ${activeTheme.bodyClass}`}>{activeTheme.tagline}</p>
              </div>

              {onSelectThemeForCreation && (
                <button
                  onClick={() => onSelectThemeForCreation(selectedThemeId)}
                  className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md cursor-pointer ${activeTheme.styleClasses.buttonPrimary}`}
                >
                  Use This Theme
                </button>
              )}
            </div>

            {/* Preview of components rendered in this theme */}
            <div className="relative z-10 mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Component 1: Timeline Card Preview */}
              <div className={`p-5 rounded-2xl border transition-all ${
                selectedThemeId === 'paper-polaroids' ? 'bg-white border-[#e3d8c4] shadow-md text-stone-900 rotate-[-1deg]' :
                selectedThemeId === 'aurora-glass' ? 'bg-slate-900/60 border-white/20 backdrop-blur-xl text-slate-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]' :
                selectedThemeId === 'neon-afterglow' ? 'bg-[#0d0d18] border-2 border-cyan-500/40 text-white shadow-[0_0_20px_rgba(0,240,255,0.2)]' :
                selectedThemeId === 'forest-chronicle' ? 'bg-[#0a2015] border border-emerald-500/30 text-[#f4f7f5]' :
                selectedThemeId === 'heritage-noir' ? 'bg-[#18130f] border-2 border-[#e5c158]/40 text-[#fdfbf7]' :
                'bg-[#0d1424] border border-amber-500/30 text-white'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🎒</span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${activeTheme.styleClasses.badge}`}>
                    Year 2022
                  </span>
                </div>
                <h4 className={`text-base ${activeTheme.headingClass}`}>First Day of College</h4>
                <p className={`text-xs opacity-75 mt-2 leading-relaxed ${activeTheme.bodyClass}`}>
                  Meeting at the central steps, deciphering timetable codes, and surviving 8 AM lectures.
                </p>
                <div className="mt-4 flex items-center gap-2 text-[11px] opacity-60">
                  <span>📍 Main Auditorium</span>
                  <span>·</span>
                  <span>4 Photos</span>
                </div>
              </div>

              {/* Component 2: Member / Yearbook Card Preview */}
              <div className={`p-5 rounded-2xl border flex flex-col items-center text-center transition-all ${
                selectedThemeId === 'paper-polaroids' ? 'bg-white border-[#e3d8c4] shadow-md rotate-[1deg] text-stone-900' :
                selectedThemeId === 'aurora-glass' ? 'bg-slate-900/60 border-white/20 backdrop-blur-xl text-slate-100' :
                selectedThemeId === 'neon-afterglow' ? 'bg-[#0d0d18] border-2 border-fuchsia-500/40 text-white shadow-[0_0_20px_rgba(255,0,127,0.2)]' :
                selectedThemeId === 'forest-chronicle' ? 'bg-[#0a2015] border border-emerald-500/30 text-[#f4f7f5]' :
                selectedThemeId === 'heritage-noir' ? 'bg-[#18130f] border-2 border-[#e5c158]/40 text-[#fdfbf7]' :
                'bg-[#0d1424] border border-amber-500/30 text-white'
              }`}>
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 mb-3 shadow-md" style={{ borderColor: activeTheme.palette.accent }}>
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80"
                    alt="Aanya"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h4 className={`text-sm font-bold ${activeTheme.headingClass}`}>Aanya Sharma</h4>
                <span className="text-[11px] opacity-70">Head Girl & Valedictorian</span>
                <p className={`text-xs mt-2 opacity-85 ${selectedThemeId === 'paper-polaroids' ? 'font-handwriting text-stone-800 text-sm' : activeTheme.bodyClass}`}>
                  “Never skip canteen cheese toast on rainy afternoons.”
                </p>
                <div className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: activeTheme.palette.accent }}>
                  <span>Leave Memory Note</span>
                  <span>→</span>
                </div>
              </div>

              {/* Component 3: Memory Wall Card Preview */}
              <div className={`p-5 rounded-2xl border transition-all ${
                selectedThemeId === 'paper-polaroids' ? 'bg-[#fef08a] text-stone-900 border-amber-300 rotate-[-1.5deg] shadow-lg' :
                selectedThemeId === 'aurora-glass' ? 'bg-slate-900/80 border-sky-400/40 text-slate-100 backdrop-blur-xl' :
                selectedThemeId === 'neon-afterglow' ? 'bg-[#130d22] border-2 border-pink-500 text-pink-100 shadow-[0_0_15px_rgba(255,0,127,0.3)]' :
                selectedThemeId === 'forest-chronicle' ? 'bg-[#0d2a1c] border border-amber-500/40 text-emerald-100' :
                selectedThemeId === 'heritage-noir' ? 'bg-[#241c14] border-2 border-[#e5c158]/50 text-amber-100 shadow-xl' :
                'bg-amber-950/40 border border-amber-500/30 text-amber-100'
              }`}>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold flex items-center gap-1">
                    {selectedThemeId === 'paper-polaroids' ? <Pin className="w-3.5 h-3.5 text-red-500" /> :
                     selectedThemeId === 'neon-afterglow' ? <Terminal className="w-3.5 h-3.5 text-cyan-400" /> :
                     selectedThemeId === 'aurora-glass' ? <Sparkle className="w-3.5 h-3.5 text-sky-400" /> :
                     <span>📌</span>}
                    <span>Scribble Wall</span>
                  </span>
                  <span className="opacity-60 text-[10px]">Just now</span>
                </div>
                <p className={`text-xs leading-relaxed ${selectedThemeId === 'paper-polaroids' ? 'font-handwriting font-bold text-sm text-stone-800' : 'font-sans'}`}>
                  “Whoever locked the library door during the physics test... the batch salutes you forever!”
                </p>
                <div className="mt-4 flex items-center justify-between text-xs opacity-75">
                  <span>- Anonymous Backbencher</span>
                  <span className="font-mono">❤️ 32</span>
                </div>
              </div>

            </div>

            {/* Design Tokens & Action Bar */}
            <div className="relative z-10 mt-8 pt-6 border-t border-current/10 flex flex-wrap items-center justify-between gap-4 text-xs opacity-90">
              <div className="flex items-center gap-4">
                <span>Accent: <strong className="font-mono">{activeTheme.palette.accent}</strong></span>
                <span>Background: <strong className="font-mono">{activeTheme.palette.bg}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onSelectThemeForCreation?.(selectedThemeId)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer ${activeTheme.styleClasses.buttonPrimary}`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create Archive with {activeTheme.name}</span>
                </button>
              </div>
            </div>

          </div>
        </motion.div>

      </div>
    </section>
  );
};

