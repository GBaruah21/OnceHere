import React, { useState } from 'react';
import { Sparkles, Compass, Palette, BookOpen, Layers, Menu, X, PlusCircle, KeyRound } from 'lucide-react';
import { PLATFORM_CONFIG } from '../config/platform';

interface PlatformNavbarProps {
  onCreateClick: () => void;
  onExploreClick: () => void;
  onViewDemoClick: () => void;
  onKeyAccessClick?: () => void;
}

export const PlatformNavbar: React.FC<PlatformNavbarProps> = ({
  onCreateClick,
  onExploreClick,
  onViewDemoClick,
  onKeyAccessClick
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold font-serif tracking-tight text-white group-hover:text-amber-300 transition-colors">
                {PLATFORM_CONFIG.name}
              </span>
              <span className="hidden sm:block text-[11px] text-neutral-400 font-sans tracking-wide">
                Digital Memory Archives
              </span>
            </div>
          </a>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-300">
          <button
            onClick={onExploreClick}
            className="hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Compass className="w-4 h-4 text-amber-400/80" />
            <span>Explore</span>
          </button>

          <button
            onClick={() => scrollToSection('features')}
            className="hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-amber-400/80" />
            <span>Features</span>
          </button>

          <button
            onClick={() => scrollToSection('themes')}
            className="hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Palette className="w-4 h-4 text-amber-400/80" />
            <span>Themes</span>
          </button>

          <button
            onClick={() => scrollToSection('how-it-works')}
            className="hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-amber-400/80" />
            <span>How It Works</span>
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="hidden sm:flex items-center gap-2.5">
          {onKeyAccessClick && (
            <button
              onClick={onKeyAccessClick}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-neutral-300 hover:text-amber-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Unlock your archive using your Owner Recovery Key or PIN"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>Key Access</span>
            </button>
          )}

          <button
            onClick={onViewDemoClick}
            className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
          >
            View Demo
          </button>

          <button
            onClick={onCreateClick}
            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Archive</span>
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
          {onKeyAccessClick && (
            <button
              onClick={onKeyAccessClick}
              className="p-2 rounded-lg text-amber-400 bg-amber-400/10 border border-amber-400/30 text-xs font-semibold flex items-center gap-1"
              title="Key Access"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onCreateClick}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-950 bg-amber-400 active:scale-95 transition-transform"
          >
            Create
          </button>
          
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-neutral-300 hover:text-white bg-white/5 border border-white/10"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-neutral-950/95 border-b border-white/10 px-6 py-6 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid gap-3">
            {onKeyAccessClick && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onKeyAccessClick();
                }}
                className="text-left py-2 text-amber-300 hover:text-amber-200 font-medium flex items-center gap-2.5"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                Access Archive with Key / PIN
              </button>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onExploreClick();
              }}
              className="text-left py-2 text-neutral-200 hover:text-amber-300 font-medium flex items-center gap-2.5"
            >
              <Compass className="w-4 h-4 text-amber-400" />
              Explore Archives
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-left py-2 text-neutral-200 hover:text-amber-300 font-medium flex items-center gap-2.5"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              Platform Features
            </button>
            <button
              onClick={() => scrollToSection('themes')}
              className="text-left py-2 text-neutral-200 hover:text-amber-300 font-medium flex items-center gap-2.5"
            >
              <Palette className="w-4 h-4 text-amber-400" />
              Visual Themes
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-left py-2 text-neutral-200 hover:text-amber-300 font-medium flex items-center gap-2.5"
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              How It Works
            </button>
          </div>

          <div className="pt-4 border-t border-white/10 flex flex-col gap-2.5">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onViewDemoClick();
              }}
              className="w-full py-2.5 text-center text-sm font-medium text-neutral-200 bg-white/5 rounded-xl border border-white/10 cursor-pointer"
            >
              View Demo Archive
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onCreateClick();
              }}
              className="w-full py-2.5 text-center text-sm font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-xl shadow-md shadow-amber-500/20 cursor-pointer"
            >
              Create Your Archive
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
