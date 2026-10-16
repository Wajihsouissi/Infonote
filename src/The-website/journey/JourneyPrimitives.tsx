import type { ReactNode } from 'react';
import { FileText, GripVertical, Link2, Square, Type, Image, Plus, MousePointer2, Layers, ArrowUpRight } from 'lucide-react';
import blockStyles from '../../features/block/BlockNode.module.css';
import cardStyles from '../../features/card/NoteCard.module.css';
import styles from './JourneyPage.module.css';

/** Read-only presentations use the live app's node/card shells and tokens.
 * They deliberately don't mount editor/store handlers in a marketing demo. */
export function StoryNode({ children, className = '', label, card = false }: { children: ReactNode; className?: string; label?: string; card?: boolean }) {
  return <div className={`${card ? cardStyles.card : blockStyles.blockNode} ${styles.node} ${className}`}>
    {label && <div className={styles.nodeLabel}>{label}</div>}{children}
  </div>;
}

export function CoffeeGallery({ compact = false }: { compact?: boolean }) {
  return <div className={`${styles.gallery} ${compact ? styles.compactGallery : ''}`}>
    <img src="/marketing/journey/coffee.jpg" alt="Coffee being poured by hand in a neighborhood café" width="800" height="533" decoding="async" />
    <div className={styles.poster}><span>NEIGHBORHOOD CLUB</span><strong>good coffee.<br />good company.</strong><span>COME AS YOU ARE.</span></div>
  </div>;
}

export function ResearchFile() {
  return <StoryNode className={styles.file}><FileText size={25} /><div><strong>Neighborhood notes.pdf</strong><small>A reference I collected</small></div></StoryNode>;
}

export function ReferenceLink() {
  return <div className={styles.reference}><Link2 size={15} /><span>Coffee club inspiration</span><ArrowUpRight size={14} /></div>;
}

export function TaskLine({ edited = false }: { edited?: boolean }) {
  return <div className={styles.task}><Square size={15} /><span>Plan a {edited ? 'Saturday' : 'first'} pop-up</span></div>;
}

export function CanvasToolbar() {
  return <div className={styles.toolbar} aria-hidden="true">{[MousePointer2, Type, Square, Image, Link2, Layers, Plus].map((Icon, i) => <span key={i}><Icon size={19} strokeWidth={1.6} /></span>)}</div>;
}

export function BlockHandle() { return <GripVertical size={15} className={styles.grip} />; }

export function Connector({ className = '', radial = false }: { className?: string; radial?: boolean }) {
  return <svg className={`${styles.connectors} ${className}`} viewBox="0 0 600 300" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <path d={radial ? 'M300 10V130M300 95C300 130 90 95 90 170M300 95C300 130 510 95 510 170M300 130V270' : 'M300 0V35Q300 50 285 50H145Q130 50 130 65V290M300 50H455Q470 50 470 65V290'} />
  </svg>;
}
