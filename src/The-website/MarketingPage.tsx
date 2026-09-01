import React, { useCallback, memo, useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { ReactFlow, ReactFlowProvider, Background, useNodesState, useEdgesState, addEdge, Handle, Position, type Node, type Edge, type Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Search,
  Menu,
  FileIcon,
  Link2,
  X,
  ArrowRight,
  Sparkles,
  Target,
  Zap,
  ShieldCheck,
  Lock,
  HardDrive,
  Database,
  FileText,
  Kanban,
  Sun,
  Moon,
  MoveUp,
  Play,
  Calendar
} from 'lucide-react';
import styles from './MarketingPage.module.css';
// Import actual app components
import { NoteCard } from '../features/card/NoteCard';
import { FusedNoteNode } from '../features/card/FusedNoteNode';
import { BlockNode } from '../features/block/BlockNode';
import { BottomMenu } from '../features/ui/BottomMenu';
import { Breadcrumbs } from '../features/navigation/Breadcrumbs';
import { useStore } from '../store/useStore';
import { StepCaptureIllustration } from './illustrations/StepCaptureIllustration';
import { StepChunkIllustration } from './illustrations/StepChunkIllustration';
import { StepConnectIllustration } from './illustrations/StepConnectIllustration';
import { SecondBrainIllustration } from './illustrations/SecondBrainIllustration';
import { InfiniteCanvasIllustration } from './illustrations/InfiniteCanvasIllustration';
import { LocalStorageIllustration } from './illustrations/LocalStorageIllustration';
import { FlowStateIllustration } from './illustrations/FlowStateIllustration';
import { ParaMethodIllustration } from './illustrations/ParaMethodIllustration';
import { ZettelkastenIllustration } from './illustrations/ZettelkastenIllustration';
import { MindmappingIllustration } from './illustrations/MindmappingIllustration';
import { LinkPreview } from '../components/ui/link-preview';
import { originFromEvent } from '../utils/themeTransition';
import { Button, ButtonLink, IconButton } from '../components/ui/Button';

// -------------------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------------------
const MarqueeItem = memo(() => (
  <div className={styles.marqueeItem}>
    <span>Visual Thinking</span> <span className={styles.marqueeStar}>✦</span>
    <span>Infinite Canvas</span> <span className={styles.marqueeStar}>✦</span>
    <span>Knowledge Graph</span> <span className={styles.marqueeStar}>✦</span>
    <span>Fluid Connections</span> <span className={styles.marqueeStar}>✦</span>
    <span>Absolute Privacy</span> <span className={styles.marqueeStar}>✦</span>
  </div>
));
MarqueeItem.displayName = "MarqueeItem";

export function CinematicFooter() {
  const scrollToTop = () => {
    const scrollContainer = document.getElementById('marketing-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* The actual footer stays fixed to the viewport underneath everything */}
      <footer className={styles.footer}>
        {/* 1. Sleek Marquee */}
        <div className={styles.marqueeContainer}>
          <div className={styles.marqueeTrack}>
            <MarqueeItem />
            <MarqueeItem />
          </div>
        </div>

        {/* 2. Main Center Content */}
        <motion.div 
          className={styles.centerContent}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { 
              opacity: 1, 
              y: 0, 
              transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.15 } 
            }
          }}
        >
          <motion.h2 
            className={styles.heading}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            Ready to begin?
          </motion.h2>

          <motion.div 
            className={styles.buttonContainer}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            {/* Primary Calls to Action */}
            <div className={styles.primaryButtonGroup}>
              <ButtonLink href="#" variant="primary" size="lg" className={styles.primaryPill} leadingIcon={<Play className={styles.icon} />}>
                Start for Free
              </ButtonLink>
              
              <ButtonLink href="#" variant="secondary" size="lg" className={styles.primaryPill} leadingIcon={<Calendar className={styles.icon} />}>
                Book a Demo
              </ButtonLink>
            </div>

            {/* Secondary Text Links */}
            <div className={styles.secondaryButtonGroup}>
              <ButtonLink href="#" variant="ghost" size="sm" className={styles.secondaryPill}>
                Privacy Policy
              </ButtonLink>
              <ButtonLink href="#" variant="ghost" size="sm" className={styles.secondaryPill}>
                Terms of Service
              </ButtonLink>
              <ButtonLink href="#" variant="ghost" size="sm" className={styles.secondaryPill}>
                Support
              </ButtonLink>
            </div>
          </motion.div>
        </motion.div>

        {/* 3. Bottom Bar / Credits */}
        <motion.div 
          className={styles.bottomBar}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          
          <div className={styles.copyright}>
            © 2026 Infonote. All rights reserved.
          </div>

          <div className={`${styles.editorialPill} ${styles.madeWithBadge}`}>
            <span className={styles.badgeText}>Crafted with</span>
            <span className={styles.heart}>❤</span>
            <span className={styles.badgeText}>by</span>
            <span className={styles.badgeBrand}>Wajih</span>
          </div>

          <IconButton
            label="Scroll to top"
            variant="ghost"
            onClick={scrollToTop}
            className={`${styles.editorialPill} ${styles.backToTop}`}
          >
            <MoveUp />
          </IconButton>
        </motion.div>
      </footer>
    </div>
  );
}

const lpWordVariants = {
  hidden: { filter: 'blur(10px)', opacity: 0, y: 10 },
  visible: { filter: 'blur(0px)', opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } },
};

const AnimatedText = ({ text }: { text: string }) => (
  <>
    {text.split(' ').map((word, i) => (
      <motion.span key={i} variants={lpWordVariants} style={{ display: 'inline-block', marginRight: '0.25em' }}>
        {word}
      </motion.span>
    ))}
  </>
);

const ImageBlockComponent = memo(({ data }: { data: { url?: string } }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: 'var(--elev-2)',
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
        style={{ right: -4, background: 'var(--accent)', border: '2px solid var(--bg-rail)', width: 10, height: 10, borderRadius: '50%', boxShadow: 'var(--shadow-sm)' }}
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
      background: 'var(--bg-raised)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 1000,
        aspectRatio: '16/9', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        boxShadow: 'var(--elev-3)',
      }} onClick={(e) => e.stopPropagation()}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      </div>
      <IconButton label="Close video" variant="ghost" style={{
        position: 'absolute', top: 24, right: 24,
        width: 40, height: 40, borderRadius: '50%',
        background: 'var(--active-wash)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'white',
      }} onClick={onClose}>
        <X size={20} />
      </IconButton>
    </div>,
    document.body
  );
});

const YouTubeBlock = memo(({ data }: { data: { videoId: string } }) => {
  const [open, setOpen] = useState(false);
  const videoId = data.videoId;

  return (
    <>
      <div style={{
        width: '100%', height: '100%', borderRadius: 'var(--radius-md)',
        overflow: 'hidden', position: 'relative',
        background: 'var(--bg-inset)', border: '1px solid var(--color-border)',
        boxShadow: 'var(--elev-2)',
        cursor: videoId ? 'pointer' : 'default',
      }} onClick={() => { if (videoId) setOpen(true); }}>
        {videoId ? (
          <img
            src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.8 }}
            alt="Video thumbnail"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'var(--bg-inset)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            paddingBottom: 28, gap: 6,
          }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
              Product tour
            </span>
            <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>
              Coming with the beta
            </span>
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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

const initialNodes: Node[] = [
  // ── CENTER: YouTube video + Icon card side by side ──
  {
    id: '10',
    type: 'youtube',
    className: styles.blockVideo,
    position: { x: -36, y: 181 },
    data: {
      // Set to the YouTube id of OUR demo video when it's ready. Empty renders
      // a branded "Product tour" placeholder instead of an external embed.
      videoId: '',
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

  // ── EDGES: surrounding nodes spread around the perimeter ──

  // Top-left — Bullet list block
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

  // Left — New Note card
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



  // Top-right — Text block ("Chunk it...")
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

  // Right — Fused note (Meeting Notes)
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
      color: 'var(--secondary)',
      hideHoverMenu: true,
    },
    style: { width: 320, height: 320, rotate: '-15deg' },
    selected: false,
  },

  // Bottom-right — Workshop insights (large expanded card)
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

const nestedDesignNodes: Node[] = [
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
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [drilledNode, setDrilledNode] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [isSmallScreen, setIsSmallScreen] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const setCurrentView = useStore((state) => state.setCurrentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const auth = useStore((state) => state.auth);

  // Signed-in identity for the top nav — mirrors LandingPage's derivation.
  const accountName = auth.displayName || auth.email?.split('@')[0] || 'Account';
  const accountInitial = accountName.charAt(0).toUpperCase();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
      kicker: "Capture & organise",
      title: "Second Brain",
      desc: "Capture your thoughts, ideas, and knowledge in a centralized digital repository. Chunkit naturally accommodates the P.A.R.A method.",
      tags: ["P.A.R.A", "Capture", "Retrieve"],
      icon: <Database />,
      svg: <ParaMethodIllustration />
    },
    {
      kicker: "Link & connect",
      title: "Zettelkasten",
      desc: "Create atomic notes and interconnect them organically. Foster emergent ideas through bidirectional linking and spatial mapping.",
      tags: ["Atomic notes", "Backlinks", "Emergence"],
      icon: <Link2 />,
      svg: <ZettelkastenIllustration />
    },
    {
      kicker: "Think visually",
      title: "Mindmapping",
      desc: "Brainstorm visually on the infinite canvas. Group, connect, and hierarchize concepts without linear constraints.",
      tags: ["Infinite canvas", "Freeform", "Hierarchy"],
      icon: <Target />,
      svg: <MindmappingIllustration />
    }
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
  }, [setEdges]);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.id === '6' && !drilledNode) {
      setDrilledNode('6');
      setNodes(nestedDesignNodes);
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
    setNodes(initialNodes);
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
    <div id="marketing-scroll-container" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
      <div className={styles.pageContainer}>
        <div className={styles.orbBg} />

        {/* Top Navigation */}
        <nav className={`${styles.topNav} ${scrolled ? styles.scrolled : ''}`} onMouseMove={handleNavMouseMove}>
        <div className={styles.navLogo}>
          <div className={styles.navLogoMark}>
            <img src="/ChnkLogo.svg" alt="Chnk" style={{ height: 18 }} />
          </div>
          <span className={styles.navLogoText}>Infonote</span>
        </div>
        <div className={styles.navLinks}>
          <a className={styles.navLink} onClick={() => setCurrentView('features')} style={{ cursor: 'pointer' }}>
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
          {auth.isAuthenticated ? (
            <button
              type="button"
              className={styles.navAccount}
              onClick={() => setCurrentView('landing')}
              title={auth.email || accountName}
              aria-label={`Signed in as ${accountName} — open app`}
            >
              <span className={styles.navAccountAvatar}>{accountInitial}</span>
              {/* Name swaps to the "Open app" call to action on hover/focus */}
              <span className={styles.navAccountSwap}>
                <span className={styles.navAccountName}>{accountName}</span>
                <span className={styles.navAccountAction} aria-hidden="true">
                  Open app
                  <ArrowRight size={13} className={styles.navAccountArrow} />
                </span>
              </span>
            </button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className={styles.loginBtn} onClick={() => setCurrentView('login')}>
                Login
              </Button>
              <Button variant="primary" size="sm" className={styles.navButton} onClick={() => setCurrentView('signup')}>
                <span>Get Started</span>
                <ArrowRight size={14} className={styles.navButtonIcon} />
              </Button>
            </>
          )}
          <IconButton
            label="Toggle theme"
            variant="ghost"
            onClick={(e) => toggleTheme(originFromEvent(e))}
            className={styles.themeToggleNav}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
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
              <img src="/ChnkLogo.svg" alt="Chnk" style={{ height: 16 }} />
              <span>Infonote</span>
              <Menu size={16} color="var(--color-text-muted)" style={{ marginLeft: 8 }} />
            </div>

            <div className={styles.browserSearch}>
              <Search size={14} />
              <span>Find anything you are looking for...</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10, background: 'var(--hover-wash)', padding: '2px 6px', borderRadius: 4 }}>⌘K</span>
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
                minZoom={isSmallScreen ? 0.35 : 0.8}
                maxZoom={0.8}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                key={`${drilledNode || 'main'}-${isSmallScreen ? 'sm' : 'lg'}`}
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
        <div className={styles.ftHero} style={{ position: 'relative', zIndex: 1 }}>
          <h2 className={styles.ftHeading}>
            Build your second brain
          </h2>
          <p className={styles.ftSub}>
            Align your thinking around a <strong>unified knowledge canvas</strong>. Capture, organize, and connect all your ideas with Infonote's visual-first approach to note-taking.
          </p>

          {/* Large hero visual — Collaborative Canvas UI Simulation (Nested Chunks) */}
          <div className={styles.ftHeroVisual} style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Watermark centered behind the illustration */}
            <div className={styles.wtWatermarkSection}>Knowledge Management</div>
            <SecondBrainIllustration />
          </div>
        </div>

        {/* ── Two Column Feature Cards ── */}
        <div className={styles.ftDualRow}>

          {/* Feature 1: Local Storage and Security */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText} style={{ position: 'relative' }}>
              <ShieldCheck
                size={140}
                strokeWidth={0}
                fill="currentColor"
                style={{ position: 'absolute', top: '-30px', left: '-20px', opacity: 0.08, color: 'var(--text-main)', pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 70%)', maskImage: 'linear-gradient(180deg, black 0%, transparent 70%)' }}
              />
              <h3 className={styles.ftDualTitle} style={{ color: 'var(--text-main)', position: 'relative', zIndex: 1 }}>
                Your data stays on your device
              </h3>
              <p className={styles.ftDualDesc} style={{ position: 'relative', zIndex: 1 }}>
                Experience zero-latency access with local-first storage. All your notes and documents are end-to-end encrypted for absolute privacy.
              </p>
            </div>

            <div className={styles.ftDualVisual}>
              <LocalStorageIllustration />
            </div>
          </div>

          {/* Feature 2: Flow State / Seamless UX */}
          <div className={styles.ftDualCard}>
            <div className={styles.ftDualText} style={{ position: 'relative' }}>
              <Zap
                size={140}
                strokeWidth={0}
                fill="currentColor"
                style={{ position: 'absolute', top: '-30px', left: '-20px', opacity: 0.08, color: 'var(--text-main)', pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 70%)', maskImage: 'linear-gradient(180deg, black 0%, transparent 70%)' }}
              />
              <h3 className={styles.ftDualTitle} style={{ color: 'var(--text-main)', position: 'relative', zIndex: 1 }}>
                Take notes & plan in one flow
              </h3>
              <p className={styles.ftDualDesc} style={{ position: 'relative', zIndex: 1 }}>
                Experience a frictionless workspace. Capture knowledge in notes and instantly organize them into actionable project plans without breaking your flow.
              </p>
            </div>

            <div className={styles.ftDualVisual}>
              <FlowStateIllustration />
            </div>
          </div>
        </div>

        {/* ── Split Feature Row: Linear meets Canvas ── */}
        <div className={styles.ftSplitRow}>

          <div className={styles.ftSplitText} style={{ position: 'relative', zIndex: 1 }}>
            <div className={styles.wtWatermarkSection}>fusion</div>
            <h3 className={styles.ftDualTitle} style={{ color: 'var(--text-main)', fontSize: '38px' }}>
              Linear notes meet infinite canvas
            </h3>
            <p className={styles.ftDualDesc} style={{ maxWidth: '480px', marginBottom: '32px' }}>
              Chunkit completely fuses the focused, block-based writing approach of tools like Notion with the boundless, free-form spatial power of an infinite canvas like Milanote.
            </p>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: 'var(--accent)' }} />
              <span>Write long-form docs with a rich block editor</span>
            </div>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: 'var(--accent)' }} />
              <span>Extract any block into a spatial card instantly</span>
            </div>
            <div className={styles.ftBullet}>
              <span className={styles.ftBulletDot} style={{ background: 'var(--accent)' }} />
              <span>Connect ideas visually across a limitless board</span>
            </div>
          </div>

          <div className={`${styles.ftDualVisual} ${styles.ftSplitVisualModifier}`}>

            <InfiniteCanvasIllustration />
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

      {/* ── How It Works Walkthrough Section ── */}
      <section className={styles.walkthroughSection} id="how-it-works">
        <div className={styles.wtHeader} style={{ position: 'relative', zIndex: 1 }}>
          <div className={styles.wtWatermarkSection}>HOW IT WORKS</div>
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
                      '--dot-color': 'var(--accent)'
                    } as React.CSSProperties}
                  />
                ))}
              </div>

              {/* Step 1 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 0 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>01</div>
                <div className={styles.wtWatermarkText}>CAPTURE</div>
                <h3 className={styles.wtStepTitle}>Write notes naturally</h3>
                <p className={styles.wtStepDesc}>
                  Start in a focused, high-performance editor. Write ideas, record meetings, and collect documents using standard linear text. No visual clutter, just raw thoughts instantly structured in blocks.
                </p>
              </div>

              {/* Step 2 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 1 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>02</div>
                <div className={styles.wtWatermarkText}>CHUNK IT</div>
                <h3 className={styles.wtStepTitle}>Extract blocks into layers</h3>
                <p className={styles.wtStepDesc}>
                  Hover over any paragraph, bullet, or list item. With one click, "chunk" it. This slices the text out, converting it into a separate visual block linked dynamically to your document.
                </p>
              </div>

              {/* Step 3 text */}
              <div className={`${styles.wtStickyStepText} ${activeStep === 2 ? styles.wtStickyStepTextActive : ''}`}>
                <div className={styles.wtNumber}>03</div>
                <div className={styles.wtWatermarkText}>CONNECT</div>
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
              <StepCaptureIllustration activeStep={activeStep} />
            </div>

            {/* Step 2 Visual */}
            <div className={styles.wtScrollPanel} ref={(el) => { stepRefs.current[1] = el; }}>
              <StepChunkIllustration activeStep={activeStep} />
            </div>

            {/* Step 3 Visual */}
            <div className={styles.wtScrollPanel} ref={(el) => { stepRefs.current[2] = el; }}>
              <StepConnectIllustration activeStep={activeStep} />
            </div>

          </div>
        </div>
      </section>

      {/* ── Competitor Fusion Section ── */}
      <section className={styles.fusionSection}>

        <div className={styles.fusionHeader} style={{ position: 'relative', zIndex: 1 }}>
          <div className={styles.wtWatermarkSection}>All-in-One Optimization</div>
          <h2 className={styles.fusionTitle}>Works Seamlessly Across All Tools</h2>
          <p className={styles.fusionSubtitle}>
            We fuse the experiences of Notion, Milanote, Scrintal, Affine, and OneNote into one seamless workflow.
          </p>
        </div>

        <div className={styles.fusionCarousel}>
          {/* Card 1: Notion (Outer Left) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: -360, z: -150, rotateY: 40, scale: 1, opacity: 0.2 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={styles.fusionCard}
          >
            <img src="https://cdn.simpleicons.org/notion/ffffff" alt="Notion" style={{ width: '56px', height: '56px' }} />
          </motion.div>

          {/* Card 2: Milanote (Mid Left) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: -240, z: -100, rotateY: 25, scale: 1, opacity: 0.5 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ zIndex: 4 }}
            className={styles.fusionCard}
          >
            <img src="https://cdn.simpleicons.org/milanote/ef4444" alt="Milanote" style={{ width: '56px', height: '56px' }} />
          </motion.div>

          {/* Card 3: OneNote (Inner Left) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: -120, z: -50, rotateY: 10, scale: 1, opacity: 0.8 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ zIndex: 6 }}
            className={styles.fusionCard}
          >
            <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Microsoft_Office_OneNote_%282019%E2%80%932025%29.svg" alt="OneNote" style={{ width: '56px', height: '56px' }} />
          </motion.div>

          {/* Card Center: Chunkit */}
          <motion.div
            initial={{ x: 0, z: 0, rotateY: 0, scale: 0.5, opacity: 0 }}
            whileInView={{ x: 0, z: 0, rotateY: 0, scale: 1, opacity: 1 }}
            whileHover={{ y: -10, scale: 1.05 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{ zIndex: 10 }}
            className={styles.fusionCardCenter}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </motion.div>

          {/* Card 4: Scrintal (Inner Right) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: 120, z: -50, rotateY: -10, scale: 1, opacity: 0.8 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ zIndex: 5 }}
            className={styles.fusionCard}
          >
            <div style={{ color: 'var(--secondary)', fontSize: '56px', fontWeight: 700, fontStyle: 'italic', fontFamily: 'serif', lineHeight: 1 }}>S</div>
          </motion.div>

          {/* Card 5: Affine (Mid Right) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: 240, z: -100, rotateY: -25, scale: 1, opacity: 0.5 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ zIndex: 4 }}
            className={styles.fusionCard}
          >
            <img src="https://cdn.simpleicons.org/affine/3b82f6" alt="Affine" style={{ width: '56px', height: '56px' }} />
          </motion.div>

          {/* Card 6: Obsidian (Outer Right) */}
          <motion.div
            initial={{ x: 0, z: -50, rotateY: 0, scale: 0.6, opacity: 0 }}
            whileInView={{ x: 360, z: -150, rotateY: -40, scale: 1, opacity: 0.2 }}
            whileHover={{ y: -10, scale: 1.05, opacity: 1, zIndex: 20 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={styles.fusionCard}
          >
            <img src="https://cdn.simpleicons.org/obsidian/7c3aed" alt="Obsidian" style={{ width: '56px', height: '56px' }} />
          </motion.div>
        </div>

        <div style={{ marginTop: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <Button variant="primary" size="lg" className={styles.navButton} style={{ padding: '14px 36px', fontSize: '15px' }}>
            VIEW DEMO
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-faint)', fontWeight: 500 }}>
            <div style={{ display: 'flex', position: 'relative' }}>
              <img src="https://i.pravatar.cc/100?img=4" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-strong)' }} />
              <img src="https://i.pravatar.cc/100?img=5" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-strong)', marginLeft: '-10px' }} />
              <img src="https://i.pravatar.cc/100?img=6" alt="user" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-strong)', marginLeft: '-10px' }} />
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-strong)', marginLeft: '-10px', background: 'var(--bg-rail)', color: 'var(--text-main)', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>+1k</div>
            </div>
            Trusted by 1,200+ teams who turned ideas into real digital products.
          </div>
        </div>
      </section>

      {/* ── Link Preview Demo Section ── */}
      <section className={styles.lpSection}>
        <motion.p 
          className={styles.lpText}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            hidden: { opacity: 1 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.08 },
            },
          }}
        >
          <AnimatedText text="Experience Infonote's unique visual features. Watch the" />
          <motion.span variants={lpWordVariants} style={{ display: 'inline-block', marginRight: '0.25em' }}>
            <LinkPreview
              url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              imageSrc="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=640&auto=format&fit=crop"
              isStatic
              className={styles.lpLink}
            >
              Product Tour ↗
            </LinkPreview>
          </motion.span>
          <AnimatedText text="for a deep dive, explore a" />
          <motion.span variants={lpWordVariants} style={{ display: 'inline-block', marginRight: '0.25em' }}>
            <LinkPreview
              url="/templates"
              imageSrc="https://images.unsplash.com/photo-1542626991-cbc4e32524cc?q=80&w=640&auto=format&fit=crop"
              isStatic
              className={styles.lpLink}
            >
              Sample Canvas ↗
            </LinkPreview>
          </motion.span>
          <AnimatedText text="to see how ideas flow, or navigate your" />
          <motion.span variants={lpWordVariants} style={{ display: 'inline-block', marginRight: '0.25em' }}>
            <LinkPreview
              url="/graph"
              imageSrc="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=640&auto=format&fit=crop"
              isStatic
              className={styles.lpLink}
            >
              Knowledge Graph ↗
            </LinkPreview>
          </motion.span>
          <AnimatedText text="instantly." />
        </motion.p>
      </section>

      {/* ── Testimonials Section ── */}
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
                  <div className={styles.accEyebrow}>
                    <span className={styles.accIndex}>
                      {String(index + 1).padStart(2, '0')}
                      <span className={styles.accIndexTotal}> / {String(accordionData.length).padStart(2, '0')}</span>
                    </span>
                    <span className={styles.accRule} />
                    <span className={styles.accKicker}>{item.kicker}</span>
                    <span className={styles.accHeadIcon}>
                      {React.cloneElement(item.icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 17, strokeWidth: 2 })}
                    </span>
                  </div>

                  <h3 className={styles.accTitle}>{item.title}</h3>
                  <p className={styles.accDesc}>{item.desc}</p>

                  <div className={styles.accTags}>
                    {item.tags.map((tag) => (
                      <span key={tag} className={styles.accTag}>{tag}</span>
                    ))}
                  </div>

                  <div className={styles.accDivider} />

                  <div className={styles.accImageWrapper}>
                    {item.svg}
                  </div>
                </div>

                {/* Collapsed strip */}
                <div className={styles.accordionSidebar}>
                  <span className={styles.accSidebarIndex}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.accVerticalText}>{item.title}</div>
                  <div className={styles.accSidebarIcon}>
                    {React.cloneElement(item.icon as React.ReactElement<{ size?: number }>, { size: 18 })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>


      {/* Cinematic Footer now inside pageContainer */}
      <CinematicFooter />
      </div>
    </div>
  );
};
