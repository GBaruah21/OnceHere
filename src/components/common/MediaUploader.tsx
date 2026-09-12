import React, { useEffect, useState, useRef } from 'react';
import { ImageCropPreview } from './ImageCropPreview';
import { Upload, Link as LinkIcon, Image as ImageIcon, Video, X, Check, Camera, RefreshCw, Eye } from 'lucide-react';
import { compressImageForUpload, IMAGE_SOURCE_LIMIT_BYTES, VIDEO_SOURCE_LIMIT_BYTES } from '../../lib/imageCompression';

type UploadPhase = 'optimizing' | 'authorizing' | 'direct';
type UploadPurpose = 'vault' | 'portrait' | 'timeline' | 'wall';
type AuthorizedUpload = {
  uploadUrl: string;
  url: string;
  storageKey?: string;
  key?: string;
  fileSize: number;
  contentType: string;
  type: 'image' | 'video';
};

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
  // Videos get more time, scaled for slower mobile connections. Uploads never
  // fall back through the application server, protecting hosting bandwidth.
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
    // This is an inactivity deadline, not a total transfer deadline. Progressing
    // mobile uploads must not be discarded and uploaded a second time.
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

export interface MediaUploaderProps {
  value?: string;
  onChange: (url: string, type?: 'image' | 'video', meta?: {
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
  placeholder = 'Paste URL or select file from your device...',
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
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: 'image' | 'video'; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReaderRef = useRef<FileReader | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const completedUploadRef = useRef<{ file: File; authorized: AuthorizedUpload } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    onBusyChange?.(isProcessing);
  }, [isProcessing, onBusyChange]);
  const uploadDirectly = async (file: File) => {
    if (!directUpload) throw new Error('Direct upload is unavailable.');
    let authorized = completedUploadRef.current?.file === file
      ? completedUploadRef.current.authorized
      : undefined;

    // If the object upload succeeded but registration failed, retry only the
    // small registration request. Re-uploading the same large file would waste
    // the user's data and leave duplicate orphan objects in storage.
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

    // Attachments used outside the Memory Vault still need a durable media
    // record. Register them immediately so protected image/video requests work,
    // they count toward archive quotas, and the upload is not left as an
    // invisible object that the public renderer cannot authorize.
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

  useEffect(() => () => { fileReaderRef.current?.abort(); }, []);

  useEffect(() => {
    if (!value) {
      setLocalPreviewUrl('');
      setSelectedFile(null);
    }
  }, [value]);

  useEffect(() => () => {
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  const isVideo = (url: string) => {
    if (!url) return false;
    return (
      url.startsWith('data:video') ||
      selectedFile?.type === 'video' ||
      /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url) ||
      url.includes('youtube.com') ||
      url.includes('youtu.be')
    );
  };

  const handleFile = async (file: File) => {
    setFileError(null);
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
        setFileError(error instanceof Error ? error.message : 'Image compression failed. Please try another image.');
        return;
      }
    }

    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(uploadFile));
    setSelectedFile({ name: uploadFile.name, type: isVideoFile ? 'video' : 'image', size: uploadFile.size });
    setIsProcessing(true);

    if (directUpload) {
      try {
        // Upload bytes only to object storage. A failed direct upload remains
        // retryable, but is never relayed through Render/application bandwidth.
        const completed = await uploadDirectly(uploadFile);
        onChange(completed.url, completed.type, {
          name: uploadFile.name,
          size: completed.fileSize,
          // Preserve the signed-upload receipt so the media record always points
          // at the exact object the user selected.
          storageKey: completed.storageKey || completed.key,
          contentType: completed.contentType
        });
        pendingFileRef.current = null;
      } catch (error) {
        setFileError(uploadErrorMessage(error));
        // Keep the File object and its local preview alive. A failed network or
        // expired session must be retryable without making the user reselect it.
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
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const mediaType: 'image' | 'video' = isVideoFile ? 'video' : 'image';
      onChange(dataUrl, mediaType, { name: uploadFile.name, size: uploadFile.size });
      setIsProcessing(false);
    };
    reader.onerror = () => {
      setFileError('Failed to read file.');
      setIsProcessing(false);
    };
    reader.readAsDataURL(uploadFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    fileReaderRef.current?.abort();
    setIsProcessing(false);
    setLocalPreviewUrl('');
    setSelectedFile(null);
    const mediaType: 'image' | 'video' = isVideo(urlInput.trim()) ? 'video' : 'image';
    onChange(urlInput.trim(), mediaType);
  };

  const handleClear = () => {
    fileReaderRef.current?.abort();
    setIsProcessing(false);
    setFileError(null);
    setUploadPhase(null);
    setUploadProgress(null);
    setUrlInput('');
    pendingFileRef.current = null;
    completedUploadRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClear) onClear();
    else onChange('', 'image');
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl('');
    setSelectedFile(null);
  };

  // Keep showing the local object URL while the newly uploaded object has not yet
  // been committed to the media table. The protected API URL intentionally 404s
  // until that commit and previously produced a blank preview here.
  const previewValue = localPreviewUrl || value;

  return (
    <div className={`space-y-2 text-xs ${className}`}>
      {cropOpen && <ImageCropPreview src={value || localPreviewUrl} onClose={() => setCropOpen(false)} onApply={(cropped) => onChange(cropped, 'image')} />}
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

      {/* If an image or video is already selected, show live preview card */}
      {previewValue ? (
        <div className="relative rounded-xl border border-white/15 bg-neutral-900/90 overflow-hidden group p-2 flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg bg-black/60 overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center">
            {isVideo(previewValue) ? (
              <video src={previewValue} className="w-full h-full object-cover" muted playsInline controls={false} />
            ) : (
              <img src={previewValue} alt="Selected media" className="w-full h-full object-cover" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate flex items-center gap-1.5">
              {isVideo(previewValue) ? <Video className="w-3.5 h-3.5 text-amber-400" /> : <ImageIcon className="w-3.5 h-3.5 text-amber-400" />}
              <span>
                {isProcessing
                  ? uploadPhase === 'optimizing'
                    ? 'Optimizing image…'
                    : uploadPhase === 'authorizing'
                      ? 'Preparing secure upload…'
                      : `Uploading directly${uploadProgress !== null ? ` · ${uploadProgress}%` : '…'}`
                  : isVideo(previewValue) ? 'Video ready to save' : 'Image ready to save'}
              </span>
            </div>
            <p className="text-[10px] text-neutral-400 truncate mt-0.5 font-mono">
              {selectedFile ? `${selectedFile.name} · ${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : previewValue.startsWith('data:') ? 'Local file ready to save' : previewValue}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {fileError && pendingFileRef.current && (
              <button
                type="button"
                onClick={() => { if (pendingFileRef.current) void handleFile(pendingFileRef.current); }}
                disabled={isProcessing}
                title="Retry this selected file upload"
                className="min-h-11 px-3 py-2 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>Retry upload</span>
              </button>
            )}
            {!directUpload && !isVideo(previewValue) && (
              <button type="button" onClick={() => setCropOpen(true)} title="Preview and crop image" className="min-w-11 min-h-11 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center">
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              title="Change media"
              className="min-w-11 min-h-11 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Remove media"
              className="min-w-11 min-h-11 p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors cursor-pointer flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty state: Tabs for Direct File Upload & URL Input */
        <div className="space-y-2">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-neutral-900 border border-white/10 w-full sm:w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`min-h-11 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'upload' ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Upload className="w-3 h-3" />
              <span>Choose File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`min-h-11 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'url' ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LinkIcon className="w-3 h-3" />
              <span>Paste URL</span>
            </button>
          </div>

          {activeTab === 'upload' ? (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
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
                    {isProcessing ? (directUpload ? 'Optimizing and uploading securely…' : 'Optimizing media…') : 'Click to browse or drop file here'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {acceptMode === 'image' ? 'Images up to 10 MB · optimized before upload' : 'Images up to 10 MB (optimized) · videos up to 20 MB'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                placeholder={placeholder}
                className="flex-1 min-h-12 px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-base sm:text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="min-h-12 px-4 py-2 rounded-xl bg-amber-400 text-neutral-950 font-semibold text-sm disabled:opacity-40 hover:brightness-110 cursor-pointer transition-all"
              >
                Attach
              </button>
            </div>
          )}

          {fileError && <p role="alert" className="text-[11px] text-rose-400">{fileError}</p>}
        </div>
      )}
      {fileError && previewValue && (
        <div role="alert" aria-live="assertive" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200">
          <p className="leading-5">{fileError}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingFileRef.current && (
              <button type="button" onClick={() => { if (pendingFileRef.current) void handleFile(pendingFileRef.current); }} disabled={isProcessing} className="min-h-11 rounded-lg bg-amber-400 px-3 font-bold text-neutral-950 hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} /> Retry upload
              </button>
            )}
            <button type="button" onClick={() => {
              if (window.confirm('Refresh OnceHere? You will need to select this file again after the page reloads.')) window.location.reload();
            }} className="min-h-11 rounded-lg border border-white/20 px-3 font-semibold text-white hover:bg-white/10">
              Refresh page
            </button>
          </div>
        </div>
      )}

      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptMode === 'image' ? 'image/*' : 'image/*,video/*'}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />
    </div>
  );
};
