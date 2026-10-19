const MB = 1024 * 1024;

export const IMAGE_SOURCE_LIMIT_BYTES = 10 * MB;
export const VIDEO_SOURCE_LIMIT_BYTES = 20 * MB;
export const IMAGE_COMPRESSION_TARGET_BYTES = 0.75 * MB;
const MAX_IMAGE_DIMENSION = 1600;
export const THUMBNAIL_MAX_DIMENSION = 480;

const ORIGINAL_UPLOAD_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif'
]);

export function canUploadOriginalImage(file: Pick<File, 'type'>): boolean {
  return ORIGINAL_UPLOAD_IMAGE_TYPES.has(file.type.toLowerCase());
}

function outputName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '') || 'memory'}.webp`;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('This browser could not compress the image.')),
      'image/webp',
      quality
    );
  });
}

export type CompressionProfile = { maxDimension: number; targetBytes: number; minQuality: number };
export const DEFAULT_COMPRESSION_PROFILE: CompressionProfile = {
  maxDimension: MAX_IMAGE_DIMENSION, targetBytes: IMAGE_COMPRESSION_TARGET_BYTES, minQuality: 0.6
};
// Yearbook portraits are only shown as small cards and a modest detail view, so
// they do not need full-photo resolution (a 250-person yearbook adds up fast).
export const PORTRAIT_COMPRESSION_PROFILE: CompressionProfile = {
  maxDimension: 800, targetBytes: 0.15 * MB, minQuality: 0.5
};

export async function compressImageForUpload(file: File, profile: CompressionProfile = DEFAULT_COMPRESSION_PROFILE): Promise<File> {
  // Animated GIFs would be flattened by canvas, so preserve them as supplied.
  if (file.type === 'image/gif') return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    const scale = Math.min(1, profile.maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    // Re-encoding an already-small image adds visible waiting without a useful
    // bandwidth saving.
    if (file.size <= profile.targetBytes && scale === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('This browser could not prepare the image.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.86;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > profile.targetBytes && quality > profile.minQuality) {
      quality -= 0.05;
      blob = await canvasToBlob(canvas, quality);
    }

    // Compression must actually save space; otherwise retain the original.
    if (blob.size >= file.size) return file;
    return new File([blob], outputName(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Small WebP copy (max 480px, usually 20-60 KB) used for grid tiles so visitors
 * only download the full photo when they open it. Returns null if anything fails;
 * the full image is then used in the grid exactly as before.
 */
export async function createImageThumbnail(file: File): Promise<File | null> {
  if (file.type === 'image/gif') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, 0.72);
    // Not worth a second object if it is not clearly smaller.
    if (blob.size >= file.size * 0.8) return null;
    return new File([blob], `thumb-${outputName(file.name)}`, { type: 'image/webp', lastModified: file.lastModified });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
