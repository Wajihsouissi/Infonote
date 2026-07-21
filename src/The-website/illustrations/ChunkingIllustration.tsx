import React from 'react';

export const ChunkingIllustration: React.FC = () => {
  return (
    <svg viewBox="0 0 800 800" style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <defs>
        <filter id="chunk-glow-orange" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="chunk-glow-light" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="chunk-btn-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f95d2e" />
          <stop offset="100%" stopColor="#fca048" />
        </linearGradient>
      </defs>

      <g transform="translate(100, 60) scale(1) rotate(-1.5) skewY(1)">
        {/* Main Card Background */}
        <rect x="0" y="0" width="600" height="680" rx="16" fill="#181515" stroke="#f95d2e" strokeWidth="1" strokeOpacity="0.4" />
        
        {/* Outer Glow */}
        <rect x="0" y="0" width="600" height="680" rx="16" fill="none" stroke="#f95d2e" strokeWidth="4" opacity="0.08" filter="url(#chunk-glow-orange)" />

        <g transform="translate(40, 50)">
          {/* Header */}
          <g>
            {/* File Icon */}
            <rect x="0" y="0" width="20" height="26" rx="4" fill="none" stroke="#ddd" strokeWidth="2.5" />
            <path d="M12 0v8h8" fill="none" stroke="#ddd" strokeWidth="2.5" />
            {/* Title */}
            <text x="36" y="21" fill="#fff" fontSize="26" fontWeight="800" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="-0.5">Q3 Master Document</text>
          </g>

          {/* Mouse and Tooltip */}
          <g transform="translate(240, 20)">
            <rect x="0" y="0" width="165" height="30" rx="10" fill="url(#chunk-btn-grad)" filter="url(#chunk-glow-light)" />
            <rect x="10" y="12" width="6" height="6" rx="1" fill="#fff" />
            <text x="24" y="19" fill="#fff" fontSize="12" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Double-click to explore</text>
            
            {/* Cursor */}
            <g transform="translate(-15, -30) scale(1.2)">
              <path d="M0,0 L8,20 L12,12 L20,8 Z" fill="#fff" stroke="#f95d2e" strokeWidth="1.5" filter="url(#chunk-glow-light)" />
            </g>
          </g>

          {/* Top CHUNKED Block */}
          <g transform="translate(0, 80)">
            <rect x="0" y="0" width="520" height="100" rx="8" fill="none" stroke="#333" strokeWidth="1.5" strokeDasharray="6 6" />
            <rect x="15" y="15" width="80" height="24" rx="12" fill="#221918" />
            <text x="23" y="31" fill="#d95e42" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="0.5">CHUNKED</text>
            <rect x="15" y="60" width="420" height="8" rx="4" fill="#252528" />
            <rect x="15" y="80" width="320" height="8" rx="4" fill="#252528" />
          </g>

          {/* Chunk It Button */}
          <g transform="translate(180, 210)">
            <rect x="-6" y="-6" width="162" height="52" rx="10" fill="none" stroke="#444" strokeWidth="1.5" />
            <rect x="0" y="0" width="150" height="40" rx="8" fill="url(#chunk-btn-grad)" filter="url(#chunk-glow-light)" />
            
            {/* Scissors */}
            <g transform="translate(22, 10) scale(0.9)" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="18" r="3" fill="none" />
              <circle cx="18" cy="18" r="3" fill="none" />
              <path d="M8 15L20 4 M16 15L4 4" />
            </g>
            
            <text x="52" y="25" fill="#fff" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif">Chunk It</text>
          </g>

          {/* READY TO CHUNK Block */}
          <g transform="translate(0, 290)">
            <rect x="0" y="0" width="520" height="100" rx="8" fill="#221514" stroke="#f95d2e" strokeWidth="1.5" filter="url(#chunk-glow-light)" />
            <rect x="15" y="15" width="135" height="24" rx="12" fill="#3a221a" />
            <text x="23" y="31" fill="#fca048" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="0.5">READY TO CHUNK</text>
            <rect x="15" y="60" width="420" height="8" rx="4" fill="#3c2621" />
            <rect x="15" y="80" width="230" height="8" rx="4" fill="#3c2621" />
          </g>

          {/* Bottom CHUNKED Block */}
          <g transform="translate(0, 420)">
            <rect x="0" y="0" width="520" height="110" rx="8" fill="none" stroke="#333" strokeWidth="1.5" strokeDasharray="6 6" />
            <rect x="15" y="15" width="80" height="24" rx="12" fill="#181822" />
            <text x="23" y="31" fill="#585a82" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="0.5">CHUNKED</text>
            
            <rect x="15" y="55" width="490" height="40" rx="6" fill="#1a1a1f" stroke="#222" strokeWidth="1" />
            
            {/* Image icon */}
            <g transform="translate(250, 66) scale(0.9)" stroke="#445" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </g>
          </g>

        </g>
      </g>
    </svg>
  );
};
