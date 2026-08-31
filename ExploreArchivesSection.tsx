import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Compass, ExternalLink, Users, Calendar, Sparkles } from 'lucide-react';
import { Archive, ArchiveType } from '../../types';
import { THEMES } from '../../config/themes';

interface ExploreArchivesSectionProps {
  archives: Archive[];
  onSelectArchive: (archive: Archive) => void;
  onCreateClick: () => void;
}

export const ExploreArchivesSection: React.FC<ExploreArchivesSectionProps> = ({
  archives,
  onSelectArchive,
  onCreateClick
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  const filteredArchives = archives.filter((a) => {
    const matchesSearch =
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.organizationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedType === 'all' || a.archiveType === selectedType;

    return matchesSearch && matchesType;
  });

  const filterTabs = [
    { id: 'all', label: 'All Archives' },
    { id: 'school', label: 'Schools' },
    { id: 'college', label: 'Colleges' },
    { id: 'university', label: 'Universities' },
    { id: 'trip', label: 'Trips & Expeditions' },
    { id: 'team', label: 'Teams' }
  ];

  return (
    <section id="explore" className="py-24 bg-neutral-950 border-t border-white/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row items-start md:items-end justify-between mb-12 gap-6"
        >
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              <span>Community Showcase</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold font-serif text-white tracking-tight">
              Explore Live Memory Archives
            </h2>
            <p className="text-sm sm:text-base text-neutral-400 font-light">
              Discover how graduating classes, student societies, travel groups, and teams capture their journeys on OnceHere.
            </p>
          </div>

          {/* Search bar */}
          <div className="w-full md:w-80 relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by school, class or name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/50"
            />
          </div>
        </motion.div>

        {/* Filter Pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap gap-2 mb-10 overflow-x-auto pb-2"
        >
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                selectedType === tab.id
                  ? 'bg-amber-400 text-neutral-950 font-semibold shadow-md shadow-amber-400/10'
                  : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Archives Grid */}
        {filteredArchives.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArchives.map((archive, i) => {
              const theme = THEMES[archive.themeId] || THEMES['midnight-cinema'];
              return (
                <motion.div
                  key={archive.id}
                  initial={{ opacity: 0, y: 35 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 1.1, delay: (i % 3) * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onSelectArchive(archive)}
                  className="group p-6 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900 border border-white/10 hover:border-amber-500/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-2xl hover:shadow-black/70 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Theme indicator & Year */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-neutral-300 border border-white/10">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: theme.palette.accent }}
                        />
                        <span>{theme.name}</span>
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{archive.startYear === archive.endYear ? archive.startYear : `${archive.startYear}–${archive.endYear}`}</span>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold font-serif text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                      {archive.title}
                    </h3>
                    <div className="text-xs text-neutral-400 font-medium mt-1 mb-3">
                      {archive.organizationName}
                    </div>

                    <p className="text-xs text-neutral-300/80 font-light leading-relaxed line-clamp-2">
                      {archive.subtitle || 'A digital memory sanctuary celebrating unforgettable moments and shared friendships.'}
                    </p>
                  </div>

                  {/* Footer metadata */}
                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>{archive.membersCount ?? archive.approxPeopleCount ? `${archive.membersCount ?? archive.approxPeopleCount} Yearbook Members` : 'Class Archive'}</span>
                    </div>

                    <span className="inline-flex items-center gap-1 font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
                      <span>View Archive</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 p-8 rounded-2xl bg-white/[0.02] border border-white/10">
            <p className="text-neutral-400 text-sm">No archives found matching "{searchQuery}".</p>
            <button
              onClick={onCreateClick}
              className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-400 text-neutral-950 cursor-pointer"
            >
              Create the first archive for this category
            </button>
          </div>
        )}

      </div>
    </section>
  );
};
