import { ThemeId } from '../types';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
  headingFont: string;
  bodyFont: string;
  accentFont?: string;
  headingClass: string;
  bodyClass: string;
  palette: {
    bg: string;
    bgSecondary: string;
    bgCard: string;
    text: string;
    textMuted: string;
    accent: string;
    accentSecondary: string;
    border: string;
    ring: string;
  };
  styleClasses: {
    container: string;
    card: string;
    buttonPrimary: string;
    buttonSecondary: string;
    headerGlow: string;
    badge: string;
    input: string;
    statBox: string;
    statNumber: string;
    themeTabActive: string;
  };
  decorations: {
    hasGrain: boolean;
    hasAurora: boolean;
    hasPaperTexture: boolean;
    hasNeonLines: boolean;
    hasForestFog: boolean;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  'midnight-cinema': {
    id: 'midnight-cinema',
    name: 'Midnight Cinema',
    tagline: 'Warm 24K gold filament & 35mm film grain under cinematic spotlights',
    description: 'Deep obsidian and midnight velvet tones, 24k gold leaf accents, vintage 35mm grain, and stately serif typography for an emotional, timeless aesthetic.',
    headingFont: 'font-serif', // Playfair Display / Cinzel
    bodyFont: 'font-sans',     // Plus Jakarta Sans
    accentFont: 'font-serif',
    headingClass: 'font-serif font-bold tracking-tight text-white',
    bodyClass: 'font-sans text-[#fdfbf7]',
    palette: {
      bg: '#070913',
      bgSecondary: '#0b1122',
      bgCard: '#11172a',
      text: '#fdfbf7',
      textMuted: '#94a3b8',
      accent: '#f59e0b', // 24k Gold
      accentSecondary: '#fef08a',
      border: 'rgba(245, 158, 11, 0.25)',
      ring: '#f59e0b'
    },
    styleClasses: {
      container: 'theme-texture-midnight text-[#fdfbf7]',
      card: 'bg-[#0d1424]/90 border border-amber-500/25 text-[#fdfbf7] backdrop-blur-xl shadow-2xl shadow-black/80 rounded-2xl hover:border-amber-400/40 transition-all',
      buttonPrimary: 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-neutral-950 font-bold shadow-lg shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all',
      buttonSecondary: 'bg-amber-950/40 border border-amber-500/30 text-amber-200 hover:bg-amber-900/60 transition-all',
      headerGlow: 'from-amber-400/25 via-amber-500/10 to-transparent',
      badge: 'bg-amber-950/80 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full text-xs font-semibold tracking-wide shadow-sm',
      input: 'bg-[#090d18] border border-amber-500/30 text-neutral-100 placeholder:text-neutral-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400',
      statBox: 'bg-amber-950/20 border border-amber-500/20 text-center rounded-xl p-3 backdrop-blur-sm',
      statNumber: 'text-amber-400 font-serif font-bold text-xl sm:text-2xl',
      themeTabActive: 'bg-amber-400 text-neutral-950 font-bold shadow-md shadow-amber-400/30'
    },
    decorations: {
      hasGrain: true,
      hasAurora: false,
      hasPaperTexture: false,
      hasNeonLines: false,
      hasForestFog: false
    }
  },
  'heritage-noir': {
    id: 'heritage-noir',
    name: 'Heritage Noir',
    tagline: 'Warm sepia-charcoal canvas, gold leaf editorial serifs & museum brass',
    description: 'Archival sepia-charcoal velvet textures, luminous gold serifs, double-line framed archival photo borders, and warm candlelit reflection notes.',
    headingFont: 'font-editorial-heading font-bold tracking-tight',
    bodyFont: 'font-editorial-body',
    accentFont: 'font-editorial-heading italic',
    headingClass: 'font-editorial-heading font-bold tracking-tight text-[#fdfbf7]',
    bodyClass: 'font-editorial-body text-[#fdfbf7]',
    palette: {
      bg: '#100d0a',
      bgSecondary: '#18130f',
      bgCard: '#221c16',
      text: '#fdfbf7',
      textMuted: '#b8ab99',
      accent: '#e5c158', // Antique Museum Gold
      accentSecondary: '#f7e7a9',
      border: 'rgba(229, 193, 88, 0.32)',
      ring: '#e5c158'
    },
    styleClasses: {
      container: 'theme-texture-heritage text-[#fdfbf7]',
      card: 'bg-[#18130f]/95 border-2 border-[#e5c158]/35 text-[#fdfbf7] backdrop-blur-md shadow-2xl shadow-black/90 rounded-2xl hover:border-[#e5c158]/55 transition-all',
      buttonPrimary: 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-neutral-950 font-bold shadow-xl shadow-amber-950/60 hover:brightness-110 active:scale-95 transition-all',
      buttonSecondary: 'bg-[#2a2119] border border-[#e5c158]/45 text-[#f3e5ab] hover:bg-[#362b20] transition-all',
      headerGlow: 'from-amber-500/30 via-amber-600/15 to-transparent',
      badge: 'bg-[#2a2119] text-amber-200 border border-amber-500/60 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase shadow-inner',
      input: 'bg-[#120e0b] border border-amber-500/45 text-[#fdfbf7] placeholder:text-neutral-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl',
      statBox: 'bg-[#221a12]/80 border-2 border-[#e5c158]/30 text-center rounded-xl p-3 shadow-inner',
      statNumber: 'text-[#e5c158] font-editorial-heading font-bold text-xl sm:text-2xl',
      themeTabActive: 'bg-[#e5c158] text-neutral-950 font-bold shadow-md shadow-[#e5c158]/30'
    },
    decorations: {
      hasGrain: true,
      hasAurora: false,
      hasPaperTexture: true,
      hasNeonLines: false,
      hasForestFog: false
    }
  },
  'aurora-glass': {
    id: 'aurora-glass',
    name: 'Aurora Liquid Glass',
    tagline: 'VisionOS frosted liquid glass, specular refractions & celestial glow',
    description: 'Ultra-translucent frosted glass panels with specular top-edge white highlights, fluid celestial aurora refractions, smooth pill geometries, and electric cyan-violet radiance.',
    headingFont: 'font-minimal-heading font-extrabold tracking-[-0.03em]',
    bodyFont: 'font-minimal-body tracking-[-0.01em]',
    accentFont: 'font-mono',
    headingClass: 'font-minimal-heading font-extrabold tracking-tight text-white',
    bodyClass: 'font-minimal-body text-slate-100',
    palette: {
      bg: '#040714',
      bgSecondary: '#080f24',
      bgCard: 'rgba(255, 255, 255, 0.08)',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      accent: '#38bdf8', // Liquid Cyan
      accentSecondary: '#c084fc', // Celestial Violet
      border: 'rgba(255, 255, 255, 0.22)',
      ring: '#38bdf8'
    },
    styleClasses: {
      container: 'theme-texture-aurora text-[#f8fafc]',
      card: 'bg-slate-900/60 border border-white/20 text-[#f8fafc] backdrop-blur-2xl shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.4),0_16px_40px_0_rgba(0,0,0,0.6)] rounded-3xl transition-all duration-300 hover:bg-slate-900/80 hover:border-white/35',
      buttonPrimary: 'bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 text-white font-bold backdrop-blur-xl border border-white/35 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_24px_rgba(56,189,248,0.4)] rounded-full hover:brightness-110 active:scale-95 transition-all',
      buttonSecondary: 'bg-white/10 border border-white/25 text-white backdrop-blur-xl hover:bg-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3)] rounded-full transition-all',
      headerGlow: 'from-sky-500/35 via-purple-500/25 to-transparent',
      badge: 'bg-sky-500/15 backdrop-blur-xl text-sky-300 border border-sky-400/40 px-3.5 py-1 rounded-full text-xs font-bold tracking-wide shadow-[0_0_15px_rgba(56,189,248,0.25)]',
      input: 'bg-black/50 backdrop-blur-xl border border-white/25 text-slate-100 placeholder:text-slate-400 rounded-2xl focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40',
      statBox: 'bg-white/[0.06] border border-white/20 text-center rounded-2xl p-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
      statNumber: 'text-sky-300 font-minimal-heading font-black text-xl sm:text-2xl drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]',
      themeTabActive: 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white font-bold shadow-lg shadow-sky-500/30'
    },
    decorations: {
      hasGrain: false,
      hasAurora: true,
      hasPaperTexture: false,
      hasNeonLines: false,
      hasForestFog: false
    }
  },
  'paper-polaroids': {
    id: 'paper-polaroids',
    name: 'Paper & Polaroids',
    tagline: 'Warm tactile linen cream, washi tape & polaroid scrapbook frames',
    description: 'Sunny textured linen paper canvas, polaroid white photo borders, tactile washi tape corners, rich terracotta ink stamps, and handwritten cursive memories.',
    headingFont: 'font-serif font-bold', // Playfair
    bodyFont: 'font-sans',
    accentFont: 'font-handwriting', // Caveat
    headingClass: 'font-serif font-bold text-stone-900 tracking-tight',
    bodyClass: 'font-sans text-stone-800',
    palette: {
      bg: '#fbf8f1',
      bgSecondary: '#f4eee2',
      bgCard: '#ffffff',
      text: '#1c1917',
      textMuted: '#57534e',
      accent: '#c2410c', // Terracotta Rust
      accentSecondary: '#1d4ed8', // Ink Blue
      border: 'rgba(194, 65, 12, 0.25)',
      ring: '#c2410c'
    },
    styleClasses: {
      container: 'theme-texture-paper text-[#1c1917]',
      card: 'bg-white border-2 border-[#e3d8c4] text-[#1c1917] shadow-xl shadow-amber-950/10 rounded-2xl rotate-[-0.3deg] hover:rotate-0 transition-transform',
      buttonPrimary: 'bg-[#c2410c] text-white font-bold shadow-md shadow-orange-950/20 hover:bg-[#a2360a] active:scale-95 transition-all rounded-xl',
      buttonSecondary: 'bg-[#f4eee2] border border-[#d8cdba] text-[#57534e] hover:bg-[#eae0ce] transition-all rounded-xl',
      headerGlow: 'from-amber-500/15 via-orange-500/8 to-transparent',
      badge: 'bg-[#f4eee2] text-[#9a3412] border-2 border-[#fed7aa] px-3.5 py-1 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm',
      input: 'bg-white border-2 border-[#d8cdba] text-[#1c1917] placeholder:text-stone-400 focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c] rounded-xl',
      statBox: 'bg-[#f4eee2]/90 border-2 border-[#e3d8c4] text-center rounded-xl p-3 shadow-sm',
      statNumber: 'text-[#c2410c] font-serif font-black text-xl sm:text-2xl',
      themeTabActive: 'bg-[#c2410c] text-white font-bold shadow-md shadow-orange-700/30'
    },
    decorations: {
      hasGrain: true,
      hasAurora: false,
      hasPaperTexture: true,
      hasNeonLines: false,
      hasForestFog: false
    }
  },
  'neon-afterglow': {
    id: 'neon-afterglow',
    name: 'Neon Afterglow',
    tagline: 'Cyberpunk Tokyo perspective grid, electric cyan & laser magenta',
    description: 'Pitch-black obsidian canvas with pulsing cyan and laser magenta neon glow, isometric cyber floor grid, bold tech headings, and high-energy contrast.',
    headingFont: 'font-tech-heading font-black uppercase tracking-wider', // Space Grotesk
    bodyFont: 'font-tech-body',
    accentFont: 'font-mono',
    headingClass: 'font-tech-heading font-black uppercase tracking-wider text-white',
    bodyClass: 'font-tech-body text-slate-100',
    palette: {
      bg: '#06060a',
      bgSecondary: '#0d0d16',
      bgCard: '#151522',
      text: '#ffffff',
      textMuted: '#a1a1aa',
      accent: '#00f0ff', // Electric Laser Cyan
      accentSecondary: '#ff007f', // Hot Laser Magenta
      border: 'rgba(0, 240, 255, 0.4)',
      ring: '#00f0ff'
    },
    styleClasses: {
      container: 'theme-texture-neon text-white',
      card: 'bg-[#0f0f1c]/95 border-2 border-cyan-500/40 text-white backdrop-blur-md shadow-[0_0_24px_rgba(0,240,255,0.15)] rounded-2xl hover:border-pink-500/60 hover:shadow-[0_0_30px_rgba(255,0,127,0.2)] transition-all',
      buttonPrimary: 'bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-pink-500 text-black font-extrabold shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition-all rounded-xl',
      buttonSecondary: 'bg-purple-950/60 border border-fuchsia-500/50 text-fuchsia-200 hover:bg-purple-900/80 transition-all rounded-xl',
      headerGlow: 'from-cyan-500/35 via-fuchsia-500/25 to-transparent',
      badge: 'bg-[#150a21] text-cyan-300 border border-cyan-400/70 px-3.5 py-1 rounded-md text-xs font-black uppercase tracking-widest shadow-[0_0_12px_rgba(0,240,255,0.35)]',
      input: 'bg-[#090910] border border-cyan-500/50 text-white placeholder:text-neutral-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/40 rounded-xl',
      statBox: 'bg-[#110e20] border-2 border-cyan-500/40 text-center rounded-xl p-3 shadow-[0_0_15px_rgba(0,240,255,0.15)]',
      statNumber: 'text-[#00f0ff] font-tech-heading font-black text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]',
      themeTabActive: 'bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black font-black shadow-lg shadow-cyan-500/40'
    },
    decorations: {
      hasGrain: false,
      hasAurora: false,
      hasPaperTexture: false,
      hasNeonLines: true,
      hasForestFog: false
    }
  },
  'forest-chronicle': {
    id: 'forest-chronicle',
    name: 'Forest Chronicle',
    tagline: 'Deep Pacific Northwest evergreen, burnished copper & firefly serenity',
    description: 'Deep rainforest pine depths, warm burnished copper leaf highlights, mossy frosted glass panels, tranquil drifting dust particles, and peaceful editorial typography.',
    headingFont: 'font-serif font-bold tracking-tight', // Playfair
    bodyFont: 'font-sans',
    accentFont: 'font-serif italic',
    headingClass: 'font-serif font-bold tracking-tight text-[#f4f7f5]',
    bodyClass: 'font-sans text-[#f4f7f5]',
    palette: {
      bg: '#05130b',
      bgSecondary: '#0c2417',
      bgCard: '#133522',
      text: '#f4f7f5',
      textMuted: '#9bb8a8',
      accent: '#f59e0b', // Burnished Copper / Amber
      accentSecondary: '#10b981', // Sage / Emerald
      border: 'rgba(245, 158, 11, 0.3)',
      ring: '#f59e0b'
    },
    styleClasses: {
      container: 'theme-texture-forest text-[#f4f7f5]',
      card: 'bg-[#0e2418]/90 border border-emerald-500/25 text-[#f4f7f5] backdrop-blur-xl shadow-2xl shadow-black/70 rounded-2xl hover:border-amber-500/40 transition-all',
      buttonPrimary: 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-neutral-950 font-bold shadow-lg shadow-amber-950/50 hover:brightness-110 active:scale-95 transition-all rounded-xl',
      buttonSecondary: 'bg-emerald-950/70 border border-emerald-500/35 text-emerald-200 hover:bg-emerald-900/80 transition-all rounded-xl',
      headerGlow: 'from-emerald-500/25 via-amber-500/15 to-transparent',
      badge: 'bg-[#072415] text-emerald-300 border border-emerald-500/50 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide shadow-sm',
      input: 'bg-[#08170e] border border-emerald-500/35 text-emerald-100 placeholder:text-emerald-700/60 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl',
      statBox: 'bg-[#092214]/80 border border-emerald-500/30 text-center rounded-xl p-3 backdrop-blur-sm',
      statNumber: 'text-amber-400 font-serif font-bold text-xl sm:text-2xl',
      themeTabActive: 'bg-gradient-to-r from-emerald-500 to-amber-500 text-neutral-950 font-bold shadow-md shadow-emerald-500/30'
    },
    decorations: {
      hasGrain: true,
      hasAurora: false,
      hasPaperTexture: false,
      hasNeonLines: false,
      hasForestFog: true
    }
  }
};

export interface FontPreset {
  id: string;
  name: string;
  description: string;
  headingFamily: string;
  bodyFamily: string;
  accentFamily: string;
  headingClass: string;
  bodyClass: string;
  accentClass: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'editorial-heritage',
    name: 'Editorial Heritage',
    description: 'Cormorant Garamond & Newsreader (Literary & Timeless)',
    headingFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    bodyFamily: "'Newsreader', Georgia, serif",
    accentFamily: "'Cormorant Garamond', Georgia, serif",
    headingClass: 'font-editorial-heading font-bold tracking-tight',
    bodyClass: 'font-editorial-body',
    accentClass: 'font-editorial-heading italic'
  },
  {
    id: 'modern-minimal',
    name: 'Modern Minimalist',
    description: 'Outfit & Plus Jakarta Sans (Clean & Contemporary)',
    headingFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif",
    bodyFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    accentFamily: "'Outfit', system-ui, sans-serif",
    headingClass: 'font-minimal-heading font-extrabold tracking-tight',
    bodyClass: 'font-minimal-body',
    accentClass: 'font-minimal-heading font-semibold'
  },
  {
    id: 'classic-academy',
    name: 'Classic Academy',
    description: 'Playfair Display & DM Sans (Stately & Scholastic)',
    headingFamily: "'Playfair Display', Georgia, serif",
    bodyFamily: "'DM Sans', system-ui, sans-serif",
    accentFamily: "'Playfair Display', Georgia, serif",
    headingClass: 'font-academy-heading font-bold',
    bodyClass: 'font-academy-body',
    accentClass: 'font-academy-heading italic'
  },
  {
    id: 'scrapbook-nostalgia',
    name: 'Scrapbook Nostalgia',
    description: 'Caveat Handwriting & DM Sans (Warm & Personal)',
    headingFamily: "'Caveat', cursive, sans-serif",
    bodyFamily: "'DM Sans', system-ui, sans-serif",
    accentFamily: "'Caveat', cursive",
    headingClass: 'font-scrapbook-heading font-bold',
    bodyClass: 'font-scrapbook-body',
    accentClass: 'font-handwriting font-bold'
  },
  {
    id: 'cyber-code',
    name: 'Tech & Terminal',
    description: 'Space Grotesk & JetBrains Mono (Digital & Bold)',
    headingFamily: "'Space Grotesk', system-ui, monospace",
    bodyFamily: "'JetBrains Mono', monospace",
    accentFamily: "'Space Grotesk', monospace",
    headingClass: 'font-tech-heading font-bold uppercase tracking-wider',
    bodyClass: 'font-tech-body',
    accentClass: 'font-tech-heading font-bold'
  }
];

export function getFontPreset(presetId?: string): FontPreset {
  if (presetId) {
    const found = FONT_PRESETS.find((p) => p.id === presetId);
    if (found) return found;
  }
  return FONT_PRESETS[0];
}

export function getTheme(themeId?: string): ThemeConfig {
  if (themeId && themeId in THEMES) {
    return THEMES[themeId as ThemeId];
  }
  return THEMES['midnight-cinema'];
}
