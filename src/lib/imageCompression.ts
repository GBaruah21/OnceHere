const MB = 1024 * 1024;

export const IMAGE_SOURCE_LIMIT_BYTES = 10 * MB;
export const VIDEO_SOURCE_LIMIT_BYTES = 20 * MB;
export const IMAGE_COMPRESSION_TARGET_BYTES = 1.25 * MB;
const MAX_IMAGE_DIMENSION = 2048;

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

export async function compressImageForUpload(file: File): Promise<File> {
  // Animated GIFs would be flattened by canvas, so preserve them as supplied.
  if (file.type === 'image/gif') return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    if (file.size <= 1 * MB && scale === 1) return file;

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
    while (blob.size > IMAGE_COMPRESSION_TARGET_BYTES && quality > 0.7) {
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
