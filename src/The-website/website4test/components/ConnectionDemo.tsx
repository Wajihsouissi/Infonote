import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { Link2, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { clamp, project, rubberband, spring } from '../physics';
import { C1, C2, question } from '../researchStory';
import { SelectionCorners } from './ResearchCard';
import styles from './ConnectionDemo.module.css';

type CardId = 'C1' | 'C2' | 'Q1';
type Pair = readonly [CardId, CardId];
interface Point { x: MotionValue<number>; y: MotionValue<number> }
interface Size { w: number; h: number }
interface Geometry { w: number; h: number; boxes: Record<CardId, Size> }

/* `at` is each card's resting place as a fraction of the free space. */
const CARDS: readonly { id: CardId; text: string; at: readonly [number, number] }[] = [
  { id: 'C1', text: C1.lead, at: [0.04, 0.06] },
  { id: 'C2', text: C2.lead, at: [0.96, 0.42] },
  { id: 'Q1', text: question.lead, at: [0.26, 0.95] },
];
const TEXT = Object.fromEntries(CARDS.map(card => [card.id, card.text])) as Record<CardId, string>;
const HOME = () => Object.fromEntries(CARDS.map(card => [card.id, [...card.at]])) as Record<CardId, [number, number]>;

const PAD = 14;        // closest a card rests to the region's edge
const HYSTERESIS = 6;  // travel before a press becomes a drag
const THROW = 380;     // px/s above which a release carries momentum
const WIRE_GAP = 9;

function usePoint(): Point {
  const x = useMotionValue(0), y = useMotionValue(0);
  return useMemo(() => ({ x, y }), [x, y]);
}

/* A straight run between two cards, trimmed to stop just short of each edge. */
function wirePath(ax: number, ay: number, a: Size, bx: number, by: number, b: Size) {
  const from = { x: ax + a.w / 2, y: ay + a.h / 2 }, to = { x: bx + b.w / 2, y: by + b.h / 2 };
  const dx = to.x - from.x, dy = to.y - from.y;
  const trim = (size: Size) => Math.min(0.5, (size.w / 2 + WIRE_GAP) / Math.abs(dx || 1e-6), (size.h / 2 + WIRE_GAP) / Math.abs(dy || 1e-6));
  const t1 = trim(a), t2 = trim(b);
  return `M${(from.x + dx * t1).toFixed(1)} ${(from.y + dy * t1).toFixed(1)}L${(to.x - dx * t2).toFixed(1)} ${(to.y - dy * t2).toFixed(1)}`;
}

function DemoWire({ a, b, pair, geometry, reduced }: { a: Point; b: Point; pair: Pair; geometry: RefObject<Geometry>; reduced: boolean }) {
  // Follows both cards live, so a wire never lags a card that is being dragged.
  const d = useTransform<number, string>([a.x, a.y, b.x, b.y], ([ax, ay, bx, by]) => {
    const { boxes } = geometry.current;
    return wirePath(ax, ay, boxes[pair[0]], bx, by, boxes[pair[1]]);
  });
  return (
    <motion.path
      d={d}
      className={styles.wire}
      initial={reduced ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={spring(0.35)}
    />
  );
}

/** 07 — a real, small interaction. Its state is local and holds only the three
 * demo cards: it never reads or writes a workspace, and nothing here carries
 * over to the app. Selecting and connecting work by tap, click or keyboard;
 * dragging is an extra for a mouse or pen, and touch keeps scrolling the page. */
export function ConnectionDemo({ reduced }: { reduced: boolean }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<CardId, HTMLButtonElement | null>>({ C1: null, C2: null, Q1: null });
  const geometry = useRef<Geometry>({ w: 0, h: 0, boxes: { C1: { w: 0, h: 0 }, C2: { w: 0, h: 0 }, Q1: { w: 0, h: 0 } } });
  const fractions = useRef(HOME());
  const running = useRef<Record<CardId, { stop: () => void }[]>>({ C1: [], C2: [], Q1: [] });
  const drag = useRef<{ id: CardId; pointer: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; samples: { t: number; x: number; y: number }[] } | null>(null);
  const suppressClick = useRef(false);

  const c1 = usePoint(), c2 = usePoint(), q1 = usePoint();
  const points = useMemo<Record<CardId, Point>>(() => ({ C1: c1, C2: c2, Q1: q1 }), [c1, c2, q1]);

  const [selected, setSelected] = useState<CardId[]>([]);
  const [edges, setEdges] = useState<Pair[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [held, setHeld] = useState<CardId | null>(null);

  const bounds = (id: CardId) => {
    const { w, h, boxes } = geometry.current;
    return { minX: PAD, maxX: Math.max(PAD, w - boxes[id].w - PAD), minY: PAD, maxY: Math.max(PAD, h - boxes[id].h - PAD) };
  };

  const halt = (id: CardId) => {
    running.current[id].forEach(animation => animation.stop());
    running.current[id] = [];
  };

  const settle = (id: CardId, x: number, y: number, velocity = { x: 0, y: 0 }, dampingRatio = 1) => {
    halt(id);
    if (reduced) {
      points[id].x.set(x);
      points[id].y.set(y);
      return;
    }
    // X and Y are separate springs: one spring on the distance would desync
    // whenever the two axes leave with different velocities.
    const options = spring(0.4, dampingRatio);
    running.current[id] = [
      animate(points[id].x, x, { ...options, velocity: velocity.x }),
      animate(points[id].y, y, { ...options, velocity: velocity.y }),
    ];
  };

  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const measure = () => {
      const current = geometry.current;
      current.w = region.clientWidth;
      current.h = region.clientHeight;
      for (const { id } of CARDS) {
        const el = cardRefs.current[id];
        if (el) current.boxes[id] = { w: el.offsetWidth, h: el.offsetHeight };
      }
      // Keep each card at the same relative place when the region changes size.
      for (const { id } of CARDS) {
        if (drag.current?.id === id) continue;
        halt(id);
        const b = bounds(id), [fx, fy] = fractions.current[id];
        points[id].x.set(b.minX + fx * (b.maxX - b.minX));
        points[id].y.set(b.minY + fy * (b.maxY - b.minY));
      }
      // Cards stay hidden until they have been placed, so none is seen stacked in the corner.
      region.dataset.ready = '';
    };
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    for (const { id } of CARDS) {
      const el = cardRefs.current[id];
      if (el) observer.observe(el);
    }
    measure();
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measuring once per mount; `points` is stable
  }, []);

  const isConnected = (a: CardId, b: CardId) => edges.some(edge => edge.includes(a) && edge.includes(b));
  const pairReady = selected.length === 2;
  const duplicate = pairReady && isConnected(selected[0], selected[1]);
  const state = edges.length ? 'connected' : pairReady ? 'pair-selected' : selected.length ? 'first-selected' : 'ready';
  const message = notice
    ?? (duplicate ? 'Those two are already connected. Pick a different pair.'
      : pairReady ? 'Two selected. Press Connect ideas.'
        : selected.length ? 'One selected. Pick another.'
          : 'Pick two ideas to connect.');

  const toggle = (id: CardId) => {
    setNotice(null);
    // A third pick replaces the oldest, so there is never a dead end.
    setSelected(current => (current.includes(id) ? current.filter(other => other !== id) : [...current, id].slice(-2)));
  };

  const connect = () => {
    if (!pairReady || duplicate) return;
    const [a, b] = selected;
    setEdges(current => [...current, [a, b]]);
    setSelected([]);
    setNotice(`Connected “${TEXT[a]}” and “${TEXT[b]}” Undo it, or connect another pair.`);
    // One short tick, on the frame the line appears — and never with motion reduced.
    if (!reduced) navigator.vibrate?.(8);
  };

  const undo = () => {
    setEdges(current => current.slice(0, -1));
    setNotice('Connection removed.');
  };

  const reset = () => {
    setEdges([]);
    setSelected([]);
    setNotice('Demo reset.');
    fractions.current = HOME();
    for (const { id } of CARDS) {
      const b = bounds(id), [fx, fy] = fractions.current[id];
      settle(id, b.minX + fx * (b.maxX - b.minX), b.minY + fy * (b.maxY - b.minY));
    }
  };

  const onPointerDown = (id: CardId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Touch keeps the page scrolling; a tap still selects through the click.
    if (event.pointerType === 'touch' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    // Catch it wherever it is, mid-flight included: the spring stops at its
    // live value, so the card never jumps to where it was heading.
    halt(id);
    drag.current = {
      id, pointer: event.pointerId, moved: false,
      startX: event.clientX, startY: event.clientY,
      originX: points[id].x.get(), originY: points[id].y.get(),
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
    setHeld(id);
  };

  const onPointerMove = (id: CardId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== id || d.pointer !== event.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < HYSTERESIS) return;
      // Re-anchor at the threshold so the card starts under the pointer
      // instead of skipping the distance it took to decide this is a drag.
      d.moved = true;
      d.startX = event.clientX;
      d.startY = event.clientY;
    }
    const b = bounds(id), { w, h } = geometry.current;
    const soft = (value: number, min: number, max: number, span: number) =>
      value < min ? min - rubberband(min - value, span) : value > max ? max + rubberband(value - max, span) : value;
    // 1:1 with the pointer, from the point it was grabbed; resistance only past the edge.
    points[id].x.set(soft(d.originX + event.clientX - d.startX, b.minX, b.maxX, w));
    points[id].y.set(soft(d.originY + event.clientY - d.startY, b.minY, b.maxY, h));
    d.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    while (d.samples.length > 2 && event.timeStamp - d.samples[0].t > 100) d.samples.shift();
  };

  const onPointerEnd = (id: CardId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== id || d.pointer !== event.pointerId) return;
    drag.current = null;
    setHeld(null);
    if (!d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);

    // Release velocity from the last ~100ms of movement. A pointer that sat
    // still before letting go hands off none.
    const first = d.samples[0], last = d.samples[d.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    const live = event.type === 'pointerup' && !reduced && dt > 0 && event.timeStamp - last.t < 60;
    const velocity = live
      ? { x: clamp((last.x - first.x) / dt, -3000, 3000), y: clamp((last.y - first.y) / dt, -3000, 3000) }
      : { x: 0, y: 0 };

    // Land where the throw was heading, not where the pointer let go.
    const b = bounds(id);
    const x = clamp(points[id].x.get() + project(velocity.x), b.minX, b.maxX);
    const y = clamp(points[id].y.get() + project(velocity.y), b.minY, b.maxY);
    fractions.current[id] = [(x - b.minX) / Math.max(1, b.maxX - b.minX), (y - b.minY) / Math.max(1, b.maxY - b.minY)];
    // A little bounce only when the release itself carried momentum.
    settle(id, x, y, velocity, Math.hypot(velocity.x, velocity.y) > THROW ? 0.8 : 1);
  };

  return (
    <div className={styles.demo} data-state={state} data-testid="w4-demo">
      <div ref={regionRef} className={styles.region} role="group" aria-label="Demo canvas with three ideas">
        <svg className={styles.wires} aria-hidden="true">
          <AnimatePresence>
            {edges.map(pair => (
              <DemoWire key={pair.join('-')} a={points[pair[0]]} b={points[pair[1]]} pair={pair} geometry={geometry} reduced={reduced} />
            ))}
          </AnimatePresence>
        </svg>
        {CARDS.map(card => {
          const isSelected = selected.includes(card.id);
          return (
            <motion.button
              key={card.id}
              ref={el => { cardRefs.current[card.id] = el; }}
              type="button"
              className={styles.card}
              style={{ x: points[card.id].x, y: points[card.id].y }}
              whileTap={{ scale: 1.025 }}
              transition={spring(0.25)}
              aria-pressed={isSelected}
              data-held={held === card.id || undefined}
              onClick={() => { if (!suppressClick.current) toggle(card.id); }}
              onPointerDown={onPointerDown(card.id)}
              onPointerMove={onPointerMove(card.id)}
              onPointerUp={onPointerEnd(card.id)}
              onPointerCancel={onPointerEnd(card.id)}
            >
              <span className={styles.cardId} aria-hidden="true">{card.id}</span>
              {card.text}
              {isSelected && <SelectionCorners />}
            </motion.button>
          );
        })}
      </div>

      <div className={styles.controls}>
        <p className={styles.status} role="status">{message}</p>
        <div className={styles.buttons}>
          <Button variant="primary" leadingIcon={<Link2 size={16} />} disabled={!pairReady || duplicate} onClick={connect}>Connect ideas</Button>
          <Button variant="ghost" leadingIcon={<Undo2 size={16} />} disabled={!edges.length} onClick={undo}>Undo</Button>
          <Button variant="ghost" leadingIcon={<RotateCcw size={15} />} onClick={reset}>Reset demo</Button>
        </div>
      </div>
    </div>
  );
}
