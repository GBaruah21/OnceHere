import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  Instagram,
  Twitter,
  MessageCircle,
  Facebook,
  Send,
  Linkedin,
  Mail,
  QrCode,
  Sparkles,
  Smartphone,
  Layers,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Archive, MediaItem } from '../../types';
import { THEMES } from '../../config/themes';
import { InstagramStoryModal } from './InstagramStoryModal';

interface PreConfiguredShareBarProps {
  archive: Archive;
  media?: MediaItem[];
  variant?: 'hero' | 'floating' | 'card' | 'minimal';
  onOpenGeneralShare?: () => void;
  onOpenQr?: () => void;
}

export const PreConfiguredShareBar: React.FC<PreConfiguredShareBarProps> = ({
  archive,
  media = [],
  variant = 'card',
  onOpenGeneralShare,
  onOpenQr
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [instagramMode, setInstagramMode] = useState<'story' | 'post'>('story');
  const [showMoreChannels, setShowMoreChannels] = useState(false);

  const theme = THEMES[archive.themeId] || THEMES['midnight-cinema'];

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = archive.slug ? `${origin}/s/${archive.slug}` : (typeof window !== 'undefined' ? window.location.href : '');

  const batchYearText = archive.batchLabel || `${archive.startYear}–${archive.endYear}`;
  
  // Custom pre-configured messages using current archive title and link
  const cleanTitle = archive.title;
  const cleanSubtitle = archive.subtitle || 'Every laughter, inside joke, and memory etched in stone.';
  
  // WhatsApp Chat prefilled text
  const whatsappChatMessage = `✨ *${cleanTitle}* (${batchYearText})\n_${cleanSubtitle}_\n\n📸 Explore our batch timeline, photo vault & leave your note on the memory wall here:\n👉 ${shareUrl}\n\n_Preserved forever on OnceHere._`;

  // WhatsApp Status text
  const whatsappStatusText = `🎓 ${cleanTitle} (${batchYearText})\n"${cleanSubtitle}"\n\nLink to explore our memories & sign the wall:\n${shareUrl}`;

  // Twitter / X text
  const tweetText = `Preserving our golden memories from ${archive.organizationName} (${batchYearText}) ✨\n\n"${cleanSubtitle}"\n\nExplore the interactive archive & photo vault:\n${shareUrl}\n\n#ClassOf${archive.endYear} #AlumniArchive #OnceHere`;

  // Copy Link Handler
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopied(true);
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.2 }
      });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  // WhatsApp Chat Trigger
  const handleShareWhatsAppChat = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappChatMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // WhatsApp Status Copy & Prompt
  const handleShareWhatsAppStatus = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(whatsappStatusText);
      }
      setCopiedStatus(true);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      setTimeout(() => setCopiedStatus(false), 2500);

      // On mobile, also try opening whatsapp
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.open('whatsapp://send?text=' + encodeURIComponent(whatsappStatusText), '_blank');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Twitter / X Trigger
  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Facebook Trigger
  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(`${cleanTitle} - ${cleanSubtitle}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Telegram Trigger
  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${cleanTitle} (${batchYearText}) - ${cleanSubtitle}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // LinkedIn Trigger
  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Open Instagram Modal with specific mode
  const openInstagramStudio = (m: 'story' | 'post') => {
    setInstagramMode(m);
    setIsInstagramModalOpen(true);
  };

  // 1. HERO VARIANT (Inline glowing pill hub)
  if (variant === 'hero') {
    return (
      <>
        <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-neutral-900/70 border border-white/15 backdrop-blur-xl shadow-2xl space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span>Share Archive with Classmates & Batch</span>
            </div>
            <span className="text-[11px] font-mono opacity-60 text-white">
              1-Click Pre-Configured Share
            </span>
          </div>

          {/* Primary Quick Platform Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Instagram Story */}
            <button
              onClick={() => openInstagramStudio('story')}
              className="p-2.5 rounded-2xl bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-amber-500/20 hover:from-pink-500/30 hover:to-amber-500/30 border border-pink-500/30 text-pink-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm group"
            >
              <Instagram className="w-4 h-4 group-hover:scale-110 transition-transform text-pink-400" />
              <span>IG Stories</span>
            </button>

            {/* WhatsApp Chat */}
            <button
              onClick={handleShareWhatsAppChat}
              className="p-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm group"
            >
              <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform text-emerald-400" />
              <span>WhatsApp</span>
            </button>

            {/* Twitter / X */}
            <button
              onClick={handleShareTwitter}
              className="p-2.5 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm group"
            >
              <Twitter className="w-4 h-4 group-hover:scale-110 transition-transform text-sky-400" />
              <span>Twitter / X</span>
            </button>

            {/* Facebook */}
            <button
              onClick={handleShareFacebook}
              className="p-2.5 rounded-2xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-600/30 text-blue-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm group"
            >
              <Facebook className="w-4 h-4 group-hover:scale-110 transition-transform text-blue-400" />
              <span>Facebook</span>
            </button>
          </div>

          {/* Secondary Options Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => openInstagramStudio('post')}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>IG Post (1:1)</span>
              </button>

              <button
                onClick={handleShareWhatsAppStatus}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copiedStatus ? 'Status Copied!' : 'WhatsApp Status'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>

              {onOpenQr && (
                <button
                  onClick={onOpenQr}
                  title="Show QR Code"
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <InstagramStoryModal
          isOpen={isInstagramModalOpen}
          onClose={() => setIsInstagramModalOpen(false)}
          archive={archive}
          media={media}
          defaultMode={instagramMode}
        />
      </>
    );
  }

  // 2. CARD VARIANT (For Closing section or dedicated share block)
  return (
    <>
      <div className="p-6 sm:p-8 rounded-3xl border border-white/15 bg-neutral-900/90 text-white shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative space-y-2 text-center max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Share2 className="w-3.5 h-3.5" />
            <span>Pass On The Memories</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">
            Share <span className="italic text-amber-300">"{archive.title}"</span>
          </h3>

          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-light">
            Every memory deserves an audience. Send this link into your batch group chats, Instagram stories, or alumni feeds so everyone can sign the wall and relive the good days.
          </p>
        </div>

        {/* Big Pre-Configured Social Channels */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative">
          
          {/* Instagram Story & Post */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-pink-500/15 via-purple-500/10 to-transparent border border-pink-500/30 flex flex-col justify-between space-y-3 group hover:border-pink-400/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <Instagram className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wide">Instagram</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">Stories & Highlights</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">9:16 Story Card & 1:1 Post</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={() => openInstagramStudio('story')}
                className="py-1.5 px-2 rounded-lg bg-pink-500 hover:bg-pink-600 text-white font-bold text-[11px] transition-all cursor-pointer text-center"
              >
                Story
              </button>
              <button
                onClick={() => openInstagramStudio('post')}
                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-pink-200 font-semibold text-[11px] transition-all cursor-pointer text-center"
              >
                Post
              </button>
            </div>
          </div>

          {/* WhatsApp Chat & Status */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 flex flex-col justify-between space-y-3 group hover:border-emerald-400/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-black shadow-md">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">WhatsApp</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">Batch Chats & Status</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">Pre-formatted batch message</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={handleShareWhatsAppChat}
                className="py-1.5 px-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-[11px] transition-all cursor-pointer text-center"
              >
                Group Chat
              </button>
              <button
                onClick={handleShareWhatsAppStatus}
                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-emerald-200 font-semibold text-[11px] transition-all cursor-pointer text-center"
              >
                {copiedStatus ? 'Copied!' : 'Status'}
              </button>
            </div>
          </div>

          {/* Twitter / X */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-sky-500/15 via-sky-500/5 to-transparent border border-sky-500/30 flex flex-col justify-between space-y-3 group hover:border-sky-400/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center text-black shadow-md">
                <Twitter className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">Twitter / X</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">Post Milestone</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">Prefilled with class tags</p>
            </div>
            <button
              onClick={handleShareTwitter}
              className="w-full py-1.5 px-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-black font-bold text-[11px] transition-all cursor-pointer text-center"
            >
              Compose Tweet
            </button>
          </div>

          {/* Facebook & Direct URL */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-blue-600/15 via-blue-600/5 to-transparent border border-blue-600/30 flex flex-col justify-between space-y-3 group hover:border-blue-400/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                <Facebook className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">Facebook</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">Feed & Alumni Group</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">Share directly with friends</p>
            </div>
            <button
              onClick={handleShareFacebook}
              className="w-full py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-all cursor-pointer text-center"
            >
              Share on FB
            </button>
          </div>

        </div>

        {/* Quick Link Copy Field */}
        <div className="p-1.5 sm:p-2 rounded-2xl bg-neutral-950/90 border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 focus-within:border-amber-400/50 transition-colors w-full overflow-hidden">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="min-w-0 flex-1 px-3 py-2 bg-transparent text-xs font-mono text-neutral-300 focus:outline-none select-all truncate"
          />
          <button
            onClick={handleCopyLink}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-md ${
              copied
                ? 'bg-emerald-500 text-black'
                : 'bg-amber-400 hover:bg-amber-300 text-neutral-950'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Archive Link'}</span>
          </button>
        </div>

        {/* More Platforms Accordion */}
        <div className="pt-1">
          <button
            onClick={() => setShowMoreChannels(!showMoreChannels)}
            className="text-xs font-semibold text-neutral-400 hover:text-white flex items-center gap-1.5 mx-auto transition-colors cursor-pointer"
          >
            <span>{showMoreChannels ? 'Hide additional share options' : 'More platforms (Telegram, LinkedIn, Email, QR)'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreChannels ? 'rotate-180' : ''}`} />
          </button>

          {showMoreChannels && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 animate-in fade-in duration-200">
              <button
                onClick={handleShareTelegram}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-blue-400" />
                <span>Telegram</span>
              </button>

              <button
                onClick={handleShareLinkedIn}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Linkedin className="w-3.5 h-3.5 text-indigo-400" />
                <span>LinkedIn</span>
              </button>

              <button
                onClick={() => {
                  const subject = encodeURIComponent(`Memory Archive: ${cleanTitle}`);
                  const body = encodeURIComponent(`Hey!\n\nCheck out our memory archive:\n\n${cleanTitle} (${batchYearText})\n${cleanSubtitle}\n\nExplore memories and sign our memory wall here:\n${shareUrl}`);
                  window.open(`mailto:?subject=${subject}&body=${body}`);
                }}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-rose-400" />
                <span>Email</span>
              </button>

              {onOpenQr && (
                <button
                  onClick={onOpenQr}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>Scan QR Code</span>
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      <InstagramStoryModal
        isOpen={isInstagramModalOpen}
        onClose={() => setIsInstagramModalOpen(false)}
        archive={archive}
        media={media}
        defaultMode={instagramMode}
      />
    </>
  );
};
