import React, { useEffect, useRef } from 'react';

/**
 * A page-wide texture field for the landing page. It deliberately does not
 * render a fake cursor: only the surrounding grain and line-work responds.
 */
export const LandingTextureOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const surface = overlay?.parentElement;
    if (!overlay || !surface || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame: number | null = null;
    let x = 50;
    let y = 4;
    let energy = 0;

    const paint = () => {
      energy *= 0.88;
      overlay.style.setProperty('--landing-x', `${x}%`);
      overlay.style.setProperty('--landing-y', `${y}%`);
      overlay.style.setProperty('--landing-energy', energy.toFixed(3));
      overlay.style.setProperty('--landing-dot-size', `${22 + energy * 17}px`);
      overlay.style.setProperty('--landing-line-size', `${96 + energy * 36}px`);
      overlay.style.setProperty('--landing-shift-x', `${x * -0.2}px`);
      overlay.style.setProperty('--landing-shift-y', `${y * -0.2}px`);
      if (energy > 0.015) frame = window.requestAnimationFrame(paint);
      else frame = null;
    };

    const onMove = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const nextY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      energy = Math.min(1, energy + Math.hypot(nextX - x, nextY - y) / 16);
      x = nextX;
      y = nextY;
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };

    surface.addEventListener('pointermove', onMove);
    return () => {
      surface.removeEventListener('pointermove', onMove);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="absolute inset-0 z-[5] hidden overflow-hidden pointer-events-none lg:block"
      style={{
        '--landing-x': '50%',
        '--landing-y': '4%',
        '--landing-energy': '0',
        '--landing-dot-size': '22px',
        '--landing-line-size': '96px',
        '--landing-shift-x': '0px',
        '--landing-shift-y': '0px',
      } as React.CSSProperties}
    >
      <div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage: 'linear-gradient(120deg, rgba(186, 230, 253, 0.72) 1px, transparent 1px), radial-gradient(rgba(253, 230, 138, 0.72) 0.75px, transparent 0.9px)',
          backgroundSize: 'var(--landing-line-size) var(--landing-line-size), var(--landing-dot-size) var(--landing-dot-size)',
          backgroundPosition: 'var(--landing-shift-x) var(--landing-shift-y)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.34] transition-[background-size,background-position] duration-300"
        style={{
          backgroundImage: 'linear-gradient(120deg, rgba(125, 211, 252, 0.55) 1px, transparent 1px), radial-gradient(rgba(253, 230, 138, 0.9) 0.9px, transparent 1.05px)',
          backgroundSize: 'var(--landing-line-size) var(--landing-line-size), var(--landing-dot-size) var(--landing-dot-size)',
          backgroundPosition: 'var(--landing-shift-x) var(--landing-shift-y)',
          maskImage: 'radial-gradient(circle 15rem at var(--landing-x) var(--landing-y), black 0%, rgba(0,0,0,0.78) 36%, transparent 73%)',
          WebkitMaskImage: 'radial-gradient(circle 15rem at var(--landing-x) var(--landing-y), black 0%, rgba(0,0,0,0.78) 36%, transparent 73%)',
        }}
      />
    </div>
  );
};
