import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageCropPreview } from './ImageCropPreview';
import {
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  X,
  Camera,
  RefreshCw,
  Eye,
  Crop,
  ExternalLink,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { compressImageForUpload, IMAGE_SOURCE_LIMIT_BYTES, VIDEO_SOURCE_LIMIT_BYTES } from '../../lib/imageCompression';

type UploadPhase = 'optimizing' | 'authorizing' | 'direct';
type UploadPurpose = 'vault' | 'portrait' | 'timeline' | 'wall';
type MediaKind = 'image' | 'video';

type AuthorizedUpload = {
  uploadUrl: string;
  url: string;
  storageKey?: string;
  key?: string;
  fileSize: number;
  contentType: string;
  type: MediaKind;
};

const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i;
const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(?:[?#]|$)/i;
const PAGE_URL_RE = /(^|\.)((?:youtube\.com)|(?:youtu\.be)|(?:instagram\.com)|(?:tiktok\.com)|(?:facebook\.com)|(?:x\.com)|(?:twitter\.com))$/i;

function uploadErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : '';
  if (/unauthori[sz]ed|forbidden|session|401|403/i.test(detail)) {
    return 'Upload access expired. Refresh the page, unlock the workspace again, and retry this file.';
  }
  if (/too large|unsupported|image file|video file/i.test(detail)) return detail;
  if (/timed out|abort/i.test(detail)) {
    return 'The upload stopped because the connection was inactive for too long. Retry this file on a stable connection.';
  }
  if (/connection failed|storage upload failed|failed to fetch|network/i.test(detail)) {
    return 'Direct storage upload failed. Check the object-storage CORS/configuration, then retry this file. The file was not relayed through the website server.';
  }
  return detail
    ? `${detail} Retry this file. If it fails again, refresh the page and sign in again.`
    : 'Upload failed. Retry this file. If it fails again, refresh the page and sign in again.';
}

export function directUploadTimeoutMs(file: Pick<File, 'size' | 'type'>): number {
  if (file.type.startsWith('image/')) return 4_000;
  return Math.min(90_000, Math.max(30_000, Math.ceil(file.size / (256 * 1024)) * 1_000));
}

function uploadBytes(
  url: string,
  file: File,
  headers: Record<string, string>,
  timeoutMs: number,
  onProgress: (progress: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    let idleTimer: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const resetDeadline = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        xhr.abort();
      }, timeoutMs);
    };
    xhr.onloadend = () => clearTimeout(idleTimer);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      resetDeadline();
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
    xhr.onerror = () => reject(new Error('The upload connection failed.'));
    xhr.ontimeout = () => reject(new Error('The upload connection timed out.'));
    xhr.onabort = () => reject(new Error(timedOut ? 'The upload connection timed out.' : 'The upload was cancelled.'));
    resetDeadline();
    xhr.send(file);
  });
}

function parseExternalUrl(raw: string): URL {
  const normalized = raw.trim();
  if (!normalized) throw new Error('Paste a media URL first.');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('That is not a valid URL. Use a complete https:// link.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// or https:// media URLs are supported.');
  }
  if (PAGE_URL_RE.test(parsed.hostname)) {
    throw new Error('Page links from YouTube, Instagram, TikTok, Facebook or X are not direct media files. Use the original direct image/video URL or upload the file instead.');
  }
  return parsed;
}

function guessMediaKind(url: string): MediaKind | null {
  if (!url) return null;
  if (url.startsWith('data:video')) return 'video';
  if (url.startsWith('data:image')) return 'image';
  if (VIDEO_EXTENSION_RE.test(url)) return 'video';
  if (IMAGE_EXTENSION_RE.test(url)) return 'image';
  return null;
}

function probeImage(url: string, timeoutMs = 7_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      image.src = '';
      reject(new Error('Image preview timed out.'));
    }, timeoutMs);
    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error('That URL did not load as an image.'));
    };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

function probeVideo(url: string, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Video preview timed out.'));
    }, timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve();
    };
    video.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('That URL did not load as a video.'));
    };
    video.src = url;
    video.load();
  });
}

async function validateExternalMedia(raw: string, acceptMode: 'image' | 'image-video'): Promise<{ url: string; type: MediaKind }> {
  const parsed = parseExternalUrl(raw);
  const url = parsed.toString();
  const guessed = guessMediaKind(url);

  if (guessed === 'video' && acceptMode === 'image') {
    throw new Error('This field accepts images only.');
  }

  if (guessed === 'image') {
    await probeImage(url);
    return { url, type: 'image' };
  }
  if (guessed === 'video') {
    await probeVideo(url);
    return { url, type: 'video' };
  }

  try {
    await probeImage(url);
    return { url, type: 'image' };
  } catch {
    if (acceptMode === 'image') {
      throw new Error('That link is not a loadable image. Use a direct image URL or choose a file from your device.');
    }
  }

  try {
    await probeVideo(url);
    return { url, type: 'video' };
  } catch {
    throw new Error('That link is not a direct image/video file. Use a direct .jpg/.png/.webp/.gif/.mp4/.webm link or upload the file instead.');
  }
}

export interface MediaUploaderProps {
  value?: string;
  onChange: (url: string, type?: MediaKind, meta?: {
    name?: string;
    size?: number;
    storageKey?: string;
    contentType?: string;
    thumbnailUrl?: string;
    thumbnailStorageKey?: string;
  }) => void;
  onClear?: () => void;
  acceptMode?: 'image' | 'image-video';
  label?: string;
  placeholder?: string;
  onOpenAnalyzer?: () => void;
  compact?: boolean;
  className?: string;
  directUpload?: { archiveId: string; token?: string; autoRegister?: boolean };
  uploadPurpose?: UploadPurpose;
  onBusyChange?: (busy: boolean) => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  value = '',
  onChange,
  onClear,
  acceptMode = 'image-video',
  label,
  placeholder = 'Paste a direct image or video URL...',
  onOpenAnalyzer,
  compact = false,
  className = '',
  directUpload,
  uploadPurpose = 'vault',
  onBusyChange
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState(value && !value.startsWith('data:') ? value : '');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: MediaKind; size: number } | null>(null);
  const [resolvedMediaType, setResolvedMediaType] = useState<MediaKind | null>(() => guessMediaKind(value));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReaderRef = useRef<FileReader | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const completedUploadRef = useRef<{ file: File; authorized: AuthorizedUpload } | null>(null);

  const busy = isProcessing || isCheckingUrl;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => { fileReaderRef.current?.abort(); }, []);

  useEffect(() => {
    if (!value) {
      setResolvedMediaType(null);
      setPreviewFailed(false);
      if (!pendingFileRef.current) {
        setLocalPreviewUrl('');
        setSelectedFile(null);
      }
      return;
    }
    setResolvedMediaType((current) => current || guessMediaKind(value));
  }, [value]);

  useEffect(() => () => {
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewOpen]);

  const previewValue = localPreviewUrl || value;
  const previewType: MediaKind = selectedFile?.type || resolvedMediaType || guessMediaKind(previewValue) || 'image';

  const previewLabel = useMemo(() => {
    if (selectedFile) return `${selectedFile.name} · ${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`;
    if (previewValue.startsWith('data:')) return 'Local file ready to save';
    if (previewValue) return previewValue;
    return '';
  }, [previewValue, selectedFile]);

  const uploadDirectly = async (file: File) => {
    if (!directUpload) throw new Error('Direct upload is unavailable.');
    let authorized = completedUploadRef.current?.file === file
      ? completedUploadRef.current.authorized
      : undefined;

    if (!authorized) {
      completedUploadRef.current = null;
      setUploadPhase('authorizing');
      const authorizationController = new AbortController();
      const authorizationTimeout = window.setTimeout(() => authorizationController.abort(), 10_000);
      const authorization = await fetch(`/api/archives/${directUpload.archiveId}/media/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${directUpload.token || ''}`
        },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, purpose: uploadPurpose }),
        signal: authorizationController.signal
      }).finally(() => window.clearTimeout(authorizationTimeout));
      const authorizationBody = await authorization.json().catch(() => ({}));
      if (!authorization.ok || !authorizationBody.uploadUrl || !authorizationBody.url) {
        throw new Error(authorizationBody.error || `Upload authorization failed (${authorization.status}).`);
      }
      authorized = authorizationBody as AuthorizedUpload;

      setUploadPhase('direct');
      setUploadProgress(0);
      const upload = await uploadBytes(
        authorized.uploadUrl,
        file,
        { 'Content-Type': file.type },
        directUploadTimeoutMs(file),
        setUploadProgress
      );
      if (upload.status < 200 || upload.status >= 300) throw new Error(`Storage upload failed (${upload.status}).`);
      completedUploadRef.current = { file, authorized };
    }

    if (directUpload.autoRegister) {
      setUploadPhase('authorizing');
      const registration = await fetch(`/api/archives/${directUpload.archiveId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${directUpload.token || ''}`
        },
        body: JSON.stringify({
          url: authorized.url,
          storageKey: authorized.storageKey || authorized.key,
          fileSize: authorized.fileSize,
          contentType: authorized.contentType,
          type: authorized.type,
          caption: file.name,
          altText: file.name
        })
      });
      const registered = await registration.json().catch(() => ({}));
      if (!registration.ok) throw new Error(registered.error || `Upload registration failed (${registration.status}).`);
    }

    completedUploadRef.current = null;
    setUploadProgress(100);
    return authorized;
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    setPreviewFailed(false);
    if (!file) return;
    pendingFileRef.current = file;
    if (completedUploadRef.current?.file !== file) completedUploadRef.current = null;

    const isImageFile = file.type.startsWith('image/');
    const isVideoFile = file.type.startsWith('video/');
    if (!isImageFile && (!isVideoFile || acceptMode === 'image')) {
      setFileError(acceptMode === 'image' ? 'Please upload an image file (JPG, PNG, WebP).' : 'Please upload an image or video file.');
      return;
    }

    const maxBytes = isVideoFile ? VIDEO_SOURCE_LIMIT_BYTES : IMAGE_SOURCE_LIMIT_BYTES;
    if (file.size > maxBytes) {
      setFileError(`${isVideoFile ? 'Video' : 'Image'} is too large. Choose a file of ${isVideoFile ? '20' : '10'} MB or less.`);
      return;
    }

    let uploadFile = file;
    if (isImageFile) {
      try {
        setIsProcessing(true);
        setUploadPhase('optimizing');
        setUploadProgress(null);
        uploadFile = await compressImageForUpload(file);
      } catch (error) {
        setIsProcessing(false);
        setUploadPhase(null);
        setFileError(error instanceof Error ? error.message : 'Image compression failed. Please try another image.');
        return;
      }
    }

    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    const objectUrl = URL.createObjectURL(uploadFile);
    const mediaType: MediaKind = isVideoFile ? 'video' : 'image';
    setLocalPreviewUrl(objectUrl);
    setResolvedMediaType(mediaType);
    setSelectedFile({ name: uploadFile.name, type: mediaType, size: uploadFile.size });
    setIsProcessing(true);

    if (directUpload) {
      try {
        const completed = await uploadDirectly(uploadFile);
        setResolvedMediaType(completed.type);
        onChange(completed.url, completed.type, {
          name: uploadFile.name,
          size: completed.fileSize,
          storageKey: completed.storageKey || completed.key,
          contentType: completed.contentType
        });
        pendingFileRef.current = null;
      } catch (error) {
        setFileError(uploadErrorMessage(error));
      } finally {
        setIsProcessing(false);
        setUploadPhase(null);
        setUploadProgress(null);
      }
      return;
    }

    fileReaderRef.current?.abort();
    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onChange(dataUrl, mediaType, { name: uploadFile.name, size: uploadFile.size });
      pendingFileRef.current = null;
      setIsProcessing(false);
      setUploadPhase(null);
    };
    reader.onerror = () => {
      setFileError('Failed to read file.');
      setIsProcessing(false);
      setUploadPhase(null);
    };
    reader.readAsDataURL(uploadFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.[0]) void handleFile(event.dataTransfer.files[0]);
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim() || isCheckingUrl) return;
    setFileError(null);
    setPreviewFailed(false);
    setIsCheckingUrl(true);
    try {
      const checked = await validateExternalMedia(urlInput, acceptMode === 'image' ? 'image' : 'image-video');
      fileReaderRef.current?.abort();
      pendingFileRef.current = null;
      completedUploadRef.current = null;
      if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl('');
      setSelectedFile(null);
      setResolvedMediaType(checked.type);
      setUrlInput(checked.url);
      onChange(checked.url, checked.type);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not load media from that URL.');
    } finally {
      setIsCheckingUrl(false);
    }
  };

  const handleClear = () => {
    fileReaderRef.current?.abort();
    setIsProcessing(false);
    setIsCheckingUrl(false);
    setFileError(null);
    setUploadPhase(null);
    setUploadProgress(null);
    setUrlInput('');
    pendingFileRef.current = null;
    completedUploadRef.current = null;
    setPreviewOpen(false);
    setPreviewFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClear) onClear();
    else onChange('', 'image');
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl('');
    setSelectedFile(null);
    setResolvedMediaType(null);
  };

  const processingText = uploadPhase === 'optimizing'
    ? 'Optimizing image…'
    : uploadPhase === 'authorizing'
      ? 'Preparing secure upload…'
      : uploadPhase === 'direct'
        ? `Uploading directly${uploadProgress !== null ? ` · ${uploadProgress}%` : '…'}`
        : 'Processing media…';

  return (
    <div className={`space-y-2 text-xs ${className}`}>
      {cropOpen && previewType === 'image' && (
        <ImageCropPreview
          src={localPreviewUrl || value}
          onClose={() => setCropOpen(false)}
          onApply={(cropped) => {
            setLocalPreviewUrl('');
            setSelectedFile(null);
            setResolvedMediaType('image');
            onChange(cropped, 'image');
          }}
        />
      )}

      {previewOpen && previewValue && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Selected media preview"
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewOpen(false);
          }}
        >
          <div className="w-full max-w-5xl max-h-[94dvh] rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl overflow-hidden flex flex-col">
            <div className="min-h-14 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Preview before adding</p>
                <p className="text-[11px] text-neutral-400 truncate">{previewLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="min-w-11 min-h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-auto p-2 sm:p-4">
              {previewType === 'video' ? (
                <video
                  key={previewValue}
                  src={previewValue}
                  className="max-w-full max-h-[78dvh] object-contain bg-black"
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => setPreviewFailed(true)}
                  onLoadedMetadata={() => setPreviewFailed(false)}
                />
              ) : (
                <img
                  key={previewValue}
                  src={previewValue}
                  alt="Selected media preview"
                  className="max-w-full max-h-[78dvh] object-contain"
                  onError={() => setPreviewFailed(true)}
                  onLoad={() => setPreviewFailed(false)}
                />
              )}
            </div>
            {previewFailed && (
              <div className="px-4 py-3 border-t border-rose-400/20 bg-rose-500/10 text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>The selected media could not be rendered. Choose another file or use a direct media URL.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {label && (
        <div className="flex items-center justify-between font-medium text-neutral-300">
          <span>{label}</span>
          {onOpenAnalyzer && (
            <button
              type="button"
              onClick={onOpenAnalyzer}
              className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
            >
              <Camera className="w-3 h-3" />
              <span>AI Vision</span>
            </button>
          )}
        </div>
      )}

      {previewValue ? (
        <div className="rounded-2xl border border-white/15 bg-neutral-900/90 overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="relative w-full min-h-36 sm:min-h-44 bg-neutral-950 overflow-hidden group cursor-zoom-in flex items-center justify-center"
            title="Preview selected media"
          >
            {previewType === 'video' ? (
              <video
                key={`thumb-${previewValue}`}
                src={previewValue}
                className="w-full h-36 sm:h-44 object-contain bg-black"
                muted
                playsInline
                preload="metadata"
                onError={() => setPreviewFailed(true)}
                onLoadedMetadata={() => setPreviewFailed(false)}
              />
            ) : (
              <img
                key={`thumb-${previewValue}`}
                src={previewValue}
                alt="Selected media"
                className="w-full h-36 sm:h-44 object-contain bg-neutral-950"
                onError={() => setPreviewFailed(true)}
                onLoad={() => setPreviewFailed(false)}
              />
            )}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            <span className="absolute right-3 bottom-3 px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-white inline-flex items-center gap-2 shadow-lg">
              <Eye className="w-4 h-4" /> Preview
            </span>
          </button>

          <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white flex items-center gap-1.5">
                {previewType === 'video' ? <Video className="w-4 h-4 text-amber-400" /> : <ImageIcon className="w-4 h-4 text-amber-400" />}
                <span>{busy ? processingText : previewType === 'video' ? 'Video ready to add' : 'Image ready to add'}</span>
              </div>
              <p className="text-[10px] text-neutral-400 truncate mt-1 font-mono">{previewLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="min-h-11 px-3 py-2 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Eye className="w-4 h-4" /> Preview
              </button>
              {!directUpload && previewType === 'image' && (
                <button
                  type="button"
                  onClick={() => setCropOpen(true)}
                  className="min-h-11 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Crop className="w-4 h-4" /> Crop
                </button>
              )}
              {fileError && pendingFileRef.current && (
                <button
                  type="button"
                  onClick={() => { if (pendingFileRef.current) void handleFile(pendingFileRef.current); }}
                  disabled={isProcessing}
                  className="min-h-11 px-3 py-2 rounded-lg bg-amber-400 text-neutral-950 font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} /> Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change media"
                className="min-w-11 min-h-11 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                title="Remove media"
                className="min-w-11 min-h-11 p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-neutral-900 border border-white/10 w-full sm:w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`min-h-11 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'upload' ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Choose File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`min-h-11 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'url' ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Direct URL</span>
            </button>
          </div>

          {activeTab === 'upload' ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`min-h-36 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex items-center justify-center ${
                isDragging
                  ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-white/15 hover:border-white/30 bg-neutral-900/60 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="flex flex-col items-center justify-center space-y-1.5">
                <div className="p-2 rounded-full bg-white/5 text-amber-400">
                  {acceptMode === 'image' ? <ImageIcon className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                <div className="text-xs font-medium text-white">
                  {isProcessing ? processingText : 'Click to browse or drop file here'}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {acceptMode === 'image' ? 'Images up to 10 MB · preview before adding' : 'Images up to 10 MB · videos up to 20 MB · preview before adding'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="url"
                  inputMode="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleUrlSubmit();
                    }
                  }}
                  placeholder={placeholder}
                  className="flex-1 min-h-12 px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-base sm:text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => void handleUrlSubmit()}
                  disabled={!urlInput.trim() || isCheckingUrl}
                  className="min-h-12 px-4 py-2 rounded-xl bg-amber-400 text-neutral-950 font-semibold text-sm disabled:opacity-40 hover:brightness-110 transition-all inline-flex items-center justify-center gap-2"
                >
                  {isCheckingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {isCheckingUrl ? 'Checking…' : 'Check & attach'}
                </button>
              </div>
              <p className="text-[10px] text-neutral-500 leading-4">
                Use a direct media file URL. Social-post/page links are not media files and are rejected instead of creating a broken black preview.
              </p>
            </div>
          )}
        </div>
      )}

      {fileError && (
        <div role="alert" aria-live="assertive" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="leading-5">{fileError}</p>
            {pendingFileRef.current && (
              <button
                type="button"
                onClick={() => { if (pendingFileRef.current) void handleFile(pendingFileRef.current); }}
                disabled={isProcessing}
                className="mt-2 min-h-11 rounded-lg bg-amber-400 px-3 font-bold text-neutral-950 hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} /> Retry upload
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptMode === 'image' ? 'image/*' : 'image/*,video/*'}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.[0]) void handleFile(event.target.files[0]);
        }}
      />
    </div>
  );
};
