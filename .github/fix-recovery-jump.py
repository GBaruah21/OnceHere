from pathlib import Path


def must_replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Target not found in {path}")
    text = text.replace(old, new, count)
    file.write_text(text)


# Recovery-key unlock: after successful verification, cache the exact owner key
# in this browser tab session so Access & Privacy can reveal/copy/download it.
must_replace(
    'src/components/common/KeyAccessModal.tsx',
    """      // Save token in storage\n      if (data.archive && data.token) {\n        SessionStorage.setOwnerToken(data.archive.id, data.token);\n        SessionStorage.setWorkspaceToken(data.workspaceSlug, data.token);\n      }\n\n      onSuccess(data.archive, data.workspaceSlug, data.token);\n""",
    """      // Save the verified owner session AND the exact recovery key that\n      // was just presented. The server stores only a hash, so it cannot safely\n      // reconstruct a lost plaintext key later. Keeping the entered key in this\n      // tab session lets the owner reveal/copy/download a backup immediately.\n      if (data.archive && data.token) {\n        SessionStorage.setOwnerToken(data.archive.id, data.token);\n        SessionStorage.setWorkspaceToken(data.workspaceSlug, data.token);\n        SessionStorage.setRecoveryKey(data.archive.id, archiveKey.trim());\n      }\n\n      onSuccess(data.archive, data.workspaceSlug, data.token);\n"""
)

# Deterministic scrolling for standalone pages and nested Studio preview.
must_replace(
    'src/components/archive/ArchivePublicView.tsx',
    """  const scrollElementInView = (element: HTMLElement, behavior: ScrollBehavior = 'smooth') => {\n    const previewScroller = viewRootRef.current?.closest<HTMLElement>('[data-archive-preview-scroll]');\n    if (!previewScroller) {\n      element.scrollIntoView({ behavior, block: 'start' });\n      return;\n    }\n\n    const scrollerBounds = previewScroller.getBoundingClientRect();\n    const elementBounds = element.getBoundingClientRect();\n    // Leave a little room for the sticky archive navigation rather than\n    // hiding the section title immediately underneath it.\n    const top = previewScroller.scrollTop + elementBounds.top - scrollerBounds.top - 76;\n    previewScroller.scrollTo({ top: Math.max(0, top), behavior });\n  };\n""",
    """  const scrollElementInView = (element: HTMLElement, behavior: ScrollBehavior = 'smooth') => {\n    const performScroll = () => {\n      const previewScroller = viewRootRef.current?.closest<HTMLElement>('[data-archive-preview-scroll]');\n      const elementBounds = element.getBoundingClientRect();\n\n      if (previewScroller) {\n        const scrollerBounds = previewScroller.getBoundingClientRect();\n        // Account for both the Studio jump bar and the archive's own sticky nav.\n        const top = previewScroller.scrollTop + elementBounds.top - scrollerBounds.top - 132;\n        previewScroller.scrollTo({ top: Math.max(0, top), behavior });\n        return;\n      }\n\n      // Standalone archive: scroll the window explicitly rather than relying on\n      // scrollIntoView(), which can choose the wrong ancestor around sticky UI.\n      const top = window.scrollY + elementBounds.top - 112;\n      window.scrollTo({ top: Math.max(0, top), behavior });\n    };\n\n    // Let React/motion finish the current layout pass before measuring.\n    window.requestAnimationFrame(() => window.requestAnimationFrame(performScroll));\n  };\n"""
)

# Shared Studio jump helper. It selects the editor section and reliably scrolls
# the preview even when motion/sticky layouts settle a little later.
archive_editor = Path('src/components/editor/ArchiveEditor.tsx')
text = archive_editor.read_text()
anchor = """  const handleToggleSectionVisibility = (sectionId: string) => {\n    const updated = sections.map((s) => (s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s));\n    void handleUpdateSections(updated);\n  };\n\n  // Sub-entity mutations\n"""
replacement = """  const handleToggleSectionVisibility = (sectionId: string) => {\n    const updated = sections.map((s) => (s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s));\n    void handleUpdateSections(updated);\n  };\n\n  const jumpPreviewToSection = useCallback((stableType: string) => {\n    const foundSection = sections.find((section) => section.stableType === stableType);\n    setActiveTab(foundSection?.id || stableType);\n\n    const scrollNow = () => {\n      const stage = document.getElementById('editor-preview-stage');\n      if (!stage) return;\n      const target = stage.querySelector<HTMLElement>(`#section-${stableType}`);\n      if (!target) return;\n      const stageBounds = stage.getBoundingClientRect();\n      const targetBounds = target.getBoundingClientRect();\n      const top = stage.scrollTop + targetBounds.top - stageBounds.top - 132;\n      stage.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });\n    };\n\n    window.requestAnimationFrame(() => window.requestAnimationFrame(scrollNow));\n    window.setTimeout(scrollNow, 240);\n  }, [sections]);\n\n  // Sub-entity mutations\n"""
if anchor not in text:
    raise SystemExit('ArchiveEditor jump helper anchor not found')
text = text.replace(anchor, replacement, 1)

old_sidebar = """                        onClick={() => {\n                          setActiveTab(sec.id);\n                          setMobileStudioTab('inspector');\n                        }}\n"""
new_sidebar = """                        onClick={() => {\n                          jumpPreviewToSection(sec.stableType);\n                          setMobileStudioTab('inspector');\n                        }}\n"""
if old_sidebar not in text:
    raise SystemExit('ArchiveEditor sidebar navigation target not found')
text = text.replace(old_sidebar, new_sidebar, 1)

old_jump = """                    onClick={() => {\n                      const foundSec = sections.find((s) => s.stableType === item.id);\n                      if (foundSec) {\n                        setActiveTab(foundSec.id);\n                      } else {\n                        setActiveTab(item.id);\n                      }\n                      // Resolve within this preview. A public page, modal, or\n                      // stale hidden preview can have the same section IDs.\n                      const stage = document.getElementById('editor-preview-stage');\n                      const el = stage?.querySelector<HTMLElement>(`#section-${item.id}, #${item.id}`) || null;\n                      if (el) {\n                        const stageBounds = stage?.getBoundingClientRect();\n                        const sectionBounds = el.getBoundingClientRect();\n                        const top = (stage?.scrollTop || 0) + sectionBounds.top - (stageBounds?.top || 0) - 76;\n                        stage?.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });\n                      }\n                    }}\n"""
new_jump = """                    onClick={() => jumpPreviewToSection(item.id)}\n"""
if old_jump not in text:
    raise SystemExit('ArchiveEditor quick-jump target not found')
archive_editor.write_text(text.replace(old_jump, new_jump, 1))

# Recovery-panel wording: owner-only key, cached only after the owner provides it.
settings = Path('src/components/editor/SectionSettingsPanel.tsx')
text = settings.read_text()
old_hidden = 'Hidden for security — unlock with the original owner key on this device to save a backup'
new_hidden = 'Owner key not cached in this tab — unlock with the original recovery key, then return here to copy or download it'
if old_hidden not in text:
    raise SystemExit('Recovery panel hidden-key text not found')
text = text.replace(old_hidden, new_hidden, 1)
old_backup = 'Backup saved. This does not change or replace your original owner recovery key.'
new_backup = 'Recovery-key backup downloaded. The permanent owner key was not changed.'
if old_backup not in text:
    raise SystemExit('Recovery backup message not found')
settings.write_text(text.replace(old_backup, new_backup, 1))
