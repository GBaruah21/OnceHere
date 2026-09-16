/**
 * Client & Shared Security Utilities
 */

export interface PinStrength {
  score: 0 | 1 | 2 | 3;
  label: 'Weak' | 'Fair' | 'Strong';
  message: string;
  isAllowed: boolean;
}

const FORBIDDEN_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '9876', '1122', '2211', '1357', '2468',
  '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '123123', '112233', '001122', '987654'
]);

/**
 * Validate numeric PIN & assess complexity
 */
export function evaluatePin(pin: string): PinStrength {
  const clean = pin.trim();

  if (!clean || !/^\d+$/.test(clean)) {
    return {
      score: 0,
      label: 'Weak',
      message: 'PIN must contain digits only.',
      isAllowed: false
    };
  }

  if (clean.length !== 4 && clean.length !== 6) {
    return {
      score: 0,
      label: 'Weak',
      message: 'PIN must be exactly 4 or 6 digits.',
      isAllowed: false
    };
  }

  if (FORBIDDEN_PINS.has(clean)) {
    return {
      score: 0,
      label: 'Weak',
      message: 'This PIN is too common and easily guessed.',
      isAllowed: false
    };
  }

  // Check repeating digits
  const uniqueDigits = new Set(clean.split('')).size;
  if (uniqueDigits <= 2 && clean.length === 6) {
    return {
      score: 1,
      label: 'Fair',
      message: 'Use more diverse numbers for better security.',
      isAllowed: true
    };
  }

  if (clean.length === 6 && uniqueDigits >= 4) {
    return {
      score: 3,
      label: 'Strong',
      message: 'Strong 6-digit PIN selected.',
      isAllowed: true
    };
  }

  return {
    score: clean.length === 6 ? 2 : 1,
    label: clean.length === 6 ? 'Strong' : 'Fair',
    message: clean.length === 6 ? 'Good PIN.' : 'Recommended: 6 digits for stronger safety.',
    isAllowed: true
  };
}

/**
 * Generate a cryptographically random owner recovery key for initial creation.
 * Format: mc_rec_<24-character random string with readability separators>
 */
export function generateRecoveryKey(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // Base32 without confusing chars (0/O, 1/I/L)
  let result = 'mc_rec_';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      result += chars[bytes[i] % chars.length];
      if (i % 6 === 5 && i !== bytes.length - 1) {
        result += '-';
      }
    }
  } else {
    // Development-only fallback for browsers without Web Crypto.
    for (let i = 0; i < 24; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
      if (i % 6 === 5 && i !== 23) {
        result += '-';
      }
    }
  }
  return result;
}

/**
 * Helper to download an owner recovery key as a text file.
 * The initial key should be labeled Master; an owner-created secondary key is Backup.
 */
export function downloadRecoveryKeyFile(
  archiveTitle: string,
  recoveryKey: string,
  keyLabel = 'Master Owner Recovery Key'
) {
  if (!recoveryKey) return;
  const content = `================================================================================
ONCEHERE ${keyLabel.toUpperCase()}
================================================================================

Archive Title: ${archiveTitle}
Saved At: ${new Date().toISOString()}
Key Type: ${keyLabel}

RECOVERY KEY:
${recoveryKey}

IMPORTANT SECURITY NOTICE:
- Keep this key private and store the file somewhere you control.
- The first Master Owner Recovery Key created with the archive is permanent and
  remains valid even if a Backup Owner Key is later created or replaced.
- A Backup Owner Key can be replaced only from an authenticated owner session.
- Contributor/editor and private-viewer PINs never grant permission to replace
  owner keys.
- Never share an owner key with contributors or in public/group chats.
- Contributor and private-viewer PINs are intentionally NOT included in this file.
- To restore access: open OnceHere, choose "Recover Archive", and paste either
  the permanent Master Owner Key or the current Backup Owner Key.

================================================================================
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = archiveTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  const kind = keyLabel.toLowerCase().includes('backup') ? 'backup_owner_key' : 'master_owner_key';
  link.href = url;
  link.download = `${kind}_${safeName}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Session-only browser cache for sensitive credentials. Server-side ownership
 * is based on durable hashes and signed sessions; this cache only lets an owner
 * copy/download a key again during the current browser tab.
 */
export const SessionStorage = {
  getOwnerToken(archiveId: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(`mc_owner_${archiveId}`);
  },
  setOwnerToken(archiveId: string, token: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`mc_owner_${archiveId}`, token);
  },
  clearOwnerToken(archiveId: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(`mc_owner_${archiveId}`);
  },

  getWorkspaceToken(workspaceSlug: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(`mc_workspace_${workspaceSlug}`);
  },
  setWorkspaceToken(workspaceSlug: string, token: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`mc_workspace_${workspaceSlug}`, token);
  },

  getViewerToken(slug: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(`mc_viewer_${slug}`);
  },
  setViewerToken(slug: string, token: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`mc_viewer_${slug}`, token);
  },

  /** Plaintext permanent master key, only if this tab has actually seen it. */
  getRecoveryKey(archiveId: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(`mc_key_${archiveId}`);
  },
  setRecoveryKey(archiveId: string, key: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`mc_key_${archiveId}`, key);
  },

  /** Plaintext current backup key, kept separate so it never overwrites the master cache. */
  getBackupRecoveryKey(archiveId: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(`mc_backup_key_${archiveId}`);
  },
  setBackupRecoveryKey(archiveId: string, key: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(`mc_backup_key_${archiveId}`, key);
  },
  clearBackupRecoveryKey(archiveId: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(`mc_backup_key_${archiveId}`);
  },

  getEditorSession(archiveId: string): { token: string; expiresAt: number } | null {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(`mc_editor_${archiveId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Date.now() > parsed.expiresAt) {
        sessionStorage.removeItem(`mc_editor_${archiveId}`);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  setEditorSession(archiveId: string, token: string, expiresInHours = 2) {
    if (typeof window === 'undefined') return;
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;
    sessionStorage.setItem(`mc_editor_${archiveId}`, JSON.stringify({ token, expiresAt }));
  },
  clearEditorSession(archiveId: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(`mc_editor_${archiveId}`);
  }
};
