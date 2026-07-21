import React from 'react';
import { BlueprintFrame, BlueprintCard, SkeletonLine, FlowPath, FlowDot } from './primitives';

/**
 * P.A.R.A. second-brain routing scene: four method quadrants exchanging
 * knowledge packets with a central brain hub.
 */
export const ParaMethodIllustration: React.FC = () => (
  <BlueprintFrame idPrefix="para">
    {/* Central routing hub */}
    <circle cx="400" cy="200" r="160" fill="var(--bg-inset)" />

    {/* Data arteries */}
    <FlowPath d="M 400 200 C 400 100, 330 100, 260 100" />
    <FlowPath d="M 400 200 C 400 300, 330 300, 260 300" />
    <FlowPath d="M 400 200 C 400 100, 470 100, 540 100" />
    <FlowPath d="M 400 200 C 400 300, 470 300, 540 300" />

    {/* Flow packets: P / A / R stream in, Archives stream out */}
    <FlowDot path="M 260 100 C 330 100, 400 100, 400 200" dur="1.2s" />
    <FlowDot path="M 260 300 C 330 300, 400 300, 400 200" dur="2.5s" />
    <FlowDot path="M 540 100 C 470 100, 400 100, 400 200" dur="1.8s" />
    <FlowDot path="M 400 200 C 400 300, 470 300, 540 300" dur="4s" />

    {/* Central hub: the brain */}
    <g transform="translate(400, 200)">
      <g transform="scale(3) translate(-12, -13)" strokeLinecap="square" strokeLinejoin="miter">
        <g fill="var(--bg-raised)" stroke="none">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
        </g>
        <g fill="none" stroke="var(--accent)" strokeWidth="1">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
          <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
          <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
          <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
          <path d="M6 18a4 4 0 0 1-1.967-.516" />
          <path d="M19.967 17.484A4 4 0 0 1 18 18" />
        </g>
      </g>

      {/* Animated inner neural stem */}
      <g
        transform="scale(3) translate(-12, -13)"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="1"
        strokeLinecap="square"
        strokeDasharray="2 4"
      >
        <animate attributeName="stroke-dashoffset" values="6;0" dur="1s" repeatCount="indefinite" />
        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      </g>
    </g>

    {/* [P] Projects — top left: active task list */}
    <BlueprintCard x={100} y={60} width={160} height={80} label="[P] PROJECTS" statusDot="var(--accent)">
      <SkeletonLine x={15} y={36} width={90} fill="var(--accent)" />
      <SkeletonLine x={15} y={50} width={120} />
      <SkeletonLine x={15} y={64} width={70} />
      <line x1="8" y1="38" x2="8" y2="66" stroke="var(--text-soft)" strokeWidth="1" strokeDasharray="2 2" />
    </BlueprintCard>

    {/* [A] Areas — bottom left: standing pillars */}
    <BlueprintCard x={100} y={260} width={160} height={80} label="[A] AREAS">
      <circle cx="30" cy="52" r="16" fill="none" stroke="var(--secondary)" strokeWidth="1" />
      <circle cx="30" cy="52" r="8" fill="var(--secondary)" opacity="0.6" />
      <circle cx="80" cy="52" r="16" fill="none" stroke="var(--secondary)" strokeWidth="1" />
      <circle cx="80" cy="52" r="8" fill="var(--secondary)" opacity="0.6" />
      <circle cx="130" cy="52" r="16" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
    </BlueprintCard>

    {/* [R] Resources — top right: data grid */}
    <BlueprintCard x={540} y={60} width={160} height={80} label="[R] RESOURCES">
      <g fill="var(--text-main)">
        <rect x="15" y="35" width="20" height="12" rx="2" />
        <rect x="40" y="35" width="20" height="12" rx="2" opacity="0.5" />
        <rect x="65" y="35" width="20" height="12" rx="2" opacity="0.3" />
        <rect x="90" y="35" width="20" height="12" rx="2" opacity="0.7" />
        <rect x="115" y="35" width="20" height="12" rx="2" opacity="0.4" />
        <rect x="15" y="52" width="20" height="12" rx="2" opacity="0.2" />
        <rect x="40" y="52" width="20" height="12" rx="2" />
        <rect x="65" y="52" width="20" height="12" rx="2" opacity="0.6" />
        <rect x="90" y="52" width="20" height="12" rx="2" opacity="0.2" />
        <rect x="115" y="52" width="20" height="12" rx="2" opacity="0.5" />
      </g>
    </BlueprintCard>

    {/* [A] Archives — bottom right: cold storage stacks */}
    <BlueprintCard x={540} y={260} width={160} height={80} label="[A] ARCHIVES" labelColor="var(--text-soft)" dashed>
      <g fill="var(--line-strong)">
        <rect x="20" y="35" width="120" height="8" rx="2" />
        <rect x="20" y="48" width="120" height="8" rx="2" />
        <rect x="20" y="61" width="120" height="8" rx="2" />
      </g>
      <line x1="30" y1="39" x2="60" y2="39" stroke="var(--text-soft)" strokeWidth="1" />
      <line x1="30" y1="52" x2="90" y2="52" stroke="var(--text-soft)" strokeWidth="1" />
    </BlueprintCard>
  </BlueprintFrame>
);
