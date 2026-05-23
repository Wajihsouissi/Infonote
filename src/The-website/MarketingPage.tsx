import React, { useCallback, memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, ReactFlowProvider, Background, useNodesState, useEdgesState, addEdge, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Search,
  Menu,
  LayoutGrid,
  FileIcon,
  Link2,
  X,
  ArrowRight
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
  {
    id: '1',
    type: 'note',
    className: styles.cardInsights,
    position: { x: -680, y: -280 },
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
        { id: 'b5', type: 'bullet', content: 'Social proof, like a Challenge Feed, can encourage participation.' },
        { id: 'b6', type: 'bullet', content: 'Personalized challenge recommendations based on user data can increase relevance.' }
      ]
    },
    style: { width: 480, height: 420 },
    selected: false,
  },
  {
    id: '2',
    type: 'image',
    className: styles.cardImageBlock,
    position: { x: 580, y: 60 },
    data: {
      url: '/marketing/team_workshop.png',
    },
    style: { width: 240, height: 135 },
    selected: false,
  },
  {
    id: '3',
    type: 'note',
    className: styles.cardNewNote,
    position: { x: 584, y: 220 },
    data: {
      label: 'New Note',
      viewMode: 'medium',
      description: 'Add description...',
      hideHoverMenu: true,
    },
    style: { width: 240, height: 240 },
    selected: false,
  },
  {
    id: '6',
    type: 'note',
    className: styles.cardDesignAssets,
    position: { x: 240, y: 60 },
    data: {
      label: 'Design Assets',
      viewMode: 'icon',
      icon: 'folder-closed',
      hideHoverMenu: true,
    },
    style: { width: 120, height: 120 },
    selected: false,
  },
  {
    id: '7',
    type: 'fused-note',
    className: styles.cardFusedNote,
    position: { x: 600, y: -280 },
    data: {
      content: [
        { id: 'fb1', type: 'heading', content: 'Meeting Notes' },
        { id: 'fb2', type: 'paragraph', content: 'Discussed roadmap priorities for Q1 2025. Key decisions on feature scope and timeline.' },
        { id: 'fb3', type: 'bullet', content: 'New onboarding flow to be designed by end of month' },
        { id: 'fb4', type: 'bullet', content: 'Performance improvements targeting <100ms load times' },
      ],
      color: '#7c3aed',
      hideHoverMenu: true,
    },
    style: { width: 320, height: 320 },
    selected: false,
  },
  {
    id: '8',
    type: 'block',
    className: styles.blockBulletList,
    position: { x: -380, y: 80 },
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
  {
    id: '9',
    type: 'block',
    className: styles.blockText,
    position: { x: -680, y: 200 },
    data: {
      content: [
        { id: 'tb1', type: 'paragraph', content: 'Infonote transforms the way teams capture, organize, and share knowledge. With an infinite canvas and rich block-based editing, your ideas flow freely.' },
      ],
      hideHoverMenu: true,
    },
    selected: false,
  },
  {
    id: '10',
    type: 'youtube',
    className: styles.blockVideo,
    position: { x: -100, y: -90 },
    data: {
      videoId: '-I8QtPA7lt4',
    },
    style: { width: 320, height: 180 },
    selected: false,
  }
];

const nestedDesignNodes = [
  {
    id: 'n1',
    type: 'note',
    position: { x: -280, y: -200 },
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
    position: { x: -280, y: 80 },
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
            
            <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--color-border)', padding: '4px 10px', borderRadius: 6}}>
                <Link2 size={14} color="var(--color-text-muted)" />
                <span>Links</span>
              </div>
              <div style={{border: '1px solid var(--color-border)', padding: '4px 6px', borderRadius: 6}}>
                <LayoutGrid size={14} color="var(--color-text-muted)" />
              </div>
            </div>
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
                onPaneDoubleClick={drilledNode ? goBack : undefined}
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
    </div>
  );
};
