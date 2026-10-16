import { useLayoutEffect, useRef, useState } from 'react';

type Range = readonly [number, number];

/** Beats inside each scene, as fractions of that scene's own scroll progress.
 * Roughly: the first fifth sets the context, the middle shows the change, the
 * last third leaves the result readable. Each beat is written to the scene
 * root as a custom property running 0 → 1; the stylesheet does the rest. */
const SCENE_BEATS: Record<string, Record<string, Range>> = {
  collection: { drift: [0, 1] },
  cut: { mark: [0.08, 0.34], split: [0.34, 0.72], label: [0.66, 0.9] },
  connection: { gather: [0.08, 0.42], wire: [0.4, 0.68], note: [0.64, 0.9] },
  depth: { group: [0.04, 0.26], open: [0.36, 0.72], inside: [0.62, 0.92] },
  assist: { select: [0.08, 0.3], panel: [0.28, 0.58], answer: [0.52, 0.84] },
  plan: { spread: [0.06, 0.36], outline: [0.3, 0.62], move: [0.62, 0.9] },
};

/* Scroll sets the target and a critically damped spring follows it (damping
   ratio 1, response 0.2s). Because the spring keeps its velocity, reversing
   the scroll bends the motion instead of snapping it, and a wheel step never
   shows as a jump. The page itself always scrolls natively. */
const RESPONSE = 0.2;
const OMEGA = (2 * Math.PI) / RESPONSE;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => t * t * (3 - 2 * t);

interface Scene {
  el: HTMLElement;
  beats: [string, Range][];
  start: number;
  end: number;
  target: number;
  value: number;
  velocity: number;
  written: number;
}

export function useResearchStoryMotion(reduced: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    // Entrance states only apply once this has run, so the page stays fully
    // readable if the script never does.
    root.dataset.js = 'ready';

    const scenes: Scene[] = [...root.querySelectorAll<HTMLElement>('[data-scene]')].map(el => ({
      el,
      beats: Object.entries(SCENE_BEATS[el.dataset.scene ?? ''] ?? {}),
      start: 0, end: 1, target: 0, value: 0, velocity: 0, written: NaN,
    }));
    const chapterEls = [...root.querySelectorAll<HTMLElement>('[data-chapter]')];
    let chapterTops: number[] = [];
    let currentChapter = -1;
    let isScrolled = false;
    let frame = 0;
    let last = 0;
    let primed = false;

    const write = (scene: Scene) => {
      const p = clamp01(scene.value);
      if (Math.abs(p - scene.written) < 0.0002) return;
      scene.written = p;
      scene.el.style.setProperty('--p', p.toFixed(4));
      for (const [name, [from, to]] of scene.beats) {
        scene.el.style.setProperty(`--${name}`, ease(clamp01((p - from) / (to - from))).toFixed(4));
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 0.016);
      last = now;
      let moving = false;
      for (const scene of scenes) {
        if (Math.abs(scene.target - scene.value) < 0.0004 && Math.abs(scene.velocity) < 0.002) {
          scene.value = scene.target;
          scene.velocity = 0;
        } else {
          // Two substeps keep the integrator stable across a dropped frame.
          for (let i = 0; i < 2; i++) {
            const h = dt / 2;
            scene.velocity += (OMEGA * OMEGA * (scene.target - scene.value) - 2 * OMEGA * scene.velocity) * h;
            scene.value += scene.velocity * h;
          }
          moving = true;
        }
        write(scene);
      }
      if (moving) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    const onScroll = () => {
      const scroll = root.scrollTop;

      if (scroll > 8 !== isScrolled) {
        isScrolled = scroll > 8;
        setScrolled(isScrolled);
      }
      let chapter = 0;
      const line = scroll + root.clientHeight * 0.42;
      for (let i = 1; i < chapterTops.length; i++) if (line >= chapterTops[i]) chapter = i;
      if (chapter !== currentChapter) {
        currentChapter = chapter;
        setActive(chapter);
      }

      if (reduced) return;
      for (const scene of scenes) scene.target = clamp01((scroll - scene.start) / (scene.end - scene.start));
      if (!primed) {
        // First paint, or a reload part-way down: land in place, don't animate there.
        primed = true;
        for (const scene of scenes) {
          scene.value = scene.target;
          scene.velocity = 0;
          write(scene);
        }
      } else if (!frame) {
        frame = requestAnimationFrame(tick);
      }
    };

    /* Geometry is read here only — on mount, resize and font load — never per
       scroll frame. */
    const measure = () => {
      const view = root.clientHeight;
      const rootTop = root.getBoundingClientRect().top;
      const offset = (el: HTMLElement) => el.getBoundingClientRect().top - rootTop + root.scrollTop;
      chapterTops = chapterEls.map(offset);

      for (const scene of scenes) {
        const track = scene.el.querySelector<HTMLElement>('[data-track]');
        const stage = scene.el.querySelector<HTMLElement>('[data-stage]');
        if (!track || !stage) {
          // The opening scene: progress is simply how far the hero has scrolled.
          scene.start = offset(scene.el);
          scene.end = scene.start + scene.el.offsetHeight * 0.55;
          continue;
        }
        const trackTop = offset(track);
        const style = getComputedStyle(stage);
        const travel = track.offsetHeight - stage.offsetHeight;
        if (style.position === 'sticky' && travel > 40) {
          // Side-by-side layout: the stage arrives, holds while it plays, then leaves.
          const stuckAt = trackTop - (parseFloat(style.top) || 0);
          scene.start = stuckAt - view * 0.42;
          scene.end = stuckAt + travel * 0.9;
        } else {
          // Stacked layout: play as the stage rises to the middle of the screen.
          scene.start = trackTop - view * 0.84;
          scene.end = trackTop + stage.offsetHeight / 2 - view * 0.5;
        }
        scene.end = Math.max(scene.end, scene.start + view * 0.3);
      }
      onScroll();
    };

    if (reduced) {
      // Reduced motion: the stylesheet shows each scene's result (or its
      // before/after pose). Nothing is scrubbed.
      for (const scene of scenes) {
        scene.el.style.removeProperty('--p');
        for (const [name] of scene.beats) scene.el.style.removeProperty(`--${name}`);
      }
    }

    const seen = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-seen', '');
        seen.unobserve(entry.target);
      }
    }, { root, rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    root.querySelectorAll('[data-reveal]:not([data-seen])').forEach(el => seen.observe(el));

    const resize = new ResizeObserver(measure);
    resize.observe(root);
    const content = root.querySelector('main');
    if (content) resize.observe(content);
    root.addEventListener('scroll', onScroll, { passive: true });
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    measure();

    return () => {
      cancelled = true;
      seen.disconnect();
      resize.disconnect();
      root.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return { scrollRef, active, scrolled };
}
