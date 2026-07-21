import React from 'react';

export const NodeConnectionsIllustration: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div 
      className={className} 
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg 
        viewBox="0 0 800 600" 
        style={{ width: '100%', maxWidth: '700px', overflow: 'visible' }}
      >
        <defs>
          <filter id="glow-pink" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="30" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-orange-sm" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="conn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#f95d2e" />
          </linearGradient>
        </defs>

        {/* Floating Particles */}
        <circle cx="210" cy="400" r="3" fill="#f95d2e" opacity="0.8" filter="url(#glow-orange-sm)" />
        <circle cx="680" cy="180" r="2.5" fill="#f43f5e" opacity="0.9" filter="url(#glow-orange-sm)" />
        <circle cx="300" cy="180" r="1.5" fill="#fff" opacity="0.4" />

        {/* Node 1: User Interview */}
        <g transform="translate(180, 150)">
          <rect x="0" y="0" width="220" height="170" rx="12" fill="#151416" stroke="#2c2a2e" strokeWidth="1.5" />
          
          {/* Header */}
          <g transform="translate(15, 20)">
            <g transform="scale(0.85)" stroke="#f95d2e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
            </g>
            <text x="30" y="14" fill="#fff" fontSize="14" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">User Interview</text>
          </g>

          {/* Dummy content */}
          <rect x="15" y="60" width="180" height="4" rx="2" fill="#3a383d" />
          <rect x="15" y="75" width="120" height="4" rx="2" fill="#3a383d" />

          {/* Active Block */}
          <g transform="translate(15, 100)">
            <rect x="0" y="0" width="190" height="50" rx="8" fill="#201519" stroke="#f43f5e" strokeWidth="1" />
            <rect x="15" y="18" width="120" height="6" rx="3" fill="#f43f5e" />
            <rect x="15" y="32" width="60" height="6" rx="3" fill="#a03445" />
            
            {/* Output Port */}
            <rect x="185" y="20" width="10" height="10" rx="3" fill="#f43f5e" />
          </g>
          
          {/* Cursor */}
          <g transform="translate(100, 75)" style={{ zIndex: 10 }}>
            <g transform="scale(1.2)" filter="url(#glow-orange-sm)">
              <path d="M0,0 L7,18 L11,11 L19,8 Z" fill="#151416" stroke="#f43f5e" strokeWidth="1.5" strokeLinejoin="round" />
            </g>
          </g>
        </g>

        {/* Connection Line */}
        <path d="M 385 275 C 440 275, 440 375, 505 375" fill="none" stroke="url(#conn-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 8" />

        {/* Node 2: Launch Plan */}
        <g transform="translate(500, 210)">
          <rect x="0" y="0" width="230" height="220" rx="12" fill="#131113" stroke="#38252a" strokeWidth="1.5" />
          
          {/* Pink Glow Behind */}
          <circle cx="115" cy="110" r="110" fill="#f43f5e" opacity="0.12" filter="url(#glow-pink)" />
          
          {/* Header */}
          <g transform="translate(15, 20)">
            <g transform="scale(0.85)" stroke="#f43f5e" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18M7 16l4-4 4 4 4-8" />
            </g>
            <text x="32" y="14" fill="#fff" fontSize="14" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Launch Plan</text>
          </g>

          {/* Dummy blocks */}
          <rect x="15" y="60" width="200" height="50" rx="6" fill="#1e1b1e" />
          <rect x="30" y="75" width="160" height="6" rx="3" fill="#3a383d" />
          <rect x="30" y="90" width="90" height="6" rx="3" fill="#3a383d" />

          {/* Connected Block */}
          <g transform="translate(15, 130)">
            <rect x="0" y="0" width="200" height="70" rx="8" fill="#28171e" stroke="#f43f5e" strokeWidth="1.5" />
            {/* Input Port */}
            <rect x="-5" y="30" width="10" height="10" rx="3" fill="#f95d2e" />
            
            <rect x="20" y="18" width="130" height="6" rx="3" fill="#fff" />
            <text x="20" y="48" fill="#f43f5e" fontSize="12" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">New Feature</text>
            
            {/* Avatar Pill */}
            <rect x="165" y="30" width="22" height="22" rx="6" fill="#f95d2e" />
            <text x="176" y="45" fill="#fff" fontSize="11" fontWeight="800" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">J</text>
          </g>
        </g>

      </svg>
    </div>
  );
};
