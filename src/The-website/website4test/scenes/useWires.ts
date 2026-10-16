import { useLayoutEffect, useRef, useState } from 'react';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface WireSpec {
  /** `data-node` names of the two pieces to join. */
  from: string;
  to: string;
  sides: readonly [Side, Side];
  /** Sides to use once the scene has stacked into a narrow column. */
  compactSides?: readonly [Side, Side];
}

export interface Wire {
  d: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const NORMAL: Record<Side, readonly [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const COMPACT_BELOW = 520;

/* Layout box relative to `root`. offset* ignore transforms, so a piece that is
   mid-move still reports where it will come to rest — which is where its wire
   has to attach. */
function box(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function anchor(b: ReturnType<typeof box>, side: Side) {
  if (side === 'top') return { x: b.x + b.w / 2, y: b.y };
  if (side === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h };
  if (side === 'left') return { x: b.x, y: b.y + b.h / 2 };
  return { x: b.x + b.w, y: b.y + b.h / 2 };
}

const n = (value: number) => Math.round(value * 10) / 10;

/** Connections between pieces, measured from where they rest in the layout.
 * Geometry is read on mount, on resize and when fonts land — never per frame. */
export function useWires(specs: readonly WireSpec[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<(Wire | null)[]>(() => specs.map(() => null));

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const measure = () => {
      const compact = canvas.clientWidth < COMPACT_BELOW;
      const next = specs.map((spec): Wire | null => {
        const a = canvas.querySelector<HTMLElement>(`[data-node="${spec.from}"]`);
        const b = canvas.querySelector<HTMLElement>(`[data-node="${spec.to}"]`);
        // A piece hidden at this width has no layout box and takes its wire with it.
        if (!a || !b || !a.offsetWidth || !b.offsetWidth) return null;
        const [s1, s2] = (compact && spec.compactSides) || spec.sides;
        const from = anchor(box(a, canvas), s1), to = anchor(box(b, canvas), s2);
        const reach = Math.max(18, Math.hypot(to.x - from.x, to.y - from.y) * 0.42);
        const d = `M${n(from.x)} ${n(from.y)}C${n(from.x + NORMAL[s1][0] * reach)} ${n(from.y + NORMAL[s1][1] * reach)} ${n(to.x + NORMAL[s2][0] * reach)} ${n(to.y + NORMAL[s2][1] * reach)} ${n(to.x)} ${n(to.y)}`;
        return { d, from, to };
      });
      setWires(previous => (previous.every((wire, i) => wire?.d === next[i]?.d) ? previous : next));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas.querySelectorAll('[data-node]').forEach(node => observer.observe(node));
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    measure();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [specs]);

  return { ref, wires };
}
