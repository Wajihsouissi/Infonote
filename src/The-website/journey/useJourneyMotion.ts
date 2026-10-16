import { useLayoutEffect, useRef, useState } from 'react';
import { useMotionValue, type MotionValue } from 'motion/react';
import { LAST_CHAPTER } from './journeyData';

export interface TravelerMotion {
  left: MotionValue<number>; top: MotionValue<number>;
  width: MotionValue<number>; height: MotionValue<number>; rotate: MotionValue<number>;
}

/** Measure actual document destinations, not virtual slides. The page scrolls
 * normally; only one block travels along the measured path above it. */
export function useJourneyMotion(reduced: boolean) {
  const scrollRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stage = useMotionValue(0);
  const left = useMotionValue(0), top = useMotionValue(0);
  const width = useMotionValue(340), height = useMotionValue(160), rotate = useMotionValue(-2);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(() => window.innerWidth <= 760);

  useLayoutEffect(() => {
    const root = scrollRef.current, track = trackRef.current;
    if (!root || !track) return;
    let frame = 0;
    let destinations: { start: number; x: number; y: number; w: number; h: number }[] = [];
    const update = () => {
      frame = 0;
      if (!destinations.length) return;
      const scroll = root.scrollTop;
      let i = 0;
      while (i < LAST_CHAPTER && scroll >= destinations[i + 1].start) i++;
      const a = destinations[i], b = destinations[Math.min(i + 1, LAST_CHAPTER)];
      const t = i === LAST_CHAPTER ? 0 : Math.min(1, Math.max(0, (scroll - a.start) / (b.start - a.start)));
      const smooth = reduced ? (t < .5 ? 0 : 1) : t * t * (3 - 2 * t);
      const blend = (a: number, b: number, ratio = smooth) => a + (b - a) * ratio;
      // The card itself opens wider while crossing into its nested canvas.
      // Surrounding map nodes remain in document flow throughout the dive.
      const opening = i === 4 && !compact && !reduced ? Math.sin(t * Math.PI) : 0;
      const w = Math.min(root.clientWidth - 48, blend(a.w, b.w) + opening * 280);
      const h = blend(a.h, b.h) + opening * 100;
      left.set(blend(a.x, b.x));
      // Linear document interpolation cancels natural scrolling. Local anchor
      // heights still move the block vertically as it crosses each section.
      const y = blend(a.y, b.y, t) - scroll;
      top.set(i === LAST_CHAPTER ? y : Math.max(92 + h / 2, Math.min(root.clientHeight - 40 - h / 2, y)));
      width.set(w); height.set(h);
      rotate.set(reduced ? 0 : i === 0 ? -2 + t * 2 : Math.sin(t * Math.PI) * (i % 2 ? 2 : -2));
      stage.set(i + t);
    };
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      destinations = [...track.querySelectorAll<HTMLElement>('[data-journey-section]')].map(section => {
        const anchor = section.querySelector<HTMLElement>('[data-traveler-anchor]')!;
        const rect = anchor.getBoundingClientRect();
        return { start: section.getBoundingClientRect().top - bounds.top + root.scrollTop, x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + root.scrollTop + rect.height / 2, w: rect.width, h: rect.height };
      });
      update(); setReady(true);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { setCompact(window.innerWidth <= 760); measure(); };
    const observer = new ResizeObserver(measure);
    observer.observe(root); observer.observe(track);
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    measure();
    return () => { observer.disconnect(); root.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); };
  }, [reduced, compact, stage, left, top, width, height, rotate]);

  return { scrollRef, trackRef, stage, compact, ready, travel: { left, top, width, height, rotate } };
}
