import React, { useEffect, useState, useRef } from 'react';
import { ImageCropPreview } from './ImageCropPreview';
import { Upload, Link as LinkIcon, Image as ImageIcon, Video, X, Check, Camera, RefreshCw, Eye } from 'lucide-react';
import { compressImageForUpload, IMAGE_SOURCE_LIMIT_BYTES, VIDEO_SOURCE_LIMIT_BYTES } from '../../lib/imageCompression';

type UploadPhase = 'optimizing' | 'authorizing' | 'direct' | 'fallback';

export function directUploadTimeoutMs(file: Pick<File, 'size' | 'type'>): number {
  if (file.type.startsWith('image/')) return 12_000;
  // Videos get more time, scaled for slower mobile connections, but a stalled
  // storage request must still hand off to the same-origin fallback promptly.
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
    const resetDeadline = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => xhr.abort(), timeoutMs);
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
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
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
    analysisDataUrl?: string;
  }) => void;
  onClear?: () => void;
  acceptMode?: 'image' | 'image-video';
  label?: string;
  placeholder?: string;
  onOpenAnalyzer?: () => void;
  compact?: boolean;
  className?: string;
  directUpload?: { archiveId: string; token?: string };
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
  directUpload
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
  const [cropOpen, setCropOpen] = useState(false);
  const uploadDirectly = async (file: File) => {
    if (!directUpload) throw new Error('Direct upload is unavailable.');
    setUploadPhase('authorizing');
    const authorizationController = new AbortController();
    const authorizationTimeout = window.setTimeout(() => authorizationController.abort(), 10_000);
    const authorization = await fetch(`/api/archives/${directUpload.archiveId}/media/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${directUpload.token || ''}`
      },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
      signal: authorizationController.signal
    }).finally(() => window.clearTimeout(authorizationTimeout));
    const authorized = await authorization.json().catch(() => ({}));
    if (!authorization.ok || !authorized.uploadUrl || !authorized.url) {
      throw new Error(authorized.error || `Upload authorization failed (${authorization.status}).`);
    }

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
    setUploadProgress(100);
    return authorized;
  };

  const uploadThroughServer = async (file: File) => {
    if (!directUpload) throw new Error('Server upload is unavailable.');
    setUploadPhase('fallback');
    setUploadProgress(0);
    const upload = await uploadBytes(
      `/api/archives/${directUpload.archiveId}/media/upload`,
      file,
      {
        'Content-Type': file.type,
        'X-File-Name': encodeURIComponent(file.name),
        Authorization: `Bearer ${directUpload.token || ''}`
      },
      120_000,
      setUploadProgress
    );
    const completed = (() => {
      try { return JSON.parse(upload.responseText || '{}'); } catch { return {}; }
    })();
    if (upload.status < 200 || upload.status >= 300 || !completed.url) {
      throw new Error(completed.error || `Upload failed (${upload.status}).`);
    }
    setUploadProgress(100);
    return completed;
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
        let analysisDataUrl: string | undefined;
        if (isImageFile) {
          analysisDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not prepare this image for AI analysis.'));
            reader.readAsDataURL(uploadFile);
          });
        }
        // Sending the bytes straight to object storage avoids relaying every image
        // through Render. If bucket CORS is not ready, retain the same-origin proxy
        // as a compatibility fallback instead of losing the user's selection.
        let completed;
        try {
          completed = await uploadDirectly(uploadFile);
        } catch {
          completed = await uploadThroughServer(uploadFile);
        }
        onChange(completed.url, completed.type, {
          name: uploadFile.name,
          size: completed.fileSize,
          // Presigned-upload authorization returns `key`, while the same-origin
          // fallback returns `storageKey`. Preserve either receipt so the media
          // record always points at the exact object the user selected.
          storageKey: completed.storageKey || completed.key,
          contentType: completed.contentType,
          analysisDataUrl
        });
        pendingFileRef.current = null;
      } catch (error) {
        setFileError(error instanceof Error ? error.message : 'Cloud upload failed. Please retry.');
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
                      : uploadPhase === 'fallback'
                        ? `Using secure backup upload${uploadProgress !== null ? ` · ${uploadProgress}%` : '…'}`
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

          {fileError && <p className="text-[11px] text-rose-400">{fileError}</p>}
        </div>
      )}
      {fileError && previewValue && <p role="alert" className="text-rose-300">{fileError}</p>}

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
