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
import mindmapVisual from '../assets/mindmap_visual.png';
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
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: 'transparent' }}>
          <defs>
            {/* Cinematic Multi-layered Bloom Glow */}
            <filter id="para-glow-heavy" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blurMedium" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurMedium" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            {/* Subtler Bloom for smaller elements */}
            <filter id="para-glow-light" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Rich multi-color ambient hub aura */}
            <radialGradient id="para-hub-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.5"/>
              <stop offset="40%" stopColor="#f43f5e" stopOpacity="0.15"/>
              <stop offset="100%" stopColor="#f97316" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="para-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.8"/>
              <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.8"/>
            </linearGradient>
            <pattern id="para-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="none" />
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(249, 115, 22, 0.05)" strokeWidth="0.5"/>
            </pattern>
          </defs>

          {/* Background Technical Grid */}
          <rect width="100%" height="100%" fill="url(#para-grid)" />

          {/* Central Routing Hub Glow */}
          <circle cx="400" cy="200" r="160" fill="url(#para-hub-glow)">
             <animate attributeName="opacity" values="0.3;0.8;0.3" dur="5s" repeatCount="indefinite" />
          </circle>

          {/* --- DATA ARTERIES --- */}
          <g fill="none" stroke="url(#para-line-grad)" strokeWidth="1.5" strokeLinecap="round">
            {/* To Projects */}
            <path d="M 400 200 C 400 100, 330 100, 260 100" />
            {/* To Areas */}
            <path d="M 400 200 C 400 300, 330 300, 260 300" />
            {/* To Resources */}
            <path d="M 400 200 C 400 100, 470 100, 540 100" />
            {/* To Archives */}
            <path d="M 400 200 C 400 300, 470 300, 540 300" />
          </g>

          {/* Animated Flow Packets */}
          <g fill="#fff" filter="url(#para-glow-light)">
            {/* P-Flow */}
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 260 100 C 330 100, 400 100, 400 200" dur="1.2s" repeatCount="indefinite" />
            </circle>
            {/* A-Flow */}
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 260 300 C 330 300, 400 300, 400 200" dur="2.5s" repeatCount="indefinite" />
            </circle>
            {/* R-Flow */}
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 540 100 C 470 100, 400 100, 400 200" dur="1.8s" repeatCount="indefinite" />
            </circle>
            {/* Arch-Flow */}
            <circle cx="0" cy="0" r="2">
              <animateMotion path="M 400 200 C 400 300, 470 300, 540 300" dur="4s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* --- CENTRAL HUB (THE BRAIN) --- */}
          <g transform="translate(400, 200)">
            <g>
              <animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="4s" repeatCount="indefinite" />
              
              {/* Glowing Brain SVG */}
              <g transform="scale(3) translate(-12, -13)" strokeLinecap="round" strokeLinejoin="round">
                {/* Dark Structural Fill (NO FILTER) */}
                <g fill="rgba(20,5,0,0.9)" stroke="none">
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                </g>
                
                {/* Glowing Stroke Only */}
                <g fill="none" stroke="#f97316" strokeWidth="1" filter="url(#para-glow-heavy)">
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
              <g transform="scale(3) translate(-12, -13)" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 4">
                <animate attributeName="stroke-dashoffset" values="6;0" dur="1s" repeatCount="indefinite" />
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
              </g>
            </g>

          </g>

          {/* --- [P] PROJECTS QUADRANT (Top Left) --- */}
          <g transform="translate(180, 100)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-4; 0,0" dur="3s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="rgba(15,5,10,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="none" stroke="#f43f5e" strokeWidth="1.5" filter="url(#para-glow-light)" />
              {/* Header */}
              <rect x="-80" y="-40" width="160" height="24" rx="8" fill="rgba(244,63,94,0.15)" />
              <text x="-70" y="-24" fill="#fbcfe8" fontSize="11" fontWeight="bold" fontFamily="monospace" letterSpacing="1.5">[P] PROJECTS</text>
              <circle cx="65" cy="-28" r="4" fill="#f43f5e" filter="url(#para-glow-light)">
                <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
              </circle>
              {/* Visuals: Active Tasks */}
              <rect x="-65" y="-4" width="90" height="6" rx="3" fill="#f43f5e" opacity="0.9" filter="url(#para-glow-light)" />
              <rect x="-65" y="10" width="120" height="6" rx="3" fill="#f43f5e" opacity="0.5" />
              <rect x="-65" y="24" width="70" height="6" rx="3" fill="#f43f5e" opacity="0.3" />
              {/* Vertical timeline */}
              <line x1="-72" y1="-2" x2="-72" y2="26" stroke="#f43f5e" strokeWidth="2" strokeDasharray="2 2" />
            </g>
          </g>

          {/* --- [A] AREAS QUADRANT (Bottom Left) --- */}
          <g transform="translate(180, 300)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,3; 0,0" dur="4.5s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="rgba(15,10,5,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" filter="url(#para-glow-light)" />
              {/* Header */}
              <rect x="-80" y="-40" width="160" height="24" rx="8" fill="rgba(245,158,11,0.15)" />
              <text x="-70" y="-24" fill="#fef3c7" fontSize="11" fontWeight="bold" fontFamily="monospace" letterSpacing="1.5">[A] AREAS</text>
              {/* Visuals: Pillars / Foundations */}
              <circle cx="-50" cy="12" r="16" fill="none" stroke="#f59e0b" strokeWidth="2.5" filter="url(#para-glow-light)" />
              <circle cx="-50" cy="12" r="8" fill="#f59e0b" opacity="0.6" />
              <circle cx="0" cy="12" r="16" fill="none" stroke="#f59e0b" strokeWidth="2.5" filter="url(#para-glow-light)" />
              <circle cx="0" cy="12" r="8" fill="#f59e0b" opacity="0.6" />
              <circle cx="50" cy="12" r="16" fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.4" />
            </g>
          </g>

          {/* --- [R] RESOURCES QUADRANT (Top Right) --- */}
          <g transform="translate(620, 100)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="3.8s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="rgba(5,15,20,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="none" stroke="#06b6d4" strokeWidth="1.5" filter="url(#para-glow-light)" />
              {/* Header */}
              <rect x="-80" y="-40" width="160" height="24" rx="8" fill="rgba(6,182,212,0.15)" />
              <text x="-70" y="-24" fill="#cffafe" fontSize="11" fontWeight="bold" fontFamily="monospace" letterSpacing="1.5">[R] RESOURCES</text>
              {/* Visuals: Data Grid */}
              <g fill="#06b6d4">
                <rect x="-65" y="-5" width="20" height="12" rx="2" opacity="0.9" filter="url(#para-glow-light)" />
                <rect x="-40" y="-5" width="20" height="12" rx="2" opacity="0.5" />
                <rect x="-15" y="-5" width="20" height="12" rx="2" opacity="0.3" />
                <rect x="10" y="-5" width="20" height="12" rx="2" opacity="0.7" />
                <rect x="35" y="-5" width="20" height="12" rx="2" opacity="0.4" />
                <rect x="-65" y="12" width="20" height="12" rx="2" opacity="0.2" />
                <rect x="-40" y="12" width="20" height="12" rx="2" opacity="0.8" filter="url(#para-glow-light)" />
                <rect x="-15" y="12" width="20" height="12" rx="2" opacity="0.6" />
                <rect x="10" y="12" width="20" height="12" rx="2" opacity="0.2" />
                <rect x="35" y="12" width="20" height="12" rx="2" opacity="0.5" />
              </g>
            </g>
          </g>

          {/* --- [A] ARCHIVES QUADRANT (Bottom Right) --- */}
          <g transform="translate(620, 300)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,2; 0,0" dur="6s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="rgba(10,10,15,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-80" y="-40" width="160" height="80" rx="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" filter="url(#para-glow-light)" />
              {/* Header */}
              <rect x="-80" y="-40" width="160" height="24" rx="8" fill="rgba(255,255,255,0.05)" />
              <text x="-70" y="-24" fill="rgba(255,255,255,0.8)" fontSize="11" fontWeight="bold" fontFamily="monospace" letterSpacing="1.5">[A] ARCHIVES</text>
              {/* Visuals: Cold Storage Stacks */}
              <g fill="rgba(255,255,255,0.1)">
                <rect x="-60" y="-5" width="120" height="8" rx="2" />
                <rect x="-60" y="8" width="120" height="8" rx="2" />
                <rect x="-60" y="21" width="120" height="8" rx="2" />
              </g>
              <line x1="-50" y1="-1" x2="-20" y2="-1" stroke="#fff" strokeWidth="2" opacity="0.5" filter="url(#para-glow-light)" />
              <line x1="-50" y1="12" x2="10" y2="12" stroke="#fff" strokeWidth="2" opacity="0.4" filter="url(#para-glow-light)" />
            </g>
          </g>
        </svg>
      )
    },
    {
      title: "Zettelkasten",
      desc: "Create atomic notes and interconnect them organically. Foster emergent ideas through bidirectional linking and spatial mapping.",
      icon: <Link2 />,
      color: "#06b6d4",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: 'transparent' }}>
          <defs>
            <filter id="zk-glow-heavy" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blurMedium" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurMedium" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="zk-glow-light" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <pattern id="zk-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="none" />
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5"/>
            </pattern>
          </defs>

          {/* Background Technical Grid */}
          <rect width="100%" height="100%" fill="url(#zk-grid)" />

          {/* CONNECTIONS (Static Lines) */}
          <g fill="none" strokeWidth="2" strokeLinecap="round" opacity="0.4">
            {/* Inputs to Notes (Cyan) */}
            <path d="M 100 40 C 160 40, 160 70, 220 70" stroke="#93c5fd" />
            <path d="M 100 100 C 160 100, 160 70, 220 70" stroke="#93c5fd" />
            <path d="M 100 180 C 160 180, 160 270, 220 270" stroke="#93c5fd" />
            <path d="M 100 240 C 160 240, 160 270, 220 270" stroke="#93c5fd" />
            <path d="M 100 300 C 160 300, 160 270, 220 270" stroke="#93c5fd" />
            <path d="M 100 360 C 160 360, 160 270, 220 270" stroke="#93c5fd" />

            {/* Notes to Factory (Yellow) */}
            <path d="M 320 70 C 340 70, 340 170, 370 170" stroke="#facc15" />
            <path d="M 320 270 C 340 270, 340 170, 370 170" stroke="#facc15" />

            {/* Factory to Permanent (Red) */}
            <path d="M 450 170 C 480 170, 480 155, 510 155" stroke="#f43f5e" />
          </g>

          {/* Animated Particles */}
          <g fill="#fff" filter="url(#zk-glow-light)">
            {/* Inputs -> Notes */}
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 40 C 160 40, 160 70, 220 70" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 100 C 160 100, 160 70, 220 70" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 180 C 160 180, 160 270, 220 270" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 240 C 160 240, 160 270, 220 270" dur="2.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 300 C 160 300, 160 270, 220 270" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5" fill="#93c5fd">
              <animateMotion path="M 100 360 C 160 360, 160 270, 220 270" dur="3s" repeatCount="indefinite" />
            </circle>

            {/* Notes -> Factory */}
            <circle cx="0" cy="0" r="3" fill="#facc15">
              <animateMotion path="M 320 70 C 340 70, 340 170, 370 170" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="3" fill="#facc15">
              <animateMotion path="M 320 270 C 340 270, 340 170, 370 170" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Factory -> Permanent */}
            <circle cx="0" cy="0" r="3" fill="#f43f5e">
              <animateMotion path="M 450 170 C 480 170, 480 155, 510 155" dur="1.2s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* --- COL 1: INPUTS --- */}
          <g transform="translate(30, 28)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5 M9 18h6 M10 22h4" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Ideas</text>
          </g>
          
          <g transform="translate(30, 88)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Thoughts</text>
          </g>

          <g transform="translate(30, 168)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Books</text>
          </g>

          <g transform="translate(30, 228)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Articles</text>
          </g>

          <g transform="translate(30, 288)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Podcasts</text>
          </g>

          <g transform="translate(30, 348)">
            <g stroke="#93c5fd" strokeWidth="1.5" fill="none" filter="url(#zk-glow-light)">
              <path d="m22 8-6 4 6 4V8Z M2 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <text x="35" y="16" fill="#93c5fd" fontSize="12" fontFamily="monospace">Videos</text>
          </g>

          {/* --- COL 2: FLEETING & LITERATURE --- */}
          <g transform="translate(220, 35)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="3.5s" repeatCount="indefinite" />
              <rect x="0" y="0" width="115" height="70" rx="6" fill="rgba(20,15,5,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="0" y="0" width="115" height="70" rx="6" fill="none" stroke="#facc15" strokeWidth="1.5" filter="url(#zk-glow-light)" />
              <rect x="0" y="0" width="115" height="22" rx="6" fill="rgba(250,204,21,0.15)" />
              <text x="10" y="15" fill="#fef08a" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[F] FLEETING</text>
              <line x1="15" y1="40" x2="95" y2="40" stroke="#facc15" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
              <line x1="15" y1="55" x2="75" y2="55" stroke="#facc15" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
            </g>
          </g>

          <g transform="translate(220, 235)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,3; 0,0" dur="4.2s" repeatCount="indefinite" />
              <rect x="0" y="0" width="115" height="70" rx="6" fill="rgba(20,15,5,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="0" y="0" width="115" height="70" rx="6" fill="none" stroke="#facc15" strokeWidth="1.5" filter="url(#zk-glow-light)" />
              <rect x="0" y="0" width="115" height="22" rx="6" fill="rgba(250,204,21,0.15)" />
              <text x="10" y="15" fill="#fef08a" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[L] LITERATURE</text>
              <line x1="15" y1="40" x2="95" y2="40" stroke="#facc15" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
              <line x1="15" y1="55" x2="75" y2="55" stroke="#facc15" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
            </g>
          </g>

          {/* --- COL 3: REVIEW FACTORY --- */}
          <g transform="translate(370, 140)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-4; 0,0" dur="2.8s" repeatCount="indefinite" />
              <circle cx="55" cy="35" r="30" fill="#f43f5e" opacity="0.05" filter="url(#zk-glow-heavy)" />
              
              {/* Glass Card */}
              <rect x="0" y="0" width="115" height="70" rx="6" fill="rgba(15,5,10,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="0" y="0" width="115" height="70" rx="6" fill="none" stroke="#f43f5e" strokeWidth="2" filter="url(#zk-glow-light)" />
              
              {/* Header Banner */}
              <rect x="0" y="0" width="115" height="22" rx="6" fill="rgba(244,63,94,0.15)" />
              <text x="10" y="15" fill="#fecdd3" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[R] REVIEW</text>
              
              {/* Factory Icon scaled down inside the card */}
              <g transform="translate(25, 30) scale(0.65)">
                <path d="M 0 50 L 0 10 L 25 25 L 25 0 L 50 15 L 50 -10 L 80 15 L 80 50 Z" fill="rgba(244,63,94,0.2)" stroke="#f43f5e" strokeWidth="2" filter="url(#zk-glow-light)" />
                <rect x="15" y="30" width="10" height="15" fill="#f43f5e" opacity="0.8" rx="2" />
                <rect x="35" y="30" width="10" height="15" fill="#f43f5e" opacity="0.8" rx="2" />
                <rect x="55" y="30" width="10" height="15" fill="#f43f5e" opacity="0.8" rx="2" />
              </g>
            </g>
          </g>

          {/* --- COL 4: PERMANENT NOTES --- */}
          <g transform="translate(510, 120)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,4; 0,0" dur="3.8s" repeatCount="indefinite" />
              <circle cx="50" cy="45" r="30" fill="#a855f7" opacity="0.05" filter="url(#zk-glow-heavy)" />
              {/* Stack effect background cards */}
              <rect x="15" y="-5" width="115" height="70" rx="6" fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.4" />
              <rect x="8" y="0" width="115" height="70" rx="6" fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.7" />
              
              {/* Main Card */}
              <rect x="0" y="5" width="115" height="70" rx="6" fill="rgba(15,5,20,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="0" y="5" width="115" height="70" rx="6" fill="none" stroke="#a855f7" strokeWidth="2" filter="url(#zk-glow-light)" />
              
              {/* Header Banner */}
              <rect x="0" y="5" width="115" height="22" rx="6" fill="rgba(168,85,247,0.15)" />
              <text x="10" y="20" fill="#e9d5ff" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[Z] PERMANENT</text>
              
              {/* Lines inside */}
              <line x1="15" y1="42" x2="100" y2="42" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
              <line x1="15" y1="52" x2="80" y2="52" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
              <line x1="15" y1="62" x2="90" y2="62" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
            </g>
          </g>

          {/* --- COL 5: ZETTELKASTEN BOX --- */}
          <g transform="translate(670, 110)">
            {/* Viewfinder Corners (Static framing) */}
            <g fill="none" stroke="#06b6d4" strokeWidth="2" filter="url(#zk-glow-light)" opacity="0.8">
              <path d="M 0 10 L -10 10 L -10 0" /> {/* Top Left */}
              <path d="M 120 10 L 130 10 L 130 0" /> {/* Top Right */}
              <path d="M 0 90 L -10 90 L -10 100" /> {/* Bottom Left */}
              <path d="M 120 90 L 130 90 L 130 100" /> {/* Bottom Right */}
            </g>
            
            {/* Incoming Arrow */}
            <polygon points="-15,45 -5,50 -15,55" fill="#06b6d4" filter="url(#zk-glow-light)" />
            
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="4.5s" repeatCount="indefinite" />
              
              <circle cx="55" cy="50" r="35" fill="#06b6d4" opacity="0.05" filter="url(#zk-glow-heavy)" />
              
              {/* Main Box Body */}
              <rect x="5" y="20" width="110" height="70" rx="4" fill="rgba(5,15,20,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="5" y="20" width="110" height="70" rx="4" fill="none" stroke="#06b6d4" strokeWidth="2" filter="url(#zk-glow-light)" />
              
              {/* Lid */}
              <rect x="0" y="10" width="120" height="15" rx="3" fill="rgba(5,15,20,0.95)" />
              <rect x="0" y="10" width="120" height="15" rx="3" fill="none" stroke="#06b6d4" strokeWidth="2" filter="url(#zk-glow-light)" />
              <line x1="5" y1="20" x2="115" y2="20" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
              
              {/* Handle */}
              <rect x="40" y="32" width="40" height="10" rx="5" fill="none" stroke="#06b6d4" strokeWidth="2" filter="url(#zk-glow-light)" />
              
              {/* Text Inside Box */}
              <text x="60" y="65" fill="#a5f3fc" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="1">ZETTELKASTEN</text>
              
              {/* Dashed line */}
              <line x1="30" y1="75" x2="90" y2="75" stroke="#a5f3fc" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
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
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: 'transparent' }}>
          <defs>
            {/* Multi-layered Bloom Glows */}
            <filter id="mm-glow-heavy" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blurMedium" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurMedium" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="mm-glow-light" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradients for Paths */}
            <linearGradient id="path-grad-1" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="path-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="path-grad-3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="path-grad-4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Flowing Organic Connections */}
          {/* Main Branches */}
          <g fill="none" strokeWidth="2.5" filter="url(#mm-glow-light)" opacity="0.6">
            <path id="branch1" d="M 400 200 C 300 200, 250 100, 180 100" stroke="url(#path-grad-1)" />
            <path id="branch2" d="M 400 200 C 320 200, 280 320, 150 300" stroke="url(#path-grad-2)" />
            <path id="branch3" d="M 400 200 C 500 200, 530 80, 620 90" stroke="url(#path-grad-3)" />
            <path id="branch4" d="M 400 200 C 520 200, 560 300, 650 280" stroke="url(#path-grad-4)" />
          </g>

          {/* Secondary Branches */}
          <g fill="none" strokeWidth="1.5" filter="url(#mm-glow-light)" opacity="0.4">
            {/* From Node 1 */}
            <path d="M 180 100 C 130 100, 100 50, 70 60" stroke="#06b6d4" />
            <path d="M 180 100 C 120 100, 100 150, 60 140" stroke="#06b6d4" />
            {/* From Node 2 */}
            <path d="M 150 300 C 100 290, 80 250, 50 250" stroke="#f59e0b" />
            <path d="M 150 300 C 90 310, 80 360, 40 350" stroke="#f59e0b" />
            {/* From Node 3 */}
            <path d="M 620 90 C 680 95, 720 50, 750 60" stroke="#a855f7" />
            <path d="M 620 90 C 690 85, 720 140, 740 150" stroke="#a855f7" />
            {/* From Node 4 */}
            <path d="M 650 280 C 700 270, 730 230, 760 240" stroke="#10b981" />
            <path d="M 650 280 C 720 290, 740 330, 770 340" stroke="#10b981" />
          </g>

          {/* Animated Particles on Main Branches */}
          <g fill="#fff" filter="url(#mm-glow-light)">
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 400 200 C 300 200, 250 100, 180 100" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2">
              <animateMotion path="M 400 200 C 320 200, 280 320, 150 300" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 400 200 C 500 200, 530 80, 620 90" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2">
              <animateMotion path="M 400 200 C 520 200, 560 300, 650 280" dur="3.5s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* --- NODES --- */}
          {/* Node 1: Top Left (Cyan) */}
          <g transform="translate(180, 100)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="3s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="rgba(5,15,20,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="none" stroke="#06b6d4" strokeWidth="1.5" filter="url(#mm-glow-heavy)" />
              {/* Header */}
              <rect x="-60" y="-30" width="120" height="20" rx="8" fill="rgba(6,182,212,0.15)" />
              <text x="-52" y="-16" fill="#a5f3fc" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[C] CONCEPT</text>
              {/* Inner Details */}
              <circle cx="45" cy="-20" r="3" fill="#06b6d4" filter="url(#mm-glow-light)" />
              <rect x="-50" y="0" width="70" height="4" rx="2" fill="#06b6d4" opacity="0.8" filter="url(#mm-glow-light)" />
              <rect x="-50" y="10" width="40" height="4" rx="2" fill="#06b6d4" opacity="0.4" />
            </g>
          </g>

          {/* Node 2: Bottom Left (Amber) */}
          <g transform="translate(150, 300)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; -2,2; 0,0" dur="4s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="rgba(20,15,5,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" filter="url(#mm-glow-heavy)" />
              {/* Header */}
              <rect x="-60" y="-30" width="120" height="20" rx="8" fill="rgba(245,158,11,0.15)" />
              <text x="-52" y="-16" fill="#fde68a" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[R] RESEARCH</text>
              {/* Inner Details */}
              <circle cx="45" cy="-20" r="3" fill="#f59e0b" filter="url(#mm-glow-light)" />
              <rect x="-50" y="0" width="80" height="4" rx="2" fill="#f59e0b" opacity="0.8" filter="url(#mm-glow-light)" />
              <rect x="-50" y="10" width="50" height="4" rx="2" fill="#f59e0b" opacity="0.4" />
            </g>
          </g>

          {/* Node 3: Top Right (Purple) */}
          <g transform="translate(620, 90)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 0,2; 0,0" dur="3.5s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="rgba(15,5,20,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="none" stroke="#a855f7" strokeWidth="1.5" filter="url(#mm-glow-heavy)" />
              {/* Header */}
              <rect x="-60" y="-30" width="120" height="20" rx="8" fill="rgba(168,85,247,0.15)" />
              <text x="-52" y="-16" fill="#e9d5ff" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[D] DESIGN</text>
              {/* Inner Details */}
              <circle cx="45" cy="-20" r="3" fill="#a855f7" filter="url(#mm-glow-light)" />
              <rect x="-50" y="0" width="60" height="4" rx="2" fill="#a855f7" opacity="0.8" filter="url(#mm-glow-light)" />
              <rect x="-50" y="10" width="70" height="4" rx="2" fill="#a855f7" opacity="0.4" />
            </g>
          </g>

          {/* Node 4: Bottom Right (Emerald) */}
          <g transform="translate(650, 280)">
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0; 2,0; 0,0" dur="4.5s" repeatCount="indefinite" />
              {/* Glass Card */}
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="rgba(5,20,15,0.95)" style={{ backdropFilter: 'blur(8px)' }} />
              <rect x="-60" y="-30" width="120" height="60" rx="8" fill="none" stroke="#10b981" strokeWidth="1.5" filter="url(#mm-glow-heavy)" />
              {/* Header */}
              <rect x="-60" y="-30" width="120" height="20" rx="8" fill="rgba(16,185,129,0.15)" />
              <text x="-52" y="-16" fill="#a7f3d0" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">[D] DEVELOP</text>
              {/* Inner Details */}
              <circle cx="45" cy="-20" r="3" fill="#10b981" filter="url(#mm-glow-light)" />
              <rect x="-50" y="0" width="55" height="4" rx="2" fill="#10b981" opacity="0.8" filter="url(#mm-glow-light)" />
              <rect x="-50" y="10" width="80" height="4" rx="2" fill="#10b981" opacity="0.4" />
            </g>
          </g>

          {/* Leaf Nodes */}
          <g filter="url(#mm-glow-light)">
            {/* Top Left Leaves */}
            <circle cx="70" cy="60" r="8" fill="rgba(5,15,20,0.95)" stroke="#06b6d4" strokeWidth="2" />
            <circle cx="60" cy="140" r="6" fill="rgba(5,15,20,0.95)" stroke="#06b6d4" strokeWidth="2" />
            {/* Bottom Left Leaves */}
            <circle cx="50" cy="250" r="7" fill="rgba(20,15,5,0.95)" stroke="#f59e0b" strokeWidth="2" />
            <circle cx="40" cy="350" r="9" fill="rgba(20,15,5,0.95)" stroke="#f59e0b" strokeWidth="2" />
            {/* Top Right Leaves */}
            <circle cx="750" cy="60" r="6" fill="rgba(15,5,20,0.95)" stroke="#a855f7" strokeWidth="2" />
            <circle cx="740" cy="150" r="8" fill="rgba(15,5,20,0.95)" stroke="#a855f7" strokeWidth="2" />
            {/* Bottom Right Leaves */}
            <circle cx="760" cy="240" r="7" fill="rgba(5,20,15,0.95)" stroke="#10b981" strokeWidth="2" />
            <circle cx="770" cy="340" r="6" fill="rgba(5,20,15,0.95)" stroke="#10b981" strokeWidth="2" />
          </g>

          {/* --- CENTRAL CORE NODE --- */}
          <g transform="translate(400, 200)">
            <g>
              <animateTransform attributeName="transform" type="scale" values="1;1.03;1" dur="2s" repeatCount="indefinite" />
              
              {/* Ambient Pulse */}
              <circle cx="0" cy="0" r="45" fill="#ec4899" opacity="0.1" filter="url(#mm-glow-heavy)">
                <animate attributeName="r" values="45;65;45" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.1;0.3;0.1" dur="3s" repeatCount="indefinite" />
              </circle>

              {/* Core Body */}
              <circle cx="0" cy="0" r="45" fill="rgba(25,5,15,0.95)" />
              <circle cx="0" cy="0" r="45" fill="none" stroke="#ec4899" strokeWidth="3" filter="url(#mm-glow-heavy)" />
              
              {/* Inner Ring */}
              <circle cx="0" cy="0" r="35" fill="none" stroke="#f472b6" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" filter="url(#mm-glow-light)">
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite" />
              </circle>

              {/* Core Text */}
              <text x="0" y="4" fill="#fdf2f8" fontSize="14" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="2">IDEA</text>
            </g>
          </g>
        </svg>
      )
    },
    {
      title: "Agile Workflows",
      desc: "Turn insights into action. Extract tasks directly from your notes to build dynamic, fully-integrated Kanban boards.",
      icon: <Kanban />,
      color: "#8b5cf6",
      svg: (
        <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%', background: 'transparent' }}>
          <defs>
            {/* Cinematic Multi-layered Bloom Glow */}
            <filter id="aw-glow-heavy" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blurMedium" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurMedium" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="aw-glow-light" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blurOuter" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurInner" />
              <feMerge>
                <feMergeNode in="blurOuter" />
                <feMergeNode in="blurInner" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <linearGradient id="aw-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2"/>
              <stop offset="50%" stopColor="#c4b5fd" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.2"/>
            </linearGradient>

            <radialGradient id="aw-col-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
            </radialGradient>
            
            <pattern id="aw-dot-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="15" cy="15" r="1" fill="#8b5cf6" opacity="0.2" />
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#aw-dot-grid)" />

          {/* Connective Data Bridges */}
          <g fill="none" stroke="url(#aw-flow-grad)" strokeWidth="2" opacity="0.6">
            <path d="M 260 140 C 290 140, 290 140, 320 140" />
            <path d="M 260 250 C 290 250, 290 250, 320 250" />
            <path d="M 480 160 C 510 160, 510 160, 540 160" />
            <path d="M 480 270 C 510 270, 510 270, 540 270" />
          </g>

          {/* Animated Bridge Flows */}
          <g fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="4 16" opacity="0.7">
            <path d="M 260 140 C 290 140, 290 140, 320 140">
              <animate attributeName="stroke-dashoffset" values="20;0" dur="1s" repeatCount="indefinite" />
            </path>
            <path d="M 260 250 C 290 250, 290 250, 320 250">
              <animate attributeName="stroke-dashoffset" values="20;0" dur="1.2s" repeatCount="indefinite" />
            </path>
            <path d="M 480 160 C 510 160, 510 160, 540 160">
              <animate attributeName="stroke-dashoffset" values="20;0" dur="0.8s" repeatCount="indefinite" />
            </path>
            <path d="M 480 270 C 510 270, 510 270, 540 270">
              <animate attributeName="stroke-dashoffset" values="20;0" dur="1.4s" repeatCount="indefinite" />
            </path>
          </g>

          {/* Flow Packets */}
          <g fill="#fff" filter="url(#aw-glow-light)">
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 260 140 C 290 140, 290 140, 320 140" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="2.5">
              <animateMotion path="M 480 160 C 510 160, 510 160, 540 160" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Columns */}
          {/* Backlog Column */}
          <g transform="translate(100, 60)">
            <rect x="0" y="0" width="160" height="280" rx="16" fill="rgba(15,5,25,0.8)" style={{ backdropFilter: 'blur(8px)' }} />
            <rect x="0" y="0" width="160" height="280" rx="16" fill="none" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.3" filter="url(#aw-glow-light)" />
            
            <rect x="20" y="45" width="120" height="2" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
            <text x="80" y="32" fill="#f3e8ff" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="1">[K] BACKLOG</text>
            
            {/* Cards */}
            <g transform="translate(20, 70)">
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,-2; 0,0" dur="4s" repeatCount="indefinite" />
                <rect x="0" y="0" width="120" height="70" rx="8" fill="rgba(20,10,35,0.95)" />
                <rect x="0" y="0" width="120" height="70" rx="8" fill="none" stroke="#a78bfa" strokeWidth="1" filter="url(#aw-glow-light)" opacity="0.5" />
                <rect x="15" y="15" width="40" height="6" rx="3" fill="#ec4899" filter="url(#aw-glow-light)" />
                <rect x="15" y="32" width="80" height="4" rx="2" fill="#fff" opacity="0.7" />
                <rect x="15" y="44" width="60" height="4" rx="2" fill="#fff" opacity="0.3" />
                <circle cx="100" cy="55" r="5" fill="#ec4899" filter="url(#aw-glow-light)" />
              </g>
            </g>
            
            <g transform="translate(20, 160)">
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,2; 0,0" dur="5s" repeatCount="indefinite" />
                <rect x="0" y="0" width="120" height="70" rx="8" fill="rgba(20,10,35,0.95)" />
                <rect x="0" y="0" width="120" height="70" rx="8" fill="none" stroke="#8b5cf6" strokeWidth="1" opacity="0.3" />
                <rect x="15" y="15" width="50" height="6" rx="3" fill="#3b82f6" filter="url(#aw-glow-light)" />
                <rect x="15" y="32" width="90" height="4" rx="2" fill="#fff" opacity="0.6" />
                <rect x="15" y="44" width="70" height="4" rx="2" fill="#fff" opacity="0.2" />
                <circle cx="100" cy="55" r="5" fill="#3b82f6" filter="url(#aw-glow-light)" />
              </g>
            </g>
          </g>

          {/* Active / In Progress Column (Center) */}
          <g transform="translate(320, 50)">
            {/* Massive background aura */}
            <circle cx="80" cy="150" r="140" fill="url(#aw-col-glow)">
               <animate attributeName="opacity" values="0.4;0.8;0.4" dur="4s" repeatCount="indefinite" />
            </circle>

            {/* Main structural box */}
            <rect x="0" y="0" width="160" height="300" rx="16" fill="rgba(15,5,25,0.9)" style={{ backdropFilter: 'blur(8px)' }} />
            
            {/* High-tech Corner Brackets */}
            <path d="M 0 30 L 0 16 Q 0 0 16 0 L 30 0" fill="none" stroke="#a78bfa" strokeWidth="2" filter="url(#aw-glow-heavy)" />
            <path d="M 160 30 L 160 16 Q 160 0 144 0 L 130 0" fill="none" stroke="#a78bfa" strokeWidth="2" filter="url(#aw-glow-heavy)" />
            <path d="M 0 270 L 0 284 Q 0 300 16 300 L 30 300" fill="none" stroke="#a78bfa" strokeWidth="2" filter="url(#aw-glow-heavy)" />
            <path d="M 160 270 L 160 284 Q 160 300 144 300 L 130 300" fill="none" stroke="#a78bfa" strokeWidth="2" filter="url(#aw-glow-heavy)" />
            
            {/* Faint inner border */}
            <rect x="0" y="0" width="160" height="300" rx="16" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.3" />

            {/* Separator */}
            <rect x="20" y="55" width="120" height="2" fill="none" stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="2 4" />
            
            {/* Active Spinner next to Header */}
            <g transform="translate(25, 38)">
              <animateTransform attributeName="transform" type="rotate" values="0;360" dur="3s" repeatCount="indefinite" />
              <circle cx="0" cy="0" r="5" fill="none" stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="6 4" filter="url(#aw-glow-light)" />
              <circle cx="0" cy="0" r="2" fill="#c4b5fd" filter="url(#aw-glow-light)" />
            </g>
            <text x="85" y="42" fill="#f3e8ff" fontSize="11" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="1.5">[K] IN_PROGRESS</text>
            
            {/* --- DETAILED ACTIVE CARD --- */}
            <g transform="translate(10, 80)">
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="4.5s" repeatCount="indefinite" />
                
                {/* Outer scanning bounding box */}
                <rect x="0" y="0" width="140" height="130" rx="10" fill="rgba(30,15,50,0.6)" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 6">
                   <animate attributeName="stroke-dashoffset" values="20;0" dur="2s" repeatCount="indefinite" />
                </rect>
                
                {/* Main Card Body */}
                <rect x="5" y="5" width="130" height="120" rx="8" fill="rgba(25,10,40,0.95)" />
                <rect x="5" y="5" width="130" height="120" rx="8" fill="none" stroke="#c4b5fd" strokeWidth="1.5" filter="url(#aw-glow-light)" />
                
                {/* Priority Tag */}
                <rect x="15" y="15" width="45" height="8" rx="4" fill="#fbbf24" filter="url(#aw-glow-light)" />
                <rect x="65" y="15" width="25" height="8" rx="4" fill="rgba(139,92,246,0.3)" />
                
                {/* Title lines */}
                <rect x="15" y="32" width="100" height="4" rx="2" fill="#fff" opacity="0.9" />
                <rect x="15" y="42" width="70" height="4" rx="2" fill="#fff" opacity="0.6" />
                
                {/* Mini Sparkline Chart */}
                <g transform="translate(15, 60)">
                  <rect x="0" y="-10" width="110" height="30" rx="4" fill="rgba(0,0,0,0.4)" />
                  <path d="M 5 15 L 20 10 L 40 18 L 60 5 L 80 12 L 105 2" fill="none" stroke="#a78bfa" strokeWidth="1.5" filter="url(#aw-glow-light)" />
                  <circle cx="105" cy="2" r="2.5" fill="#c4b5fd" filter="url(#aw-glow-light)" />
                </g>
                
                {/* Bottom Metadata row */}
                <g transform="translate(15, 105)">
                  {/* Progress bar */}
                  <rect x="0" y="4" width="70" height="4" rx="2" fill="#fff" opacity="0.2" />
                  <rect x="0" y="4" width="45" height="4" rx="2" fill="#a78bfa" filter="url(#aw-glow-light)" />
                  
                  {/* Avatars */}
                  <circle cx="95" cy="6" r="6" fill="#3b82f6" />
                  <circle cx="105" cy="6" r="6" fill="#ec4899" />
                  <circle cx="105" cy="6" r="6" fill="none" stroke="#190a28" strokeWidth="1.5" />
                </g>
              </g>
            </g>

            {/* Secondary Active Task (Smaller) */}
            <g transform="translate(10, 230)">
               <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,2; 0,0" dur="5s" repeatCount="indefinite" />
                <rect x="5" y="0" width="130" height="50" rx="8" fill="rgba(25,10,40,0.95)" />
                <rect x="5" y="0" width="130" height="50" rx="8" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
                
                <rect x="15" y="12" width="30" height="6" rx="3" fill="#a78bfa" filter="url(#aw-glow-light)" />
                <rect x="15" y="26" width="80" height="3" rx="1.5" fill="#fff" opacity="0.7" />
                <rect x="15" y="35" width="50" height="3" rx="1.5" fill="#fff" opacity="0.4" />
                
                <circle cx="120" cy="25" r="4" fill="#fbbf24" filter="url(#aw-glow-light)" />
               </g>
            </g>

          </g>

          {/* Completed Column */}
          <g transform="translate(540, 60)">
            <rect x="0" y="0" width="160" height="280" rx="16" fill="rgba(5,15,10,0.8)" style={{ backdropFilter: 'blur(8px)' }} />
            <rect x="0" y="0" width="160" height="280" rx="16" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.4" filter="url(#aw-glow-light)" />
            
            <rect x="20" y="45" width="120" height="2" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
            <text x="80" y="32" fill="#d1fae5" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle" letterSpacing="1">[K] COMPLETED</text>
            
            {/* Completed Cards */}
            <g transform="translate(20, 70)" opacity="0.8">
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,-1.5; 0,0" dur="6s" repeatCount="indefinite" />
                <rect x="0" y="0" width="120" height="60" rx="8" fill="rgba(10,25,15,0.95)" />
                <rect x="0" y="0" width="120" height="60" rx="8" fill="none" stroke="#34d399" strokeWidth="1.5" filter="url(#aw-glow-light)" opacity="0.7" />
                <path d="M 12 30 L 22 40 L 42 20" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#aw-glow-light)" />
                <rect x="55" y="24" width="50" height="4" rx="2" fill="#fff" opacity="0.6" />
                <rect x="55" y="34" width="30" height="4" rx="2" fill="#fff" opacity="0.3" />
              </g>
            </g>
            
            <g transform="translate(20, 150)" opacity="0.6">
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,0; 0,1.5; 0,0" dur="5.5s" repeatCount="indefinite" />
                <rect x="0" y="0" width="120" height="60" rx="8" fill="rgba(10,25,15,0.95)" />
                <rect x="0" y="0" width="120" height="60" rx="8" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" filter="url(#aw-glow-light)" />
                <path d="M 12 30 L 22 40 L 42 20" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="55" y="24" width="45" height="4" rx="2" fill="#fff" opacity="0.4" />
                <rect x="55" y="34" width="20" height="4" rx="2" fill="#fff" opacity="0.2" />
              </g>
            </g>
          </g>
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

  const handleNavMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const nav = e.currentTarget;
    const rect = nav.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    nav.style.setProperty('--mouse-x', `${x}px`);
    nav.style.setProperty('--mouse-y', `${y}px`);
  }, []);

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
      <nav className={`${styles.topNav} ${scrolled ? styles.scrolled : ''}`} onMouseMove={handleNavMouseMove}>
        <div className={styles.navGlow} />
        <div className={styles.navLogo}>
          <div className={styles.navLogoMark}>
            <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 18}} />
          </div>
          <span className={styles.navLogoText}>Infonote</span>
        </div>
        <div className={styles.navLinks}>
          <a className={styles.navLink}>
            <Sparkles size={14} className={styles.navLinkIcon} />
            <span>Features</span>
          </a>
          <a className={styles.navLink}>
            <Target size={14} className={styles.navLinkIcon} />
            <span>Use cases</span>
          </a>
          <a className={styles.navLink}>
            <Lock size={14} className={styles.navLinkIcon} />
            <span>Pricing</span>
          </a>
        </div>
        <div className={styles.navActions}>
          <button className={styles.loginBtn} onClick={() => setCurrentView('login')}>
            Login
          </button>
          <button className={styles.navButton} onClick={() => setCurrentView('signup')}>
            <span>Get Started</span>
            <ArrowRight size={14} className={styles.navButtonIcon} />
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
                           {/* LAYER 1: Source Document Card (Largest) */}
              <div className={`${styles.ftUiCard} ${styles.ftUiCardMain}`} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '420px', padding: '24px', animation: 'cardReaction 4s infinite' }}>
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

                {/* ── Interactive Double Click Cursor ── */}
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
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.2);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.1) inset, 0 0 20px rgba(168, 85, 247, 0.1);
                    }
                    /* First Click */
                    35% {
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(0.98);
                      border-color: rgba(168, 85, 247, 0.6);
                      box-shadow: 0 8px 30px rgba(168, 85, 247, 0.3), 0 0 0 1px rgba(168, 85, 247, 0.3) inset, 0 0 30px rgba(168, 85, 247, 0.3);
                    }
                    38% {
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.4);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.2) inset, 0 0 25px rgba(168, 85, 247, 0.2);
                    }
                    /* Second Click */
                    45% {
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(0.98);
                      border-color: rgba(168, 85, 247, 0.8);
                      box-shadow: 0 8px 30px rgba(168, 85, 247, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.4) inset, 0 0 45px rgba(168, 85, 247, 0.4);
                    }
                    /* Active Peak Glow state (entering nested canvas effect) */
                    50% {
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-8deg) rotateX(3deg) scale(1.02);
                      border-color: rgba(217, 70, 239, 0.8);
                      box-shadow: 0 20px 50px rgba(217, 70, 239, 0.4), 0 0 0 1px rgba(217, 70, 239, 0.4) inset, 0 0 60px rgba(217, 70, 239, 0.4);
                    }
                    /* Return to Normal */
                    75%, 100% {
                      transform: translate(-50%, -50%) perspective(1000px) rotateY(-10deg) rotateX(4deg) scale(1);
                      border-color: rgba(168, 85, 247, 0.2);
                      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.1) inset, 0 0 20px rgba(168, 85, 247, 0.1);
                    }
                  }
                `}</style>
                <div style={{ position: 'absolute', top: '16px', right: '160px', zIndex: 50, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: -6, left: -6, width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(168,85,247,0.8)', background: 'rgba(168,85,247,0.2)', animation: 'clickRippleEffect 4s infinite ease-out' }} />
                  <div style={{ animation: 'cursorApproach 4s infinite', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#a855f7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ undefined }}>
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
            </div>
          </div>
        </div>

        {/* â”€â”€ Two Column Feature Cards â”€â”€ */}
        <div className={styles.ftDualRow}>
          
          {/* Feature 1: Local Storage and Security */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText} style={{ position: 'relative' }}>
              <ShieldCheck 
                size={140} 
                strokeWidth={1}
                style={{ position: 'absolute', top: '-30px', left: '-20px', opacity: 0.05, color: '#10b981', pointerEvents: 'none', zIndex: 0 }} 
              />
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #34d399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', position: 'relative', zIndex: 1 }}>
                Your data stays on your device
              </h3>
              <p className={styles.ftDualDesc} style={{ position: 'relative', zIndex: 1 }}>
                Experience zero-latency access with local-first storage. All your notes and documents are end-to-end encrypted for absolute privacy.
              </p>
            </div>
            
            <div className={styles.ftDualVisual}>
              
              {/* Floating ambient particles */}
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim1}`} style={{ top: '15%', left: '20%', width: '4px', height: '4px', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim2}`} style={{ top: '80%', left: '75%', width: '6px', height: '6px', background: '#34d399', boxShadow: '0 0 12px #34d399' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim3}`} style={{ top: '35%', left: '85%', width: '3px', height: '3px', background: '#fff', boxShadow: '0 0 8px #fff' }} />

              {/* Floating cursor */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim3}`} style={{ top: '35%', right: '15%', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#10b981', fontSize: '9px', padding: '1px 6px' }}>You</div>
              </div>

              {/* 3D Master Card inside viewport */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '60%', transform: 'perspective(1000px) rotateY(-14deg) rotateX(6deg)', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowPurple}`} style={{ opacity: 0.15, background: 'radial-gradient(circle at center, rgba(16,185,129,0.5) 0%, transparent 70%)' }} />
                
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 0 20px rgba(16,185,129,0.1)' }}>
                   <ShieldCheck size={28} color="#10b981" />
                </div>
                
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Saved securely</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>Encrypted on your local disk</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', width: '100%' }}>
                  <HardDrive size={14} color="#34d399" />
                  <span style={{ fontSize: '12px', color: '#cbd5e1', fontFamily: 'monospace', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ~/local_data/vault.enc
                  </span>
                  <Lock size={12} color="#10b981" />
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Flow State / Seamless UX */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText} style={{ position: 'relative' }}>
              <Zap 
                size={140} 
                strokeWidth={1}
                style={{ position: 'absolute', top: '-30px', left: '-20px', opacity: 0.05, color: '#ec4899', pointerEvents: 'none', zIndex: 0 }} 
              />
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', position: 'relative', zIndex: 1 }}>
                Take notes & plan in one flow
              </h3>
              <p className={styles.ftDualDesc} style={{ position: 'relative', zIndex: 1 }}>
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

      {/* ── Methodology Accordion Section ── */}
      <section className={styles.accordionSection}>
        <div className={styles.accordionHeader}>
          <h2 className={styles.accordionTitle}>Your knowledge, structured your way</h2>
          <p className={styles.accordionSubtitle}>Whether you prefer the rigidity of Kanban, the interconnectedness of a Zettelkasten, or the freedom of an infinite canvas, Infonote adapts to your mental models.</p>
        </div>
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

      {/* ── Final CTA Section ── */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContainer}>
          <h2 className={styles.ctaTitle}>
            Start building your second brain <span className={styles.ctaHighlight}>today</span>
          </h2>
          <p className={styles.ctaDesc}>
            Join thousands of thinkers, writers, and creators who have transformed the way they capture, connect, and synthesize their knowledge.
          </p>
          <div className={styles.ctaButtonGroup}>
            <button className={`${styles.navButton} ${styles.ctaButtonPrimary}`} style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
              <Sparkles size={20} className={styles.btnIcon} />
              Get Started for Free
            </button>
            <button className={`${styles.navButton} ${styles.ctaButtonSecondary}`} style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
              Book a Demo
            </button>
          </div>
        </div>
      </section>

      {/* ── Global Footer Section ── */}
      <footer className={styles.footerSection}>
        <div className={styles.footerContainer}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <div className={styles.logoOrb}></div>
              Infonote
            </div>
            <p className={styles.footerDesc}>
              The visual-first knowledge management system designed for emergent thought and dynamic organization.
            </p>
          </div>
          
          <div className={styles.footerColumn}>
            <h4 className={styles.footerColTitle}>Product</h4>
            <div className={styles.footerLinks}>
              <a href="#" className={styles.footerLink}>Features</a>
              <a href="#" className={styles.footerLink}>Integrations</a>
              <a href="#" className={styles.footerLink}>Pricing</a>
              <a href="#" className={styles.footerLink}>Changelog</a>
            </div>
          </div>
          
          <div className={styles.footerColumn}>
            <h4 className={styles.footerColTitle}>Resources</h4>
            <div className={styles.footerLinks}>
              <a href="#" className={styles.footerLink}>Documentation</a>
              <a href="#" className={styles.footerLink}>Methodology</a>
              <a href="#" className={styles.footerLink}>Community</a>
              <a href="#" className={styles.footerLink}>Blog</a>
            </div>
          </div>
          
          <div className={styles.footerColumn}>
            <h4 className={styles.footerColTitle}>Company</h4>
            <div className={styles.footerLinks}>
              <a href="#" className={styles.footerLink}>About Us</a>
              <a href="#" className={styles.footerLink}>Careers</a>
              <a href="#" className={styles.footerLink}>Privacy Policy</a>
              <a href="#" className={styles.footerLink}>Terms of Service</a>
            </div>
          </div>
        </div>
        
        <div className={styles.footerBottom}>
          <div>&copy; {new Date().getFullYear()} Infonote Inc. All rights reserved.</div>
          <div className={styles.footerSocials}>
            <a href="#" className={styles.footerSocialLink}>Twitter</a>
            <a href="#" className={styles.footerSocialLink}>GitHub</a>
            <a href="#" className={styles.footerSocialLink}>Discord</a>
          </div>
        </div>
      </footer>

    </div>
  );
};
