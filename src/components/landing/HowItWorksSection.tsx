import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Wand2, Users, Rocket } from 'lucide-react';

interface HowItWorksSectionProps {
  onCreateClick: () => void;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ onCreateClick }) => {
  const steps = [
    {
      step: '01',
      title: 'Initialize in Studio Workspace',
      subtitle: 'No premature domain selection',
      description: 'Set your group name, pick your theme, configure collaboration PINs, and download your secure owner recovery key. Work freely in a private studio workspace.',
      icon: Wand2,
      badge: 'Step 1'
    },
    {
      step: '02',
      title: 'Curate Stories, People & Media',
      subtitle: 'Collaborate with your batch',
      description: 'Add timeline milestones, populate yearbook profiles, upload high-res photo dumps into the vault, and collect memory scribbles from classmates.',
      icon: Users,
      badge: 'Step 2'
    },
    {
      step: '03',
      title: 'Choose Final Address & Deploy',
      subtitle: 'The final step before going live',
      description: 'Pick your permanent path address (e.g. /s/marys-convent-2026), platform subdomain, or custom domain with instant availability verification, then publish in 1-click.',
      icon: Rocket,
      badge: 'Step 3'
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-neutral-950 border-t border-white/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simple 3-Step Flow</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif text-white tracking-tight">
            How It Works
          </h2>
          <p className="text-base sm:text-lg text-neutral-400 font-light">
            You can build, preview, and refine your entire memory website in our studio before choosing a public domain name.
          </p>
        </motion.div>

        {/* 3 Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((s, index) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 1.15, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="relative p-8 rounded-3xl bg-neutral-900/40 border border-white/10 hover:border-amber-500/30 transition-all group flex flex-col justify-between"
              >
                {/* Step badge & number */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl sm:text-4xl font-bold font-serif text-amber-400/40 group-hover:text-amber-400 transition-colors">
                      {s.step}
                    </span>
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold font-serif text-white group-hover:text-amber-300 transition-colors">
                    {s.title}
                  </h3>
                  <div className="text-xs text-amber-400/80 font-medium mb-3">
                    {s.subtitle}
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-400 font-light leading-relaxed">
                    {s.description}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 flex items-center gap-2 text-xs font-semibold text-neutral-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>{s.badge}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Final CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 1.2, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-amber-950/40 via-neutral-900 to-amber-950/40 border border-amber-500/30 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="max-w-2xl mx-auto space-y-4 relative z-10">
            <h3 className="text-2xl sm:text-3xl font-bold font-serif text-white">
              Ready to Give Your Batch Memories a Forever Home?
            </h3>
            <p className="text-sm text-neutral-300 font-light">
              Start building in minutes. No credit card, no complex setups, and no ads.
            </p>
            <div className="pt-4 flex justify-center">
              <button
                onClick={onCreateClick}
                className="px-8 py-4 rounded-2xl text-base font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 hover:brightness-110 shadow-xl shadow-amber-500/25 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer"
              >
                <span>Create Your Archive Now</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
};
