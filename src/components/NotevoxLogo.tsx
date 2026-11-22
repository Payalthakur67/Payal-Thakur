interface NotevoxLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export function NotevoxLogo({ size = 'md' }: NotevoxLogoProps) {
  const boxSize =
    size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-9 h-9 rounded-xl';
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <div
        className={`${boxSize} bg-[#1C1926] flex items-center justify-center relative overflow-hidden shrink-0`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 36 36" className="w-6 h-6" fill="none">
          <rect x="5" y="13" width="4" height="10" rx="2" fill="#F4A6C6" />
          <rect x="11.5" y="8" width="4" height="20" rx="2" fill="#FFD45C" />
          <rect x="18" y="11" width="4" height="14" rx="2" fill="#62B8F5" />
          <rect x="24.5" y="7" width="4" height="22" rx="2" fill="#83D66F" />
          <circle cx="31" cy="18" r="2" fill="#C9B6F5" />
        </svg>
      </div>
      <span
        className={`${textSize} font-bold tracking-tight text-[#1C1926]`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Notevox
      </span>
    </div>
  );
}
