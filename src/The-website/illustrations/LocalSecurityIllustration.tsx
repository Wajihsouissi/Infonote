import React from 'react';

export const LocalSecurityIllustration: React.FC<{ className?: string }> = ({ className }) => {
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
        viewBox="0 0 600 600" 
        style={{ width: '100%', maxWidth: '500px', overflow: 'visible' }}
      >
        <defs>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="30" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-green-sm" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Floating Particles */}
        <circle cx="100" cy="90" r="1.5" fill="#10b981" opacity="0.5" />
        <circle cx="360" cy="490" r="3" fill="#10b981" filter="url(#glow-green-sm)" />
        <circle cx="430" cy="190" r="1.5" fill="#fff" opacity="0.6" />

        <g transform="translate(100, 80)">
          {/* Main Card Background */}
          <rect x="0" y="0" width="400" height="400" rx="12" fill="#131414" stroke="#1d2621" strokeWidth="2" />
          
          {/* Central Green Glow */}
          <circle cx="200" cy="180" r="120" fill="#10b981" opacity="0.12" filter="url(#glow-green)" />

          {/* Shield Icon Container */}
          <g transform="translate(160, 40)">
            <rect x="0" y="0" width="80" height="80" rx="24" fill="#0b1b12" stroke="#10b981" strokeWidth="1.5" />
            <g transform="translate(24, 24) scale(1.3)" stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </g>
          </g>

          {/* Texts */}
          <text x="200" y="175" fill="#fff" fontSize="24" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">Saved securely</text>
          <text x="200" y="210" fill="#9ca3af" fontSize="14" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">Encrypted on your local disk</text>

          {/* File Path Pill */}
          <g transform="translate(40, 270)">
            <rect x="0" y="0" width="320" height="50" rx="8" fill="#1a1c1a" stroke="#253028" strokeWidth="1.5" />
            
            {/* Drive Icon */}
            <g transform="translate(15, 14)" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
              <line x1="6" y1="12" x2="18" y2="12" />
            </g>
            
            <text x="50" y="30" fill="#9ca3af" fontSize="13" fontFamily="monospace" letterSpacing="0.5">~/local_data/vault.enc</text>
            
            {/* Padlock Icon */}
            <g transform="translate(275, 14)" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="10" width="14" height="11" rx="2" ry="2" />
              <path d="M7 10V7a5 5 0 0 1 10 0v3" />
            </g>
          </g>
          
          {/* Cursor and User Badge */}
          <g transform="translate(390, 150)" style={{ zIndex: 10 }}>
            <g transform="scale(1.2)" filter="url(#glow-green-sm)">
              <path d="M0,0 L7,18 L11,11 L19,8 Z" fill="#151716" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
            </g>
            <rect x="-8" y="28" width="36" height="18" rx="9" fill="#10b981" />
            <text x="10" y="41" fill="#fff" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="middle">You</text>
          </g>

        </g>
      </svg>
    </div>
  );
};
