import React, { useEffect, useRef, useState } from 'react';
import { ThemeId } from '../../types';

interface ThemeInteractiveBackdropProps {
  themeId: ThemeId;
  className?: string;
  intensity?: 'subtle' | 'vibrant' | 'mockup';
  interactive?: boolean;
}

export const ThemeInteractiveBackdrop: React.FC<ThemeInteractiveBackdropProps> = ({
  themeId,
  className = '',
  intensity = 'vibrant',
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 35 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!interactive) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Bound within 0-100% with gentle clamping
      const boundedX = Math.max(-10, Math.min(110, x));
      const boundedY = Math.max(-10, Math.min(110, y));

      setMousePos({ x: boundedX, y: boundedY });
      setIsHovered(true);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      // Gently return to center
      setMousePos({ x: 50, y: 35 });
    };

    const targetEl = containerRef.current?.parentElement || containerRef.current;
    if (targetEl) {
      targetEl.addEventListener('mousemove', handleMouseMove as EventListener);
      targetEl.addEventListener('mouseleave', handleMouseLeave as EventListener);
    }

    return () => {
      if (targetEl) {
        targetEl.removeEventListener('mousemove', handleMouseMove as EventListener);
        targetEl.removeEventListener('mouseleave', handleMouseLeave as EventListener);
      }
    };
  }, [interactive]);

  // Alpha modifiers based on intensity
  const opacityMultiplier = intensity === 'mockup' ? 1 : intensity === 'subtle' ? 0.6 : 0.9;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none transition-opacity duration-700 select-none ${className}`}
      style={{ opacity: opacityMultiplier }}
    >
      {/* 1. MIDNIGHT CINEMA: 35mm Film Grain + Golden Projector Spotlight */}
      {themeId === 'midnight-cinema' && (
        <div className="absolute inset-0">
          {/* Dynamic Golden Spotlight tracking cursor */}
          <div
            className="absolute w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.08) 45%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />
          {/* Secondary ambient blue projector glow */}
          <div className="absolute -top-20 right-10 w-[450px] h-[450px] bg-blue-900/15 rounded-full blur-[90px]" />
          {/* Vintage Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.8)_100%)]" />
          {/* 35mm Noise Grain */}
          <div className="absolute inset-0 opacity-[0.045] mix-blend-overlay bg-repeat bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>
      )}

      {/* 2. AURORA LIQUID GLASS: VisionOS Refractive Celestial Aurora + Interactive Beam */}
      {themeId === 'aurora-glass' && (
        <div className="absolute inset-0">
          {/* Cursor-following Electric Cyan & Sky Blue Beam */}
          <div
            className="absolute w-[500px] h-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(56, 189, 248, 0.28) 0%, rgba(99, 102, 241, 0.18) 45%, transparent 70%)',
              filter: 'blur(45px)',
            }}
          />
          {/* Celestial Violet Ambient Wave */}
          <div
            className="absolute w-[550px] h-[550px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500 ease-out"
            style={{
              left: `${100 - mousePos.x * 0.6}%`,
              top: `${100 - mousePos.y * 0.6}%`,
              background: 'radial-gradient(circle, rgba(192, 132, 252, 0.22) 0%, rgba(236, 72, 153, 0.1) 50%, transparent 75%)',
              filter: 'blur(60px)',
            }}
          />
          {/* Emerald celestial reflection */}
          <div className="absolute top-1/4 left-1/5 w-96 h-96 bg-emerald-400/12 rounded-full blur-[100px] animate-pulse" />
          {/* Liquid Glass Refractive Texture Lines */}
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>
      )}

      {/* 3. PAPER & POLAROIDS: Tactile Handmade Linen Canvas + Warm Lamp Glow */}
      {themeId === 'paper-polaroids' && (
        <div className="absolute inset-0">
          {/* Warm Reading Lamp Glow tracking cursor */}
          <div
            className="absolute w-[480px] h-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(254, 215, 170, 0.45) 0%, rgba(251, 146, 60, 0.12) 50%, transparent 75%)',
              filter: 'blur(40px)',
            }}
          />
          {/* Tactile Linen Paper Fiber Pattern */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#a8a29e_1px,transparent_1px)] [background-size:12px_12px]" />
          {/* Subtle vintage parchment vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(180,140,100,0.12)_100%)]" />
        </div>
      )}

      {/* 4. NEON AFTERGLOW: Cyberpunk Perspective Matrix Grid + Laser Ripple */}
      {themeId === 'neon-afterglow' && (
        <div className="absolute inset-0">
          {/* Cyberpunk Tokyo Laser Ripple following cursor */}
          <div
            className="absolute w-[450px] h-[450px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-150 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(0, 240, 255, 0.28) 0%, rgba(255, 0, 127, 0.2) 45%, transparent 70%)',
              filter: 'blur(35px)',
            }}
          />
          {/* Hot Magenta Counter-light */}
          <div className="absolute -top-10 -right-10 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-[80px]" />
          {/* Cyber Perspective Grid Overlay */}
          <div
            className="absolute inset-0 opacity-20 transition-transform duration-300"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0, 240, 255, 0.5) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 0, 127, 0.4) 1px, transparent 1px)
              `,
              backgroundSize: '36px 36px',
              transform: `perspective(600px) rotateX(${Math.max(0, (mousePos.y - 50) * 0.1)}deg)`,
            }}
          />
          {/* Scanline effect */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.4)_51%)] bg-[length:100%_4px] opacity-25" />
        </div>
      )}

      {/* 5. FOREST CHRONICLE: Evergreen Canopy + Burnished Copper Sunbeam & Fireflies */}
      {themeId === 'forest-chronicle' && (
        <div className="absolute inset-0">
          {/* Copper Sunbeam moving through pine mist */}
          <div
            className="absolute w-[520px] h-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(245, 158, 11, 0.24) 0%, rgba(16, 185, 129, 0.15) 45%, transparent 70%)',
              filter: 'blur(45px)',
            }}
          />
          {/* Deep Forest Emerald Mist */}
          <div className="absolute bottom-0 right-10 w-[500px] h-[500px] bg-emerald-900/30 rounded-full blur-[100px]" />
          {/* Organic Moss / Foliage Texture */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px]" />
        </div>
      )}

      {/* 6. HERITAGE NOIR: Museum Charcoal + Antique 24k Brass Candlelight */}
      {themeId === 'heritage-noir' && (
        <div className="absolute inset-0">
          {/* Candlelight Halo following cursor */}
          <div
            className="absolute w-[500px] h-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-250 ease-out"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              background: 'radial-gradient(circle, rgba(229, 193, 88, 0.25) 0%, rgba(180, 83, 9, 0.12) 50%, transparent 70%)',
              filter: 'blur(45px)',
            }}
          />
          {/* Archival Museum Sepia Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.85)_100%)]" />
          {/* Museum Archival Parchment Texture */}
          <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(#e5c158_1px,transparent_1px)] [background-size:18px_18px]" />
        </div>
      )}
    </div>
  );
};
