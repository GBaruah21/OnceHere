import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { Archive } from '../../types';
import { SessionStorage } from '../../lib/security';
import { OwnerKeySafetyModal } from './OwnerKeySafetyModal';

function currentWorkspaceSlug(): string | null {
  const match = window.location.pathname.match(/^\/workspace\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Owner-only launcher for permanent/backup recovery-key controls. It is kept
 * outside the large editor component so security ownership logic remains
 * isolated from normal editing UI. The server-side status endpoint is the
 * authority: contributor/viewer sessions never receive this control.
 */
export const OwnerKeySafetyLauncher: React.FC = () => {
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(() => currentWorkspaceSlug());
  const [archive, setArchive] = useState<Archive | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const syncPath = () => setWorkspaceSlug((current) => {
      const next = currentWorkspaceSlug();
      return next === current ? current : next;
    });
    window.addEventListener('popstate', syncPath);
    const timer = window.setInterval(syncPath, 1000);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setArchive(null);
    setIsOwner(false);
    setOpen(false);
    if (!workspaceSlug) return;

    const token = SessionStorage.getWorkspaceToken(workspaceSlug);
    if (!token) return;
    const controller = new AbortController();

    const verifyOwner = async () => {
      try {
        const workspaceResponse = await fetch(`/api/archives/by-workspace/${encodeURIComponent(workspaceSlug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        if (!workspaceResponse.ok) return;
        const workspaceData = await workspaceResponse.json();
        const candidate = workspaceData.archive as Archive | undefined;
        if (!candidate?.id) return;

        const statusResponse = await fetch(`/api/archives/${encodeURIComponent(candidate.id)}/auth/recovery/status`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        if (!statusResponse.ok) return;

        SessionStorage.setOwnerToken(candidate.id, token);
        setArchive(candidate);
        setIsOwner(true);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('Unable to verify owner-key controls:', error);
        }
      }
    };

    void verifyOwner();
    return () => controller.abort();
  }, [workspaceSlug]);

  if (!workspaceSlug || !archive || !isOwner) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 sm:right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-5 z-[105] min-h-11 px-3.5 rounded-2xl border border-amber-400/30 bg-neutral-950/90 text-xs font-semibold text-amber-200 shadow-xl backdrop-blur-xl hover:bg-neutral-900 flex items-center gap-2"
        title="Manage backup owner key. Your first master key remains permanent."
        aria-label="Open owner key safety"
      >
        <KeyRound className="w-4 h-4 text-amber-400" />
        <span className="hidden sm:inline">Owner Key Safety</span>
        <span className="sm:hidden">Owner Key</span>
      </button>

      <OwnerKeySafetyModal
        isOpen={open}
        onClose={() => setOpen(false)}
        archive={archive}
      />
    </>
  );
};
