import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  Instagram,
  Sparkles,
  Smartphone,
  Layers,
  FileText,
  Upload,
  RefreshCw,
  Link,
  Sliders,
  Palette
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Archive, MediaItem } from '../../types';
import { THEMES } from '../../config/themes';
import { PLATFORM_CONFIG } from '../../config/platform';
import { recordArchiveShare } from '../../lib/share';

interface InstagramStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  archive: Archive;
  media?: MediaItem[];
  defaultMode?: 'story' | 'post';
}

export const InstagramStoryModal: React.FC<InstagramStoryModalProps> = ({
  isOpen,
  onClose,
  archive,
  media = [],
  defaultMode = 'story'
}) => {
  const [mode, setMode] = useState<'story' | 'post'>(defaultMode);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [storyStyle, setStoryStyle] = useState<'midnight' | 'vintage' | 'aurora'>('midnight');
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const theme = THEMES[archive.themeId] || THEMES['midnight-cinema'];

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = archive.slug
    ? `${origin}/s/${archive.slug}`
    : (typeof window !== 'undefined' ? window.location.href : '');

  // Extract clean batch year
  const batchYearText = archive.batchLabel || `${archive.startYear}–${archive.endYear}`;

  // Curated photo collection from archive media + beautiful fallbacks
  const availablePhotos = [
    customPhotoUrl,
    ...(media.map((m) => m.url).filter(Boolean)),
    'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80'
  ].filter(Boolean) as string[];

  // Deduplicate URLs
  const uniquePhotos = Array.from(new Set(availablePhotos));
  const currentPhotoUrl = uniquePhotos[selectedPhotoIndex] || uniquePhotos[0];

  const instagramCaption = `✨ ${archive.title} (${batchYearText})\n\n"${archive.subtitle || 'Every laughter, inside joke, and memory etched in stone.'}"\n\n🔗 View our full interactive timeline, photo vault & sign our memory wall:\n${shareUrl}\n\n${PLATFORM_CONFIG.attribution.shareCredit}\n\n#ClassOf${archive.endYear} #AlumniArchive #OnceHere #Yearbook #BatchOf${archive.endYear} #SchoolMemories #Farewell`;

  // Draw card onto canvas with bulletproof layout & typography
  const renderCardCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsRenderingCanvas(true);

    const isStory = mode === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    canvas.width = width;
    canvas.height = height;

    // Helper: Draw rounded rectangle
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // Helper: Draw card text with auto wrapping
    const drawWrappedText = (
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      lineHeight: number,
      maxLines = 4
    ) => {
      const words = text.split(' ');
      let line = '';
      let curY = y;
      let lineCount = 0;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          if (lineCount >= maxLines - 1) {
            ctx.fillText(line.trim() + '...', x, curY);
            return curY;
          }
          ctx.fillText(line.trim(), x, curY);
          line = words[n] + ' ';
          curY += lineHeight;
          lineCount++;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), x, curY);
      return curY;
    };

    // 1. Draw Canvas Background
    if (storyStyle === 'vintage') {
      ctx.fillStyle = '#f8f4eb';
      ctx.fillRect(0, 0, width, height);

      // Vintage outer frame
      ctx.strokeStyle = '#e2dac6';
      ctx.lineWidth = 14;
      ctx.strokeRect(36, 36, width - 72, height - 72);

      // Subtle warm vignette
      const radGrad = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.8);
      radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      radGrad.addColorStop(1, 'rgba(214, 199, 172, 0.35)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);
    } else if (storyStyle === 'aurora') {
      // Aurora Electric Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.35, '#1e1035');
      grad.addColorStop(0.7, '#2b1055');
      grad.addColorStop(1, '#0c1b33');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Neon orbs
      ctx.fillStyle = 'rgba(236, 72, 153, 0.18)';
      ctx.beginPath();
      ctx.arc(width * 0.2, height * 0.25, 380, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.beginPath();
      ctx.arc(width * 0.85, height * 0.65, 420, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Midnight Cinema Luxury
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0a0c14');
      grad.addColorStop(0.5, '#141824');
      grad.addColorStop(1, '#080a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Warm Golden Ambient Glow
      const glowGrad = ctx.createRadialGradient(width / 2, isStory ? height * 0.4 : height * 0.45, 80, width / 2, isStory ? height * 0.4 : height * 0.45, 550);
      glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
      glowGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.02)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // Color definitions based on style
    const isVintage = storyStyle === 'vintage';
    const mainTextColor = isVintage ? '#1c1917' : '#ffffff';
    const subTextColor = isVintage ? '#78716c' : '#fbbf24';
    const quoteColor = isVintage ? '#44403c' : '#cbd5e1';

    // 2. Header / Organization Badge
    ctx.textAlign = 'center';
    const orgPillY = isStory ? 140 : 70;
    const orgPillHeight = 56;
    const orgPillWidth = Math.min(680, width - 200);

    // Pill background
    ctx.fillStyle = isVintage ? 'rgba(0, 0, 0, 0.06)' : 'rgba(245, 158, 11, 0.14)';
    drawRoundedRect(width / 2 - orgPillWidth / 2, orgPillY, orgPillWidth, orgPillHeight, orgPillHeight / 2);
    ctx.fill();

    if (!isVintage) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.lineWidth = 2;
      drawRoundedRect(width / 2 - orgPillWidth / 2, orgPillY, orgPillWidth, orgPillHeight, orgPillHeight / 2);
      ctx.stroke();
    }

    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = subTextColor;
    ctx.fillText(`✨ ${archive.organizationName.toUpperCase()} · ${batchYearText}`, width / 2, orgPillY + 36);

    // 3. Title Heading
    ctx.font = 'bold 52px "Playfair Display", Georgia, serif';
    ctx.fillStyle = mainTextColor;
    const titleStartY = isStory ? 260 : 170;
    const titleEndY = drawWrappedText(archive.title, width / 2, titleStartY, 900, 60, 2);

    // 4. Photo Dimensions & Geometry
    const photoWidth = isStory ? 880 : 880;
    const photoHeight = isStory ? 940 : 540;
    const photoX = (width - photoWidth) / 2;
    const photoY = isStory ? (titleEndY + 50) : 260;

    // Helper to finish drawing text after image loads
    const drawFooterContent = () => {
      // Subtitle / Quote
      const quoteStartY = isStory ? (photoY + photoHeight + 60) : 840;
      ctx.font = 'italic 30px "Playfair Display", Georgia, serif';
      ctx.fillStyle = quoteColor;
      const quote = `"${archive.subtitle || 'Every laughter, inside joke, and memory etched in stone.'}"`;
      drawWrappedText(quote, width / 2, quoteStartY, 900, 44, 2);

      // Small, readable creator credit. It stays visible without competing
      // with the archive title, photograph, or call to action.
      const drawCreatorCredit = (centerY: number) => {
        const pillW = 500;
        const pillH = 54;
        ctx.fillStyle = isVintage ? 'rgba(255, 255, 255, 0.88)' : 'rgba(15, 23, 42, 0.82)';
        drawRoundedRect(width / 2 - pillW / 2, centerY - pillH / 2, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.strokeStyle = isVintage ? 'rgba(120, 113, 108, 0.24)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = isVintage ? '#57534e' : '#f8fafc';
        ctx.fillText(`OnceHere · ${PLATFORM_CONFIG.author.displayHandle}`, width / 2, centerY + 8);
      };

      // Bottom CTA Banner (Link in Bio / Link Sticker)
      if (isStory) {
        const linkPillY = height - 200;
        const linkPillW = 620;
        const linkPillH = 76;

        // Gradient Link Sticker Button
        const linkGrad = ctx.createLinearGradient(width / 2 - linkPillW / 2, 0, width / 2 + linkPillW / 2, 0);
        if (isVintage) {
          linkGrad.addColorStop(0, '#d97706');
          linkGrad.addColorStop(1, '#b45309');
        } else {
          linkGrad.addColorStop(0, '#f59e0b');
          linkGrad.addColorStop(1, '#ec4899');
        }

        ctx.fillStyle = linkGrad;
        drawRoundedRect(width / 2 - linkPillW / 2, linkPillY, linkPillW, linkPillH, linkPillH / 2);
        ctx.fill();

        ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🔗 TAP LINK TO EXPLORE ARCHIVE', width / 2, linkPillY + 48);

        drawCreatorCredit(height - 70);
      } else {
        drawCreatorCredit(height - 60);
      }

      setIsRenderingCanvas(false);
    };

    // 5. Load and Draw Image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Photo Shadow
      ctx.shadowColor = isVintage ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = isVintage ? 24 : 40;
      ctx.shadowOffsetY = 16;

      if (isVintage) {
        // Polaroid Frame
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(photoX - 18, photoY - 18, photoWidth + 36, photoHeight + 64);
        ctx.strokeStyle = '#e5e0d3';
        ctx.lineWidth = 2;
        ctx.strokeRect(photoX - 18, photoY - 18, photoWidth + 36, photoHeight + 64);
      }

      ctx.save();
      // Clip rounded corners for modern styles
      if (!isVintage) {
        drawRoundedRect(photoX, photoY, photoWidth, photoHeight, 28);
        ctx.clip();
      }

      // Draw photo with object-fit: cover
      const scale = Math.max(photoWidth / img.width, photoHeight / img.height);
      const scaledW = img.width * scale;
      const scaledH = img.height * scale;
      const offsetX = photoX + (photoWidth - scaledW) / 2;
      const offsetY = photoY + (photoHeight - scaledH) / 2;

      ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
      ctx.restore();

      // Reset shadows
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Draw subtle border around photo in modern modes
      if (!isVintage) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3;
        drawRoundedRect(photoX, photoY, photoWidth, photoHeight, 28);
        ctx.stroke();
      }

      drawFooterContent();
    };

    img.onerror = () => {
      // Fallback placeholder block if image CORS fails
      ctx.fillStyle = isVintage ? '#e5e0d3' : '#1e293b';
      drawRoundedRect(photoX, photoY, photoWidth, photoHeight, 24);
      ctx.fill();

      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = isVintage ? '#78716c' : '#94a3b8';
      ctx.fillText('🎓 Batch Memory Vault', width / 2, photoY + photoHeight / 2);

      drawFooterContent();
    };

    img.src = currentPhotoUrl;
  }, [mode, storyStyle, currentPhotoUrl, archive, batchYearText]);

  useEffect(() => {
    if (isOpen) {
      // Delay slightly to ensure canvas is attached to DOM
      const timer = setTimeout(() => {
        renderCardCanvas();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, renderCardCanvas]);

  if (!isOpen) return null;

  // Download High-Res Image
  const handleDownloadCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    try {
      const link = document.createElement('a');
      link.download = `${archive.slug || 'archive'}-instagram-${mode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      recordArchiveShare(archive.id, mode === 'story' ? 'instagram_story' : 'instagram_post', 'downloaded');

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      console.error('Canvas export error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Direct Web Share with File Payload (Supported on Mobile/Instagram)
  const handleDirectWebShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          handleDownloadCard();
          return;
        }
        const file = new File([blob], `${archive.slug || 'archive'}-${mode}.png`, {
          type: 'image/png'
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: archive.title,
            text: instagramCaption
          });
          recordArchiveShare(archive.id, mode === 'story' ? 'instagram_story' : 'instagram_post', 'shared');
        } else {
          // Fallback to regular download + copy
          handleDownloadCard();
          handleCopyCaption();
        }
        setIsGenerating(false);
      }, 'image/png');
    } catch (err) {
      setIsGenerating(false);
      handleDownloadCard();
    }
  };

  // Copy Instagram Caption
  const handleCopyCaption = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(instagramCaption);
      }
      recordArchiveShare(archive.id, mode === 'story' ? 'instagram_story' : 'instagram_post', 'copied');
      setCopiedCaption(true);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
      setTimeout(() => setCopiedCaption(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyHandle = async () => {
    try {
      await navigator.clipboard.writeText(PLATFORM_CONFIG.author.displayHandle);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2200);
    } catch (err) {
      console.error(err);
    }
  };

  // Copy Archive Link
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  // Custom photo upload from user device
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomPhotoUrl(reader.result);
        setSelectedPhotoIndex(0);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] rounded-3xl bg-neutral-900 border border-white/15 text-neutral-100 shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-pink-500/15 via-purple-500/10 to-amber-500/15 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-lg shrink-0">
              <Instagram className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-pink-400 font-mono">
                  Instagram Share Studio
                </span>
                <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-mono">
                  9:16 & 1:1 HD Exporter
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-serif font-bold text-white leading-tight truncate">
                {archive.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Studio Content Container with Smooth Scrolling */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Live Canvas Preview & Quick Action Bar */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-4">
              
              {/* Aspect Ratio Switcher (Story 9:16 vs Feed 1:1) */}
              <div className="flex items-center gap-1.5 p-1 bg-neutral-950 rounded-2xl border border-white/10 text-xs font-semibold w-full max-w-xs justify-center">
                <button
                  type="button"
                  onClick={() => setMode('story')}
                  className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'story'
                      ? 'bg-gradient-to-r from-pink-500 to-amber-500 text-white shadow-md font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Story (9:16)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('post')}
                  className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'post'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Post (1:1)</span>
                </button>
              </div>

              {/* Clean Preview Device Frame (No overlapping overlay text) */}
              <div className="relative group p-2 bg-neutral-950 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-center max-h-[420px] sm:max-h-[460px] w-full overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className={`rounded-xl object-contain shadow-lg ${
                    mode === 'story' ? 'max-h-[390px] sm:max-h-[430px] aspect-[9/16]' : 'max-h-[340px] sm:max-h-[380px] aspect-square'
                  }`}
                />
                
                {isRenderingCanvas && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-amber-300 text-xs font-mono gap-2 rounded-xl">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Rendering HD preview...</span>
                  </div>
                )}
              </div>

              {/* Mobile Quick Action Buttons right below preview */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                <button
                  type="button"
                  onClick={handleDownloadCard}
                  disabled={isGenerating}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Save Image</span>
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator ? (
                  <button
                    type="button"
                    onClick={handleDirectWebShare}
                    disabled={isGenerating}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <Instagram className="w-4 h-4" />
                    <span>Share to IG</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    {copiedCaption ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCaption ? 'Copied!' : 'Copy Caption'}</span>
                  </button>
                )}
              </div>

            </div>

            {/* Right Column: Customization Controls & Formatted Caption */}
            <div className="lg:col-span-6 space-y-5">
              
              {/* 1. Visual Style Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-pink-400" />
                    <span>1. Visual Theme</span>
                  </label>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {storyStyle === 'midnight' ? 'Midnight Film' : storyStyle === 'vintage' ? 'Vintage Polaroid' : 'Sunset Aurora'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'midnight', label: 'Midnight Film', desc: 'Obsidian & Gold' },
                    { id: 'vintage', label: 'Vintage Paper', desc: 'Polaroid Border' },
                    { id: 'aurora', label: 'Sunset Aurora', desc: 'Electric Glow' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStoryStyle(s.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        storyStyle === s.id
                          ? 'border-amber-400 bg-amber-500/15 text-amber-300 ring-1 ring-amber-400'
                          : 'border-white/10 bg-neutral-950 text-neutral-400 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-bold leading-tight">{s.label}</div>
                      <div className="text-[10px] opacity-70 truncate">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Photo Selector & Custom Upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>2. Cover Memory Photo</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-lg border border-white/10"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Custom</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                  {uniquePhotos.map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => setSelectedPhotoIndex(i)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                        selectedPhotoIndex === i
                          ? 'border-amber-400 scale-105 shadow-md ring-2 ring-amber-400/40'
                          : 'border-white/10 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="Cover option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Pre-Formatted Instagram Caption & Bio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                    <span>3. Ready-To-Paste Caption</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-xs font-semibold text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Link className="w-3 h-3" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyCaption}
                      className="text-xs font-semibold text-pink-400 hover:text-pink-300 flex items-center gap-1 cursor-pointer font-mono"
                    >
                      {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCaption ? 'Copied Caption!' : 'Copy Caption'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-neutral-950 border border-white/10 text-xs font-mono text-neutral-300 max-h-24 overflow-y-auto leading-relaxed select-all">
                  {instagramCaption}
                </div>
                <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-amber-500/10 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-pink-300">
                    <Instagram className="w-3.5 h-3.5" />
                    <span>A small creator note</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed">
                    {PLATFORM_CONFIG.attribution.shareRequest.split(PLATFORM_CONFIG.author.displayHandle)[0]}
                    <a
                      href={PLATFORM_CONFIG.author.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-amber-300 underline decoration-amber-300/50 underline-offset-2 transition-colors hover:text-amber-200"
                    >
                      {PLATFORM_CONFIG.author.displayHandle}
                    </a>
                    {PLATFORM_CONFIG.attribution.shareRequest.split(PLATFORM_CONFIG.author.displayHandle)[1]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyHandle}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-white inline-flex items-center gap-1.5"
                    >
                      {copiedHandle ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedHandle ? 'Tag copied' : `Copy ${PLATFORM_CONFIG.author.displayHandle}`}
                    </button>
                    <a
                      href={PLATFORM_CONFIG.author.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 text-[11px] font-semibold text-pink-300 inline-flex items-center gap-1.5"
                    >
                      <Instagram className="w-3 h-3" />Follow or send a note
                    </a>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-600 leading-relaxed">
                  Instagram controls the final editor. Add its Mention sticker to guarantee a tag notification.
                </p>
              </div>

              {/* 4. Complete Action Controls */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCard}
                    disabled={isGenerating}
                    className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>Download {mode === 'story' ? 'Story (9:16)' : 'Post (1:1)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="py-3 px-4 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {copiedCaption ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
                    <span>{copiedCaption ? 'Caption Copied!' : 'Copy Caption & Tags'}</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Footer tip */}
        <div className="px-5 py-3 sm:px-6 bg-neutral-950/90 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400 flex-shrink-0">
          <span className="flex items-center gap-1.5 truncate pr-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Tip: In Instagram Stories, add this archive link using the "Link Sticker" for 1-tap friend visits!</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
