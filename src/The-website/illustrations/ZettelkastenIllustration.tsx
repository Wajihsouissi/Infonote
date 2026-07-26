import React from 'react';
import { Lightbulb, Cloud, BookOpen, FileText, Mic, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BlueprintFrame, BlueprintCard, SkeletonLine, FlowPath, FlowDot, CornerBrackets, MonoLabel } from './primitives';

/**
 * Zettelkasten pipeline scene: raw inputs flow into fleeting/literature
 * notes, through the review stage, into permanent notes and the slip-box.
 */

const INPUTS: { icon: LucideIcon; label: string; y: number }[] = [
  { icon: Lightbulb, label: 'Ideas', y: 28 },
  { icon: Cloud, label: 'Thoughts', y: 88 },
  { icon: BookOpen, label: 'Books', y: 168 },
  { icon: FileText, label: 'Articles', y: 228 },
  { icon: Mic, label: 'Podcasts', y: 288 },
  { icon: Video, label: 'Videos', y: 348 },
];

const INPUT_PATHS = [
  'M 100 40 C 160 40, 160 70, 220 70',
  'M 100 100 C 160 100, 160 70, 220 70',
  'M 100 180 C 160 180, 160 270, 220 270',
  'M 100 240 C 160 240, 160 270, 220 270',
  'M 100 300 C 160 300, 160 270, 220 270',
  'M 100 360 C 160 360, 160 270, 220 270',
];

const NOTE_PATHS = [
  'M 320 70 C 340 70, 340 170, 370 170',
  'M 320 270 C 340 270, 340 170, 370 170',
];

const REVIEW_TO_PERMANENT = 'M 450 170 C 480 170, 480 155, 510 155';

const INPUT_DURATIONS = ['2s', '2.5s', '2.2s', '2.8s', '2.4s', '3s'];

export const ZettelkastenIllustration: React.FC = () => (
  <BlueprintFrame idPrefix="zk">
    {/* Static connections */}
    <g opacity="0.5">
      {INPUT_PATHS.map((d) => (
        <FlowPath key={d} d={d} strokeWidth={1.5} />
      ))}
      {NOTE_PATHS.map((d) => (
        <FlowPath key={d} d={d} stroke="var(--secondary)" strokeWidth={1.5} />
      ))}
      <FlowPath d={REVIEW_TO_PERMANENT} stroke="var(--accent)" strokeWidth={1.5} />
    </g>

    {/* Animated packets */}
    {INPUT_PATHS.map((d, i) => (
      <FlowDot key={d} path={d} dur={INPUT_DURATIONS[i]} />
    ))}
    {NOTE_PATHS.map((d, i) => (
      <FlowDot key={d} path={d} dur={i === 0 ? '1.8s' : '2s'} r={3} fill="var(--secondary)" />
    ))}
    <FlowDot path={REVIEW_TO_PERMANENT} dur="1.2s" r={3} fill="var(--text-main)" />

    {/* Column 1: raw inputs */}
    {INPUTS.map(({ icon: Icon, label, y }) => (
      <g key={label} transform={`translate(30, ${y})`}>
        <Icon x={0} y={0} width={24} height={24} color="var(--accent)" strokeWidth={1.5} />
        <MonoLabel x={35} y={16} fill="var(--accent)" size={12}>
          {label}
        </MonoLabel>
      </g>
    ))}

    {/* Column 2: fleeting + literature notes */}
    <BlueprintCard x={220} y={35} width={115} height={70} label="[F] FLEETING" headerHeight={22}>
      <SkeletonLine x={15} y={38} width={80} height={3} opacity={0.8} />
      <SkeletonLine x={15} y={52} width={60} height={3} opacity={0.8} />
    </BlueprintCard>

    <BlueprintCard x={220} y={235} width={115} height={70} label="[L] LITERATURE" headerHeight={22}>
      <SkeletonLine x={15} y={38} width={80} height={3} opacity={0.8} />
      <SkeletonLine x={15} y={52} width={60} height={3} opacity={0.8} />
    </BlueprintCard>

    {/* Column 3: review stage */}
    <circle cx="425" cy="175" r="30" fill="var(--text-main)" opacity="0.05" />
    <BlueprintCard
      x={370}
      y={140}
      width={115}
      height={70}
      label="[R] REVIEW"
      headerHeight={22}
      stroke="var(--text-main)"
      strokeWidth={1.5}
    >
      {/* Factory: where fleeting notes are processed */}
      <g transform="translate(25, 30) scale(0.65)">
        <path
          d="M 0 50 L 0 10 L 25 25 L 25 0 L 50 15 L 50 -10 L 80 15 L 80 50 Z"
          fill="var(--accent-dim)"
          stroke="var(--text-main)"
          strokeWidth="2"
        />
        <rect x="15" y="30" width="10" height="15" fill="var(--text-main)" opacity="0.8" rx="2" />
        <rect x="35" y="30" width="10" height="15" fill="var(--text-main)" opacity="0.8" rx="2" />
        <rect x="55" y="30" width="10" height="15" fill="var(--text-main)" opacity="0.8" rx="2" />
      </g>
    </BlueprintCard>

    {/* Column 4: permanent notes (stacked) */}
    <circle cx="560" cy="165" r="30" fill="var(--text-soft)" opacity="0.05" />
    <g opacity="0.4">
      <BlueprintCard x={525} y={115} width={115} height={70} />
    </g>
    <g opacity="0.7">
      <BlueprintCard x={518} y={120} width={115} height={70} />
    </g>
    <BlueprintCard
      x={510}
      y={125}
      width={115}
      height={70}
      label="[Z] PERMANENT"
      headerHeight={22}
      fill="var(--bg-rail)"
      headerFill="var(--bg-card)"
      stroke="var(--text-soft)"
      strokeWidth={1.5}
    >
      <SkeletonLine x={15} y={36} width={85} height={3} opacity={0.8} />
      <SkeletonLine x={15} y={46} width={65} height={3} opacity={0.8} />
      <SkeletonLine x={15} y={56} width={75} height={3} opacity={0.8} />
    </BlueprintCard>

    {/* Column 5: the slip-box */}
    <g transform="translate(670, 110)">
      <CornerBrackets x={0} y={0} width={120} height={100} />
      <polygon points="-15,45 -5,50 -15,55" fill="var(--accent)" />

      <circle cx="55" cy="50" r="35" fill="var(--accent)" opacity="0.05" />

      {/* Box body */}
      <rect x="5" y="20" width="110" height="70" rx="4" fill="var(--bg-rail)" />
      <rect x="5" y="20" width="110" height="70" rx="4" fill="none" stroke="var(--accent)" strokeWidth="2" />

      {/* Lid */}
      <rect x="0" y="10" width="120" height="15" rx="3" fill="var(--bg-rail)" />
      <rect x="0" y="10" width="120" height="15" rx="3" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <line x1="5" y1="20" x2="115" y2="20" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />

      {/* Handle */}
      <rect x="40" y="32" width="40" height="10" rx="5" fill="none" stroke="var(--accent)" strokeWidth="2" />

      <MonoLabel x={60} y={65} fill="var(--accent)" size={10} anchor="middle">
        ZETTELKASTEN
      </MonoLabel>
      <line x1="30" y1="75" x2="90" y2="75" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
    </g>
  </BlueprintFrame>
);
