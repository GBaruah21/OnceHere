import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  QrCode,
  Sparkles,
  MessageCircle,
  Twitter,
  Linkedin,
  Send,
  Mail,
  Facebook,
  Code,
  ExternalLink,
  Smartphone,
  Instagram,
  Layers
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Archive, MediaItem } from '../../types';
import { THEMES } from '../../config/themes';
import { InstagramStoryModal } from './InstagramStoryModal';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  archive: Archive;
  media?: MediaItem[];
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  archive,
  media = []
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<'share' | 'qr' | 'embed'>('share');
  const [shareUrl, setShareUrl] = useState('');
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [instagramMode, setInstagramMode] = useState<'story' | 'post'>('story');

  const theme = THEMES[archive.themeId] || THEMES['midnight-cinema'];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      const url = archive.slug
        ? `${origin}/s/${archive.slug}`
        : `${origin}${window.location.pathname}`;
      setShareUrl(url);
    }
  }, [archive]);

  if (!isOpen) return null;

  const batchLabel = archive.batchLabel || `${archive.startYear}–${archive.endYear}`;
  const shareText = `Explore "${archive.title}" (${batchLabel}) — Our memories, timeline, and stories on OnceHere!`;

  // Copy to clipboard with visual feedback & confetti
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopied(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 }
      });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleCopyEmbed = async () => {
    const embedCode = `<iframe src="${shareUrl}" width="100%" height="700" frameborder="0" allowfullscreen style="border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.2);"></iframe>`;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2500);
    } catch (err) {
      console.error('Failed to copy embed code:', err);
    }
  };

  // WhatsApp Status copy
  const handleCopyWhatsAppStatus = async () => {
    const statusText = `🎓 ${archive.title} (${batchLabel})\n"${archive.subtitle || 'Every memory etched in stone.'}"\n\nExplore our batch memories & sign the wall:\n${shareUrl}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(statusText);
      }
      setCopiedStatus(true);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      setTimeout(() => setCopiedStatus(false), 2500);

      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.open('whatsapp://send?text=' + encodeURIComponent(statusText), '_blank');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Native Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: archive.title,
          text: shareText,
          url: shareUrl
        });
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  // Share intent links
  const shareChannels = [
    {
      name: 'WhatsApp Chat',
      icon: MessageCircle,
      color: '#25D366',
      bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      action: () => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(
          `✨ *${archive.title}* (${batchLabel})\n_${archive.subtitle || 'Every laughter, milestone, inside joke, and shared memory.'}_\n\n📸 Explore our timeline, photo vault & leave your note on the wall:\n👉 ${shareUrl}`
        )}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    {
      name: 'X (Twitter)',
      icon: Twitter,
      color: '#1DA1F2',
      bgColor: 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30',
      action: () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `Preserving our golden memories from ${archive.organizationName} (${batchLabel}) ✨\n\n"${archive.subtitle || ''}"`
        )}&url=${encodeURIComponent(shareUrl)}&hashtags=OnceHere,ClassOf${archive.endYear}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: '#1877f2',
      bgColor: 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 border-blue-600/30',
      action: () => {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          shareUrl
        )}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    {
      name: 'Telegram',
      icon: Send,
      color: '#0088cc',
      bgColor: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30',
      action: () => {
        const url = `https://t.me/share/url?url=${encodeURIComponent(
          shareUrl
        )}&text=${encodeURIComponent(shareText)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: '#0077b5',
      bgColor: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      action: () => {
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          shareUrl
        )}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    {
      name: 'Email',
      icon: Mail,
      color: '#ea4335',
      bgColor: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30',
      action: () => {
        const subject = encodeURIComponent(`Memory Archive: ${archive.title}`);
        const body = encodeURIComponent(
          `Hey!\n\nCheck out our class memory archive:\n\n${archive.title} (${batchLabel})\n${archive.subtitle || ''}\n\nView memories and sign our memory wall here:\n${shareUrl}\n\nPreserved on OnceHere.`
        );
        window.open(`mailto:?subject=${subject}&body=${body}`);
      }
    }
  ];

  // SVG QR Code generator URL
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    shareUrl
  )}&bgcolor=111728&color=fdfbf7&margin=10`;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div
          className="relative w-full max-w-lg rounded-3xl bg-neutral-900 border border-white/15 text-neutral-100 shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header Banner */}
          <div className="p-6 border-b border-white/10 relative bg-gradient-to-r from-amber-500/10 via-pink-500/5 to-transparent">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Memory Archive</span>
            </div>

            <h3 className="text-xl font-bold font-serif text-white tracking-tight line-clamp-1">
              {archive.title}
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Invite classmates, batchmates, and friends to explore milestones and leave notes.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-white/10 px-6 pt-3 bg-neutral-950/40">
            <button
              onClick={() => setActiveTab('share')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'share'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share & Copy</span>
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'qr'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>
            <button
              onClick={() => setActiveTab('embed')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'embed'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Embed Widget</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {activeTab === 'share' && (
              <div className="space-y-6">
                
                {/* Instagram Story & Post Studio Highlight Box */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-500/15 via-purple-500/10 to-amber-500/10 border border-pink-500/30 flex items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                      <Instagram className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Instagram Story & Post Studio
                      </h4>
                      <p className="text-[11px] text-pink-200/80">
                        Generate 9:16 Story card or 1:1 Post with link stickers!
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setInstagramMode('story');
                        setIsInstagramModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      Story (9:16)
                    </button>
                    <button
                      onClick={() => {
                        setInstagramMode('post');
                        setIsInstagramModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-pink-200 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      Post (1:1)
                    </button>
                  </div>
                </div>

                {/* Primary Copy Link Section */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-300 block">
                    Direct Shareable Link
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-neutral-950 border border-white/10 focus-within:border-amber-400/50 transition-colors w-full overflow-hidden">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 px-3 py-2 bg-transparent text-xs font-mono text-neutral-200 focus:outline-none select-all truncate"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap ${
                        copied
                          ? 'bg-emerald-500 text-black'
                          : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold'
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Native Device Share (if supported) */}
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleNativeShare}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>Share via device apps (Stories, Messages, AirDrop)</span>
                  </button>
                )}

                {/* Quick Social Channels */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-300 block">
                      Quick Share to Socials & Group Chats
                    </label>
                    <button
                      onClick={handleCopyWhatsAppStatus}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedStatus ? <Check className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      <span>{copiedStatus ? 'Status Copied!' : 'Copy WhatsApp Status'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {shareChannels.map((channel) => {
                      const IconComponent = channel.icon;
                      return (
                        <button
                          key={channel.name}
                          onClick={channel.action}
                          className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 cursor-pointer ${channel.bgColor}`}
                        >
                          <IconComponent className="w-4 h-4" />
                          <span>{channel.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Batch Invite Tip */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    <strong>Pro-Tip:</strong> Share this link in your batch WhatsApp group or reunion chat so everyone can view the photo vault and sign the memory wall!
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'qr' && (
              <div className="flex flex-col items-center justify-center space-y-4 py-2 text-center">
                <div className="p-4 bg-[#111728] rounded-3xl border border-amber-500/30 shadow-2xl relative group">
                  <img
                    src={qrApiUrl}
                    alt={`QR code for ${archive.title}`}
                    className="w-48 h-48 rounded-xl object-contain"
                    loading="lazy"
                  />
                </div>

                <div className="space-y-1 max-w-xs">
                  <h4 className="text-sm font-semibold text-white">Scan to Open Archive</h4>
                  <p className="text-xs text-neutral-400">
                    Perfect for displaying at farewell parties, reunion tables, or printing in yearbook margins.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>
                  <a
                    href={qrApiUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={`${archive.slug || 'memory-archive'}-qr.png`}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Download QR</span>
                  </a>
                </div>
              </div>
            )}

            {activeTab === 'embed' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-300 block">
                    HTML Iframe Embed Code
                  </label>
                  <p className="text-xs text-neutral-400">
                    Embed this interactive memory archive inside your school alumni portal, class blog, or personal website.
                  </p>
                  <div className="p-3 rounded-2xl bg-neutral-950 border border-white/10 font-mono text-[11px] text-amber-300/90 break-all leading-relaxed">
                    {`<iframe src="${shareUrl}" width="100%" height="700" frameborder="0" allowfullscreen style="border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.2);"></iframe>`}
                  </div>
                </div>

                <button
                  onClick={handleCopyEmbed}
                  className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedEmbed ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Embed Code Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Embed Code</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-neutral-950/60 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
            <span className="font-mono text-[11px]">
              {archive.visibility === 'private' ? '🔒 PIN-Protected Archive' : '🌐 Public Memory Archive'}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-colors cursor-pointer"
            >
              Done
            </button>
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
};

