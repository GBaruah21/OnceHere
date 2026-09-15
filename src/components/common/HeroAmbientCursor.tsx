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
    if (!root || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame: number | null = null;
    let x = 50;
    let y = 28;
    let lastX = x;
    let lastY = y;

    const paint = () => {
      // The outer halo deliberately catches up after the pointer instead of
      // snapping to it. This produces a quiet depth effect without React
      // rerenders or a continuously running animation at rest.
      lastX += (x - lastX) * 0.12;
      lastY += (y - lastY) * 0.12;
      root.style.setProperty('--hero-cursor-x', `${x}%`);
      root.style.setProperty('--hero-cursor-y', `${y}%`);
      root.style.setProperty('--hero-cursor-tail-x', `${lastX}%`);
      root.style.setProperty('--hero-cursor-tail-y', `${lastY}%`);
      if (Math.abs(x - lastX) > 0.08 || Math.abs(y - lastY) > 0.08) {
        frame = window.requestAnimationFrame(paint);
      } else {
        frame = null;
      }
    };

    const onMove = (event: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };

    const onLeave = () => {
      x = 50;
      y = 28;
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };

    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    return () => {
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="absolute inset-0 hidden lg:block overflow-hidden pointer-events-auto"
      style={{
        '--hero-cursor-x': '50%',
        '--hero-cursor-y': '28%',
        '--hero-cursor-tail-x': '50%',
        '--hero-cursor-tail-y': '28%',
      } as React.CSSProperties}
    >
      {/* Fine star-map texture: intentionally restrained so type remains the hero. */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: 'radial-gradient(rgba(226, 232, 240, 0.42) 0.65px, transparent 0.8px), linear-gradient(115deg, rgba(125, 211, 252, 0.045) 1px, transparent 1px)',
          backgroundSize: '22px 22px, 88px 88px',
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
          className="absolute h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100/15 shadow-[inset_0_0_40px_rgba(56,189,248,0.06)] transition-[left,top] duration-500 ease-out"
        style={{ left: 'var(--hero-cursor-tail-x)', top: 'var(--hero-cursor-tail-y)' }}
      />
      <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100/85 shadow-[0_0_24px_rgba(125,211,252,0.85)] transition-[left,top] duration-150 ease-out"
        style={{ left: 'var(--hero-cursor-x)', top: 'var(--hero-cursor-y)' }}
      />
    </div>
  );
};
