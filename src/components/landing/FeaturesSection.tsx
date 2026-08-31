import React from 'react';
import { motion } from 'motion/react';
import {
  Globe,
  Palette,
  Users,
  Milestone,
  BookUser,
  Image as ImageIcon,
  MessageSquareHeart,
  KeyRound,
  History,
  Smartphone,
  Eye,
  ShieldCheck
} from 'lucide-react';

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      icon: Globe,
      title: 'Custom Memory Address',
      description: 'Your unique permanent address on the web (e.g. /s/marys-convent-2026) with optional wildcard subdomain and custom domains.',
      tag: 'Multi-Tenant'
    },
    {
      icon: Palette,
      title: 'Five Distinct Visual Themes',
      description: 'Midnight Cinema, Aurora Glass, Paper & Polaroids, Neon Afterglow, and Forest Chronicle with refined tokens and textures.',
      tag: 'Aesthetic'
    },
    {
      icon: KeyRound,
      title: 'PIN-Protected Collaboration',
      description: 'Invite classmates and team members to contribute photos, stories, and notes using a secure 4 or 6-digit access PIN.',
      tag: 'Security'
    },
    {
      icon: Milestone,
      title: 'Cinematic Timeline Builder',
      description: 'Chronicle milestones across one or several years with photos, locations, tags, and multiple layout styles.',
      tag: 'Storytelling'
    },
    {
      icon: BookUser,
      title: 'Yearbook & People Directory',
      description: 'Searchable member cards with quotes, nicknames, social links, and the ability to send public or private memory messages.',
      tag: 'Yearbook'
    },
    {
      icon: ImageIcon,
      title: 'High-Res Media Vault',
      description: 'Organize high-resolution photos and video clips into albums with full-screen lightbox viewing and download permissions.',
      tag: 'Vault'
    },
    {
      icon: MessageSquareHeart,
      title: 'Interactive Memory Wall',
      description: 'A nostalgic board of notes, polaroids, and farewell messages with customizable card styles, likes, and creator moderation.',
      tag: 'Community'
    },
    {
      icon: History,
      title: 'Version History & Snapshots',
      description: 'Every major edit generates a lightweight revision snapshot so you can preview past states and undo accidental changes.',
      tag: 'Reliability'
    },
    {
      icon: Eye,
      title: 'Full Preview Before Domain Claim',
      description: 'Build, write, and customize your entire website in an interactive studio before picking your final public address.',
      tag: 'Workflow'
    },
    {
      icon: ShieldCheck,
      title: 'Cryptographic Owner Recovery',
      description: 'No password fatigue or email lockouts. Owners receive a dedicated, downloadable cryptographic recovery key.',
      tag: 'Privacy'
    },
    {
      icon: Smartphone,
      title: 'Mobile-First Experience',
      description: 'Every memory site is fully optimized for phones, tablets, and desktops with 44px touch targets and safe-area support.',
      tag: 'Responsive'
    },
    {
      icon: Users,
      title: 'Granular Privacy Modes',
      description: 'Toggle between Public, Unlisted (link-only), and Private (Viewer PIN protected) modes with complete data separation.',
      tag: 'Control'
    }
  ];

  return (
    <section id="features" className="py-24 bg-neutral-950/80 border-t border-white/5 relative overflow-hidden">
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
            <span>Built for Everlasting Memories</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif text-white tracking-tight">
            Everything You Need to Honor Your Journey
          </h2>
          <p className="text-base sm:text-lg text-neutral-400 font-light">
            Engineered with deep multi-tenant data isolation, fast loading speeds, and thoughtful design for groups of any size.
          </p>
        </motion.div>

        {/* 3-column Grid with Staggered Fade-in-up */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 1.1, delay: (i % 3) * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-amber-500/30 transition-all duration-300 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-white/5 text-neutral-400 border border-white/5">
                      {f.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold font-serif text-white group-hover:text-amber-300 transition-colors">
                    {f.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-2 font-light leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
