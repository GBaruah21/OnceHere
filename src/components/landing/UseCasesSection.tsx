import React from 'react';
import { motion } from 'motion/react';
import {
  GraduationCap,
  Building2,
  Users2,
  Trophy,
  Plane,
  HeartHandshake,
  Briefcase,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { ArchiveType } from '../../types';

interface UseCasesSectionProps {
  onSelectType: (type: ArchiveType) => void;
}

export const UseCasesSection: React.FC<UseCasesSectionProps> = ({ onSelectType }) => {
  const useCases = [
    {
      type: 'school' as ArchiveType,
      title: 'School Batches',
      subtitle: 'Class of 2026, High School Chapters',
      description: 'Ten to twelve years of childhood mischief, morning prayers, tiffin trades, sports days, and lifelong friendships.',
      icon: GraduationCap,
      badge: 'Most Popular',
      accentColor: 'from-amber-500/20 to-orange-500/10',
      borderColor: 'group-hover:border-amber-500/40',
      iconColor: 'text-amber-400'
    },
    {
      type: 'college' as ArchiveType,
      title: 'College Batches',
      subtitle: 'Engineering, Medicine, Arts & Commerce',
      description: 'Canteen debates, hostel corridors, proxy attendance, semester exams, and late-night project submissions.',
      icon: Building2,
      badge: 'Batch Fav',
      accentColor: 'from-cyan-500/20 to-blue-500/10',
      borderColor: 'group-hover:border-cyan-500/40',
      iconColor: 'text-cyan-400'
    },
    {
      type: 'university' as ArchiveType,
      title: 'University Departments',
      subtitle: 'Postgrads, Research Labs & Cohorts',
      description: 'Thesis milestones, international conferences, lab coffee runs, campus strolls, and collaborative breakthrough stories.',
      icon: BookOpen,
      badge: 'Academic',
      accentColor: 'from-indigo-500/20 to-purple-500/10',
      borderColor: 'group-hover:border-indigo-500/40',
      iconColor: 'text-indigo-400'
    },
    {
      type: 'team' as ArchiveType,
      title: 'Sports & Athletic Teams',
      subtitle: 'Tournaments, Rosters & Champions',
      description: 'Game-winning goals, locker room speeches, championship trophies, rigorous practice sessions, and team pride.',
      icon: Trophy,
      badge: 'Dynamic',
      accentColor: 'from-yellow-500/20 to-amber-500/10',
      borderColor: 'group-hover:border-yellow-500/40',
      iconColor: 'text-yellow-400'
    },
    {
      type: 'trip' as ArchiveType,
      title: 'Trips & Expeditions',
      subtitle: 'Goa Summer, Backpacking & Roadtrips',
      description: 'Sunset drives, campfire acoustics, beach polaroids, spontaneous detours, and the unforgettable journeys shared.',
      icon: Plane,
      badge: 'Adventures',
      accentColor: 'from-rose-500/20 to-pink-500/10',
      borderColor: 'group-hover:border-rose-500/40',
      iconColor: 'text-rose-400'
    },
    {
      type: 'workplace' as ArchiveType,
      title: 'Office & Product Teams',
      subtitle: 'Founding Crews, Hackathons & Offsites',
      description: 'Product launches, sprint retrospectives, team offsites, coffee room banter, and company milestones celebrated together.',
      icon: Briefcase,
      badge: 'Teams',
      accentColor: 'from-emerald-500/20 to-teal-500/10',
      borderColor: 'group-hover:border-emerald-500/40',
      iconColor: 'text-emerald-400'
    },
    {
      type: 'reunion' as ArchiveType,
      title: 'Alumni Reunions',
      subtitle: '10-Year, 25-Year Silver Jubilee & Beyond',
      description: 'Rekindling old connections, revisiting cherished memories, honoring teachers, and comparing then vs. now.',
      icon: HeartHandshake,
      badge: 'Timeless',
      accentColor: 'from-amber-600/20 to-red-500/10',
      borderColor: 'group-hover:border-amber-600/40',
      iconColor: 'text-amber-500'
    },
    {
      type: 'club' as ArchiveType,
      title: 'Clubs, Societies & Bands',
      subtitle: 'Drama, Robotics, Music & Debate',
      description: 'Auditorium rehearsals, hackathon victories, late night jam sessions, and building passions outside the curriculum.',
      icon: Users2,
      badge: 'Community',
      accentColor: 'from-fuchsia-500/20 to-purple-500/10',
      borderColor: 'group-hover:border-fuchsia-500/40',
      iconColor: 'text-fuchsia-400'
    }
  ];

  return (
    <section id="use-cases" className="py-20 bg-neutral-950/60 border-t border-b border-white/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto mb-14 space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Versatile Memory Builder</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif text-white tracking-tight">
            Crafted for Every Group That Shared a Story
          </h2>
          <p className="text-base sm:text-lg text-neutral-400 font-light">
            Whether your journey spanned twelve years of school or five days on a mountain roadtrip, create a dedicated digital sanctuary for your collective memories.
          </p>
        </motion.div>

        {/* 4-column Grid with Staggered Fade-in-up */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {useCases.map((uc, index) => {
            const Icon = uc.icon;
            return (
              <motion.div
                key={uc.type}
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 1.1, delay: (index % 4) * 0.1, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onSelectType(uc.type)}
                className={`group relative p-6 rounded-2xl bg-gradient-to-b ${uc.accentColor} bg-neutral-900/60 border border-white/10 ${uc.borderColor} backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 cursor-pointer flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${uc.iconColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10">
                      {uc.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold font-serif text-white group-hover:text-amber-300 transition-colors">
                    {uc.title}
                  </h3>
                  <div className="text-xs text-neutral-400 font-medium mb-3">
                    {uc.subtitle}
                  </div>
                  <p className="text-xs text-neutral-300/80 font-light leading-relaxed">
                    {uc.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-amber-400 group-hover:translate-x-0.5 transition-transform">
                  <span>Start with this template</span>
                  <span>→</span>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
