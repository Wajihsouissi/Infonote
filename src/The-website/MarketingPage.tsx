import React, { useCallback, memo, useEffect, useState } from 'react';
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
  Image as ImageIcon
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
  // ── CENTER: YouTube video + Icon card side by side ──
  {
    id: '10',
    type: 'youtube',
    className: styles.blockVideo,
    position: { x: -190, y: -90 },
    data: {
      videoId: '-I8QtPA7lt4',
    },
    style: { width: 320, height: 180 },
    selected: false,
  },
  {
    id: '6',
    type: 'note',
    className: styles.cardDesignAssets,
    position: { x: 170, y: -60 },
    data: {
      label: 'Design Assets',
      viewMode: 'icon',
      icon: 'folder-closed',
      hideHoverMenu: true,
    },
    style: { width: 120, height: 120 },
    selected: false,
  },

  // ── EDGES: surrounding nodes spread around the perimeter ──

  // Top-left — Bullet list block
  {
    id: '8',
    type: 'block',
    className: styles.blockBulletList,
    position: { x: -620, y: -280 },
    data: {
      content: [
        { id: 'bl1', type: 'bullet', content: 'Real-time collaborative editing' },
        { id: 'bl2', type: 'bullet', content: 'Drag-and-drop canvas organization' },
        { id: 'bl3', type: 'bullet', content: 'AI-powered content suggestions' },
      ],
      hideHoverMenu: true,
    },
    selected: false,
  },

  // Left — New Note card
  {
    id: '3',
    type: 'note',
    className: styles.cardNewNote,
    position: { x: -560, y: 10 },
    data: {
      label: 'New Note',
      viewMode: 'medium',
      description: 'Add description...',
      hideHoverMenu: true,
    },
    style: { width: 240, height: 240 },
    selected: false,
  },

  // Bottom-left — Image block
  {
    id: '2',
    type: 'image',
    className: styles.cardImageBlock,
    position: { x: -480, y: 280 },
    data: {
      url: '/marketing/team_workshop.png',
    },
    style: { width: 240, height: 135 },
    selected: false,
  },

  // Top-right — Text block ("Chunk it...")
  {
    id: '9',
    type: 'block',
    className: styles.blockText,
    position: { x: 420, y: -280 },
    data: {
      content: [
        { id: 'tb1', type: 'paragraph', content: 'Chunk it transforms the way teams capture, organize, and build knowledge.' },
      ],
      hideHoverMenu: true,
    },
    selected: false,
  },

  // Right — Fused note (Meeting Notes)
  {
    id: '7',
    type: 'fused-note',
    className: styles.cardFusedNote,
    position: { x: 400, y: -50 },
    data: {
      content: [
        { id: 'fb1', type: 'heading', content: 'Meeting Notes' },
        { id: 'fb2', type: 'paragraph', content: 'Discussed roadmap priorities for Q1 2025. Key decisions on feature scope and timeline.' },
        { id: 'fb3', type: 'bullet', content: 'New onboarding flow to be designed by end of month' },
      ],
      color: '#7c3aed',
      hideHoverMenu: true,
    },
    style: { width: 320, height: 320 },
    selected: false,
  },

  // Bottom-right — Workshop insights (large expanded card)
  {
    id: '1',
    type: 'note',
    className: styles.cardInsights,
    position: { x: 340, y: 300 },
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
    style: { width: 480, height: 420 },
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
      description: 'Final logo variations in SVG format — light, dark, and monochrome versions.',
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
        { id: 'nb4', type: 'bullet', content: 'Workspace creation — one-click setup' },
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onConnect = useCallback((connection: any) => {
    setEdges((eds) => addEdge(connection, eds));
  }, [setEdges]);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: any) => {
    const source = drilledNode ? nestedDesignNodes : initialNodes;
    const initial = source.find(n => n.id === node.id);
    if (initial) {
      setNodes(prevNodes => prevNodes.map(n => {
        if (n.id === node.id) {
          return {
            ...n,
            position: { ...initial.position }
          };
        }
        return n;
      }));
    }
  }, [setNodes, drilledNode]);

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
          <button className={styles.navButton}>
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
              <span style={{marginLeft: 'auto', opacity: 0.5, fontSize: 10, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4}}>⌘K</span>
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
                onNodeDragStop={onNodeDragStop}
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

        {/* ── Hero Feature Area ── */}
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

          {/* Large hero visual — Collaborative Canvas UI Simulation (Nested Chunks) */}
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
              <div className={`${styles.ftUiCard} ${styles.ftUiCardMain}`} style={{ top: '12%', left: '5%', width: '380px', padding: '24px' }}>
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
              </div>

              {/* LAYER 2: Extracted Sections (Medium) */}
              
              {/* L2 Card 1: Purple (Top) */}
              <div className={`${styles.ftUiCard} ${styles.ftL2Float1}`} style={{ top: '12%', left: '49%', width: '200px' }}>
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
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim1}`} style={{ top: '46%', left: '38%' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#d946ef" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#d946ef' }}>Alex is chunking...</div>
              </div>

              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`} style={{ top: '25%', left: '60%' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#a855f7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#a855f7' }}>Sarah organizing</div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Two Column Feature Cards ── */}
        <div className={styles.ftDualRow}>
          
          {/* Feature 1: Knowledge Hub */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText}>
              <div className={styles.ftDualBadge} style={{ color: '#d946ef', borderColor: 'rgba(217,70,239,0.3)', background: 'rgba(217,70,239,0.1)' }}>
                <Sparkles size={14} /> Unified Workspace
              </div>
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #d946ef 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Capture everything in one place
              </h3>
              <p className={styles.ftDualDesc}>
                Consolidate notes, documents, media, and other content in one centralized canvas workspace.
              </p>
            </div>
            
            <div className={styles.ftDualVisual}>
              
              {/* Floating ambient particles */}
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim1}`} style={{ top: '15%', left: '20%', width: '4px', height: '4px', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim2}`} style={{ top: '80%', left: '75%', width: '6px', height: '6px', background: '#d946ef', boxShadow: '0 0 12px #d946ef' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim3}`} style={{ top: '35%', left: '85%', width: '3px', height: '3px', background: '#fff', boxShadow: '0 0 8px #fff' }} />

              {/* Floating cursor */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim3}`} style={{ top: '35%', right: '15%', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#a855f7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#a855f7', fontSize: '9px', padding: '1px 6px' }}>You</div>
              </div>

              {/* 3D Master Card inside viewport */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '70%', transform: 'perspective(1000px) rotateY(-14deg) rotateX(6deg)' }}>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowPurple}`} style={{ opacity: 0.5 }} />
                
                <div className={styles.ftUiCardHeader}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                    <Target size={14} />
                  </div>
                  <span className={styles.ftUiCardTitle}>Knowledge Hub</span>
                </div>

                <div className={styles.ftUiCardBody}>
                  {/* Status Block */}
                  <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockActive}`} style={{ borderColor: '#22c55e', padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <span className={styles.ftUiTag} style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)' }}>● Active</span>
                       <div style={{ display: 'flex', gap: '8px' }}>
                         <span className={styles.ftUiTag}>📄 12</span>
                         <span className={styles.ftUiTag}>🔗 8</span>
                       </div>
                    </div>
                  </div>
                  
                  {/* Cards Block */}
                  <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockExtracted}`} style={{ borderColor: '#a855f7', padding: '12px', marginTop: '8px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                       <span className={styles.ftUiTag} style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#d946ef', border: '1px solid rgba(168,85,247,0.2)' }}>📋 Research</span>
                       <span className={styles.ftUiTag} style={{ background: 'rgba(217, 70, 239, 0.15)', color: '#d946ef', border: '1px solid rgba(217,70,239,0.2)' }}>🎨 Design</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Real-time collaboration */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText}>
              <div className={styles.ftDualBadge} style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)' }}>
                <Zap size={14} /> Multiplayer
              </div>
              <h3 className={styles.ftDualTitle} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #22c55e 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Real-time collaboration
              </h3>
              <p className={styles.ftDualDesc}>
                See edits, cursors, and comments as they happen — seamless team workflows on a shared canvas.
              </p>
            </div>
            
            <div className={`${styles.ftDualVisual} ${styles.ftDualVisualGreen}`}>
              
              {/* Floating ambient particles */}
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim2}`} style={{ top: '25%', left: '80%', width: '5px', height: '5px', background: '#22c55e', boxShadow: '0 0 12px #22c55e' }} />
              <div className={`${styles.ftAmbientParticle} ${styles.ftCursorAnim3}`} style={{ top: '70%', left: '15%', width: '4px', height: '4px', background: '#fff', boxShadow: '0 0 10px #fff' }} />

              {/* Floating cursor */}
              <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim1}`} style={{ top: '20%', left: '15%', zIndex: 100 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
                <div className={styles.ftUiCursorLabel} style={{ background: '#22c55e', fontSize: '9px', padding: '1px 6px' }}>Sarah K.</div>
              </div>

              {/* 3D Collab Card inside viewport */}
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat2}`} style={{ width: '70%', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg)' }}>
                <div className={`${styles.ftExtractedGlow} ${styles.ftExtractedGlowGreen}`} style={{ opacity: 0.6 }} />
                
                <div className={styles.ftUiCardHeader}>
                  <div className={styles.ftUiIconBox} style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    <Zap size={14} />
                  </div>
                  <span className={styles.ftUiCardTitle}>Live Architecture</span>
                </div>

                <div className={styles.ftUiCardBody}>
                   <div className={`${styles.ftUiNestedBlock} ${styles.ftUiNestedBlockActive}`} style={{ borderColor: '#22c55e', padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                      <span className={styles.ftUiTag} style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', fontWeight: 600 }}>● Live</span>
                      <div className={styles.ftUiLine} style={{ width: '90%', marginTop: '16px', height: '4px', background: 'rgba(255,255,255,0.2)' }} />
                      <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.2)' }} />
                      <div style={{ textAlign: 'right', marginTop: '16px' }}>
                        <span className={styles.ftUiTag} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Edited just now</span>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Split Feature Row: Linear meets Canvas ── */}
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
              <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '280px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg)', position: 'absolute', left: '20px', top: '80px', zIndex: 5 }}>
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
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
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
                   <animate attributeName="stroke-dashoffset" from="8" to="0" dur="0.8s" repeatCount="indefinite" linear="true" />
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

        {/* ── Bottom Feature Bar ── */}
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
    </div>
  );
};
