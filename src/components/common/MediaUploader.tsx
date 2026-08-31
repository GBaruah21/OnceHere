import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, Video, X, Check, Camera, RefreshCw, Eye } from 'lucide-react';

export interface MediaUploaderProps {
  value?: string;
  onChange: (url: string, type?: 'image' | 'video', meta?: { name?: string; size?: number }) => void;
  onClear?: () => void;
  acceptMode?: 'image' | 'image-video';
  label?: string;
  placeholder?: string;
  onOpenAnalyzer?: () => void;
  compact?: boolean;
  className?: string;
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
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState(value && !value.startsWith('data:') ? value : '');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = (url: string) => {
    if (!url) return false;
    return (
      url.startsWith('data:video') ||
      url.endsWith('.mp4') ||
      url.endsWith('.webm') ||
      url.endsWith('.mov') ||
      url.includes('youtube.com') ||
      url.includes('youtu.be')
    );
  };

  const handleFile = (file: File) => {
    setFileError(null);
    if (!file) return;

    const isImageFile = file.type.startsWith('image/');
    const isVideoFile = file.type.startsWith('video/');

    if (!isImageFile && (!isVideoFile || acceptMode === 'image')) {
      setFileError(acceptMode === 'image' ? 'Please upload an image file (JPG, PNG, WebP).' : 'Please upload an image or video file.');
      return;
    }

    // Check size (e.g. max 15MB for in-memory / data URL storage)
    if (file.size > 15 * 1024 * 1024) {
      setFileError('File size exceeds 15MB limit. Please choose a smaller file or use a hosted URL.');
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const mediaType: 'image' | 'video' = isVideoFile ? 'video' : 'image';
      onChange(dataUrl, mediaType, { name: file.name, size: file.size });
      setIsProcessing(false);
    };
    reader.onerror = () => {
      setFileError('Failed to read file.');
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
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
    const mediaType: 'image' | 'video' = isVideo(urlInput.trim()) ? 'video' : 'image';
    onChange(urlInput.trim(), mediaType);
  };

  const handleClear = () => {
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClear) onClear();
    else onChange('', 'image');
  };

  return (
    <div className={`space-y-2 text-xs ${className}`}>
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
      {value ? (
        <div className="relative rounded-xl border border-white/15 bg-neutral-900/90 overflow-hidden group p-2 flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg bg-black/60 overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center">
            {isVideo(value) ? (
              <video src={value} className="w-full h-full object-cover" muted playsInline />
            ) : (
              <img src={value} alt="Selected media" className="w-full h-full object-cover" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate flex items-center gap-1.5">
              {isVideo(value) ? <Video className="w-3.5 h-3.5 text-amber-400" /> : <ImageIcon className="w-3.5 h-3.5 text-amber-400" />}
              <span>{isVideo(value) ? 'Video Attached' : 'Image Attached'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 truncate mt-0.5 font-mono">
              {value.startsWith('data:') ? 'Local file uploaded' : value}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              title="Change media"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Remove media"
              className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty state: Tabs for Direct File Upload & URL Input */
        <div className="space-y-2">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-900 border border-white/10 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'upload' ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Upload className="w-3 h-3" />
              <span>Choose File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
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
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
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
                    {isProcessing ? 'Processing file...' : 'Click to browse or drop file here'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {acceptMode === 'image' ? 'Supports JPG, PNG, WEBP, GIF (up to 15MB)' : 'Supports Images & Videos: JPG, PNG, MP4, WEBM'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
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
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="px-3 py-2 rounded-xl bg-amber-400 text-neutral-950 font-semibold text-xs disabled:opacity-40 hover:brightness-110 cursor-pointer transition-all"
              >
                Attach
              </button>
            </div>
          )}

          {fileError && <p className="text-[11px] text-rose-400">{fileError}</p>}
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
