import React, { useState } from 'react';
import { PLATFORM_CONFIG } from '../config/platform';
import { ThemeId } from '../types';
import { getTheme } from '../config/themes';

interface AttributionFooterProps {
  themeId?: ThemeId;
  className?: string;
}

/**
 * Tasteful, unremovable attribution footer that automatically adapts to all 5 themes.
 * Appears on the main platform and every created memory archive page.
 * 
 * Required format:
 * Created with OnceHere · Built by @_g.baruah_ · Follow on Instagram · Email
 */
export const AttributionFooter: React.FC<AttributionFooterProps> = ({ themeId, className = '' }) => {
  const theme = getTheme(themeId);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [contact, setContact] = useState({ instagram: PLATFORM_CONFIG.author.instagram, email: PLATFORM_CONFIG.author.email, displayHandle: PLATFORM_CONFIG.author.displayHandle });

  React.useEffect(() => {
    fetch('/api/platform-settings').then((response) => response.json()).then((data) => {
      if (data.settings) setContact((current) => ({ ...current, ...data.settings }));
    }).catch(() => {});
  }, []);

  // Dynamic styling based on theme
  const isLight = themeId === 'paper-polaroids';
  const borderClass = isLight ? 'border-stone-300 bg-stone-100/80 shadow-inner' : 'border-white/10 bg-neutral-950/80';
  const textMutedClass = isLight ? 'text-stone-700 font-semibold' : 'text-neutral-300 font-normal';
  const textHighlightClass = isLight ? 'text-amber-950 font-bold' : 'text-neutral-100 font-bold';
  const linkHoverClass = isLight ? 'text-amber-900 hover:text-amber-700 font-bold underline' : 'text-amber-400 hover:text-amber-300 underline';

  const handleEmailClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Copy email to clipboard to ensure 100% utility if mailto: is blocked by iframe sandboxes
    const rawEmail = contact.email.replace('mailto:', '');
    navigator.clipboard?.writeText(rawEmail).catch(() => {});
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleInstagramClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.open(contact.instagram, '_blank', 'noopener,noreferrer');
  };

  const handleCreateClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.location.href = '/?create=true';
  };

  return (
    <footer
      id="platform-attribution-footer"
      className={`w-full py-8 pb-24 sm:pb-12 px-4 border-t ${borderClass} transition-colors relative z-20 pointer-events-auto ${className}`}
      aria-label="Platform attribution and creator credits"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm tracking-wide">
        
        {/* Main attribution statement */}
        <div className={`flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1 text-center sm:text-left ${textMutedClass}`}>
          <span>
            {PLATFORM_CONFIG.attribution.prefix}{' '}
            <span className={textHighlightClass}>{PLATFORM_CONFIG.name}</span>
          </span>
          <span className="opacity-40 select-none">·</span>
          <span>
            {PLATFORM_CONFIG.attribution.builtByText}{' '}
            <a
              href={contact.instagram}
              onClick={handleInstagramClick}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-4 font-semibold transition-colors cursor-pointer ${linkHoverClass}`}
              title="Visit @_g.baruah_ on Instagram"
            >
              {contact.displayHandle}
            </a>
          </span>
        </div>

        {/* Action Links */}
        <div className={`flex flex-wrap items-center justify-center sm:justify-end gap-x-3.5 gap-y-1.5 ${textMutedClass}`}>
          <a
            href="/?create=true"
            onClick={handleCreateClick}
            className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${isLight ? 'text-amber-700 hover:text-amber-800' : 'text-amber-400 hover:text-amber-300'}`}
          >
            <span>✨ Create Archive</span>
          </a>

          <span className="opacity-40 select-none">·</span>

          <a
            href={contact.instagram}
            onClick={handleInstagramClick}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 transition-colors underline-offset-2 hover:underline cursor-pointer ${linkHoverClass}`}
            title="Follow @_g.baruah_ on Instagram"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
            </svg>
            <span>{PLATFORM_CONFIG.attribution.instagramText}</span>
          </a>

          <span className="opacity-40 select-none">·</span>

          <div className="relative inline-flex items-center">
            <a
              href={contact.email.startsWith('mailto:') ? contact.email : `mailto:${contact.email}`}
              onClick={handleEmailClick}
              className={`inline-flex items-center gap-1.5 transition-colors underline-offset-2 hover:underline cursor-pointer ${linkHoverClass}`}
              title="Send email to workwithgitam@gmail.com (copies to clipboard)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <span>{copiedEmail ? 'Copied to Clipboard! ✓' : PLATFORM_CONFIG.attribution.emailText}</span>
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
