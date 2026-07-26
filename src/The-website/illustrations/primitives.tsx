import React from 'react';

/**
 * Shared visual grammar for the marketing "blueprint" illustrations.
 *
 * Every accordion scene is drawn with the same vocabulary:
 *  - an 800x400 frame with a faint technical grid
 *  - "blueprint cards" (card body + raised header band + mono `[X] LABEL`)
 *  - skeleton text lines
 *  - arteries (thin connection paths) with animated flow dots
 *  - viewfinder corner brackets for the focal element of the scene
 *
 * All colors come from design-system.css tokens — never hardcode.
 */

export const VIEW_W = 800;
export const VIEW_H = 400;

/* ── Frame ─────────────────────────────────────────────────────────── */

interface BlueprintFrameProps {
  /** Unique per-illustration prefix for SVG defs ids (all scenes mount at once). */
  idPrefix: string;
  children: React.ReactNode;
}

export const BlueprintFrame: React.FC<BlueprintFrameProps> = ({ idPrefix, children }) => {
  const gridId = `${idPrefix}-grid`;
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <defs>
        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--line)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${gridId})`} />
      {children}
    </svg>
  );
};

/* ── Blueprint card ────────────────────────────────────────────────── */

interface BlueprintCardProps {
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** Mono header label, e.g. "[P] PROJECTS". Omit for a headerless card. */
  label?: string;
  labelColor?: string;
  labelSize?: number;
  labelAnchor?: 'start' | 'middle';
  headerHeight?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  fill?: string;
  headerFill?: string;
  radius?: number;
  /** Renders a pulsing status dot at the right edge of the header. */
  statusDot?: string;
  /** Children draw in card-local coordinates (0,0 = card top-left). */
  children?: React.ReactNode;
}

export const BlueprintCard: React.FC<BlueprintCardProps> = ({
  x = 0,
  y = 0,
  width,
  height,
  label,
  labelColor = 'var(--text-main)',
  labelSize = 10,
  labelAnchor = 'start',
  headerHeight = 24,
  stroke = 'var(--line-strong)',
  strokeWidth = 1,
  dashed = false,
  fill = 'var(--bg-card)',
  headerFill = 'var(--bg-rail)',
  radius = 8,
  statusDot,
  children,
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <rect width={width} height={height} rx={radius} fill={fill} />
    {label && <rect width={width} height={headerHeight} rx={radius} fill={headerFill} />}
    <rect
      width={width}
      height={height}
      rx={radius}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashed ? '4 4' : undefined}
    />
    {label && (
      <text
        x={labelAnchor === 'middle' ? width / 2 : 10}
        y={headerHeight / 2 + labelSize / 2 - 1}
        fill={labelColor}
        fontSize={labelSize}
        fontWeight="bold"
        fontFamily="var(--font-mono)"
        letterSpacing="1.5"
        textAnchor={labelAnchor}
      >
        {label}
      </text>
    )}
    {statusDot && (
      <circle cx={width - 15} cy={headerHeight / 2} r="4" fill={statusDot}>
        <animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    )}
    {children}
  </g>
);

/* ── Skeleton text line ────────────────────────────────────────────── */

interface SkeletonLineProps {
  x: number;
  y: number;
  width: number;
  height?: number;
  fill?: string;
  opacity?: number;
}

export const SkeletonLine: React.FC<SkeletonLineProps> = ({
  x,
  y,
  width,
  height = 4,
  fill = 'var(--line-strong)',
  opacity,
}) => <rect x={x} y={y} width={width} height={height} rx={height / 2} fill={fill} opacity={opacity} />;

/* ── Arteries + flow dots ──────────────────────────────────────────── */

interface FlowPathProps {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  dashed?: boolean;
}

export const FlowPath: React.FC<FlowPathProps> = ({
  d,
  stroke = 'var(--line-strong)',
  strokeWidth = 1,
  opacity,
  dashed = false,
}) => (
  <path
    d={d}
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    opacity={opacity}
    strokeDasharray={dashed ? '4 4' : undefined}
  />
);

interface FlowDotProps {
  path: string;
  dur: string;
  fill?: string;
  r?: number;
  begin?: string;
}

export const FlowDot: React.FC<FlowDotProps> = ({ path, dur, fill = 'var(--accent)', r = 2.5, begin }) => (
  <circle r={r} fill={fill}>
    <animateMotion path={path} dur={dur} begin={begin} repeatCount="indefinite" />
  </circle>
);

/* ── Viewfinder corner brackets ────────────────────────────────────── */

interface CornerBracketsProps {
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
  inset?: number;
  stroke?: string;
}

/** Square blueprint brackets framing the focal element of a scene. */
export const CornerBrackets: React.FC<CornerBracketsProps> = ({
  x,
  y,
  width,
  height,
  size = 10,
  inset = 10,
  stroke = 'var(--accent)',
}) => {
  const x0 = x - inset;
  const y0 = y - inset;
  const x1 = x + width + inset;
  const y1 = y + height + inset;
  return (
    <g fill="none" stroke={stroke} strokeWidth="2" opacity="0.8">
      <path d={`M ${x0} ${y0 + size} L ${x0} ${y0} L ${x0 + size} ${y0}`} />
      <path d={`M ${x1 - size} ${y0} L ${x1} ${y0} L ${x1} ${y0 + size}`} />
      <path d={`M ${x0} ${y1 - size} L ${x0} ${y1} L ${x0 + size} ${y1}`} />
      <path d={`M ${x1 - size} ${y1} L ${x1} ${y1} L ${x1} ${y1 - size}`} />
    </g>
  );
};

/* ── Mono caption ──────────────────────────────────────────────────── */

interface MonoLabelProps {
  x: number;
  y: number;
  children: React.ReactNode;
  fill?: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export const MonoLabel: React.FC<MonoLabelProps> = ({
  x,
  y,
  children,
  fill = 'var(--text-soft)',
  size = 11,
  anchor = 'start',
}) => (
  <text
    x={x}
    y={y}
    fill={fill}
    fontSize={size}
    fontWeight="bold"
    fontFamily="var(--font-mono)"
    letterSpacing="1.5"
    textAnchor={anchor}
  >
    {children}
  </text>
);
