import React, { useState } from 'react';
import { PLATFORM_CONFIG } from '../config/platform';
import { Archive, ThemeId } from '../types';
import { getTheme } from '../config/themes';
import { SessionStorage } from '../lib/security';
import { OwnerKeySafetyModal } from './common/OwnerKeySafetyModal';

interface AttributionFooterProps {
  themeId?: ThemeId;
  className?: string;
}

/**
 * Tasteful, persistent attribution footer shared by the platform and archives.
 * It also exposes the trust/safety surfaces that users need before a wider launch.
 */
export const AttributionFooter: React.FC<AttributionFooterProps> = ({ themeId, className = '' }) => {
  getTheme(themeId);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [contact, setContact] = useState({
    instagram: PLATFORM_CONFIG.author.instagram,
    email: PLATFORM_CONFIG.author.email,
    displayHandle: PLATFORM_CONFIG.author.displayHandle
  });
  const [ownerArchive, setOwnerArchive] = useState<Archive | null>(null);
  const [isOwnerKeySafetyOpen, setIsOwnerKeySafetyOpen] = useState(false);

  React.useEffect(() => {
    fetch('/api/platform-settings')
      .then((response) => response.json())
      .then((data) => {
        if (data.settings) setContact((current) => ({ ...current, ...data.settings }));
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = window.location.pathname.match(/^\/workspace\/([^/?#]+)/i);
    if (!match) {
      setOwnerArchive(null);
      return;
    }

    let workspaceSlug = '';
    try {
      workspaceSlug = decodeURIComponent(match[1]);
    } catch {
      workspaceSlug = match[1];
    }
    const token = SessionStorage.getWorkspaceToken(workspaceSlug);
    fetch(`/api/archives/by-workspace/${encodeURIComponent(workspaceSlug)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok && data.accessRole === 'owner' && data.archive?.id) {
          setOwnerArchive(data.archive as Archive);
        } else {
          setOwnerArchive(null);
        }
      })
      .catch(() => setOwnerArchive(null));
  }, []);

  const isLight = themeId === 'paper-polaroids';
  const borderClass = isLight ? 'border-stone-300 bg-stone-100/80 shadow-inner' : 'border-white/10 bg-neutral-950/80';
  const textMutedClass = isLight ? 'text-stone-700 font-semibold' : 'text-neutral-300 font-normal';
  const textHighlightClass = isLight ? 'text-amber-950 font-bold' : 'text-neutral-100 font-bold';
  const linkHoverClass = isLight ? 'text-amber-900 hover:text-amber-700 font-bold underline' : 'text-amber-400 hover:text-amber-300 underline';

  const handleEmailClick = () => {
    const rawEmail = contact.email.replace('mailto:', '');
    navigator.clipboard?.writeText(rawEmail).catch(() => {});
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleInstagramClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.open(contact.instagram, '_blank', 'noopener,noreferrer');
  };

  const handleCreateClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.location.href = '/?create=true';
  };

  const legalLinks = [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
    { href: '/safety', label: 'Safety' },
    { href: '/report', label: 'Report content' }
  ];

  return (
    <>
      <footer
        id="platform-attribution-footer"
        className={`w-full py-8 pb-24 sm:pb-12 px-4 border-t ${borderClass} transition-colors relative z-20 pointer-events-auto ${className}`}
        aria-label="Platform attribution, support, and trust links"
      >
        <div className="max-w-7xl mx-auto space-y-4 text-xs sm:text-sm tracking-wide">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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

            <div className={`flex flex-wrap items-center justify-center sm:justify-end gap-x-3.5 gap-y-1.5 ${textMutedClass}`}>
              {ownerArchive && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsOwnerKeySafetyOpen(true)}
                    className={`inline-flex min-h-11 items-center gap-1 font-semibold transition-colors cursor-pointer underline underline-offset-4 ${linkHoverClass}`}
                    title="Manage the permanent master owner key and optional backup owner key"
                  >
                    🔐 Owner Key Safety
                  </button>
                  <span className="opacity-40 select-none">·</span>
                </>
              )}

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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
                </svg>
                <span>{PLATFORM_CONFIG.attribution.instagramText}</span>
              </a>

              <span className="opacity-40 select-none">·</span>

              <a
                href={contact.email.startsWith('mailto:') ? contact.email : `mailto:${contact.email}`}
                onClick={handleEmailClick}
                className={`inline-flex items-center gap-1.5 transition-colors underline-offset-2 hover:underline cursor-pointer ${linkHoverClass}`}
                title="Send email to OnceHere support"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <span>{copiedEmail ? 'Copied to Clipboard! ✓' : PLATFORM_CONFIG.attribution.emailText}</span>
              </a>
            </div>
          </div>

          <nav
            aria-label="Privacy, terms, safety, and reporting"
            className={`flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 border-t pt-4 ${isLight ? 'border-stone-300/80' : 'border-white/10'} ${textMutedClass}`}
          >
            {legalLinks.map((link) => (
              <a key={link.href} href={link.href} className={`underline-offset-4 hover:underline ${linkHoverClass}`}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>

      {ownerArchive && (
        <OwnerKeySafetyModal
          isOpen={isOwnerKeySafetyOpen}
          onClose={() => setIsOwnerKeySafetyOpen(false)}
          archive={ownerArchive}
        />
      )}
    </>
  );
};
