import { useEffect } from 'react';
import { Archive, MediaItem } from '../types';

interface DynamicMetaOptions {
  archive: Archive;
  media?: MediaItem[];
}

/**
 * Dynamic Meta-Tag Management System
 * Automatically updates document.title, standard meta descriptions,
 * OpenGraph properties (og:*), Twitter Card tags (twitter:*), and canonical link
 * based on the active archive's specific title, institution, story, and visual assets.
 */
export function useDynamicArchiveMeta({ archive, media }: DynamicMetaOptions) {
  useEffect(() => {
    if (!archive) return;

    // 1. Calculate dynamic title
    const batchYear = archive.batchLabel || `${archive.startYear}–${archive.endYear}`;
    const formattedTitle = `${archive.title} · ${archive.organizationName || 'Class of ' + batchYear} Memory Archive`;
    
    // Save original values for clean restoration on unmount
    const originalTitle = document.title;
    document.title = formattedTitle;

    // 2. Calculate dynamic description
    const metaDescription =
      archive.subtitle?.trim() ||
      archive.settings?.heroSecondaryText?.trim() ||
      archive.settings?.customClosingNote?.trim() ||
      `Explore the digital memory archive for ${archive.title} (${batchYear}) at ${archive.organizationName}. Discover timelines, yearbook portraits, media vaults, and memory notes.`;

    // 3. Determine best image for preview
    const previewImage =
      archive.settings?.groupLogoUrl ||
      (media && media.length > 0 ? media[0].url : '') ||
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80';

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    // Helper to safely set or create standard and open graph meta tags
    const setMetaTag = (attributeName: 'name' | 'property', key: string, content: string) => {
      let tag = document.querySelector(`meta[${attributeName}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attributeName, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // Helper to set or create link tags (e.g. canonical)
    const setLinkTag = (rel: string, href: string) => {
      let tag = document.querySelector(`link[rel="${rel}"]`);
      if (!tag) {
        tag = document.createElement('link');
        tag.setAttribute('rel', rel);
        document.head.appendChild(tag);
      }
      tag.setAttribute('href', href);
    };

    // Apply Standard SEO Meta Tags
    setMetaTag('name', 'description', metaDescription);
    setMetaTag('name', 'author', archive.organizationName || 'OnceHere');
    setMetaTag('name', 'keywords', `${archive.title}, ${archive.organizationName}, class of ${batchYear}, memory archive, digital yearbook, alumni memories`);

    // Apply OpenGraph (Facebook, LinkedIn, Discord, iMessage, WhatsApp)
    setMetaTag('property', 'og:title', `${archive.title} · ${batchYear}`);
    setMetaTag('property', 'og:description', metaDescription);
    setMetaTag('property', 'og:image', previewImage);
    setMetaTag('property', 'og:url', currentUrl);
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('property', 'og:site_name', 'OnceHere');

    // Apply Twitter Cards
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', `${archive.title} · ${batchYear}`);
    setMetaTag('name', 'twitter:description', metaDescription);
    setMetaTag('name', 'twitter:image', previewImage);

    // Apply Canonical Link
    if (currentUrl) {
      setLinkTag('canonical', currentUrl);
    }

    // Cleanup when navigating away or unmounting
    return () => {
      document.title = originalTitle || 'OnceHere · Every chapter deserves a place to live.';
      setMetaTag('name', 'description', 'Build and deploy beautiful digital memory websites for school batches, college classes, sports teams, trips, and communities.');
      setMetaTag('property', 'og:title', 'OnceHere · Digital Memory & Yearbook Platform');
      setMetaTag('property', 'og:description', 'Every chapter deserves a place to live. Create customizable memory archives with timelines, yearbook members, media vaults, and memory walls.');
    };
  }, [archive, media]);
}
