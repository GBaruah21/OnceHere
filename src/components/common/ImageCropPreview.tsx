import React, { useEffect, useRef, useState } from 'react';

// Crop only on explicit Apply. Cancel never alters the selected file.
export function ImageCropPreview({ src, onApply, onClose }: { src: string; onApply: (src: string) => void; onClose: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previousFocus?.focus();
  }, []);
  const [ratio, setRatio] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState('');
  const [size, setSize] = useState({ width: 1, height: 1 });
  const sourceRatio = size.width / size.height;
  const width = sourceRatio > ratio ? zoom * sourceRatio / ratio * 100 : zoom * 100;
  const height = sourceRatio > ratio ? zoom * 100 : zoom * ratio / sourceRatio * 100;
  const apply = () => {
    try {
      if (!img.current?.naturalWidth) throw new Error('Wait for the image to load.');
      const cropW = Math.min(size.width, size.height * ratio) / zoom;
      const cropH = cropW / ratio;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(Math.min(cropW, 2048));
      canvas.height = Math.round(canvas.width / ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cropping is unavailable in this browser.');
      context.drawImage(img.current, (size.width - cropW) * x / 100, (size.height - cropH) * y / 100, cropW, cropH, 0, 0, canvas.width, canvas.height);
      onApply(canvas.toDataURL('image/jpeg', 0.9));
      onClose();
    } catch {
      setError('Cannot crop this image. For external links, download the image and select the local file instead.');
    }
  };
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label="Preview and crop image" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button, select, input');
      if (!controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
    <div className="bg-neutral-900 text-white rounded-2xl p-4 w-full max-w-lg max-h-[90dvh] overflow-auto space-y-3">
      <div className="flex justify-between items-center"><h3>Preview and crop</h3><button autoFocus type="button" onClick={onClose} className="min-h-11 px-3">Cancel</button></div>
      <div className="relative overflow-hidden bg-black mx-auto" style={{ aspectRatio: ratio, width: `min(100%, ${45 * ratio}vh)` }}>
        <img ref={img} src={src} crossOrigin="anonymous" alt="Crop preview" onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('Image preview could not load. Try a local file.')} style={{ position: 'absolute', width: `${width}%`, height: `${height}%`, maxWidth: 'none', left: `${-(width - 100) * x / 100}%`, top: `${-(height - 100) * y / 100}%` }} />
      </div>
      <label className="block">Shape <select value={ratio} onChange={(event) => setRatio(Number(event.target.value))} className="bg-neutral-800 p-2 ml-2"><option value={1}>Square</option><option value={4 / 3}>Landscape 4:3</option><option value={16 / 9}>Wide 16:9</option><option value={3 / 4}>Portrait 3:4</option></select></label>
      {([{ name: 'Zoom', value: zoom, min: 1, max: 3, step: 0.01, set: setZoom }, { name: 'Horizontal position', value: x, min: 0, max: 100, step: 1, set: setX }, { name: 'Vertical position', value: y, min: 0, max: 100, step: 1, set: setY }]).map(control => <label key={control.name} className="block text-sm">{control.name}<input className="block w-full min-h-11" type="range" min={control.min} max={control.max} step={control.step} value={control.value} onChange={event => control.set(Number(event.target.value))} /></label>)}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <button type="button" onClick={apply} className="w-full min-h-11 bg-amber-400 text-black rounded-xl">Apply crop to selected image</button>
      <p className="text-xs text-neutral-400">This changes the selection, not the original file on your device. Save the memory to keep this crop.</p>
    </div>
  </div>;
}
