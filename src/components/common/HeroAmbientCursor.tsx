import React, { useEffect, useRef } from 'react';

/**
 * A lightweight desktop-only ambient cursor treatment for the landing hero.
 * It paints through CSS variables rather than React state, so pointer movement
 * never rerenders the page or competes with the interactive archive preview.
 */
export const HeroAmbientCursor: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const interactionSurface = root?.parentElement;
    if (!root || !interactionSurface || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame: number | null = null;
    let x = 50;
    let y = 28;
    let lastX = x;
    let lastY = y;
    let energy = 0;

    const paint = () => {
      // The outer halo deliberately catches up after the pointer instead of
      // snapping to it. This produces a quiet depth effect without React
      // rerenders or a continuously running animation at rest.
      lastX += (x - lastX) * 0.12;
      lastY += (y - lastY) * 0.12;
      energy *= 0.88;
      root.style.setProperty('--hero-cursor-x', `${x}%`);
      root.style.setProperty('--hero-cursor-y', `${y}%`);
      root.style.setProperty('--hero-cursor-tail-x', `${lastX}%`);
      root.style.setProperty('--hero-cursor-tail-y', `${lastY}%`);
      root.style.setProperty('--hero-cursor-energy', energy.toFixed(3));
      if (Math.abs(x - lastX) > 0.08 || Math.abs(y - lastY) > 0.08 || energy > 0.015) {
        frame = window.requestAnimationFrame(paint);
      } else {
        frame = null;
      }
    };

    const onMove = (event: MouseEvent) => {
      const rect = interactionSurface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const nextY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      energy = Math.min(1, energy + Math.hypot(nextX - x, nextY - y) / 18);
      x = nextX;
      y = nextY;
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };

    const onLeave = () => {
      x = 50;
      y = 28;
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };

    interactionSurface.addEventListener('pointermove', onMove);
    interactionSurface.addEventListener('pointerleave', onLeave);
    return () => {
      interactionSurface.removeEventListener('pointermove', onMove);
      interactionSurface.removeEventListener('pointerleave', onLeave);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="absolute inset-0 hidden lg:block overflow-hidden pointer-events-none"
      style={{
        '--hero-cursor-x': '50%',
        '--hero-cursor-y': '28%',
        '--hero-cursor-tail-x': '50%',
        '--hero-cursor-tail-y': '28%',
        '--hero-cursor-energy': '0',
      } as React.CSSProperties}
    >
      {/* The texture only brightens around the pointer, like a small field of light spreading across paper. */}
      <div
        className="absolute inset-0 opacity-70 transition-opacity duration-300"
        style={{
          backgroundImage: 'radial-gradient(rgba(226, 232, 240, 0.58) 0.75px, transparent 0.95px), linear-gradient(115deg, rgba(125, 211, 252, 0.12) 1px, transparent 1px)',
          backgroundSize: '20px 20px, 88px 88px',
          maskImage: 'radial-gradient(circle 17rem at var(--hero-cursor-x) var(--hero-cursor-y), black 0%, rgba(0,0,0,0.75) 33%, transparent 73%)',
          WebkitMaskImage: 'radial-gradient(circle 17rem at var(--hero-cursor-x) var(--hero-cursor-y), black 0%, rgba(0,0,0,0.75) 33%, transparent 73%)',
        }}
      />
      <div
        className="absolute h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100/25 transition-[left,top,opacity,transform] duration-500 ease-out"
        style={{
          left: 'var(--hero-cursor-tail-x)',
          top: 'var(--hero-cursor-tail-y)',
          opacity: 'calc(0.12 + var(--hero-cursor-energy) * 0.58)',
          transform: 'translate(-50%, -50%) scale(calc(0.86 + var(--hero-cursor-energy) * 0.55))',
        }}
      />
      <div
        className="absolute h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-2xl transition-[left,top] duration-300 ease-out"
        style={{
          left: 'var(--hero-cursor-x)',
          top: 'var(--hero-cursor-y)',
          background: 'conic-gradient(from 210deg, transparent, rgba(56, 189, 248, 0.08), transparent 42%, rgba(45, 212, 191, 0.06), transparent 76%)',
        }}
      />
      <div
        className="absolute h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-90 blur-[96px] transition-[left,top] duration-300 ease-out"
        style={{
          left: 'var(--hero-cursor-x)',
          top: 'var(--hero-cursor-y)',
          background: 'radial-gradient(circle, rgba(125, 211, 252, 0.16) 0%, rgba(99, 102, 241, 0.10) 32%, rgba(45, 212, 191, 0.06) 54%, transparent 72%)',
        }}
      />
      <div
          className="absolute h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100/30 shadow-[inset_0_0_40px_rgba(56,189,248,0.10)] transition-[left,top] duration-500 ease-out"
        style={{ left: 'var(--hero-cursor-tail-x)', top: 'var(--hero-cursor-tail-y)' }}
      />
      <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100/85 shadow-[0_0_24px_rgba(125,211,252,0.85)] transition-[left,top] duration-150 ease-out"
        style={{ left: 'var(--hero-cursor-x)', top: 'var(--hero-cursor-y)' }}
      />
    </div>
  );
};
