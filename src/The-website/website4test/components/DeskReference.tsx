import { useId } from 'react';

/** S2, the reference "photo" in the example. Drawn rather than photographed so
 * the page ships no unlicensed imagery; swap in an owned or licensed photo of
 * the same subject when one is available. The warm palette belongs to the
 * sample content, never to the interface chrome. */
export function DeskReference({ className }: { className?: string }) {
  const id = useId();
  const wood = `${id}-wood`, light = `${id}-light`, shade = `${id}-shade`, grain = `${id}-grain`;
  return (
    <svg className={className} viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={wood} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5a4636" />
          <stop offset="1" stopColor="#35281f" />
        </linearGradient>
        <radialGradient id={light} cx="0.24" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#ffe6bf" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffe6bf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={shade} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0" />
        </filter>
      </defs>

      <rect width="320" height="220" fill={`url(#${wood})`} />
      <g stroke="#000" strokeOpacity="0.1" strokeWidth="1">
        <path d="M0 44h320M0 97h320M0 151h320M0 198h320" />
      </g>

      {/* notebook and pen */}
      <g transform="rotate(-7 78 128)">
        <rect x="32" y="72" width="92" height="116" rx="4" fill="#000" opacity="0.28" transform="translate(3 5)" />
        <rect x="32" y="72" width="92" height="116" rx="4" fill="#e9e0cc" />
        <rect x="32" y="72" width="9" height="116" rx="3" fill="#c9bea4" />
        <g stroke="#a99d83" strokeWidth="1.4" strokeLinecap="round">
          <path d="M50 92h60M50 104h52M50 116h62M50 128h40M50 148h58M50 160h46" />
        </g>
      </g>
      <g transform="rotate(26 140 160)">
        <rect x="137" y="124" width="6" height="66" rx="3" fill="#1b1b1b" />
        <rect x="137" y="124" width="6" height="14" rx="3" fill="#d2a544" />
      </g>

      {/* laptop, seen from above */}
      <rect x="158" y="62" width="126" height="92" rx="8" fill="#000" opacity="0.3" transform="translate(4 6)" />
      <rect x="158" y="54" width="126" height="10" rx="4" fill="#4a4e53" />
      <rect x="158" y="62" width="126" height="92" rx="8" fill="#2b2e32" />
      <rect x="168" y="72" width="106" height="44" rx="4" fill="#1b1d20" />
      <g stroke="#fff" strokeOpacity="0.07" strokeWidth="5" strokeLinecap="round" strokeDasharray="5 4">
        <path d="M174 80h94M174 90h94M174 100h94M174 110h94" />
      </g>
      <rect x="200" y="124" width="42" height="22" rx="4" fill="#363a3f" />

      {/* mug */}
      <circle cx="274" cy="186" r="21" fill="#000" opacity="0.28" transform="translate(3 4)" />
      <rect x="288" y="180" width="16" height="11" rx="5" fill="#d9d2c3" />
      <circle cx="274" cy="186" r="21" fill="#e0d9ca" />
      <circle cx="274" cy="186" r="15.5" fill="#3a2317" />
      <path d="M264 180a12 12 0 0 1 10-5" stroke="#8a5f44" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* plant */}
      <circle cx="286" cy="30" r="19" fill="#000" opacity="0.25" transform="translate(3 5)" />
      <circle cx="286" cy="30" r="17" fill="#8a6149" />
      <g fill="#6c8c66">
        <ellipse cx="270" cy="20" rx="17" ry="7" transform="rotate(-32 270 20)" />
        <ellipse cx="300" cy="18" rx="16" ry="6.5" transform="rotate(38 300 18)" />
        <ellipse cx="290" cy="46" rx="16" ry="6.5" transform="rotate(74 290 46)" />
      </g>
      <g fill="#58765a">
        <ellipse cx="272" cy="40" rx="15" ry="6" transform="rotate(28 272 40)" />
        <ellipse cx="287" cy="14" rx="13" ry="5.5" transform="rotate(-80 287 14)" />
      </g>

      {/* a sticky note */}
      <g transform="rotate(8 70 36)">
        <rect x="54" y="20" width="32" height="32" fill="#000" opacity="0.22" transform="translate(2 3)" />
        <rect x="54" y="20" width="32" height="32" fill="#dcbf63" />
        <path d="M60 31h20M60 38h14" stroke="#8d7632" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      <rect width="320" height="220" fill={`url(#${light})`} />
      <rect width="320" height="220" fill={`url(#${shade})`} />
      <rect width="320" height="220" filter={`url(#${grain})`} />
    </svg>
  );
}
