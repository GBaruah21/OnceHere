import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Image as ImageIcon } from 'lucide-react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'auto' | string;
  fallbackSrc?: string;
  showSkeleton?: boolean;
}

const DEFAULT_MEMORY_FALLBACK = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80';

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  aspectRatio,
  fallbackSrc = DEFAULT_MEMORY_FALLBACK,
  showSkeleton = true,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>(src || fallbackSrc);
  const [triedFallback, setTriedFallback] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc);
    setIsLoaded(false);
    setHasError(false);
    setTriedFallback(false);
  }, [src, fallbackSrc]);

  // Check if image is already cached/complete on mount
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [currentSrc]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    setHasError(false);
    if (props.onLoad) {
      props.onLoad(e);
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!triedFallback && fallbackSrc && currentSrc !== fallbackSrc) {
      setTriedFallback(true);
      setCurrentSrc(fallbackSrc);
    } else {
      setHasError(true);
      setIsLoaded(true);
    }
    if (props.onError) {
      props.onError(e);
    }
  };

  return (
    <div className={`${/(^|\s)(absolute|fixed|sticky)(\s|$)/.test(containerClassName) ? '' : 'relative'} overflow-hidden ${containerClassName}`}>
      {/* Shimmer / Skeleton Placeholder while approaching viewport or loading */}
      {showSkeleton && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center pointer-events-none z-0">
          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_1.8s_infinite]" />
        </div>
      )}

      {/* Styled Memory Fallback State if network fails entirely */}
      {hasError ? (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-amber-950/40 border border-white/10 flex flex-col items-center justify-center text-amber-200/80 p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-2 shadow-inner">
            <ImageIcon className="w-5 h-5 text-amber-400" />
          </div>
          <span className="text-xs font-serif font-bold text-amber-100 line-clamp-1">{alt || 'Memory Moment'}</span>
          <span className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            <span>Image could not load</span>
          </span>
        </div>
      ) : (
        <img
          {...props}
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
          className={`transition-opacity duration-300 ${className}`}
        />
      )}
    </div>
  );
};
