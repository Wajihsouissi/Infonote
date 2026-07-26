import React from 'react';
import { BlueprintFrame, BlueprintCard, SkeletonLine, FlowPath, FlowDot } from './primitives';

/**
 * Mindmapping scene: a central IDEA core radiating organic branches
 * out to four topic nodes and their leaf satellites.
 */

const MAIN_BRANCHES = [
  'M 400 200 C 300 200, 250 100, 180 100',
  'M 400 200 C 320 200, 280 320, 150 300',
  'M 400 200 C 500 200, 530 80, 620 90',
  'M 400 200 C 520 200, 560 300, 650 280',
];

const SECONDARY_BRANCHES = [
  'M 180 100 C 130 100, 100 50, 70 60',
  'M 180 100 C 120 100, 100 150, 60 140',
  'M 150 300 C 100 290, 80 250, 50 250',
  'M 150 300 C 90 310, 80 360, 40 350',
  'M 620 90 C 680 95, 720 50, 750 60',
  'M 620 90 C 690 85, 720 140, 740 150',
  'M 650 280 C 700 270, 730 230, 760 240',
  'M 650 280 C 720 290, 740 330, 770 340',
];

const LEAVES = [
  { cx: 70, cy: 60, r: 8 },
  { cx: 60, cy: 140, r: 6 },
  { cx: 50, cy: 250, r: 7 },
  { cx: 40, cy: 350, r: 9 },
  { cx: 750, cy: 60, r: 6 },
  { cx: 740, cy: 150, r: 8 },
  { cx: 760, cy: 240, r: 7 },
  { cx: 770, cy: 340, r: 6 },
];

const NODES = [
  { x: 120, y: 70, label: '[C] CONCEPT', color: 'var(--accent)' },
  { x: 90, y: 270, label: '[R] RESEARCH', color: 'var(--secondary)' },
  { x: 560, y: 60, label: '[D] DESIGN', color: 'var(--text-main)' },
  { x: 590, y: 250, label: '[D] DEVELOP', color: 'var(--accent)' },
];

const BRANCH_DURATIONS = ['2.5s', '3s', '2s', '3.5s'];

export const MindmappingIllustration: React.FC = () => (
  <BlueprintFrame idPrefix="mm">
    {/* Branches */}
    <g opacity="0.6">
      {MAIN_BRANCHES.map((d) => (
        <FlowPath key={d} d={d} strokeWidth={2.5} />
      ))}
    </g>
    <g opacity="0.4">
      {SECONDARY_BRANCHES.map((d) => (
        <FlowPath key={d} d={d} strokeWidth={1.5} />
      ))}
    </g>

    {/* Animated packets radiating outward */}
    {MAIN_BRANCHES.map((d, i) => (
      <FlowDot key={d} path={d} dur={BRANCH_DURATIONS[i]} r={i % 2 === 0 ? 2.5 : 2} />
    ))}

    {/* Topic nodes */}
    {NODES.map(({ x, y, label, color }) => (
      <BlueprintCard
        key={label}
        x={x}
        y={y}
        width={120}
        height={60}
        label={label}
        labelColor={color}
        headerHeight={20}
        stroke={color}
        statusDot={color}
      >
        <SkeletonLine x={10} y={30} width={70} fill={color} opacity={0.8} />
        <SkeletonLine x={10} y={40} width={40} />
      </BlueprintCard>
    ))}

    {/* Leaf satellites */}
    <g>
      {LEAVES.map(({ cx, cy, r }) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--bg-rail)" stroke="var(--line-strong)" strokeWidth="1" />
      ))}
    </g>

    {/* Central core */}
    <g transform="translate(400, 200)">
      <circle cx="0" cy="0" r="45" fill="var(--bg-card)" />
      <circle cx="0" cy="0" r="45" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="0" cy="0" r="35" fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7">
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite" />
      </circle>
      <text
        x="0"
        y="4"
        fill="var(--text-main)"
        fontSize="14"
        fontWeight="bold"
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        letterSpacing="2"
      >
        IDEA
      </text>
    </g>
  </BlueprintFrame>
);
