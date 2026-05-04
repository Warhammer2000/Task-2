import { useMemo } from "react";

interface VMaskAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

/**
 * Deterministic V-mask SVG avatar.
 * Hue/accent are derived from a stable hash of the seed string,
 * so the same user always gets the same mask color.
 */
export function VMaskAvatar({ seed, size = 40, className }: VMaskAvatarProps) {
  const { hue, accentHue } = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return { hue: h % 360, accentHue: (h * 7) % 360 };
  }, [seed]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="User avatar"
      className={className}
    >
      <defs>
        <linearGradient id={`bg-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 60%, 12%)`} />
          <stop offset="100%" stopColor={`hsl(${accentHue}, 50%, 6%)`} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="6" fill={`url(#bg-${seed})`} />
      {/* Stylized V-mask: forehead + eyes + chin point */}
      <path
        d="M14 18 L32 12 L50 18 L48 28 L32 26 L16 28 Z"
        fill={`hsl(${hue}, 80%, 70%)`}
        opacity="0.92"
      />
      <circle cx="24" cy="33" r="3" fill={`hsl(${accentHue}, 90%, 60%)`} />
      <circle cx="40" cy="33" r="3" fill={`hsl(${accentHue}, 90%, 60%)`} />
      <path
        d="M22 42 Q32 56 42 42 L32 50 Z"
        fill={`hsl(${hue}, 70%, 55%)`}
        opacity="0.9"
      />
    </svg>
  );
}
