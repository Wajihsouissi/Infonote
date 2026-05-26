import React, { useCallback, memo, useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { ReactFlow, ReactFlowProvider, Background, useNodesState, useEdgesState, addEdge, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Search,
  Menu,
  FileIcon,
  Link2,
  X,
  ArrowRight,
  Sparkles,
  Scissors,
  Target,
  Zap,
  Image as ImageIcon,
  ShieldCheck,
  Lock,
  HardDrive,
  Database,
  FileText,
  Kanban
} from 'lucide-react';
import styles from './MarketingPage.module.css';

// Import actual app components
import { NoteCard } from '../features/card/NoteCard';
import { FusedNoteNode } from '../features/card/FusedNoteNode';
import { BlockNode } from '../features/block/BlockNode';
import { BottomMenu } from '../features/ui/BottomMenu';
import { Breadcrumbs } from '../features/navigation/Breadcrumbs';
import { useStore } from '../store/useStore';

const ImageBlockComponent = memo(({ data }: any) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
      border: '1px solid var(--color-border)',
      position: 'relative'
    }}>
      <img 
        src={data.url} 
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
        alt="Canvas Image" 
      />
      {/* Target handle covering entire block */}
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ top: '50%', left: '50%', width: '100%', height: '100%', border: 'none', background: 'transparent', transform: 'translate(-50%, -50%)', zIndex: -1 }} 
      />
      {/* Visible purple source handle on the right */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ right: -4, background: '#a855f7', border: '2px solid #ffffff', width: 10, height: 10, borderRadius: '50%', boxShadow: '0 0 8px rgba(168,85,247,0.6)' }} 
      />
    </div>
  );
});

const YouTubeModal = memo(({ videoId, onClose }: { videoId: string; onClose: () => void }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 1000,
        aspectRatio: '16/9', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
      }} onClick={(e) => e.stopPropagation()}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      </div>
      <button style={{
        position: 'absolute', top: 24, right: 24,
        width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'white',
      }} onClick={onClose}>
        <X size={20} />
      </button>
    </div>,
    document.body
  );
});

const YouTubeBlock = memo(({ data }: any) => {
  const [open, setOpen] = useState(false);
  const videoId = data.videoId;

  return (
    <>
      <div style={{
        width: '100%', height: '100%', borderRadius: 12,
        overflow: 'hidden', position: 'relative',
        background: '#000', border: '1px solid var(--color-border)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
      }} onClick={() => setOpen(true)}>
        <img
          src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.8 }}
          alt="Video thumbnail"
        />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 30px rgba(139,92,246,0.6)',
            transition: 'transform 0.2s',
          }} className={styles.playButton}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <polygon points="8,5 19,12 8,19" />
            </svg>
          </div>
        </div>
      </div>
      {open && <YouTubeModal videoId={videoId} onClose={() => setOpen(false)} />}
    </>
  );
});

const nodeTypes = {
  note: NoteCard,
  block: BlockNode,
  image: ImageBlockComponent,
  'fused-note': FusedNoteNode,
  youtube: YouTubeBlock,
};

const initialNodes: any[] = [
  // â”€â”€ CENTER: YouTube video + Icon card side by side â”€â”€
  {
    id: '10',
    type: 'youtube',
    className: styles.blockVideo,
    position: { x: -36, y: 181 },
    data: {
      videoId: '-I8QtPA7lt4',
    },
    style: { width: 480, height: 270, rotate: '1deg' },
    selected: false,
  },
  {
    id: '6',
    type: 'note',
    className: styles.cardDesignAssets,
    position: { x: 235, y: 74 },
    data: {
      label: 'Design Assets',
      viewMode: 'icon',
      icon: 'folder-closed',
      hideHoverMenu: true,
    },
    style: { width: 120, height: 120, rotate: '0deg' },
    selected: false,
  },

  // â”€â”€ EDGES: surrounding nodes spread around the perimeter â”€â”€

  // Top-left â€” Bullet list block
  {
    id: '8',
    type: 'block',
    className: styles.blockBulletList,
    position: { x: -625, y: -30 },
    data: {
      content: [
        { id: 'bl1', type: 'bullet', content: 'Real-time collaborative editing' },
        { id: 'bl2', type: 'bullet', content: 'Drag-and-drop canvas organization' },
        { id: 'bl3', type: 'bullet', content: 'AI-powered content suggestions' },
      ],
      hideHoverMenu: true,
    },
    style: { rotate: '-5deg' },
    selected: false,
  },

  // Left â€” New Note card
  {
    id: '3',
    type: 'note',
    className: styles.cardNewNote,
    position: { x: 666, y: 80 },
    data: {
      label: 'New Note',
      viewMode: 'medium',
      description: 'Add description...',
      hideHoverMenu: true,
    },
    style: { width: 240, height: 240, rotate: '14deg' },
    selected: false,
  },

  

  // Top-right â€” Text block ("Chunk it...")
  {
    id: '9',
    type: 'block',
    className: styles.blockText,
    position: { x: -765, y: 96 },
    data: {
      content: [
        { id: 'tb1', type: 'paragraph', content: 'Chunk it transforms the way teams capture, organize, and build knowledge.' },
      ],
      hideHoverMenu: true,
    },
    style: { rotate: '-12deg', scale: '0.8' },
    selected: false,
  },

  // Right â€” Fused note (Meeting Notes)
  {
    id: '7',
    type: 'fused-note',
    className: styles.cardFusedNote,
    position: { x: -749, y: 190 },
    data: {
      content: [
        { id: 'fb1', type: 'heading', content: 'Meeting Notes' },
        { id: 'fb2', type: 'paragraph', content: 'Discussed roadmap priorities for Q1 2025. Key decisions on feature scope and timeline.' },
        { id: 'fb3', type: 'bullet', content: 'New onboarding flow to be designed by end of month' },
      ],
      color: '#7c3aed',
      hideHoverMenu: true,
    },
    style: { width: 320, height: 320, rotate: '-15deg' },
    selected: false,
  },

  // Bottom-right â€” Workshop insights (large expanded card)
  {
    id: '1',
    type: 'note',
    className: styles.cardInsights,
    position: { x: 461, y: -12 },
    data: {
      label: 'Workshop insights',
      viewMode: 'expanded',
      icon: 'rocket',
      description: 'On September 23, 2024, the PXConnect team conducted a workshop to discuss and align on the new Social Challenge feature. This document summarizes the key insights, decisions, and action items resulting from our collaborative session.',
      showMetadata: false,
      hideHoverMenu: true,
      content: [
        { id: 'b1', type: 'heading', content: 'Key Findings' },
        { id: 'b2', type: 'bullet', content: 'Users desire flexibility in challenge creation, suggesting both templates and custom options.' },
        { id: 'b3', type: 'bullet', content: 'Visual feedback, such as progress bars and journey maps, is crucial for maintaining motivation.' },
        { id: 'b4', type: 'bullet', content: 'Micro-interactions (e.g., confetti animations, virtual high-fives) can significantly boost engagement.' },
        
      ]
    },
    style: { width: 384, height: 336, rotate: '-12deg' },
    selected: false,
  },
];

const nestedDesignNodes = [
  {
    id: 'n1',
    type: 'note',
    position: { x: 520, y: -100 },
    data: {
      label: 'Brand Guidelines',
      viewMode: 'medium',
      icon: 'palette',
      description: 'Color palette, typography, and logo usage rules for consistent branding.',
      hideHoverMenu: true,
    },
    style: { width: 240, height: 240 },
    selected: false,
  },
  {
    id: 'n2',
    type: 'note',
    position: { x: 400, y: 80 },
    data: {
      label: 'Logo Designs',
      viewMode: 'medium',
      icon: 'square',
      description: 'Final logo variations in SVG format â€” light, dark, and monochrome versions.',
      hideHoverMenu: true,
    },
    style: { width: 240, height: 240 },
    selected: false,
  },
  {
    id: 'n3',
    type: 'note',
    position: { x: 80, y: -200 },
    data: {
      label: 'UI Mockups',
      viewMode: 'expanded',
      icon: 'layout-grid',
      description: 'High-fidelity mockups for the new onboarding flow.',
      showMetadata: false,
      hideHoverMenu: true,
      content: [
        { id: 'nb1', type: 'heading', content: 'Screens' },
        { id: 'nb2', type: 'bullet', content: 'Welcome screen with product value prop' },
        { id: 'nb3', type: 'bullet', content: 'Feature highlights with interactive previews' },
        { id: 'nb4', type: 'bullet', content: 'Workspace creation â€” one-click setup' },
      ],
    },
    style: { width: 360, height: 340 },
    selected: false,
  },
  {
    id: 'n4',
    type: 'note',
    position: { x: 80, y: 120 },
    data: {
      label: 'Export Assets',
      viewMode: 'icon',
      icon: 'folder-closed',
      hideHoverMenu: true,
    },
    style: { width: 120, height: 120 },
    selected: false,
  },
];

export const MarketingPage: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [drilledNode, setDrilledNode] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const setCurrentView = useStore((state) => state.setCurrentView);

  // Intersection observer to track which step visual is currently in view
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    stepRefs.current.forEach((ref, index) => {
      if (!ref) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
              setActiveStep(index);
            }
          });
        },
        { threshold: [0.4, 0.6, 0.8], rootMargin: '-10% 0px -10% 0px' }
      );
      observer.observe(ref);
      observers.push(observer);
    });
    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  const accordionData = [
    {
      title: "Second Brain",
      desc: "Capture your thoughts, ideas, and knowledge in a centralized digital repository. Chunkit naturally accommodates the P.A.R.A method.",
      icon: <Database />,
      color: "#f97316",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: '#110a05' }}>
          <defs>
            <radialGradient id="sbGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#110a05" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <pattern id="sbGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(249, 115, 22, 0.05)" strokeWidth="1"/>
          </pattern>
          <rect width="800" height="400" fill="url(#sbGrid)" />
          <circle cx="400" cy="200" r="150" fill="url(#sbGlow)" />
          <rect x="350" y="150" width="100" height="100" rx="16" fill="rgba(249, 115, 22, 0.1)" stroke="#f97316" strokeWidth="2" />
          <circle cx="400" cy="200" r="20" fill="#f97316" />
          <g stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" opacity="0.5">
            <line x1="220" y1="100" x2="350" y2="150" />
            <line x1="240" y1="300" x2="350" y2="250" />
            <line x1="580" y1="120" x2="450" y2="180" />
            <line x1="560" y1="280" x2="450" y2="220" />
          </g>
          <rect x="160" y="80" width="60" height="40" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
          <rect x="180" y="280" width="60" height="40" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
          <rect x="580" y="100" width="60" height="40" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
          <rect x="560" y="260" width="60" height="40" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
        </svg>
      )
    },
    {
      title: "Zettelkasten",
      desc: "Create atomic notes and interconnect them organically. Foster emergent ideas through bidirectional linking and spatial mapping.",
      icon: <Link2 />,
      color: "#06b6d4",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: '#050c11' }}>
          <defs>
            <style>
              {`
                @keyframes zkLineFlow {
                  from { stroke-dashoffset: 24; }
                  to { stroke-dashoffset: 0; }
                }
                @keyframes zkPulse {
                  0%, 100% { opacity: 0.2; transform: scale(0.9); }
                  50% { opacity: 0.8; transform: scale(1.1); }
                }
                .zk-flow {
                  stroke-dasharray: 4 4;
                  animation: zkLineFlow 1.5s linear infinite;
                }
                .zk-pulse-1 { animation: zkPulse 3s ease-in-out infinite; transform-origin: center; }
                .zk-pulse-2 { animation: zkPulse 4s ease-in-out infinite 1s; transform-origin: center; }
                .zk-pulse-3 { animation: zkPulse 2.5s ease-in-out infinite 0.5s; transform-origin: center; }
              `}
            </style>
            <filter id="zkGlowV3">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1"/>
            </linearGradient>
            <linearGradient id="fadeLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.1"/>
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.7"/>
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.1"/>
            </linearGradient>
          </defs>

          {/* Network Edges */}
          <g stroke="#06b6d4" strokeWidth="1.5" opacity="0.6" fill="none">
            {/* Solid links fading into background slightly */}
            <line x1="220" y1="200" x2="350" y2="220" />
            <line x1="260" y1="130" x2="350" y2="220" />
            <line x1="240" y1="310" x2="350" y2="220" />
            <line x1="410" y1="220" x2="500" y2="210" />
            <line x1="560" y1="210" x2="640" y2="200" />
            <line x1="500" y1="125" x2="530" y2="180" />
            
            {/* Dashed Background Connections (Animated Flow) */}
            <g stroke="url(#fadeLine)" strokeWidth="1" opacity="0.5" className="zk-flow">
              <line x1="260" y1="130" x2="500" y2="125" />
              <line x1="220" y1="200" x2="240" y2="310" />
              <line x1="500" y1="125" x2="640" y2="200" />
            </g>
          </g>

          {/* Ghost Background Cards (Animated Fadeout) */}
          <g filter="url(#zkGlowV3)">
            {/* Top Left Area */}
            <g transform="translate(50, 40)" opacity="0.15" className="zk-pulse-1">
              <rect width="24" height="24" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            </g>
            <g transform="translate(120, 20)" opacity="0.1" className="zk-pulse-2">
              <rect width="32" height="32" rx="4" fill="rgba(6,182,212,0.05)" stroke="rgba(6,182,212,0.1)" />
            </g>
            <g transform="translate(40, 180)" opacity="0.2" className="zk-pulse-3">
              <rect width="28" height="28" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
              <rect x="4" y="6" width="10" height="2" rx="1" fill="#fff" />
            </g>
            
            {/* Bottom Left Area */}
            <g transform="translate(60, 320)" opacity="0.15" className="zk-pulse-2">
              <rect width="30" height="30" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
              <rect x="4" y="6" width="12" height="2" rx="1" fill="#fff" />
            </g>
            <g transform="translate(140, 360)" opacity="0.1" className="zk-pulse-1">
              <rect width="26" height="26" rx="4" fill="rgba(6,182,212,0.05)" stroke="rgba(6,182,212,0.1)" />
            </g>
            <g transform="translate(80, 250)" opacity="0.2" className="zk-pulse-3">
              <rect width="20" height="20" rx="4" fill="rgba(255,255,255,0.05)" />
            </g>

            {/* Top Center Edge */}
            <g transform="translate(300, 30)" opacity="0.15" className="zk-pulse-1">
              <rect width="34" height="34" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            </g>
            <g transform="translate(420, 40)" opacity="0.1" className="zk-pulse-2">
              <rect width="24" height="24" rx="4" fill="rgba(6,182,212,0.05)" stroke="rgba(6,182,212,0.1)" />
            </g>
            <g transform="translate(550, 20)" opacity="0.25" className="zk-pulse-3">
              <rect width="36" height="36" rx="6" fill="rgba(6,182,212,0.05)" stroke="rgba(6,182,212,0.2)" />
              <rect x="6" y="8" width="14" height="2" rx="1" fill="#06b6d4" />
            </g>

            {/* Bottom Center Edge */}
            <g transform="translate(360, 340)" opacity="0.1" className="zk-pulse-3">
              <rect width="28" height="28" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            </g>
            <g transform="translate(500, 360)" opacity="0.15" className="zk-pulse-1">
              <rect width="32" height="32" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
              <rect x="5" y="6" width="12" height="2" rx="1" fill="#fff" />
            </g>

            {/* Top Right Area */}
            <g transform="translate(680, 50)" opacity="0.2" className="zk-pulse-2">
              <rect width="28" height="28" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
              <rect x="4" y="6" width="10" height="2" rx="1" fill="#fff" />
            </g>
            <g transform="translate(750, 100)" opacity="0.1" className="zk-pulse-1">
              <rect width="24" height="24" rx="4" fill="rgba(6,182,212,0.05)" />
            </g>

            {/* Bottom Right Area */}
            <g transform="translate(740, 280)" opacity="0.15" className="zk-pulse-3">
              <rect width="32" height="32" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            </g>
            <g transform="translate(660, 330)" opacity="0.2" className="zk-pulse-1">
              <rect width="26" height="26" rx="4" fill="rgba(6,182,212,0.05)" stroke="rgba(6,182,212,0.1)" />
              <rect x="4" y="6" width="8" height="2" rx="1" fill="#06b6d4" />
            </g>
            <g transform="translate(760, 180)" opacity="0.1" className="zk-pulse-2">
              <rect width="28" height="28" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            </g>
          </g>

          {/* Note Cards (Zettels) */}
          {/* All cards now have solid backgrounds (#050c11 base tint) to fully hide lines passing behind them */}
          <g filter="url(#zkGlowV3)">
            {/* MOC Hub 1 (Cyan) */}
            <g transform="translate(350, 190)">
              <rect width="60" height="60" rx="8" fill="#091b24" stroke="#06b6d4" strokeWidth="1.5" />
              <rect x="10" y="10" width="20" height="4" rx="2" fill="#fff" />
              <rect x="10" y="22" width="40" height="3" rx="1.5" fill="#06b6d4" opacity="0.8" />
              <rect x="10" y="32" width="30" height="3" rx="1.5" fill="#06b6d4" opacity="0.8" />
              <rect x="10" y="42" width="35" height="3" rx="1.5" fill="#06b6d4" opacity="0.8" />
            </g>

            {/* MOC Hub 2 (Blue) */}
            <g transform="translate(500, 180)">
              <rect width="60" height="60" rx="8" fill="#091729" stroke="#3b82f6" strokeWidth="1.5" />
              <rect x="10" y="10" width="25" height="4" rx="2" fill="#fff" />
              <rect x="10" y="22" width="40" height="3" rx="1.5" fill="#3b82f6" opacity="0.8" />
              <rect x="10" y="32" width="35" height="3" rx="1.5" fill="#3b82f6" opacity="0.8" />
            </g>

            {/* Minor Cards */}
            <g transform="translate(240, 110)">
              <rect width="36" height="36" rx="6" fill="#0a121a" stroke="rgba(255, 255, 255, 0.2)" />
              <rect x="6" y="8" width="14" height="3" rx="1.5" fill="#fff" />
              <rect x="6" y="16" width="22" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
              <rect x="6" y="22" width="18" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
            </g>

            <g transform="translate(200, 180)">
              <rect width="36" height="36" rx="6" fill="#0a121a" stroke="rgba(255, 255, 255, 0.2)" />
              <rect x="6" y="8" width="14" height="3" rx="1.5" fill="#fff" />
              <rect x="6" y="16" width="22" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
            </g>

            <g transform="translate(220, 290)">
              <rect width="36" height="36" rx="6" fill="#0a121a" stroke="rgba(255, 255, 255, 0.2)" />
              <rect x="6" y="8" width="14" height="3" rx="1.5" fill="#fff" />
            </g>

            <g transform="translate(480, 105)">
              <rect width="36" height="36" rx="6" fill="#0a121a" stroke="rgba(255, 255, 255, 0.2)" />
              <rect x="6" y="8" width="14" height="3" rx="1.5" fill="#fff" />
              <rect x="6" y="16" width="22" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
            </g>

            <g transform="translate(620, 180)">
              <rect width="36" height="36" rx="6" fill="#0a121a" stroke="rgba(255, 255, 255, 0.2)" />
              <rect x="6" y="8" width="14" height="3" rx="1.5" fill="#fff" />
              <rect x="6" y="16" width="22" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
            </g>
          </g>
        </svg>
      )
    },
    {
      title: "Mindmapping",
      desc: "Brainstorm visually on the infinite canvas. Group, connect, and hierarchize concepts without linear constraints.",
      icon: <Target />,
      color: "#ec4899",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: '#11050a' }}>
          <g stroke="#ec4899" strokeWidth="2" opacity="0.4" fill="none">
            <path d="M 200 200 C 300 200, 300 100, 400 100" />
            <path d="M 200 200 C 300 200, 300 200, 400 200" />
            <path d="M 200 200 C 300 200, 300 300, 400 300" />
            <path d="M 460 100 C 500 100, 500 70, 560 70" />
            <path d="M 460 100 C 500 100, 500 130, 560 130" />
            <path d="M 460 300 C 500 300, 500 270, 560 270" />
            <path d="M 460 300 C 500 300, 500 330, 560 330" />
          </g>
          <rect x="100" y="170" width="100" height="60" rx="30" fill="rgba(236, 72, 153, 0.15)" stroke="#ec4899" strokeWidth="2" />
          <text x="150" y="205" fill="#fff" fontSize="14" fontWeight="bold" textAnchor="middle">Project Root</text>
          <rect x="400" y="80" width="80" height="40" rx="20" fill="rgba(255,255,255,0.03)" stroke="rgba(236, 72, 153, 0.4)" />
          <rect x="400" y="180" width="80" height="40" rx="20" fill="rgba(255,255,255,0.03)" stroke="rgba(236, 72, 153, 0.4)" />
          <rect x="400" y="280" width="80" height="40" rx="20" fill="rgba(255,255,255,0.03)" stroke="rgba(236, 72, 153, 0.4)" />
          <circle cx="580" cy="70" r="8" fill="rgba(236, 72, 153, 0.7)" />
          <circle cx="580" cy="130" r="8" fill="rgba(236, 72, 153, 0.7)" />
          <circle cx="580" cy="270" r="8" fill="rgba(236, 72, 153, 0.7)" />
          <circle cx="580" cy="330" r="8" fill="rgba(236, 72, 153, 0.7)" />
        </svg>
      )
    },
    {
      title: "Agile Workflows",
      desc: "Turn insights into action. Extract tasks directly from your notes to build dynamic, fully-integrated Kanban boards.",
      icon: <Kanban />,
      color: "#8b5cf6",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: '#0a0511' }}>
          <defs>
            <linearGradient id="kanbanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(139, 92, 246, 0.08)"/>
              <stop offset="100%" stopColor="transparent"/>
            </linearGradient>
          </defs>
          <rect x="140" y="60" width="140" height="280" rx="12" fill="url(#kanbanGrad)" stroke="rgba(139, 92, 246, 0.15)" />
          <rect x="330" y="60" width="140" height="280" rx="12" fill="url(#kanbanGrad)" stroke="rgba(139, 92, 246, 0.15)" />
          <rect x="520" y="60" width="140" height="280" rx="12" fill="url(#kanbanGrad)" stroke="rgba(139, 92, 246, 0.3)" />
          <text x="210" y="90" fill="#8b5cf6" fontSize="13" fontWeight="bold" textAnchor="middle">To Do</text>
          <text x="400" y="90" fill="#8b5cf6" fontSize="13" fontWeight="bold" textAnchor="middle">In Progress</text>
          <text x="590" y="90" fill="#c4b5fd" fontSize="13" fontWeight="bold" textAnchor="middle">Done</text>
          
          <rect x="150" y="110" width="120" height="60" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
          <rect x="160" y="125" width="60" height="6" rx="3" fill="rgba(255,255,255,0.15)" />
          <rect x="160" y="145" width="40" height="6" rx="3" fill="#8b5cf6" />
          
          <rect x="150" y="180" width="120" height="80" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
          <rect x="160" y="195" width="80" height="6" rx="3" fill="rgba(255,255,255,0.15)" />
          
          <rect x="340" y="110" width="120" height="70" rx="6" fill="rgba(139, 92, 246, 0.15)" stroke="#8b5cf6" />
          <rect x="350" y="125" width="70" height="6" rx="3" fill="rgba(255,255,255,0.3)" />
          <circle cx="435" cy="155" r="8" fill="#8b5cf6" />
          
          <rect x="530" y="110" width="120" height="50" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
          <rect x="540" y="125" width="50" height="6" rx="3" fill="rgba(255,255,255,0.15)" />
          <circle cx="550" cy="140" r="4" fill="#10b981" />
          
          <path d="M 280 145 C 300 145, 300 145, 320 145" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 4" />
          <polygon points="325,145 315,140 315,150" fill="#8b5cf6" />
        </svg>
      )
    }
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onConnect = useCallback((connection: any) => {
    setEdges((eds) => addEdge(connection, eds));
  }, [setEdges]);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: any) => {
    // Intentionally left empty so dragging works freely
  }, []);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: any) => {
    if (node.id === '6' && !drilledNode) {
      setDrilledNode('6');
      setNodes(nestedDesignNodes as any);
      useStore.setState({
        currentParentId: '6',
        breadcrumbs: [
          { id: null, label: 'Home' },
          { id: '6', label: 'Design Assets' },
        ]
      });
    }
  }, [drilledNode, setNodes]);

  const goBack = useCallback(() => {
    setDrilledNode(null);
    setNodes(initialNodes as any);
    useStore.setState({
      currentParentId: null,
      breadcrumbs: [
        { id: null, label: 'Home' },
      ]
    });
  }, [setNodes]);

  useEffect(() => {
    useStore.setState({
      currentParentId: null,
      breadcrumbs: [
        { id: null, label: 'Home' },
      ]
    });
  }, []);

  useEffect(() => {
    const unsub = useStore.subscribe(
      (state) => state.currentParentId,
      (parentId) => {
        if (parentId === null && drilledNode) {
          goBack();
        }
      }
    );
    return () => unsub();
  }, [drilledNode, goBack]);

  return (
    <div className={styles.pageContainer}>
      <div className={styles.orbBg} />
      <div className={styles.orb} style={{ top: '20%', left: '15%', width: 600, height: 600, animationDelay: '0s' }} />
      <div className={styles.orb} style={{ top: '50%', right: '10%', width: 450, height: 450, animationDelay: '-5s', background: 'radial-gradient(circle, rgba(217,70,239,0.25), transparent 70%)' }} />
      <div className={styles.orb} style={{ bottom: '5%', left: '45%', width: 350, height: 350, animationDelay: '-10s', background: 'radial-gradient(circle, rgba(6,182,212,0.2), transparent 70%)' }} />

      {/* Floating particles */}
      <div className={styles.particle} style={{ left: '10%', top: '30%', width: 3, height: 3, animationDelay: '0s', animationDuration: '6s' }} />
      <div className={styles.particle} style={{ left: '25%', top: '55%', width: 4, height: 4, animationDelay: '-2s', animationDuration: '8s' }} />
      <div className={styles.particle} style={{ left: '40%', top: '20%', width: 2, height: 2, animationDelay: '-4s', animationDuration: '5s' }} />
      <div className={styles.particle} style={{ left: '55%', top: '65%', width: 3, height: 3, animationDelay: '-1s', animationDuration: '7s' }} />
      <div className={styles.particle} style={{ left: '70%', top: '35%', width: 2, height: 2, animationDelay: '-6s', animationDuration: '6s' }} />
      <div className={styles.particle} style={{ left: '85%', top: '50%', width: 4, height: 4, animationDelay: '-3s', animationDuration: '9s' }} />
      <div className={styles.particle} style={{ left: '15%', top: '75%', width: 2, height: 2, animationDelay: '-7s', animationDuration: '7s' }} />
      <div className={styles.particle} style={{ left: '60%', top: '15%', width: 3, height: 3, animationDelay: '-5s', animationDuration: '5s' }} />
      <div className={styles.particle} style={{ left: '35%', top: '80%', width: 2, height: 2, animationDelay: '-8s', animationDuration: '8s' }} />
      <div className={styles.particle} style={{ left: '90%', top: '25%', width: 3, height: 3, animationDelay: '-9s', animationDuration: '6s' }} />
      <div className={styles.particle} style={{ left: '50%', top: '45%', width: 4, height: 4, animationDelay: '-3.5s', animationDuration: '7s', background: 'rgba(217,70,239,0.5)' }} />
      <div className={styles.particle} style={{ left: '5%', top: '15%', width: 2, height: 2, animationDelay: '-1.5s', animationDuration: '5.5s', background: 'rgba(6,182,212,0.6)' }} />
      <div className={styles.particle} style={{ left: '75%', top: '70%', width: 3, height: 3, animationDelay: '-6.5s', animationDuration: '8.5s', background: 'rgba(168,85,247,0.5)' }} />
      <div className={styles.particle} style={{ left: '30%', top: '10%', width: 2, height: 2, animationDelay: '-4.5s', animationDuration: '6.5s' }} />
      <div className={styles.particle} style={{ left: '80%', top: '85%', width: 3, height: 3, animationDelay: '-7.5s', animationDuration: '7.5s' }} />

      {/* Top Navigation */}
      <nav className={`${styles.topNav} ${scrolled ? styles.scrolled : ''}`}>
        <div className={styles.navGlow} />
        <div className={styles.navLogo}>
          <div className={styles.navLogoMark}>
            <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 22}} />
          </div>
          <span className={styles.navLogoText}>Infonote</span>
        </div>
        <div className={styles.navLinks}>
          <a className={styles.navLink}>Features</a>
          <a className={styles.navLink}>Use Cases</a>
          <a className={styles.navLink}>Pricing</a>
          <a className={styles.navLink}>Resources</a>
        </div>
        <div className={styles.navActions}>
          <button className={styles.navLink} onClick={() => setCurrentView('login')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            Log In
          </button>
          <button className={styles.navButton} onClick={() => setCurrentView('signup')}>
            <span>Get Started Free</span>
            <ArrowRight size={16} className={styles.navButtonIcon} />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.heroContent}>
        
        {/* Browser Frame */}
        <div className={styles.browserFrame}>
          {/* Top Bar */}
          <div className={styles.browserTopBar}>
            <div className={styles.macButtons}>
              <div className={`${styles.macDot} ${styles.macRed}`} />
              <div className={`${styles.macDot} ${styles.macYellow}`} />
              <div className={`${styles.macDot} ${styles.macGreen}`} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px', fontWeight: 600, color: 'var(--color-text-main)' }}>
              <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 16}} />
              <span>Infonote</span>
              <Menu size={16} color="var(--color-text-muted)" style={{marginLeft: 8}}/>
            </div>

            <div className={styles.browserSearch}>
              <Search size={14} />
              <span>Find anything you are looking for...</span>
              <span style={{marginLeft: 'auto', opacity: 0.5, fontSize: 10, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4}}>âŒ˜K</span>
            </div>

            <div className={styles.browserActions}>
              <FileIcon size={16} color="var(--color-text-muted)" />
              <div className={styles.avatar}>H</div>
            </div>
          </div>

          {/* Breadcrumbs Component */}
          <div className={styles.breadcrumbsArea}>
            <Breadcrumbs />
          </div>

          {/* Canvas Area with Real Components */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDoubleClick={onNodeDoubleClick}
                nodeTypes={nodeTypes}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                zoomOnPinch={false}
                panOnScroll={false}
                autoPanOnNodeDrag={false}
                autoPanOnConnect={false}
                nodesDraggable={true}
                proOptions={{ hideAttribution: true }}
                minZoom={0.8}
                maxZoom={0.8}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                key={drilledNode || 'main'}
              >
                <Background gap={24} size={2} color="var(--color-border)" />
              </ReactFlow>

            {/* Real Bottom Menu Component */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
               <div style={{ pointerEvents: 'auto' }}>
                 <BottomMenu />
               </div>
            </div>
            </ReactFlowProvider>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.featuresSection} id="features">

        {/* â”€â”€ Hero Feature Area â”€â”€ */}
        <div className={styles.ftHero}>
          <span className={styles.ftBadge}>
            <span className={styles.ftBadgeDot} />
            Canvas &amp; Knowledge Management
          </span>
          <h2 className={styles.ftHeading}>
            Build your second brain
          </h2>
          <p className={styles.ftSub}>
            Align your thinking around a <strong>unified knowledge canvas</strong>. Capture, organize, and connect all your ideas with Infonote's visual-first approach to note-taking.
          </p>

          {/* Large hero visual â€” Collaborative Canvas UI Simulation (Nested Chunks) */}
          <div className={styles.ftHeroVisual}>
            <div className={styles.ftHeroVisualInner}>
              {/* Subtle dot grid for canvas background */}
              <div className={styles.ftCanvasGrid} />

              {/* Background gradient flares */}
              <div className={styles.ftCanvasFlare1} />
              <div className={styles.ftCanvasFlare2} />

              {/* Connection Lines (SVG) - Connecting nested chunks to extracted layers */}
              <svg className={styles.ftHeroSvg} viewBox="0 0 1000 640" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="beam1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="beam2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d946ef" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#d946ef" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="beam3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
                  </linearGradient>
                  <filter id="glowFlow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="pathGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#a855f7" floodOpacity="0.3"/>
                  </filter>
                </defs>

                {/* --- Layer 1 to Layer 2 --- */}
                <path id="extractTop" d="M 440 180 C 470 180, 470 125, 500 125" stroke="url(#beam1)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <path id="extractMid" d="M 440 300 C 495 298, 495 302, 550 300" stroke="url(#beam2)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <path id="extractBot" d="M 440 430 C 520 430, 520 480, 600 480" stroke="url(#beam3)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                
                {/* --- Layer 2 to Layer 3 --- */}
                <path id="extractL2Top" d="M 700 125 C 765 125, 765 90, 830 90" stroke="url(#beam1)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
                <path id="extractL2Mid" d="M 750 300 C 815 298, 815 302, 880 290" stroke="url(#beam2)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
                <path id="extractL2Bot" d="M 800 480 C 865 480, 865 470, 930 470" stroke="url(#beam3)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
                
                {/* Particles for L1 -> L2 */}
                <circle r="4.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.5s" repeatCount="indefinite"><mpath href="#extractTop" /></animateMotion>
                </circle>
                <circle r="4.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.2s" repeatCount="indefinite"><mpath href="#extractMid" /></animateMotion>
                </circle>
                <circle r="4.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.8s" repeatCount="indefinite"><mpath href="#extractBot" /></animateMotion>
                </circle>

                {/* Particles for L2 -> L3 */}
                <circle r="3.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.5s" begin="1s" repeatCount="indefinite"><mpath href="#extractL2Top" /></animateMotion>
                </circle>
                <circle r="3.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.2s" begin="0.5s" repeatCount="indefinite"><mpath href="#extractL2Mid" /></animateMotion>
                </circle>
                <circle r="3.5" fill="#fff" filter="url(#glowFlow)">
                  <animateMotion dur="2.8s" begin="1.5s" repeatCount="indefinite"><mpath href="#extractL2Bot" /></animateMotion>
                </circle>

                {/* Nodes (L1) */}
                <circle cx="440" cy="180" r="4" fill="#a855f7" filter="url(#glowFlow)" />
                <circle cx="440" cy="300" r="4" fill="#d946ef" filter="url(#glowFlow)" />
                <circle cx="440" cy="430" r="4" fill="#6366f1" filter="url(#glowFlow)" />
                
                {/* Nodes (L2) */}
                <circle cx="500" cy="125" r="4" fill="#a855f7" />
                <circle cx="700" cy="125" r="4" fill="#a855f7" />
                
                <circle cx="550" cy="300" r="4" fill="#d946ef" />
                <circle cx="750" cy="300" r="4" fill="#d946ef" />
                
                <circle cx="600" cy="480" r="4" fill="#6366f1" />
                <circle cx="800" cy="480" r="4" fill="#6366f1" />
                
                {/* Nodes (L3) */}
                <circle cx="830" cy="90" r="3" fill="#a855f7" />
                <circle cx="880" cy="290" r="3" fill="#d946ef" />
                <circle cx="930" cy="470" r="3" fill="#6366f1" />
              </svg>

              {/* Glassmorphic UI Cards */}
              
              {/* LAYER 1: Source Document Card (Largest) */}
              <div className={`${styles.ftUiCard} ${styles.ftUiCardMain}`} style={{ top: '12%', left: '2%', width: '420px', padding: '24px', animation: 'cardReaction 4s infinite' }}>
                <div className={`${styles.ftMagicalTooltip} ${styles.ftTooltipPurple}`}>
                  <Sparkles size={12} color="#a855f7" /> Parsing master document...
                </div>
                <div className={styles.ftUiCardHeader} style={{ marginBottom: 12 }}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}><FileIcon size={16} /></div>
                  <span className={styles.ftUiCardTitle} style={{ fontSize: 18 }}>Q3 Master Document</span>
                </div>
                <div className={styles.ftUiCardBody} style={{ gap: '48px' }}>
                  
                  {/* Nested Chunk 1: Purple */}
                  <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockExtracted}`} style={{ borderColor: '#a855f7' }}>
                    <span className={styles.ftUiChunkBadge} style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)' }}>Chunked</span>
                    <div className={styles.ftUiLine} style={{ width: '100%', marginTop: 2, background: 'rgba(255,255,255,0.03)' }} />
                    <div className={styles.ftUiLine} style={{ width: '70%', background: 'rgba(255,255,255,0.03)' }} />
                  </div>

                  {/* Nested Chunk 2: Pink (Active) */}
                  <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockActive}`} style={{ borderColor: '#d946ef' }}>
                    
                    {/* Floating Toolbar Context Menu */}
                    <div className={styles.ftUiToolbar}>
                      <div className={`${styles.ftUiToolBtn} ${styles.ftUiToolBtnPrimary}`}><Scissors size={14} /> Chunk It</div>
                    </div>

                    <span className={styles.ftUiChunkBadge} style={{ color: '#d946ef', background: 'rgba(217,70,239,0.15)' }}>Ready to Chunk</span>
                    <div className={styles.ftUiLine} style={{ width: '85%', marginTop: 2, background: 'rgba(255,255,255,0.1)' }} />
                    <div className={styles.ftUiLine} style={{ width: '50%', background: 'rgba(255,255,255,0.1)' }} />
                  </div>

                  {/* Nested Chunk 3: Blue */}
                  <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockExtracted}`} style={{ borderColor: '#6366f1' }}>
                    <span className={styles.ftUiChunkBadge} style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)' }}>Chunked</span>
                    <div className={styles.ftUiImagePlaceholder} style={{ height: '40px', marginTop: '6px' }}>
                      <ImageIcon size={14} color="rgba(99, 102, 241, 0.5)" />
                    </div>
                  </div>

                </div>

                {/* â”€â”€ Interactive Double Click Cursor â”€â”€ */}
                <style>{`
                  @keyframes cursorApproach {
                    0% { transform: translate(80px, 100px); opacity: 0; }
                    10% { opacity: 1; }
                    30% { transform: translate(0px, 0px); }
                    35% { transform: translate(0px, 0px) scale(0.9); }
                    40% { transform: translate(0px, 0px) scale(1); }
                    45% { transform: translate(0px, 0px) scale(0.9); }
                    50% { transform: translate(0px, 0px) scale(1); }
                    75% { transform: translate(0px, 0px); opacity: 1; }
                    85% { opacity: 0; }
                    100% { transform: translate(80px, 100px); opacity: 0; }
                  }
                  
                  @keyframes clickRippleEffect {
                    0%, 30% { transform: scale(0); opacity: 0; }
                    35% { transform: scale(1); opacity: 0.8; }
                    45% { transform: scale(3); opacity: 0; }
                    46% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1); opacity: 0.8; }
                    60% { transform: scale(3); opacity: 0; }
                    100% { transform: scale(3); opacity: 0; }
                  }
                  
                  @keyframes cardReaction {
                    0%, 30% {
                      transform: perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.2);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.1) inset, 0 0 20px rgba(168, 85, 247, 0.1);
                    }
                    /* First Click */
                    35% {
                      transform: perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(0.98);
                      border-color: rgba(168, 85, 247, 0.6);
                      box-shadow: 0 8px 30px rgba(168, 85, 247, 0.3), 0 0 0 1px rgba(168, 85, 247, 0.3) inset, 0 0 30px rgba(168, 85, 247, 0.3);
                    }
                    38% {
                      transform: perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.4);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.2) inset, 0 0 25px rgba(168, 85, 247, 0.2);
                    }
                    /* Second Click */
                    45% {
                      transform: perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(0.98);
                      border-color: rgba(168, 85, 247, 0.8);
                      box-shadow: 0 8px 30px rgba(168, 85, 247, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.4) inset, 0 0 45px rgba(168, 85, 247, 0.4);
                    }
                    /* Active Peak Glow state (entering nested canvas effect) */
                    50% {
                      transform: perspective(1000px) rotateY(-8deg) rotateX(3deg) scale(1.02);
                      border-color: rgba(217, 70, 239, 0.8);
                      box-shadow: 0 20px 50px rgba(217, 70, 239, 0.4), 0 0 0 1px rgba(217, 70, 239, 0.4) inset, 0 0 60px rgba(217, 70, 239, 0.4);
                    }
                    /* Return to Normal */
                    75%, 100% {
                      transform: perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.2);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.1) inset, 0 0 20px rgba(168, 85, 247, 0.1);
                    }
                  }
                `}</style>
                <div style={{ position: 'absolute', top: '16px', right: '160px', zIndex: 50, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: -6, left: -6, width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(168,85,247,0.8)', background: 'rgba(168,85,247,0.2)', animation: 'clickRippleEffect 4s infinite ease-out' }} />
                  <div style={{ animation: 'cursorApproach 4s infinite', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#a855f7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
                      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    </svg>
                    {/* Double-click to explore Chip attached to the mouse */}
                    <div style={{
                      background: 'rgba(168, 85, 247, 0.95)',
                      border: '1px solid rgba(168,85,247,0.4)',
                      borderRadius: '12px',
                      padding: '4px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 4px 12px rgba(168,85,247,0.4)',
                      marginTop: '4px',
                      marginLeft: '12px',
                      backdropFilter: 'blur(4px)',
                      whiteSpace: 'nowrap'
                    }}>
                      <div style={{width: 5, height: 5, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px #fff'}} />
                      <span style={{fontSize: 10, color: '#fff', fontWeight: 600, letterSpacing: '0.02em'}}>Double-click to explore</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* LAYER 2: Extracted Sections (Medium) */}
              
              {/* L2 Card 1: Purple (Top) */}
              <div className={`${styles.ftUiCard} ${styles.ftL2Float1}`} style={{ top: '12%', left: '48%', width: '220px' }}>
                <div className={`${styles.ftMagicalTooltip} ${styles.ftTooltipPurple}`}>
                  <Sparkles size={12} color="#a855f7" /> 5 entities extracted
                </div>
                <div className={styles.ftExtractedGlow} /> {/* Ambient Glow */}
                <div className={styles.ftUiCardHeader}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Search size={12} /></div>
                  <span className={styles.ftUiCardTitle}>Pain Points</span>
                </div>
                <div className={styles.ftUiCardBody}>
                  <div className={styles.ftUiLine} style={{ width: '100%' }} />
                  <div className={styles.ftUiLine} style={{ width: '60%' }} />
                </div>
              </div>

              {/* L2 Card 2: Pink (Middle) */}
              <div className={`${styles.ftUiCard} ${styles.ftL2Float2}`} style={{ top: '40%', left: '54%', width: '200px' }}>
                <div className={`${styles.ftMagicalTooltip} ${styles.ftTooltipPink}`}>
                  <Sparkles size={12} color="#d946ef" /> 3 items auto-assigned
                </div>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowPink}`} /> {/* Ambient Glow */}
                <div className={styles.ftUiCardHeader}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(217,70,239,0.1)', color: '#d946ef' }}><Menu size={12} /></div>
                  <span className={styles.ftUiCardTitle}>Action Items</span>
                </div>
                <div className={styles.ftUiCardBody}>
                  <div className={styles.ftUiTask}>
                    <div className={styles.ftUiCheck} style={{ borderColor: '#d946ef' }} />
                    <div className={styles.ftUiLine} style={{ width: '70%', margin: 0, background: 'rgba(255,255,255,0.1)' }} />
                  </div>
                </div>
              </div>

              {/* L2 Card 3: Blue (Bottom) */}
              <div className={`${styles.ftUiCard} ${styles.ftL2Float3}`} style={{ top: '68%', left: '59%', width: '200px' }}>
                <div className={`${styles.ftMagicalTooltip} ${styles.ftTooltipBlue}`}>
                  <Sparkles size={12} color="#6366f1" /> Added to backlog
                </div>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowBlue}`} /> {/* Ambient Glow */}
                <div className={styles.ftUiCardHeader}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><Link2 size={12} /></div>
                  <span className={styles.ftUiCardTitle}>Feature Requests</span>
                </div>
                <div className={styles.ftUiCardBody}>
                  <div className={styles.ftUiImagePlaceholder}>
                    <ImageIcon size={18} color="rgba(99, 102, 241, 0.5)" />
                  </div>
                  <div className={styles.ftUiLine} style={{ width: '60%', marginTop: '4px' }} />
                </div>
              </div>

              {/* LAYER 3: Atomic Nodes (Circular) */}
              
              {/* L3 Atom 1: Purple (Top) */}
              <div className={`${styles.ftUiAtom} ${styles.ftUiAtomPurple} ${styles.ftNodeFloat4}`} style={{ top: '10%', left: '82%' }}>
                <Target size={20} />
              </div>

              {/* L3 Atom 2: Pink (Middle) */}
              <div className={`${styles.ftUiAtom} ${styles.ftUiAtomPink} ${styles.ftNodeFloat1}`} style={{ top: '42%', left: '87%' }}>
                <Link2 size={20} />
              </div>

              {/* L3 Atom 3: Blue (Bottom) */}
              <div className={`${styles.ftUiAtom} ${styles.ftUiAtomBlue} ${styles.ftNodeFloat2}`} style={{ top: '70%', left: '92%' }}>
                <Zap size={20} />
              </div>

              {/* Multi-player Cursors */}

              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`} style={{ top: '25%', left: '60%' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#a855f7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#a855f7' }}>Sarah organizing</div>
              </div>

            </div>
          </div>
        </div>

        {/* â”€â”€ Two Column Feature Cards â”€â”€ */}
        <div className={styles.ftDualRow}>
          
          {/* Feature 1: Local Storage and Security */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText}>
              <div className={styles.ftDualBadge} style={{ color: '#3b82f6', borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)' }}>
                <ShieldCheck size={14} /> Local-First Security
              </div>
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #60a5fa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Your data stays on your device
              </h3>
              <p className={styles.ftDualDesc}>
                Experience zero-latency access with local-first storage. All your notes and documents are end-to-end encrypted for absolute privacy.
              </p>
            </div>
            
            <div className={styles.ftDualVisual}>
              
              {/* Floating ambient particles */}
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim1}`} style={{ top: '15%', left: '20%', width: '4px', height: '4px', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim2}`} style={{ top: '80%', left: '75%', width: '6px', height: '6px', background: '#60a5fa', boxShadow: '0 0 12px #60a5fa' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim3}`} style={{ top: '35%', left: '85%', width: '3px', height: '3px', background: '#fff', boxShadow: '0 0 8px #fff' }} />

              {/* Floating cursor */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim3}`} style={{ top: '35%', right: '15%', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#3b82f6', fontSize: '9px', padding: '1px 6px' }}>You</div>
              </div>

              {/* 3D Master Card inside viewport */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '60%', transform: 'perspective(1000px) rotateY(-14deg) rotateX(6deg)', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowPurple}`} style={{ opacity: 0.15, background: 'radial-gradient(circle at center, rgba(34,197,94,0.5) 0%, transparent 70%)' }} />
                
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(34,197,94,0.05) 100%)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 0 20px rgba(34,197,94,0.1)' }}>
                   <ShieldCheck size={28} color="#22c55e" />
                </div>
                
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Saved securely</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>Encrypted on your local disk</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', width: '100%' }}>
                  <HardDrive size={14} color="#60a5fa" />
                  <span style={{ fontSize: '12px', color: '#cbd5e1', fontFamily: 'monospace', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ~/local_data/vault.enc
                  </span>
                  <Lock size={12} color="#22c55e" />
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Flow State / Seamless UX */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText}>
              <div className={styles.ftDualBadge} style={{ color: '#ec4899', borderColor: 'rgba(236,72,153,0.3)', background: 'rgba(236,72,153,0.1)' }}>
                <Zap size={14} /> Flow State
              </div>
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Take notes & plan in one flow
              </h3>
              <p className={styles.ftDualDesc}>
                Experience a frictionless workspace. Capture knowledge in notes and instantly organize them into actionable project plans without breaking your flow.
              </p>
            </div>
            
            <div className={styles.ftDualVisual}>
              
              {/* Floating ambient particles */}
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim2}`} style={{ top: '25%', left: '80%', width: '5px', height: '5px', background: '#ec4899', boxShadow: '0 0 12px #ec4899' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim3}`} style={{ top: '70%', left: '15%', width: '4px', height: '4px', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }} />

              {/* Floating cursor representing flow */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim1}`} style={{ top: '35%', left: '25%', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ec4899" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
              </div>

              {/* 3D Flow Visual inside viewport */}
              <div className={`${styles.ftNodeFloat2}`} style={{ position: 'relative', width: '380px', height: '220px', margin: '0 auto', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg)' }}>
                <style>{`
                  @keyframes dashFlow {
                    to { stroke-dashoffset: -24; }
                  }
                `}</style>
                {/* Abstract SVG Connection */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
                  <path d="M 150 102 C 185 102, 185 170, 220 170" fill="none" stroke="url(#pinkPurpleGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" style={{ animation: 'dashFlow 1s linear infinite' }} />
                  <defs>
                    <linearGradient id="pinkPurpleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ec4899" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Source Note */}
                <div style={{ position: 'absolute', top: '15px', left: '10px', width: '140px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px', zIndex: 1, boxShadow: '0 12px 30px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                     <FileText size={14} color="#a855f7" />
                     <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>User Interview</span>
                   </div>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }} />
                     <div style={{ width: '70%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }} />
                     
                     {/* Highlighted text block to extract */}
                     <div style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.4)', borderRadius: '6px', padding: '8px', marginTop: '4px', position: 'relative' }}>
                       <div style={{ width: '90%', height: '4px', background: '#ec4899', borderRadius: '2px', marginBottom: '6px' }} />
                       <div style={{ width: '50%', height: '4px', background: '#ec4899', borderRadius: '2px', opacity: 0.7 }} />
                       {/* Visual Handle */}
                       <div style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#ec4899', border: '2px solid #1a1a1a', boxShadow: '0 0 10px rgba(236,72,153,0.6)' }} />
                     </div>
                   </div>
                </div>

                {/* Destination Project Board / Kanban Card */}
                <div style={{ position: 'absolute', top: '55px', right: '10px', width: '150px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: '12px', padding: '12px', zIndex: 1, boxShadow: '0 12px 30px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
                   <div className={styles.ftExtractedGlow} style={{ opacity: 0.3, background: 'radial-gradient(circle at center, rgba(236,72,153,0.5) 0%, transparent 70%)' }} />
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', position: 'relative' }}>
                     <Kanban size={14} color="#ec4899" />
                     <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>Launch Plan</span>
                   </div>
                   
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                     <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', position: 'relative' }}>
                       <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', marginBottom: '8px' }} />
                       <div style={{ width: '40%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }} />
                     </div>
                     
                     {/* The extracted block now as a task */}
                     <div style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.15) 100%)', border: '1px solid rgba(236,72,153,0.5)', borderRadius: '8px', padding: '10px', position: 'relative', borderLeft: '3px solid #ec4899', boxShadow: '0 4px 12px rgba(236,72,153,0.1)' }}>
                       {/* Visual Handle */}
                       <div style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7', border: '2px solid #1a1a1a', boxShadow: '0 0 10px rgba(168,85,247,0.6)' }} />
                       <div style={{ width: '85%', height: '4px', background: '#fff', borderRadius: '2px', marginBottom: '10px' }} />
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '10px', color: '#f472b6', fontWeight: 600 }}>New Feature</span>
                         <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#fff', fontWeight: 'bold' }}>J</div>
                       </div>
                     </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Split Feature Row: Linear meets Canvas â”€â”€ */}
        <div className={styles.ftSplitRow}>
          
          <div className={styles.ftSplitText}>
            <div className={styles.ftDualBadge} style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.1)' }}>
              <Sparkles size={14} /> The Best of Both Worlds
            </div>
            <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '38px' }}>
              Linear notes meet infinite canvas
            </h3>
            <p className={styles.ftDualDesc} style={{ maxWidth: '480px', marginBottom: '32px' }}>
              Chunkit completely fuses the focused, block-based writing approach of tools like Notion with the boundless, free-form spatial power of an infinite canvas like Milanote.
            </p>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: '#06b6d4', boxShadow: '0 0 6px rgba(6,182,212,0.5)' }} />
              <span>Write long-form docs with a rich block editor</span>
            </div>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: '#06b6d4', boxShadow: '0 0 6px rgba(6,182,212,0.5)' }} />
              <span>Extract any block into a spatial card instantly</span>
            </div>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: '#06b6d4', boxShadow: '0 0 6px rgba(6,182,212,0.5)' }} />
              <span>Connect ideas visually across a limitless board</span>
            </div>
          </div>

          <div className={`${styles.ftDualVisual} ${styles.ftSplitVisualModifier}`}>
            
            <div style={{ position: 'absolute', width: '700px', height: '100%', left: '50%', transform: 'translateX(-50%)' }}>
              
              {/* Ghost Blocks (Infinite Canvas background) */}
              
              {/* Ghost 1: Image Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '380px', top: '10px', width: '150px', height: '110px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-60px) scale(0.85)', opacity: 0.4, display: 'flex', flexDirection: 'column', padding: '12px', gap: '8px' }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageIcon size={18} color="rgba(255,255,255,0.15)" />
                </div>
              </div>

              {/* Ghost 2: Text Paragraph Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat1}`} style={{ left: '560px', top: '280px', width: '160px', height: '100px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-30px) scale(0.9)', opacity: 0.5, display: 'flex', flexDirection: 'column', padding: '16px', gap: '10px' }}>
                <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                <div className={styles.ftUiLine} style={{ width: '85%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                <div className={styles.ftUiLine} style={{ width: '95%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
              </div>

              {/* Ghost 3: Video Player Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat4}`} style={{ left: '600px', top: '20px', width: '140px', height: '100px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-120px) scale(0.65)', opacity: 0.15, display: 'flex', flexDirection: 'column', padding: '10px' }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.015)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                </div>
                <div className={styles.ftUiLine} style={{ width: '40%', height: '4px', background: 'rgba(255,255,255,0.04)', marginTop: '8px', alignSelf: 'center' }} />
              </div>

              {/* Ghost 4: Link Card Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat2}`} style={{ left: '360px', top: '330px', width: '160px', height: '60px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-10px) scale(0.95)', opacity: 0.6, display: 'flex', alignItems: 'center', padding: '12px', gap: '12px' }}>
                <div style={{ background: 'rgba(6,182,212,0.03)', padding: '6px', borderRadius: '4px' }}>
                  <Link2 size={12} color="rgba(6,182,212,0.3)" />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                  <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.03)' }} />
                </div>
              </div>

              {/* Ghost 5: Todo List Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '480px', top: '370px', width: '160px', height: '85px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-80px) scale(0.75)', opacity: 0.25, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }} />
                  <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.03)' }} />
                </div>
              </div>

              {/* Ghost 6: Small Attachment/File Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat4}`} style={{ left: '680px', top: '150px', width: '100px', height: '120px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-150px) scale(0.6)', opacity: 0.15, display: 'flex', flexDirection: 'column', padding: '10px', gap: '8px' }}>
                <div style={{ height: '60px', background: 'rgba(255,255,255,0.015)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }} />
                <div className={styles.ftUiLine} style={{ width: '80%', height: '4px', background: 'rgba(255,255,255,0.05)', marginTop: '4px' }} />
                <div className={styles.ftUiLine} style={{ width: '50%', height: '4px', background: 'rgba(255,255,255,0.03)' }} />
              </div>

              {/* Ghost 7: Table Placeholder (Behind Linear Doc) */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat2}`} style={{ left: '-20px', top: '10px', width: '220px', height: '110px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-40px) scale(0.85)', opacity: 0.4, display: 'flex', flexDirection: 'column', padding: '0', zIndex: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', gap: '10px' }}>
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.03)', padding: '12px', gap: '10px' }}>
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                </div>
                <div style={{ display: 'flex', padding: '12px', gap: '10px' }}>
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                  <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.04)' }} />
                </div>
              </div>

              {/* Ghost 8: H1 Fused Node Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat1}`} style={{ left: '160px', top: '350px', width: '200px', height: '90px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-100px) scale(0.7)', opacity: 0.2, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', zIndex: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>H1</span>
                  </div>
                  <div className={styles.ftUiLine} style={{ width: '60%', height: '6px', background: 'rgba(255,255,255,0.1)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '26px' }}>
                  <div className={styles.ftUiLine} style={{ width: '90%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                  <div className={styles.ftUiLine} style={{ width: '70%', height: '4px', background: 'rgba(255,255,255,0.05)' }} />
                </div>
              </div>

              {/* Ghost 9: Color Block Placeholder */}
              <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '-50px', top: '240px', width: '150px', height: '70px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-20px) scale(0.95)', opacity: 0.5, display: 'flex', alignItems: 'center', padding: '12px', gap: '10px', zIndex: 0, background: 'rgba(168, 85, 247, 0.05)', border: '1px dashed rgba(168, 85, 247, 0.15)' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.1)' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'rgba(168, 85, 247, 0.15)' }} />
                  <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'rgba(168, 85, 247, 0.1)' }} />
                </div>
              </div>

              {/* The Linear Doc (Notion style) */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '280px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg)', position: 'absolute', left: '80px', top: '80px', zIndex: 5 }}>
                 <div className={styles.ftUiCardHeader}>
                   <span className={styles.ftUiCardTitle} style={{ fontSize: '15px' }}>Product Requirements</span>
                 </div>
                 <div className={styles.ftUiCardBody}>
                   <div className={styles.ftUiLine} style={{ width: '90%', marginBottom: 8, height: '4px' }} />
                   <div className={styles.ftUiLine} style={{ width: '60%', marginBottom: 16, height: '4px' }} />
                   
                   {/* Ultra-Premium Selected Block */}
                   <div style={{ 
                      position: 'relative', 
                      padding: '12px 14px', 
                      background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, rgba(6,182,212,0.02) 100%)', 
                      border: '1px solid rgba(6,182,212,0.2)', 
                      borderLeft: '3px solid #06b6d4', 
                      borderRadius: '6px', 
                      boxShadow: '0 4px 12px rgba(6,182,212,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                      marginTop: '12px',
                      marginBottom: '12px'
                   }}>
                     
                     {/* Notion-style Action Menu (6-dots drag handle) */}
                     <div style={{ position: 'absolute', left: '-24px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', opacity: 1 }}>
                       <div style={{ width: '14px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,182,212,0.1)', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: '1px solid rgba(6,182,212,0.25)', cursor: 'grab' }}>
                         <svg width="4" height="10" viewBox="0 0 6 10" fill="#06b6d4">
                           <circle cx="1" cy="1" r="1.2" />
                           <circle cx="5" cy="1" r="1.2" />
                           <circle cx="1" cy="5" r="1.2" />
                           <circle cx="5" cy="5" r="1.2" />
                           <circle cx="1" cy="9" r="1.2" />
                           <circle cx="5" cy="9" r="1.2" />
                         </svg>
                       </div>
                     </div>

                     {/* Block Content */}
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                       <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(6,182,212,0.3)' }}>
                         <span style={{ fontSize: '9px', color: '#22d3ee', fontWeight: 700, lineHeight: 1 }}>T</span>
                       </div>
                       <span style={{ fontSize: '12px', fontWeight: 600, color: '#22d3ee', letterSpacing: '0.02em' }}>Extracted Text Block</span>
                     </div>
                     <div className={styles.ftUiLine} style={{ width: '90%', height: '4px', background: 'rgba(6,182,212,0.3)', marginBottom: '8px' }} />
                     <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                       <div className={styles.ftUiLine} style={{ width: '50%', height: '4px', background: 'rgba(6,182,212,0.2)' }} />
                       {/* Text Cursor indicator */}
                       <div style={{ width: '2px', height: '10px', background: '#22d3ee', borderRadius: '1px', boxShadow: '0 0 4px #22d3ee' }} />
                     </div>
                   </div>
                   
                   <div className={styles.ftUiLine} style={{ width: '100%', marginTop: 16, height: '4px' }} />
                   <div className={styles.ftUiLine} style={{ width: '40%', marginTop: 8, height: '4px' }} />
                 </div>
              </div>

              {/* Glowing extraction line connecting them */}
              <svg style={{ position: 'absolute', top: 0, left: '20px', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
                 <defs>
                   <linearGradient id="cyanBeam" x1="0%" y1="0%" x2="100%" y2="0%">
                     <stop offset="0%" stopColor="transparent" />
                     <stop offset="50%" stopColor="#06b6d4" />
                     <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
                   </linearGradient>
                   <filter id="glowFlow" x="-50%" y="-50%" width="200%" height="200%">
                     <feGaussianBlur stdDeviation="3" result="blur" />
                     <feComposite in="SourceGraphic" in2="blur" operator="over" />
                   </filter>
                 </defs>
                 <path id="linearToCanvasPath" d="M 280 230 C 340 230, 360 170, 430 170" stroke="url(#cyanBeam)" strokeWidth="2" strokeDasharray="4 4" fill="none" strokeLinecap="round">
                   <animate attributeName="stroke-dashoffset" from="8" to="0" dur="0.8s" repeatCount="indefinite" />
                 </path>
                 {/* Flying data particle */}
                 <circle r="4" fill="#fff" filter="url(#glowFlow)">
                   <animateMotion dur="2s" repeatCount="indefinite"><mpath href="#linearToCanvasPath" /></animateMotion>
                 </circle>
              </svg>

              {/* The Infinite Canvas Card (Milanote style) */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat2}`} style={{ width: '220px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg)', position: 'absolute', left: '440px', top: '130px' }}>
                 <div className={`${styles.ftExtractedGlow}`} style={{ background: 'rgba(6,182,212,0.4)', filter: 'blur(50px)' }} />
                 <div className={styles.ftUiCardHeader}>
                   <div className={styles.ftUiIconBox} style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4' }}>
                     <Target size={14} />
                   </div>
                   <span className={styles.ftUiCardTitle}>Canvas Node</span>
                 </div>
                 <div className={styles.ftUiCardBody}>
                   <div className={styles.ftUiLine} style={{ width: '100%', height: '4px' }} />
                   <div className={styles.ftUiLine} style={{ width: '70%', height: '4px' }} />
                 </div>
              </div>

              {/* Floating Cursors */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`} style={{ top: '170px', left: '330px', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#06b6d4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#06b6d4', fontSize: '9px', padding: '1px 6px' }}>Extracting...</div>
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Bottom Feature Bar â”€â”€ */}
        <div className={styles.ftBottomBar}>
          <div className={styles.ftBottomItem}>
            <div className={styles.ftBottomHead}>
              <span className={styles.ftBottomDot} />
              <span className={styles.ftBottomLabel}>Notes</span>
            </div>
            <p className={styles.ftBottomDesc}>Organize your thoughts in rich, structured note cards.</p>
          </div>
          <div className={styles.ftBottomItem}>
            <div className={styles.ftBottomHead}>
              <span className={styles.ftBottomDot} />
              <span className={styles.ftBottomLabel}>Connections</span>
            </div>
            <p className={styles.ftBottomDesc}>Link related ideas with visual edges across your canvas.</p>
          </div>
          <div className={styles.ftBottomItem}>
            <div className={styles.ftBottomHead}>
              <span className={styles.ftBottomDot} />
              <span className={styles.ftBottomLabel}>Nested Canvases</span>
            </div>
            <p className={styles.ftBottomDesc}>Drill into any card to reveal deeper layers of context.</p>
          </div>
          <div className={styles.ftBottomItem}>
            <div className={styles.ftBottomHead}>
              <span className={styles.ftBottomDot} />
              <span className={styles.ftBottomLabel}>Knowledge Graph</span>
            </div>
            <p className={styles.ftBottomDesc}>Visualize relationships and navigate your knowledge map.</p>
          </div>
        </div>

      </section>

      {/* â”€â”€ How It Works Walkthrough Section â”€â”€ */}
      <section className={styles.walkthroughSection} id="how-it-works">
        <div className={styles.wtHeader}>
          <span className={styles.ftBadge}>
            <span className={styles.ftBadgeDot} />
            HOW IT WORKS
          </span>
          <h2 className={styles.ftHeading}>Three simple steps to visual mastery</h2>
          <p className={styles.ftSub}>
            Infonote combines structured linear writing with limitless spatial connections. Here is the perfect loop that keeps your ideas alive and actionable.
          </p>
        </div>

        <div className={styles.wtStickyContainer}>
          {/* Left: Sticky text panel */}
          <div className={styles.wtStickyLeft}>
            <div className={styles.wtStickyTextInner}>
              {/* Step indicators */}
              <div className={styles.wtStepIndicators}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`${styles.wtStepDot} ${activeStep === i ? styles.wtStepDotActive : ''}`}
                    style={{
                      '--dot-color': ['#a855f7', '#d946ef', '#6366f1'][i]
                    } as React.CSSProperties}
                  />
                ))}
              </div>

              {/* Step 1 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 0 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>01</div>
                <div className={styles.wtBadgeStep} style={{ color: '#a855f7', borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.06)' }}>
                  <FileText size={14} /> CAPTURE
                </div>
                <h3 className={styles.wtStepTitle}>Write notes naturally</h3>
                <p className={styles.wtStepDesc}>
                  Start in a focused, high-performance editor. Write ideas, record meetings, and collect documents using standard linear text. No visual clutter, just raw thoughts instantly structured in blocks.
                </p>
              </div>

              {/* Step 2 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 1 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>02</div>
                <div className={styles.wtBadgeStep} style={{ color: '#d946ef', borderColor: 'rgba(217,70,239,0.3)', background: 'rgba(217,70,239,0.06)' }}>
                  <Scissors size={14} /> CHUNK IT
                </div>
                <h3 className={styles.wtStepTitle}>Extract blocks into layers</h3>
                <p className={styles.wtStepDesc}>
                  Hover over any paragraph, bullet, or list item. With one click, "chunk" it. This slices the text out, converting it into a separate visual block linked dynamically to your document.
                </p>
              </div>

              {/* Step 3 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 2 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>03</div>
                <div className={styles.wtBadgeStep} style={{ color: '#6366f1', borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
                  <Link2 size={14} /> CONNECT
                </div>
                <h3 className={styles.wtStepTitle}>Map your knowledge</h3>
                <p className={styles.wtStepDesc}>
                  Double-click any card to unlock its infinite sub-canvas. Create a visual network of cards, link ideas with glowing spatial paths, and navigate relationships in a rich, multi-layered knowledge map.
                </p>
              </div>
            </div>
          </div>

          {/* Right: Scrolling visual panels */}
          <div className={styles.wtScrollRight}>

            {/* Step 1 Visual */}
            <div className={styles.wtScrollPanel} ref={(el) => { stepRefs.current[0] = el; }}>
              <div style={{
                position: 'relative',
                width: '100%',
                minHeight: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px'
              }}>
                {/* Background Ambient Glow */}
                <div style={{ position: 'absolute', top: '20%', left: '20%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', filter: 'blur(30px)', zIndex: 0 }} />

                {/* The Editor Window */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  minHeight: '420px',
                  background: 'rgba(10, 10, 14, 0.7)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 1,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                }}>
                  {/* Custom Header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                      VIDEO_PROJECT.MD
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                       <style>{`
                         @keyframes wtAutoSaveAnim {
                           0%, 10% { opacity: 0; transform: translateY(-2px); }
                           20%, 45% { opacity: 1; transform: translateY(0); }
                           55%, 100% { opacity: 0; transform: translateY(-2px); }
                         }
                         @keyframes wtAiIconAnim {
                           0%, 55% { opacity: 0; transform: scale(0.8) rotate(-15deg); }
                           65%, 90% { opacity: 1; transform: scale(1) rotate(0deg); }
                           100% { opacity: 0; transform: scale(0.8) rotate(15deg); }
                         }
                       `}</style>
                       <div style={{ display: 'flex', alignItems: 'center', opacity: 0, animation: 'wtAutoSaveAnim 6s infinite ease-in-out' }}>
                          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', letterSpacing: '0.02em' }}>Auto-saving...</span>
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', opacity: 0, animation: 'wtAiIconAnim 6s infinite cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                          <div style={{ background: 'rgba(168,85,247,0.15)', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 10px rgba(168,85,247,0.2)' }}>
                            <Sparkles size={10} color="#d946ef" />
                          </div>
                       </div>
                    </div>
                  </div>

                  {/* Editor Content Area */}
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                    {/* H1 Typed Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '28px' }}>
                      {activeStep === 0 && (
                        <motion.div layoutId="shared-title" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', position: 'relative', width: 'max-content' }}>
                          <span className={styles.wtTypeText} style={{ display: 'inline-block', fontSize: '18px', maxWidth: '100%' }}># How to Master AI in 2026</span>
                        </motion.div>
                      )}
                    </div>

                    {/* Meta Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}><Zap size={10} color="#a855f7" /> Brainstorming</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}><Target size={10} color="#ec4899" /> Goal: 1M Views</span>
                    </div>

                    {/* Text Blocks */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }} />
                      <div style={{ width: '85%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }} />
                      <div style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }} />
                    </div>

                    {/* Video Placeholder Wrapper to prevent collapse */}
                    <div style={{ marginTop: 'auto', width: '100%', flex: 1, minHeight: '120px', position: 'relative' }}>
                      {activeStep === 0 && (
                        <motion.div layoutId="shared-video" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ position: 'absolute', inset: 0, borderRadius: '12px', background: 'linear-gradient(135deg, #1e1e24 0%, #0a0a0c 100%)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
                          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '12px 12px', opacity: 0.5 }} />
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, backdropFilter: 'blur(4px)', boxShadow: '0 0 20px rgba(168,85,247,0.3)', cursor: 'pointer' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f8fafc"><polygon points="8,5 19,12 8,19" /></svg>
                          </div>
                          <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', zIndex: 2 }}>
                            00:00 / 12:45
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Floating UI Elements */}
                <div style={{ position: 'absolute', top: '10%', right: '-10px', background: 'rgba(20,20,20,0.8)', backdropFilter: 'blur(10px)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', transform: 'rotate(4deg)' }}>
                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
                   <span style={{ fontSize: '10px', fontWeight: 600, color: '#fff' }}>Auto-saving</span>
                </div>

                <div style={{ position: 'absolute', bottom: '15%', left: '-15px', background: 'rgba(168,85,247,0.15)', backdropFilter: 'blur(10px)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', transform: 'rotate(-6deg)' }}>
                   <Sparkles size={18} color="#d8b4fe" />
                </div>
              </div>
            </div>

            {/* Step 2 Visual */}
            <div className={styles.wtScrollPanel} ref={(el) => { stepRefs.current[1] = el; }}>
              <div style={{
                position: 'relative',
                width: '100%',
                minHeight: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 24px',
                perspective: '1200px'
              }}>
                {/* Left Side: Text Editor Slice */}
                <div style={{
                  position: 'relative',
                  width: '320px',
                  maxWidth: '100%',
                  background: 'rgba(10, 10, 14, 0.8)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 2,
                  boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
                  transform: 'rotateX(2deg) scale(1.05)',
                  transformOrigin: 'center center',
                }}>
                  {/* Custom Header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.03)', animation: 'wtGhostFade 2s infinite alternate ease-out' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }} />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                      VIDEO_PROJECT.MD
                    </div>
                  </div>

                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Dimmed unselected content */}
                    <style>{`
                      @keyframes wtExtractZoom {
                        0%, 10% { transform: scale(1.0); }
                        90%, 100% { transform: scale(1.08); }
                      }
                      @keyframes wtGhostFade {
                        0%, 10% { opacity: 0.5; filter: blur(0px); }
                        90%, 100% { opacity: 0.15; filter: blur(4px); }
                      }
                    `}</style>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'wtGhostFade 2s infinite alternate ease-out' }}>
                      <div style={{ width: '80%', height: '6px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }} />
                      <div style={{ width: '60%', height: '6px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }} />
                    </div>
                    
                    {/* The chunked block (Highlighted) */}
                    <div style={{
                      marginTop: '8px',
                      padding: '16px',
                      background: 'rgba(217,70,239,0.1)',
                      borderRadius: '12px',
                      border: '1.5px dashed rgba(217,70,239,0.6)',
                      position: 'relative',
                      boxShadow: '0 0 30px rgba(217,70,239,0.15), inset 0 0 20px rgba(217,70,239,0.1)',
                      animation: 'wtExtractZoom 2s infinite alternate ease-out',
                      transformOrigin: 'center left',
                      zIndex: 10
                    }}>
                      <div style={{ position: 'absolute', top: -14, right: -14, background: 'linear-gradient(135deg, #d946ef, #a855f7)', color: '#fff', fontSize: '10px', padding: '6px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 8px 16px rgba(217,70,239,0.4)', zIndex: 10, fontWeight: 800, letterSpacing: '0.05em' }}>
                         <Scissors size={12} /> EXTRACTING
                      </div>
                      <div style={{ minHeight: '21px', marginBottom: '12px' }}>
                        {activeStep === 1 && (
                          <motion.div layoutId="shared-title" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', textShadow: '0 2px 10px rgba(255,255,255,0.2)' }}>
                            # How to Master AI in 2026
                          </motion.div>
                        )}
                      </div>
                      {/* Video Placeholder (Same as Step 1) */}
                      <div style={{ width: '100%', height: '90px', position: 'relative' }}>
                        {activeStep === 1 && (
                          <motion.div layoutId="shared-video" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ position: 'absolute', inset: 0, borderRadius: '8px', background: 'linear-gradient(135deg, #1e1e24 0%, #0a0a0c 100%)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)', zIndex: 5 }}>
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '12px 12px', opacity: 0.5 }} />
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, backdropFilter: 'blur(4px)', boxShadow: '0 0 20px rgba(168,85,247,0.3)', cursor: 'pointer' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f8fafc"><polygon points="8,5 19,12 8,19" /></svg>
                            </div>
                            <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', zIndex: 2 }}>
                              00:00 / 12:45
                            </div>
                          </motion.div>
                        )}
                      </div>
                      
                      {/* Connection anchor */}
                      <div style={{ position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#d946ef', boxShadow: '0 0 15px #d946ef, 0 0 30px #d946ef' }} />
                    </div>
                    
                    {/* Dimmed unselected content */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', animation: 'wtGhostFade 2s infinite alternate ease-out' }}>
                      <div style={{ width: '90%', height: '6px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }} />
                      <div style={{ width: '40%', height: '6px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 Visual */}
            <div className={styles.wtScrollPanel} ref={(el) => { stepRefs.current[2] = el; }}>
              <div style={{
                position: 'relative',
                width: '100%',
                minHeight: '700px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
                perspective: '1200px'
              }}>
                {/* Custom Animations for Step 3 Mini Cards */}
                <style>{`
                  @keyframes wtCardFloat {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-6px) scale(1.03); }
                  }
                  @keyframes wtScriptLineFill {
                    0%, 30% { width: 0%; }
                    60%, 80% { width: 100%; }
                    90%, 100% { width: 0%; }
                  }
                  @keyframes wtTodoBg {
                    0%, 30% { background: transparent; border-color: rgba(255,255,255,0.3); }
                    35% { background: #10b981; border-color: #10b981; }
                    100% { background: #10b981; border-color: #10b981; }
                  }
                  @keyframes wtTodoCheckmark {
                    0%, 30% { opacity: 0; }
                    35% { opacity: 1; }
                    100% { opacity: 1; }
                  }
                  @keyframes wtTodoStrike {
                    0%, 30% { width: 0%; }
                    35%, 100% { width: 100%; }
                  }
                  @keyframes wtLineDash {
                    to { stroke-dashoffset: -24; }
                  }
                `}</style>

                {/* Connecting SVG Lines */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
                  <defs>
                    <linearGradient id="lineGradTR" x1="50%" y1="50%" x2="80%" y2="20%">
                      <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
                      <stop offset="100%" stopColor="rgba(236,72,153,0.5)" />
                    </linearGradient>
                    <linearGradient id="lineGradBR" x1="50%" y1="50%" x2="80%" y2="80%">
                      <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
                      <stop offset="100%" stopColor="rgba(6,182,212,0.5)" />
                    </linearGradient>
                    <linearGradient id="lineGradTL" x1="50%" y1="50%" x2="20%" y2="20%">
                      <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
                      <stop offset="100%" stopColor="rgba(16,185,129,0.5)" />
                    </linearGradient>
                    <linearGradient id="lineGradBL" x1="50%" y1="50%" x2="20%" y2="80%">
                      <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
                      <stop offset="100%" stopColor="rgba(245,158,11,0.5)" />
                    </linearGradient>
                  </defs>
                  {/* The paths */}
                  <line x1="50%" y1="50%" x2="80%" y2="20%" stroke="url(#lineGradTR)" strokeWidth="1.5" strokeDasharray="4 8" strokeLinecap="round" />
                  <line x1="50%" y1="50%" x2="80%" y2="80%" stroke="url(#lineGradBR)" strokeWidth="1.5" strokeDasharray="4 8" strokeLinecap="round" />
                  <line x1="50%" y1="50%" x2="20%" y2="20%" stroke="url(#lineGradTL)" strokeWidth="1.5" strokeDasharray="4 8" strokeLinecap="round" />
                  <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="url(#lineGradBL)" strokeWidth="1.5" strokeDasharray="4 8" strokeLinecap="round" />
                </svg>

                {/* Central Node (The Extracted Chunk from Step 2) */}
                <div style={{
                  position: 'relative',
                  width: '300px',
                  background: 'rgba(10, 10, 14, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(99,102,241,0.5)',
                  padding: '32px',
                  zIndex: 5,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px'
                }}>
                   <div style={{ minHeight: '60px', display: 'flex', alignItems: 'center' }}>
                     {activeStep >= 2 && (
                       <motion.div layoutId="shared-title" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2, textShadow: '0 2px 10px rgba(255,255,255,0.1)', width: '200px' }}>
                         # How to Master AI in 2026
                       </motion.div>
                     )}
                   </div>
                   
                   <div style={{ width: '100%', height: '140px', position: 'relative' }}>
                     {activeStep >= 2 && (
                       <motion.div layoutId="shared-video" transition={{ type: 'spring', bounce: 0, duration: 0.6 }} style={{ position: 'absolute', inset: 0, borderRadius: '8px', background: 'linear-gradient(135deg, #1e1e24 0%, #0a0a0c 100%)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
                         {/* Subtle crosses pattern for video bg */}
                         <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.5 }} />
                         <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, backdropFilter: 'blur(4px)', boxShadow: '0 0 20px rgba(168,85,247,0.3)', cursor: 'pointer' }}>
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="#f8fafc"><polygon points="8,5 19,12 8,19" /></svg>
                         </div>
                         <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', padding: '6px 10px', borderRadius: '4px', fontSize: '11px', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', zIndex: 2 }}>
                           00:00 / 12:45
                         </div>
                       </motion.div>
                     )}
                   </div>

                   <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ width: '85%', height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
                      <div style={{ width: '50%', height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
                   </div>
                </div>

                {/* Outer Nodes */}
                
                {/* Top Right Node: Texts / Script */}
                <div style={{
                  position: 'absolute',
                  top: '20%',
                  left: '80%',
                  transform: 'translateY(-50%)',
                  width: '150px',
                  background: 'rgba(20, 16, 26, 0.85)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(236,72,153,0.4)',
                  padding: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.4), 0 0 15px rgba(236,72,153,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  zIndex: 2
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899', boxShadow: '0 0 8px #ec4899' }} />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, letterSpacing: '0.02em' }}>SCRIPT</span>
                  </div>
                  {/* Animated Mock Editor */}
                  <div style={{ padding: '10px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: '#ec4899', animation: 'wtScriptLineFill 4s infinite cubic-bezier(0.4, 0, 0.2, 1) 0s' }} />
                    </div>
                    <div style={{ width: '85%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'rgba(255,255,255,0.6)', animation: 'wtScriptLineFill 4s infinite cubic-bezier(0.4, 0, 0.2, 1) 0.4s' }} />
                    </div>
                    <div style={{ width: '90%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'rgba(255,255,255,0.6)', animation: 'wtScriptLineFill 4s infinite cubic-bezier(0.4, 0, 0.2, 1) 0.8s' }} />
                    </div>
                    <div style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'rgba(255,255,255,0.6)', animation: 'wtScriptLineFill 4s infinite cubic-bezier(0.4, 0, 0.2, 1) 1.2s' }} />
                    </div>
                  </div>
                </div>

                {/* Bottom Right Node: Wireframe */}
                <div style={{
                  position: 'absolute',
                  top: '80%',
                  left: '80%',
                  transform: 'translateY(-50%)',
                  width: '160px',
                  background: 'rgba(20, 16, 26, 0.85)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(6,182,212,0.4)',
                  padding: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.4), 0 0 15px rgba(6,182,212,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  zIndex: 2
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 8px #06b6d4' }} />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, letterSpacing: '0.02em' }}>LINKS</span>
                  </div>
                  {/* Mock Links List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                     {[1, 2, 3].map((_, i) => (
                       <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(6,182,212,0.1)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(6,182,212,0.2)' }}>
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(6,182,212,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                           <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                           <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                         </svg>
                         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                           <div style={{ width: '80%', height: '3px', background: 'rgba(6,182,212,0.6)', borderRadius: '2px' }} />
                           <div style={{ width: '50%', height: '3px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }} />
                         </div>
                       </div>
                     ))}
                  </div>
                </div>

                {/* Top Left Node: Todo List */}
                <div style={{
                  position: 'absolute',
                  top: '20%',
                  right: '80%',
                  transform: 'translateY(-50%)',
                  width: '150px',
                  background: 'rgba(20, 16, 26, 0.85)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(16,185,129,0.4)',
                  padding: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.4), 0 0 15px rgba(16,185,129,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  zIndex: 2
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, letterSpacing: '0.02em' }}>TODO</span>
                  </div>
                  {/* Animated Mock Checkboxes */}
                  {[
                    { w: '100%', delay: '0s' },
                    { w: '80%', delay: '0.8s' },
                    { w: '60%', delay: '1.6s' }
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: `wtTodoBg 4s infinite ease-in-out ${item.delay}` }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" style={{ animation: `wtTodoCheckmark 4s infinite ease-in-out ${item.delay}` }}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, display: 'flex' }}>
                        <div style={{ width: item.w, height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: '2px', background: '#10b981', animation: `wtTodoStrike 4s infinite ease-in-out ${item.delay}` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Left Node: Inspiration Card */}
                <div style={{
                  position: 'absolute',
                  top: '80%',
                  right: '80%',
                  transform: 'translateY(-50%)',
                  width: '150px',
                  background: 'rgba(20, 16, 26, 0.85)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '12px',
                  border: '1px solid rgba(245,158,11,0.4)',
                  padding: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.4), 0 0 15px rgba(245,158,11,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  zIndex: 2
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, letterSpacing: '0.02em' }}>INSPIRATION</span>
                  </div>
                  {/* Folder icon mockup */}
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                     <div style={{ flex: 1, height: '44px', background: 'rgba(245,158,11,0.15)', borderRadius: '6px', border: '1px dashed rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                       </svg>
                     </div>
                     <div style={{ width: '28px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                       <div style={{ width: '100%', height: '19px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
                       <div style={{ width: '100%', height: '19px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
                     </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Competitor Fusion Section ── */}
      <section className={styles.fusionSection}>
        <div className={styles.fusionGlowBg} />
        
        <div className={styles.fusionHeader}>
          <div className={styles.fusionSuperTitle}>All-in-One Optimization</div>
          <h2 className={styles.fusionTitle}>Works Seamlessly Across All Tools</h2>
          <p className={styles.fusionSubtitle}>
            We fuse the experiences of Notion, Milanote, Scrintal, Affine, and OneNote into one seamless workflow.
          </p>
        </div>

        <div className={styles.fusionCarousel}>
           {/* Card 1: Notion */}
           <motion.div 
              initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
              whileInView={{ x: -320, z: -150, rotateY: 30, scale: 1, opacity: 0.2 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className={styles.fusionCard}
           >
              <img src="https://cdn.simpleicons.org/notion/ffffff" alt="Notion" style={{ width: '56px', height: '56px' }} />
           </motion.div>

           {/* Card 2: Milanote */}
           <motion.div
              initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
              whileInView={{ x: -220, z: -100, rotateY: 20, scale: 1, opacity: 0.5 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ zIndex: 4 }}
              className={styles.fusionCard}
           >
              <img src="https://cdn.simpleicons.org/milanote/ef4444" alt="Milanote" style={{ width: '56px', height: '56px' }} />
           </motion.div>
           
           {/* Card 3: OneNote */}
           <motion.div
              initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
              whileInView={{ x: -120, z: -50, rotateY: 10, scale: 1, opacity: 0.8 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ zIndex: 6 }}
              className={styles.fusionCard}
           >
              <img src="https://cdn.simpleicons.org/microsoftonenote/a855f7" alt="OneNote" style={{ width: '56px', height: '56px' }} />
           </motion.div>

           {/* Card Center: Chunkit */}
           <motion.div
              initial={{ x: 0, z: 0, rotateY: 0, scale: 0.5, opacity: 0 }}
              whileInView={{ x: 0, z: 0, rotateY: 0, scale: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{ zIndex: 10 }}
              className={styles.fusionCardCenter}
           >
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
           </motion.div>

           {/* Card 4: Scrintal */}
           <motion.div
              initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
              whileInView={{ x: 140, z: -50, rotateY: -15, scale: 1, opacity: 0.7 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ zIndex: 5 }}
              className={styles.fusionCard}
           >
              <div style={{ color: '#fbbf24', fontSize: '56px', fontWeight: 700, fontStyle: 'italic', fontFamily: 'serif', lineHeight: 1 }}>S</div>
           </motion.div>

           {/* Card 5: Affine */}
           <motion.div
              initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
              whileInView={{ x: 260, z: -100, rotateY: -25, scale: 1, opacity: 0.3 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={styles.fusionCard}
           >
              <img src="https://cdn.simpleicons.org/affine/3b82f6" alt="Affine" style={{ width: '56px', height: '56px' }} />
           </motion.div>
        </div>

        <div style={{ marginTop: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <button className={styles.navButton} style={{ padding: '14px 36px', fontSize: '15px' }}>
            <span>VIEW DEMO</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
             <div style={{ display: 'flex', position: 'relative' }}>
                <img src="https://i.pravatar.cc/100?img=4" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #111' }} />
                <img src="https://i.pravatar.cc/100?img=5" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #111', marginLeft: '-10px' }} />
                <img src="https://i.pravatar.cc/100?img=6" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #111', marginLeft: '-10px' }} />
                <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #111', marginLeft: '-10px', background: '#333', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>+1k</div>
             </div>
             Trusted by 1,200+ teams who turned ideas into real digital products.
          </div>
        </div>
      </section>

      {/* â”€â”€ Testimonials Section â”€â”€ */}
      <section className={styles.testimonialSection}>
        <div className={styles.testimonialHeader}>
          <h2 className={styles.testimonialTitle}>Loved by thinkers, creators, and teams</h2>
          <p className={styles.testimonialSub}>Join thousands of users building their second brain.</p>
        </div>

        <div className={styles.testimonialSlider}>
          <div className={styles.testimonialTrack}>
            {[
              { quote: "The ability to extract chunks into a canvas is a game-changer. My brain finally feels organized.", name: "Alex M.", role: "Product Designer" },
              { quote: "It's like Notion and Milanote had a baby. The perfect balance of linear writing and spatial thinking.", name: "Sarah J.", role: "Founder" },
              { quote: "I use Infonote for everything from my daily tasks to mapping out complex system architectures.", name: "David K.", role: "Software Engineer" },
              { quote: "The visual-first approach just clicks for me. I've abandoned all my other note-taking apps.", name: "Emma R.", role: "Content Strategist" },
              { quote: "Fast, beautiful, and deeply powerful. The node graph helps me see connections I missed before.", name: "Michael T.", role: "Researcher" },
              { quote: "It feels magical. Hovering over a block and dragging it onto an infinite canvas is pure joy.", name: "Lisa W.", role: "Creative Director" },
              // Duplicate the list to create a seamless infinite scrolling effect
              { quote: "The ability to extract chunks into a canvas is a game-changer. My brain finally feels organized.", name: "Alex M.", role: "Product Designer" },
              { quote: "It's like Notion and Milanote had a baby. The perfect balance of linear writing and spatial thinking.", name: "Sarah J.", role: "Founder" },
              { quote: "I use Infonote for everything from my daily tasks to mapping out complex system architectures.", name: "David K.", role: "Software Engineer" },
              { quote: "The visual-first approach just clicks for me. I've abandoned all my other note-taking apps.", name: "Emma R.", role: "Content Strategist" },
              { quote: "Fast, beautiful, and deeply powerful. The node graph helps me see connections I missed before.", name: "Michael T.", role: "Researcher" },
              { quote: "It feels magical. Hovering over a block and dragging it onto an infinite canvas is pure joy.", name: "Lisa W.", role: "Creative Director" }
            ].map((t, i) => (
              <div key={i} className={styles.testimonialCard}>
                <div className={styles.testimonialQuote}>"{t.quote}"</div>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.testimonialAvatar}>{t.name.charAt(0)}</div>
                  <div className={styles.testimonialMeta}>
                    <div className={styles.testimonialName}>{t.name}</div>
                    <div className={styles.testimonialRole}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ Methodology Accordion Section â”€â”€ */}
      <section className={styles.accordionSection}>
        <div className={styles.accordionContainer}>
          {accordionData.map((item, index) => {
            const isActive = activeAccordion === index;
            return (
              <div 
                key={index} 
                className={`${styles.accordionItem} ${isActive ? styles.active : styles.inactive}`}
                onClick={() => setActiveAccordion(index)}
              >
                {/* Expanded Content */}
                <div className={styles.accordionContent}>
                  <div className={styles.accHeaderRow}>
                    <div className={styles.accIconBox} style={{ color: item.color, background: `${item.color}15`, border: `1px solid ${item.color}30` }}>
                      {React.cloneElement(item.icon as any, { size: 24, strokeWidth: 2.5 })}
                    </div>
                    <h3 className={styles.accTitle}>{item.title}</h3>
                  </div>
                  <p className={styles.accDesc}>{item.desc}</p>
                  <div className={styles.accImageWrapper}>
                    {item.svg}
                  </div>
                </div>

                {/* Collapsed Sidebar */}
                <div className={styles.accordionSidebar}>
                  <div className={styles.accVerticalText}>{item.title}</div>
                  <div className={styles.accSidebarIcon} style={{ color: isActive ? 'transparent' : item.color }}>
                    {React.cloneElement(item.icon as any, { size: 20 })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};
