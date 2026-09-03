import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Wand2,
  X,
  Check,
  Quote,
  Calendar,
  User,
  MessageSquare,
  Tag,
  Loader2,
  AlertCircle,
  Copy,
  RefreshCw,
  Camera,
  Plus
} from 'lucide-react';
import { ArchiveType, ThemeId } from '../../types';

export interface ImageAnalysisData {
  caption: string;
  detectedMood: string;
  memoryNote: string;
  quote: string;
  suggestedMilestoneTitle: string;
  suggestedRole: string;
  tags: string[];
  altText: string;
}

interface ImageAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  archiveType?: ArchiveType;
  themeId?: ThemeId;
  initialImageUrl?: string;
  initialContextHint?: string;
  onApplyToVault?: (url: string, caption: string, tags?: string[]) => void;
  onApplyToWall?: (text: string, authorName?: string, mediaUrl?: string) => void;
  onApplyToTimeline?: (title: string, desc: string, mediaUrl?: string, icon?: string) => void;
  onApplyToMember?: (quote: string, role: string, imageUrl?: string) => void;
}

const SAMPLE_PRESET_IMAGES = [
  {
    label: 'Canteen Chai Session',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80',
    hint: 'Friends having cutting chai and samosas near college canteen'
  },
  {
    label: 'Late Night Hackathon Lab',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    hint: 'Students working late together on laptops in computer lab'
  },
  {
    label: 'Convocation Cap Toss',
    url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80',
    hint: 'Graduation day batch tossing mortarboard caps into the sky'
  },
  {
    label: 'Sports Tournament Victory',
    url: 'https://images.unsplash.com/photo-1526676037777-05a232554f77?auto=format&fit=crop&w=800&q=80',
    hint: 'College team celebrating trophy on basketball court'
  }
];

export const ImageAnalyzerModal: React.FC<ImageAnalyzerModalProps> = ({
  isOpen,
  onClose,
  archiveType = 'college',
  initialImageUrl = '',
  initialContextHint = '',
  onApplyToVault,
  onApplyToWall,
  onApplyToTimeline,
  onApplyToMember
}) => {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>(initialImageUrl);
  const [contextHint, setContextHint] = useState(initialContextHint);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysisData | null>(null);
  const [appliedAction, setAppliedAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageUrl(initialImageUrl);
    setPreviewDataUrl(initialImageUrl);
    setContextHint(initialContextHint);
    setRevisionInstruction('');
    setAnalysis(null);
    setErrorMsg(null);
  }, [initialImageUrl, initialContextHint, isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreviewDataUrl(dataUrl);
      setImageUrl('');
      // Trigger automatic analysis
      triggerAnalysis(dataUrl, contextHint);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPreviewDataUrl(dataUrl);
        setImageUrl('');
        triggerAnalysis(dataUrl, contextHint);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerAnalysis = async (imgSource: string, hint?: string) => {
    if (!imgSource || !imgSource.trim()) {
      setErrorMsg('Please select or upload an image to analyze.');
      return;
    }

    try {
      setIsAnalyzing(true);
      setErrorMsg(null);
      setAppliedAction(null);

      const res = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imgSource,
          contextHint: hint || contextHint,
          archiveType
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze memory image.');
      }

      setAnalysis(data.analysis);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while analyzing image.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectSample = (sample: typeof SAMPLE_PRESET_IMAGES[0]) => {
    setImageUrl(sample.url);
    setPreviewDataUrl(sample.url);
    setSelectedFile(null);
    setContextHint(sample.hint);
    triggerAnalysis(sample.url, sample.hint);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setAppliedAction(`Copied ${label} to clipboard!`);
    setTimeout(() => setAppliedAction(null), 2500);
  };

  const activeImg = previewDataUrl || imageUrl;

  const generateAnotherVersion = () => {
    const previousSuggestion = analysis
      ? `Previous suggestion: "${analysis.caption}". Create a clearly different version without losing the real event details.`
      : '';
    const refinement = revisionInstruction.trim()
      ? `Creator's requested change: ${revisionInstruction.trim()}`
      : 'Create a fresh alternative caption with a different wording and emotional angle.';
    triggerAnalysis(activeImg, [contextHint.trim(), previousSuggestion, refinement].filter(Boolean).join('\n'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-neutral-900 border border-white/15 rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl shadow-black/90 overflow-hidden sm:my-6 max-h-[100dvh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif text-white">AI Image Memory Analyzer</h2>
              <p className="text-[11px] text-neutral-400">
                Upload any photograph to auto-generate nostalgic captions, memory notes, yearbook quotes & milestones
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content grid */}
        <div className="p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 flex-1 min-h-0 overflow-y-auto">
          
          {/* Left Column: Image input & Preview */}
          <div className="md:col-span-5 space-y-4">
            
            {/* Drop / Upload zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative aspect-[4/3] rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-4 text-center cursor-pointer overflow-hidden group ${
                activeImg
                  ? 'border-amber-400/40 bg-neutral-950'
                  : 'border-white/20 hover:border-amber-400/50 bg-neutral-950/50 hover:bg-white/5'
              }`}
            >
              {activeImg ? (
                <>
                  <img
                    src={activeImg}
                    alt="Analyzed memory"
                    className="w-full h-full object-cover rounded-xl transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1.5 p-2">
                    <Upload className="w-5 h-5 text-amber-400" />
                    <span>Click or drop to replace photo</span>
                  </div>
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-amber-300 gap-2">
                      <div className="relative">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                        <Sparkles className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-200" />
                      </div>
                      <span className="text-xs font-mono tracking-wider animate-pulse">Analyzing with Gemini AI...</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2 text-neutral-400">
                  <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-amber-400">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-semibold text-neutral-200">
                    Drop photo here or <span className="text-amber-400 underline">browse</span>
                  </div>
                  <div className="text-[10px] text-neutral-500">Supports JPG, PNG, WebP</div>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            {/* URL input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-300">Or Paste Image URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setPreviewDataUrl(e.target.value);
                  }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => triggerAnalysis(imageUrl)}
                  disabled={!imageUrl.trim() || isAnalyzing}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-neutral-950 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </div>
            </div>

            {/* Creator context clue input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-300">Tell AI what this photo is</label>
              <textarea
                value={contextHint}
                onChange={(e) => setContextHint(e.target.value)}
                rows={2}
                placeholder="e.g. Teachers’ Day celebration, farewell group photo, first college trip"
                className="w-full px-3 py-1.5 rounded-xl bg-neutral-950 border border-white/15 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-neutral-500">AI uses this clue together with the photograph instead of guessing the occasion alone.</p>
            </div>

            {/* Sample presets */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
                Try Sample Batch Memories:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SAMPLE_PRESET_IMAGES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => handleSelectSample(sample)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-amber-400/15 border border-white/10 hover:border-amber-400/30 text-left transition-all text-[11px] text-neutral-300 hover:text-white cursor-pointer"
                  >
                    <div className="font-semibold truncate">{sample.label}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: AI Analysis Results & 1-Click Action Dispatchers */}
          <div className="md:col-span-7 space-y-4">
            
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {appliedAction && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{appliedAction}</span>
              </div>
            )}

            {!analysis && !isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-neutral-400 space-y-3 bg-neutral-950/40 rounded-2xl border border-white/5">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-white">Select or Upload a Photo</div>
                <p className="text-xs text-neutral-400 max-w-sm font-light">
                  Gemini multimodal vision will automatically read the photo, extract candid emotions, and craft memory captions, quotes, tags, and timeline stories.
                </p>
              </div>
            )}

            {isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-neutral-950/40 rounded-2xl border border-white/5">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                <div className="space-y-1">
                  <div className="text-sm font-bold font-serif text-white">Analyzing Emotion & Moment...</div>
                  <p className="text-xs text-neutral-400">Generating yearbook quotes, captions, tags, and memory stories</p>
                </div>
              </div>
            )}

            {analysis && !isAnalyzing && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                
                {/* Detected Mood & Tags Header */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Detected Atmosphere</div>
                    <div className="text-sm font-bold text-white font-serif">{analysis.detectedMood}</div>
                  </div>
                  <button
                    type="button"
                    onClick={generateAnotherVersion}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>New Version</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-400/25 space-y-2">
                  <label className="text-[11px] font-semibold text-purple-200">What should AI change?</label>
                  <textarea
                    value={revisionInstruction}
                    onChange={(e) => setRevisionInstruction(e.target.value)}
                    rows={2}
                    placeholder="e.g. make it shorter, more emotional, funnier, or mention Teachers’ Day"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-purple-400/25 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-purple-400"
                  />
                  <button
                    type="button"
                    onClick={generateAnotherVersion}
                    disabled={!activeImg || isAnalyzing}
                    className="w-full py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-100 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Generate another version
                  </button>
                </div>

                {/* 1. Evocative Caption (Media Vault) */}
                <div className="p-3.5 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Memory Vault Caption</span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyText(analysis.caption, 'Caption')}
                        className="p-1 rounded text-neutral-400 hover:text-white text-[10px] flex items-center gap-1 bg-white/5 hover:bg-white/10"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                      {onApplyToVault && (
                        <button
                          type="button"
                          onClick={() => {
                            onApplyToVault(activeImg, analysis.caption, analysis.tags);
                            setAppliedAction('Added photo and caption to Media Vault!');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-[10px] flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Add to Vault</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed font-light">{analysis.caption}</p>
                </div>

                {/* 2. Memory Wall Story Entry */}
                <div className="p-3.5 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Memory Wall Story / Scribble</span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyText(analysis.memoryNote, 'Story')}
                        className="p-1 rounded text-neutral-400 hover:text-white text-[10px] flex items-center gap-1 bg-white/5 hover:bg-white/10"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                      {onApplyToWall && (
                        <button
                          type="button"
                          onClick={() => {
                            onApplyToWall(analysis.memoryNote, 'Classmate Memory', activeImg);
                            setAppliedAction('Posted memory story to the Memory Wall!');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-[10px] flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Post to Wall</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-300 italic font-serif leading-relaxed">“{analysis.memoryNote}”</p>
                </div>

                {/* 3. Yearbook Quote & Role */}
                <div className="p-3.5 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Quote className="w-3.5 h-3.5" />
                      <span>Yearbook Quote & Role</span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyText(`${analysis.quote} (${analysis.suggestedRole})`, 'Quote')}
                        className="p-1 rounded text-neutral-400 hover:text-white text-[10px] flex items-center gap-1 bg-white/5 hover:bg-white/10"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                      {onApplyToMember && (
                        <button
                          type="button"
                          onClick={() => {
                            onApplyToMember(analysis.quote, analysis.suggestedRole, activeImg);
                            setAppliedAction('Added yearbook portrait and quote to Members directory!');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-[10px] flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Add to Yearbook</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                      {analysis.suggestedRole}
                    </span>
                    <span className="text-xs text-white font-medium">{analysis.quote}</span>
                  </div>
                </div>

                {/* 4. Timeline Milestone Event */}
                <div className="p-3.5 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Timeline Milestone Title</span>
                    </span>
                    {onApplyToTimeline && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyToTimeline(analysis.suggestedMilestoneTitle, analysis.caption, activeImg, '📍');
                          setAppliedAction('Added event to Archive Timeline Journey!');
                        }}
                        className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-[10px] flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Add to Journey</span>
                      </button>
                    )}
                  </div>
                  <div className="text-xs font-bold text-white">{analysis.suggestedMilestoneTitle}</div>
                </div>

                {/* 5. Hashtags */}
                <div className="flex flex-wrap gap-1.5 items-center pt-1">
                  <Tag className="w-3 h-3 text-neutral-400" />
                  {analysis.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-neutral-300"
                    >
                      #{tag.replace(/\s+/g, '')}
                    </span>
                  ))}
                </div>

              </div>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5 text-amber-400/80">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Powered by Gemini 3.7 Flash Multimodal Vision</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
