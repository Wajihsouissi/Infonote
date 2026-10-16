import type { CSSProperties, ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { question, sources, type Chunk } from '../researchStory';
import { DeskReference } from './DeskReference';
import styles from './ResearchCard.module.css';

/* Read-only shells drawn with the app's node tokens. They never mount editor
   or store handlers: a marketing scene must not be able to touch a workspace. */

interface ShellProps {
  /** Layout name the wires look up — see useWires. */
  node?: string;
  className?: string;
  style?: CSSProperties;
  selected?: boolean;
}

/** The editor's mark beside a piece: the ID that follows it through the story.
 * It belongs to the page's margin, not to the product's card chrome. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(styles.tag, className)} aria-hidden="true">{children}</span>;
}

/** Four small squares on a selected piece, as on the app canvas. */
export function SelectionCorners() {
  return <span className={styles.corners} aria-hidden="true"><i /><i /><i /><i /></span>;
}

export function ChunkCard({ chunk, full = false, tag = true, node, className, style, selected }: ShellProps & { chunk: Chunk; full?: boolean; tag?: boolean }) {
  return (
    <div className={cn(styles.card, styles.block, className)} style={style} data-node={node} data-selected={selected || undefined}>
      {tag && <Tag>{chunk.id}</Tag>}
      <p><span className={styles.lead}>{chunk.lead}</span>{full && <span className={styles.rest}> {chunk.rest}</span>}</p>
      {selected && <SelectionCorners />}
    </div>
  );
}

export function QuestionCard({ tag = true, node, className, style, selected }: ShellProps & { tag?: boolean }) {
  return (
    <div className={cn(styles.card, styles.block, styles.question, className)} style={style} data-node={node} data-selected={selected || undefined}>
      {tag && <Tag>{question.id}</Tag>}
      <p><span className={styles.lead}>{question.lead}</span></p>
      {selected && <SelectionCorners />}
    </div>
  );
}

export function PhotoCard({ tag = true, caption = true, node, className, style }: ShellProps & { tag?: boolean; caption?: boolean }) {
  return (
    <div className={cn(styles.card, styles.photo, className)} style={style} data-node={node}>
      {tag && <Tag>{sources.photo.id}</Tag>}
      <DeskReference className={styles.photoArt} />
      {caption && <span className={styles.photoCaption}>{sources.photo.title}</span>}
    </div>
  );
}

export function FileCard({ tag = true, node, className, style }: ShellProps & { tag?: boolean }) {
  return (
    <div className={cn(styles.card, styles.file, className)} style={style} data-node={node}>
      {tag && <Tag>{sources.file.id}</Tag>}
      <FileText size={22} strokeWidth={1.6} aria-hidden="true" />
      <span><strong>{sources.file.title}</strong><small>{sources.file.meta}</small></span>
    </div>
  );
}

/** A card with a title bar and an inset writing well. */
export function NoteCard({ title, tag, node, className, wellClassName, style, selected, children }: ShellProps & { title: string; tag?: string; wellClassName?: string; children: ReactNode }) {
  return (
    <div className={cn(styles.card, styles.note, className)} style={style} data-node={node} data-selected={selected || undefined}>
      {tag && <Tag>{tag}</Tag>}
      <div className={styles.noteHead}>{title}</div>
      <div className={cn(styles.noteWell, wellClassName)}>{children}</div>
      {selected && <SelectionCorners />}
    </div>
  );
}

/** A plain block the person wrote on the canvas. */
export function BlockCard({ tag, node, className, style, children }: ShellProps & { tag?: string; children: ReactNode }) {
  return (
    <div className={cn(styles.card, styles.block, className)} style={style} data-node={node}>
      {tag && <Tag>{tag}</Tag>}
      {children}
    </div>
  );
}

/** A piece at reference size: its ID and the sentence it is known by. */
export function MiniCard({ id, text, node, className, style }: ShellProps & { id: string; text: string }) {
  return (
    <div className={cn(styles.card, styles.mini, className)} style={style} data-node={node}>
      <span className={styles.miniTag} aria-hidden="true">{id}</span>
      <span>{text}</span>
    </div>
  );
}
