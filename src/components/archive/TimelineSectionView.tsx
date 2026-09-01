import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
  BookOpen,
  Layers,
  ArrowRight,
  Maximize2
} from 'lucide-react';
import { Section, TimelineEvent, TimelineLayout, Archive } from '../../types';
import { FontPreset } from '../../config/themes';
import { LazyImage } from '../common/LazyImage';

interface TimelineSectionViewProps {
  section: Section;
  timeline: TimelineEvent[];
  theme: any;
  activeFontPreset: FontPreset;
  cardBg: string;
  sectionRevealVariants: any;
  staggerGridVariants: any;
  staggerCardVariants: any;
  archive: Archive;
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

export const TimelineSectionView: React.FC<TimelineSectionViewProps> = ({
  section,
  timeline,
  theme,
  activeFontPreset,
  cardBg,
  sectionRevealVariants,
  staggerGridVariants,
  staggerCardVariants,
  archive
}) => {
  // Determine layout from section or archive settings
  const layout: TimelineLayout =
    (section.layout as TimelineLayout) ||
    ((archive.settings as any)?.timelineLayout as TimelineLayout) ||
    'vertical-cinematic';

  // State for horizontal slider
  const [activeSliderIdx, setActiveSliderIdx] = useState(0);
  const sliderScrollRef = useRef<HTMLDivElement>(null);

  // State for active image zoom preview
  const [expandedImage, setExpandedImage] = useState<{ url: string; title: string; location?: string; year?: string } | null>(null);

  const scrollSlider = (direction: 'prev' | 'next') => {
    if (!sliderScrollRef.current) return;
    const container = sliderScrollRef.current;
    const scrollAmount = container.clientWidth * 0.75;
    if (direction === 'prev') {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      setActiveSliderIdx((prev) => Math.max(0, prev - 1));
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setActiveSliderIdx((prev) => Math.min(timeline.length - 1, prev + 1));
    }
  };

  const scrollToMilestone = (idx: number) => {
    setActiveSliderIdx(idx);
    if (!sliderScrollRef.current) return;
    const container = sliderScrollRef.current;
    const cards = container.querySelectorAll('.timeline-slider-card');
    if (cards[idx]) {
      const card = cards[idx] as HTMLElement;
      const centeredLeft = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
      container.scrollTo({ left: Math.max(0, centeredLeft), behavior: 'smooth' });
    }
  };

  if (!timeline || timeline.length === 0) {
    return (
      <motion.section
        id="section-timeline"
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.08 }}
        className="px-4 sm:px-8 max-w-6xl mx-auto py-12 text-center"
      >
        <div className="p-8 rounded-3xl border border-white/10 bg-white/5 max-w-md mx-auto space-y-2">
          <Calendar className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
          <h3 className={`text-xl font-bold ${activeFontPreset.headingClass}`}>No Milestones Yet</h3>
          <p className="text-xs text-neutral-400">Add timeline events from the Studio editor to start building your journey.</p>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      key={section.id}
      id="section-timeline"
      data-timeline-layout={layout}
      variants={sectionRevealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.08, margin: '0px 0px -40px 0px' }}
      className="px-4 sm:px-8 max-w-6xl mx-auto space-y-10 sm:space-y-16 relative"
    >
      {/* Section Header */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <span className="text-xs font-mono uppercase tracking-widest opacity-60">Chronology & Milestones</span>
        <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold ${activeFontPreset.headingClass}`}>
          {section.displayTitle || 'Our Shared Journey'}
        </h2>
        {section.description && (
          <p className={`text-xs sm:text-sm opacity-75 ${activeFontPreset.bodyClass}`}>{section.description}</p>
        )}
      </div>

      {/* ============================================================ */}
      {/* 1. LAYOUT: VERTICAL CINEMATIC (Alternating Desktop Cards)   */}
      {/* ============================================================ */}
      {layout === 'vertical-cinematic' && (
        <div className="relative">
          {/* Central Spine Line on Desktop */}
          <div
            className="hidden md:block absolute left-1/2 top-8 bottom-8 w-[2px] -translate-x-1/2 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, transparent, ${theme.palette.accent}80, ${theme.palette.accent}80, transparent)`
            }}
          />

          {/* Vertical Stream */}
          <motion.div
            variants={staggerGridVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.08, margin: '0px 0px -40px 0px' }}
            className="space-y-12 sm:space-y-20 relative"
          >
            {timeline.map((event, idx) => {
              const isEven = idx % 2 === 0;
              return (
                <motion.div key={event.id} variants={staggerCardVariants} className="relative">
                  {/* Desktop Alternating 2-Column Grid */}
                  <div className="hidden md:grid md:grid-cols-2 md:gap-14 lg:gap-20 items-center relative">
                    {/* Left Column */}
                    {isEven ? (
                      /* Image on Left */
                      <div className="flex justify-end pr-4">
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          onClick={() =>
                            setExpandedImage({
                              url: event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
                              title: event.title,
                              location: event.location,
                              year: event.yearLabel || event.eventDate
                            })
                          }
                          className="w-full max-w-md rounded-2xl overflow-hidden aspect-[4/3] border border-white/15 shadow-2xl group relative cursor-pointer"
                          style={{ borderColor: `${theme.palette.accent}40` }}
                        >
                          <LazyImage
                            src={event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80'}
                            alt={event.title}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-4 flex items-end justify-between text-xs text-white">
                            <span className="font-mono text-xs text-amber-300 font-bold bg-black/80 px-2.5 py-1 rounded-lg backdrop-blur-md border border-amber-400/40 shadow-md">
                              📍 {event.location || event.yearLabel}
                            </span>
                            <span className="font-semibold text-[11px] bg-black/80 px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/20 text-white shadow-md flex items-center gap-1">
                              <Maximize2 className="w-3 h-3" /> View Photo
                            </span>
                          </div>
                        </motion.div>
                      </div>
                    ) : (
                      /* Story Card on Left */
                      <div className="flex justify-end pr-4">
                        <div
                          className={`p-7 sm:p-8 rounded-3xl border ${cardBg} w-full max-w-md shadow-xl hover:shadow-2xl transition-all duration-300 space-y-3 relative group`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase border border-amber-400/40 text-amber-300 bg-amber-400/10">
                              {event.yearLabel}
                            </span>
                            {event.location && (
                              <span className="text-[11px] font-mono opacity-60 flex items-center gap-1">
                                <span>📍</span> {event.location}
                              </span>
                            )}
                          </div>
                          <h3
                            className={`text-xl sm:text-2xl font-bold ${activeFontPreset.headingClass} group-hover:text-amber-300 transition-colors`}
                          >
                            {event.title}
                          </h3>
                          <p className={`text-xs sm:text-sm opacity-85 leading-relaxed ${activeFontPreset.bodyClass}`}>
                            {event.description}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Center Spine Node */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 pointer-events-auto">
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border border-amber-400/50 text-amber-300 bg-neutral-950/95 backdrop-blur-md shadow-xl whitespace-nowrap">
                        {event.yearLabel || event.eventDate}
                      </span>
                      <div
                        className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm shadow-xl transition-transform group-hover:scale-110 bg-neutral-950"
                        style={{ borderColor: theme.palette.accent }}
                      >
                        <span>{event.icon || '📍'}</span>
                      </div>
                    </div>

                    {/* Right Column */}
                    {isEven ? (
                      /* Story Card on Right */
                      <div className="flex justify-start pl-4">
                        <div
                          className={`p-7 sm:p-8 rounded-3xl border ${cardBg} w-full max-w-md shadow-xl hover:shadow-2xl transition-all duration-300 space-y-3 relative group`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase border border-amber-400/40 text-amber-300 bg-amber-400/10">
                              {event.yearLabel}
                            </span>
                            {event.location && (
                              <span className="text-[11px] font-mono opacity-60 flex items-center gap-1">
                                <span>📍</span> {event.location}
                              </span>
                            )}
                          </div>
                          <h3
                            className={`text-xl sm:text-2xl font-bold ${activeFontPreset.headingClass} group-hover:text-amber-300 transition-colors`}
                          >
                            {event.title}
                          </h3>
                          <p className={`text-xs sm:text-sm opacity-85 leading-relaxed ${activeFontPreset.bodyClass}`}>
                            {event.description}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Image on Right */
                      <div className="flex justify-start pl-4">
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          onClick={() =>
                            setExpandedImage({
                              url: event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
                              title: event.title,
                              location: event.location,
                              year: event.yearLabel || event.eventDate
                            })
                          }
                          className="w-full max-w-md rounded-2xl overflow-hidden aspect-[4/3] border border-white/15 shadow-2xl group relative cursor-pointer"
                          style={{ borderColor: `${theme.palette.accent}40` }}
                        >
                          <LazyImage
                            src={event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80'}
                            alt={event.title}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-4 flex items-end justify-between text-xs text-white">
                            <span className="font-mono text-xs text-amber-300 font-bold bg-black/80 px-2.5 py-1 rounded-lg backdrop-blur-md border border-amber-400/40 shadow-md">
                              📍 {event.location || event.yearLabel}
                            </span>
                            <span className="font-semibold text-[11px] bg-black/80 px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/20 text-white shadow-md flex items-center gap-1">
                              <Maximize2 className="w-3 h-3" /> View Photo
                            </span>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>

                  {/* Mobile Stacked Layout (< md) */}
                  <div
                    className="md:hidden relative pl-8 border-l-2 ml-3 space-y-4"
                    style={{ borderColor: `${theme.palette.accent}40` }}
                  >
                    <div
                      className="absolute -left-4 top-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs shadow-md"
                      style={{ backgroundColor: '#141210', borderColor: theme.palette.accent }}
                    >
                      {event.icon || '📍'}
                    </div>
                    <div className={`p-5 rounded-2xl border ${cardBg} space-y-3`}>
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-amber-400/40 text-amber-300 bg-amber-400/10">
                          {event.yearLabel}
                        </span>
                        {event.location && (
                          <span className="text-[10px] font-mono opacity-60">📍 {event.location}</span>
                        )}
                      </div>
                      {event.mediaUrl && (
                        <div
                          onClick={() =>
                            setExpandedImage({
                              url: event.mediaUrl!,
                              title: event.title,
                              location: event.location,
                              year: event.yearLabel
                            })
                          }
                          className="rounded-xl overflow-hidden aspect-video border border-white/10 cursor-pointer relative group"
                        >
                          <LazyImage
                            src={event.mediaUrl}
                            alt={event.title}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                            Tap to view
                          </div>
                        </div>
                      )}
                      <h3 className={`text-lg font-bold ${activeFontPreset.headingClass}`}>{event.title}</h3>
                      <p className={`text-xs opacity-80 leading-relaxed ${activeFontPreset.bodyClass}`}>
                        {event.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. LAYOUT: HORIZONTAL SLIDER (Interactive Carousel Track)    */}
      {/* ============================================================ */}
      {layout === 'horizontal-slider' && (
        <div className="space-y-6 relative">
          {/* Controls Bar & Scrub Chips */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            {/* Quick Milestone Scrub Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {timeline.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToMilestone(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeSliderIdx === idx
                      ? 'bg-amber-400 text-neutral-950 font-bold shadow-lg shadow-amber-400/20'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300'
                  }`}
                >
                  <span>{item.icon || '📍'}</span>
                  <span>{item.yearLabel || `Event ${idx + 1}`}</span>
                </button>
              ))}
            </div>

            {/* Slider Navigation Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono opacity-60 hidden sm:inline mr-2">
                Milestone {activeSliderIdx + 1} of {timeline.length}
              </span>
              <button
                type="button"
                onClick={() => scrollSlider('prev')}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white transition-colors cursor-pointer"
                title="Previous Milestone"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollSlider('next')}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white transition-colors cursor-pointer"
                title="Next Milestone"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Horizontal Track Container */}
          <div
            ref={sliderScrollRef}
            className="flex gap-6 overflow-x-auto pb-6 pt-2 snap-x snap-mandatory scroll-smooth no-scrollbar"
            style={{ scrollbarWidth: 'none' }}
          >
            {timeline.map((event, idx) => (
              <div
                key={event.id}
                className="timeline-slider-card snap-center shrink-0 w-[85vw] sm:w-[420px] md:w-[460px] rounded-3xl border overflow-hidden flex flex-col shadow-2xl transition-transform hover:-translate-y-1 duration-300 group"
                style={{
                  backgroundColor: '#141210',
                  borderColor: activeSliderIdx === idx ? theme.palette.accent : 'rgba(255,255,255,0.12)'
                }}
              >
                {/* Milestone Photo Banner */}
                <div
                  onClick={() =>
                    setExpandedImage({
                      url: event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
                      title: event.title,
                      location: event.location,
                      year: event.yearLabel || event.eventDate
                    })
                  }
                  className="aspect-video w-full relative overflow-hidden bg-neutral-900 cursor-pointer"
                >
                  <LazyImage
                    src={event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80'}
                    alt={event.title}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-4">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold text-amber-300 bg-black/80 border border-amber-400/40 backdrop-blur-md">
                        {event.yearLabel}
                      </span>
                      {event.location && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-neutral-200 bg-black/60 backdrop-blur-md flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400" />
                          {event.location}
                        </span>
                      )}
                    </div>
                    <span className="p-1.5 rounded-lg bg-black/70 text-white/80 group-hover:text-white border border-white/10">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* Milestone Narrative & Content */}
                <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                      <span>{event.icon || '📍'}</span>
                      <span className="font-semibold uppercase tracking-wider">Milestone #{idx + 1}</span>
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-bold text-white ${activeFontPreset.headingClass}`}>
                      {event.title}
                    </h3>
                    <p className={`text-xs sm:text-sm text-neutral-300 opacity-90 leading-relaxed ${activeFontPreset.bodyClass}`}>
                      {event.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400 font-mono">
                    <span>{event.eventDate || event.yearLabel}</span>
                    <span className="text-amber-400/80 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      Explore <span>→</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. LAYOUT: STACKED CARDS (Modern Chronological Bento Grid)   */}
      {/* ============================================================ */}
      {layout === 'stacked-cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {timeline.map((event, idx) => (
            <div
              key={event.id}
              className={`p-6 sm:p-8 rounded-3xl border ${cardBg} shadow-2xl flex flex-col justify-between space-y-5 relative group hover:border-amber-400/40 transition-all`}
            >
              <div className="space-y-4">
                {/* Header ribbon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-sm">
                      {event.icon || '📍'}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border border-amber-400/40 text-amber-300 bg-amber-400/10">
                      {event.yearLabel || event.eventDate}
                    </span>
                  </div>
                  {event.location && (
                    <span className="text-xs font-mono opacity-60 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      {event.location}
                    </span>
                  )}
                </div>

                {/* Photo cover if available */}
                {event.mediaUrl && (
                  <div
                    onClick={() =>
                      setExpandedImage({
                        url: event.mediaUrl!,
                        title: event.title,
                        location: event.location,
                        year: event.yearLabel
                      })
                    }
                    className="aspect-video sm:aspect-[16/10] w-full rounded-2xl overflow-hidden border border-white/10 cursor-pointer relative group/img"
                  >
                    <LazyImage
                      src={event.mediaUrl}
                      alt={event.title}
                      containerClassName="w-full h-full"
                      className="w-full h-full object-cover group-hover/img:scale-106 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5" /> Expand Photo
                    </div>
                  </div>
                )}

                {/* Text Content */}
                <div className="space-y-2">
                  <h3 className={`text-xl sm:text-2xl font-bold ${activeFontPreset.headingClass} group-hover:text-amber-300 transition-colors`}>
                    {event.title}
                  </h3>
                  <p className={`text-xs sm:text-sm opacity-85 leading-relaxed ${activeFontPreset.bodyClass}`}>
                    {event.description}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400 font-mono">
                <span>Milestone {idx + 1}</span>
                <span className="text-amber-400/90 font-medium">Archived Memory</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. LAYOUT: STORY CHAPTERS (Immersive Book/Editorial Style)   */}
      {/* ============================================================ */}
      {layout === 'chapter-story' && (
        <div className="space-y-16 sm:space-y-24">
          {timeline.map((event, idx) => {
            const romanIdx = ROMAN_NUMERALS[idx] || `${idx + 1}`;
            return (
              <div
                key={event.id}
                className="p-8 sm:p-12 rounded-3xl border border-white/15 bg-neutral-950/80 shadow-2xl relative overflow-hidden space-y-8"
              >
                {/* Watermark Roman Numeral */}
                <div className="absolute -right-4 -top-8 text-8xl sm:text-9xl font-serif font-black text-white/5 select-none pointer-events-none">
                  {romanIdx}
                </div>

                {/* Chapter Title Badge */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3.5 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-amber-400 text-neutral-950">
                      Chapter {romanIdx}
                    </span>
                    <span className="text-xs font-mono text-amber-300 font-semibold">
                      {event.yearLabel || event.eventDate}
                    </span>
                  </div>
                  {event.location && (
                    <div className="text-xs font-mono text-neutral-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>

                {/* 2-Column Editorial Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  {/* Left Column: Narrative Story & Quotes */}
                  <div className="lg:col-span-7 space-y-4">
                    <h3 className={`text-2xl sm:text-3xl lg:text-4xl font-bold text-white ${activeFontPreset.headingClass}`}>
                      {event.title}
                    </h3>
                    <p className={`text-sm sm:text-base text-neutral-300 leading-relaxed font-serif opacity-90 ${activeFontPreset.bodyClass}`}>
                      {event.description}
                    </p>
                    <div className="pt-3 flex items-center gap-2 text-xs font-mono text-amber-400/80">
                      <BookOpen className="w-4 h-4" />
                      <span>Documented chapter from our historical journey</span>
                    </div>
                  </div>

                  {/* Right Column: Polaroid / Featured Photo Frame */}
                  <div className="lg:col-span-5 flex justify-center">
                    <div
                      onClick={() =>
                        setExpandedImage({
                          url: event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
                          title: event.title,
                          location: event.location,
                          year: event.yearLabel
                        })
                      }
                      className="w-full max-w-sm p-3 bg-white text-stone-900 rounded-2xl shadow-2xl rotate-1 hover:rotate-0 transition-transform duration-300 cursor-pointer group"
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-neutral-900 relative">
                        <LazyImage
                          src={event.mediaUrl || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80'}
                          alt={event.title}
                          containerClassName="w-full h-full"
                          className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                          Click to expand
                        </div>
                      </div>
                      <div className="pt-3 px-1 flex items-center justify-between text-xs font-serif text-stone-800">
                        <span className="font-bold truncate max-w-[200px]">{event.title}</span>
                        <span className="font-mono text-[11px] text-stone-500">{event.yearLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Zoom Dialog for Timeline Images */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            >
              ✕ Close
            </button>
            <img
              src={expandedImage.url}
              alt={expandedImage.title}
              className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
            <div className="mt-3 text-center space-y-1">
              <h4 className="text-base font-bold text-white">{expandedImage.title}</h4>
              <p className="text-xs text-neutral-400 font-mono">
                {expandedImage.year} {expandedImage.location ? `• 📍 ${expandedImage.location}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
};
