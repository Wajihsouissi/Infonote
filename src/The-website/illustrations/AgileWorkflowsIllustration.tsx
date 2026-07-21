import React from 'react';
import { BlueprintFrame, BlueprintCard, SkeletonLine, FlowPath, FlowDot, CornerBrackets, MonoLabel } from './primitives';

/**
 * Agile workflows scene: a Kanban board where tasks stream from backlog
 * through an in-progress focus column into completion.
 */

const BRIDGES = [
  { d: 'M 260 140 C 290 140, 290 140, 320 140', dur: '1s' },
  { d: 'M 260 250 C 290 250, 290 250, 320 250', dur: '1.2s' },
  { d: 'M 480 160 C 510 160, 510 160, 540 160', dur: '0.8s' },
  { d: 'M 480 270 C 510 270, 510 270, 540 270', dur: '1.4s' },
];

/** A muted board column: raised panel, centered mono header, dashed separator. */
const Column: React.FC<{ x: number; y: number; height: number; label: string; children?: React.ReactNode }> = ({
  x,
  y,
  height,
  label,
  children,
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <rect width="160" height={height} rx="12" fill="var(--bg-raised)" />
    <rect width="160" height={height} rx="12" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
    <MonoLabel x={80} y={32} size={10} anchor="middle">
      {label}
    </MonoLabel>
    <line x1="20" y1="46" x2="140" y2="46" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="2 4" />
    {children}
  </g>
);

/** A small backlog task card: colored tag, two text lines, status dot. */
const TaskCard: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <BlueprintCard x={x} y={y} width={120} height={70}>
    <rect x="15" y="15" width="40" height="6" rx="3" fill={color} />
    <SkeletonLine x={15} y={32} width={80} />
    <SkeletonLine x={15} y={44} width={60} />
    <circle cx="100" cy="55" r="5" fill={color} />
  </BlueprintCard>
);

/** A finished task card: check mark plus faded text lines. */
const DoneCard: React.FC<{ x: number; y: number; opacity: number; lines: [number, number] }> = ({
  x,
  y,
  opacity,
  lines,
}) => (
  <g opacity={opacity}>
    <BlueprintCard x={x} y={y} width={120} height={60}>
      <path d="M 12 30 L 22 40 L 42 20" fill="none" stroke="var(--text-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <SkeletonLine x={55} y={24} width={lines[0]} />
      <SkeletonLine x={55} y={34} width={lines[1]} />
    </BlueprintCard>
  </g>
);

export const AgileWorkflowsIllustration: React.FC = () => (
  <BlueprintFrame idPrefix="aw">
    {/* Connective data bridges */}
    <g opacity="0.6">
      {BRIDGES.map(({ d }) => (
        <FlowPath key={d} d={d} />
      ))}
    </g>
    <g opacity="0.7">
      {BRIDGES.map(({ d, dur }) => (
        <path key={d} d={d} fill="none" stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="4 16">
          <animate attributeName="stroke-dashoffset" values="20;0" dur={dur} repeatCount="indefinite" />
        </path>
      ))}
    </g>
    <FlowDot path={BRIDGES[0].d} dur="1.5s" fill="var(--secondary)" />
    <FlowDot path={BRIDGES[2].d} dur="1.8s" fill="var(--secondary)" />

    {/* Backlog column */}
    <Column x={100} y={60} height={280} label="[K] BACKLOG">
      <TaskCard x={20} y={70} color="var(--accent)" />
      <TaskCard x={20} y={160} color="var(--secondary)" />
    </Column>

    {/* In-progress column: the focal point of the scene */}
    <g transform="translate(320, 50)">
      <rect width="160" height="300" rx="12" fill="var(--bg-raised)" />
      <rect width="160" height="300" rx="12" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
      <CornerBrackets x={0} y={0} width={160} height={300} inset={0} size={16} stroke="var(--text-main)" />

      <line x1="20" y1="56" x2="140" y2="56" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="2 4" />

      {/* Active spinner next to header */}
      <g transform="translate(25, 38)">
        <animateTransform attributeName="transform" type="rotate" values="0;360" dur="3s" repeatCount="indefinite" />
        <circle cx="0" cy="0" r="5" fill="none" stroke="var(--text-main)" strokeWidth="1" strokeDasharray="6 4" />
        <circle cx="0" cy="0" r="2" fill="var(--text-main)" />
      </g>
      <MonoLabel x={85} y={42} size={11} anchor="middle" fill="var(--text-main)">
        [K] IN_PROGRESS
      </MonoLabel>

      {/* Detailed active card with scanning bounding box */}
      <g transform="translate(10, 80)">
        <rect x="0" y="0" width="140" height="130" rx="10" fill="var(--bg-inset)" stroke="var(--text-main)" strokeWidth="1" strokeDasharray="4 6">
          <animate attributeName="stroke-dashoffset" values="20;0" dur="2s" repeatCount="indefinite" />
        </rect>

        <BlueprintCard x={5} y={5} width={130} height={120}>
          {/* Priority tags */}
          <rect x="10" y="10" width="45" height="8" rx="4" fill="var(--secondary)" />
          <rect x="60" y="10" width="25" height="8" rx="4" fill="var(--line-strong)" />

          {/* Title lines */}
          <SkeletonLine x={10} y={27} width={100} />
          <SkeletonLine x={10} y={37} width={70} opacity={0.6} />

          {/* Mini sparkline chart */}
          <g transform="translate(10, 55)">
            <rect x="0" y="-10" width="110" height="30" rx="4" fill="var(--bg-inset)" />
            <path d="M 5 15 L 20 10 L 40 18 L 60 5 L 80 12 L 105 2" fill="none" stroke="var(--accent)" strokeWidth="1" />
            <circle cx="105" cy="2" r="2.5" fill="var(--accent)" />
          </g>

          {/* Progress + avatars */}
          <g transform="translate(10, 100)">
            <SkeletonLine x={0} y={4} width={70} />
            <SkeletonLine x={0} y={4} width={45} fill="var(--accent)" />
            <circle cx="95" cy="6" r="6" fill="var(--line-strong)" />
            <circle cx="105" cy="6" r="6" fill="var(--line-strong)" />
            <circle cx="105" cy="6" r="6" fill="none" stroke="var(--bg-card)" strokeWidth="1.5" />
          </g>
        </BlueprintCard>
      </g>

      {/* Secondary active task */}
      <BlueprintCard x={15} y={230} width={130} height={50}>
        <rect x="10" y="12" width="30" height="6" rx="3" fill="var(--text-main)" />
        <SkeletonLine x={10} y={26} width={80} height={3} />
        <SkeletonLine x={10} y={35} width={50} height={3} />
        <circle cx="115" cy="25" r="4" fill="var(--secondary)" />
      </BlueprintCard>
    </g>

    {/* Completed column */}
    <Column x={540} y={60} height={280} label="[K] COMPLETED">
      <DoneCard x={20} y={70} opacity={0.8} lines={[50, 30]} />
      <DoneCard x={20} y={150} opacity={0.6} lines={[45, 20]} />
    </Column>
  </BlueprintFrame>
);
