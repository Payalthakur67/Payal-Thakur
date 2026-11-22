import { useState } from 'react';
import { BookOpen, Mic, CalendarCheck } from 'lucide-react';

interface IllustrationFrameProps {
  src: string;
  alt: string;
  fallbackType: 'notes' | 'audio' | 'tasks';
  className?: string;
}

export function IllustrationFrame({
  src,
  alt,
  fallbackType,
  className = '',
}: IllustrationFrameProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    const FallbackIcon =
      fallbackType === 'audio'
        ? Mic
        : fallbackType === 'tasks'
          ? CalendarCheck
          : BookOpen;
    const bgClass =
      fallbackType === 'audio'
        ? 'bg-[#EEF7FE] text-[#145585]'
        : fallbackType === 'tasks'
          ? 'bg-[#F0FAED] text-[#226119]'
          : 'bg-[#FDF2F7] text-[#8E2050]';

    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-[#E8E0D0] ${bgClass} ${className}`}
        role="img"
        aria-label={alt}
      >
        <FallbackIcon className="w-10 h-10 mb-2 opacity-80" />
        <span className="text-xs font-medium opacity-80 px-4 text-center">{alt}</span>
      </div>
    );
  }

  return (
    <div
      className={`group overflow-hidden rounded-2xl border border-[#E5DCCB] bg-[#1C1926]/5 ${className}`}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
      />
    </div>
  );
}
