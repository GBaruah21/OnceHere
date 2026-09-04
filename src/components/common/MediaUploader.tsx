import React, { useEffect, useState, useRef } from 'react';
import { ImageCropPreview } from './ImageCropPreview';
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
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: 'image' | 'video'; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReaderRef = useRef<FileReader | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
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

  const handleFile = (file: File) => {
    setFileError(null);
    if (!file) return;

    const isImageFile = file.type.startsWith('image/');
    const isVideoFile = file.type.startsWith('video/');

    if (!isImageFile && (!isVideoFile || acceptMode === 'image')) {
      setFileError(acceptMode === 'image' ? 'Please upload an image file (JPG, PNG, WebP).' : 'Please upload an image or video file.');
      return;
    }

    const maxBytes = isVideoFile ? 18 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileError(`${isVideoFile ? 'Video' : 'Image'} is too large for this upload method. Choose a file under ${isVideoFile ? '18' : '15'} MB or use a hosted link.`);
      return;
    }

    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setSelectedFile({ name: file.name, type: isVideoFile ? 'video' : 'image', size: file.size });
    setIsProcessing(true);
    fileReaderRef.current?.abort();
    const reader = new FileReader();
    fileReaderRef.current = reader;
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
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClear) onClear();
    else onChange('', 'image');
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl('');
    setSelectedFile(null);
  };

  const previewValue = value || localPreviewUrl;

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
              <span>{isProcessing ? 'Preparing media…' : isVideo(previewValue) ? 'Video ready to save' : 'Image ready to save'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 truncate mt-0.5 font-mono">
              {selectedFile ? `${selectedFile.name} · ${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : previewValue.startsWith('data:') ? 'Local file ready to save' : previewValue}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {!isVideo(previewValue) && (
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
                    {isProcessing ? 'Preparing preview…' : 'Click to browse or drop file here'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {acceptMode === 'image' ? 'Supports JPG, PNG, WEBP, GIF (up to 15MB)' : 'Images up to 15MB · videos up to 18MB (MP4, WEBM, MOV)'}
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
