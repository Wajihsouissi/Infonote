import { useEffect } from 'react';

// Offset geometry excludes animated transforms, so refresh and reverse scroll
// cannot accidentally use a source note's temporary entrance position.
function layoutOrigin(element: HTMLElement) {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  while (current) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** Each scene owns its transforms; text and final poses remain readable without JS. */
export function useResearchMotion(reduced: boolean) {
  useEffect(() => {
    if (reduced) return;
    let disposed = false;
    let revert: (() => void) | undefined;
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const media = gsap.matchMedia();
      media.add({ desktop: '(min-width: 761px)', compact: '(max-width: 760px)' }, mediaContext => {
        const scope = document.querySelector('[data-research-page]');
        if (!scope) return;
        const context = gsap.context(() => {
          const wide = Boolean(mediaContext.conditions?.desktop);
          // On a phone, the lower hero cards enter after the headline. Each
          // waits for its own viewport entry instead of playing at page load.
          scope.querySelectorAll('[data-hero-piece]').forEach(piece => {
            gsap.from(piece, { y: 22, rotation: -1, duration: .85, ease: 'power3.out', scrollTrigger: { trigger: piece, start: 'top 74%', toggleActions: 'play none none reverse' } });
          });
          scope.querySelectorAll<HTMLElement>('[data-scene]').forEach(scene => {
            const pieces = scene.querySelectorAll('[data-piece]');
            // Mobile compositions stack: a scene-level trigger would finish
            // the lower cards before they enter the viewport.
            if (!wide) {
              pieces.forEach((piece, index) => {
                gsap.from(piece, { y: scene.closest('#cut') ? -45 : 28, rotation: index % 2 ? 2 : -2, scale: scene.closest('#cut') && index > 0 ? .92 : 1, ease: 'power2.out', scrollTrigger: { trigger: piece, start: 'top 72%', end: 'top 38%', scrub: .4, invalidateOnRefresh: true } });
              });
              const passage = scene.querySelector('[data-cut-source]');
              if (passage) gsap.from(passage, { clipPath: 'inset(0 100% 0 0)', scrollTrigger: { trigger: passage, start: 'top 68%', end: 'top 40%', scrub: .4 } });
              const cut = scene.querySelector('[data-cut-line]');
              if (cut) gsap.from(cut, { scaleX: 0, transformOrigin: 'left', scrollTrigger: { trigger: cut, start: 'top 72%', end: 'top 45%', scrub: .4 } });
              return;
            }
            const timeline = gsap.timeline({ scrollTrigger: { trigger: scene, start: 'top 55%', end: 'top 12%', scrub: .55, invalidateOnRefresh: true } });
            if (scene.closest('#cut')) {
              // The pieces visibly leave the source note. Geometry is sampled
              // on setup/refresh, never read on every scroll frame.
              const document = pieces[0] as HTMLElement;
              const passage = scene.querySelector('[data-cut-source]');
              timeline.from(document, { y: 20, duration: .3, ease: 'power2.out' }, 0);
              if (passage) {
                timeline.from(passage, { clipPath: 'inset(0 100% 0 0)', duration: .28 }, 0);
                timeline.to(passage, { clipPath: 'inset(0 0 100% 0)', duration: .35 }, .45);
              }
              timeline.from(Array.from(pieces).slice(1), {
                x: (_i: number, target: HTMLElement) => wide ? layoutOrigin(document).x - layoutOrigin(target).x + 32 : 0,
                y: (i: number, target: HTMLElement) => wide ? layoutOrigin(document).y + 140 + i * 70 - layoutOrigin(target).y : -65,
                scale: .82, opacity: .1, rotation: -3,
                duration: 1, stagger: .18, ease: 'power2.out',
              }, .2);
            } else if (pieces.length) {
              const distance = scene.closest('#connect') ? 70 : 22;
              timeline.from(pieces, { y: (i: number) => 26 + i * 12, x: (i: number) => wide ? (i % 2 ? distance : -distance) : 0, rotation: (i: number) => i % 2 ? 3 : -3, stagger: .12, ease: 'power2.out' });
            }
            scene.querySelectorAll<SVGPathElement>('[data-draw]').forEach(path => {
              const length = path.getTotalLength();
              timeline.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: .65 }, .32);
            });
            const cut = scene.querySelector('[data-cut-line]');
            if (cut) timeline.from(cut, { scaleX: 0, transformOrigin: 'left', duration: .65 }, 0);
          });
        }, scope);
        return () => context.revert();
      });
      revert = () => media.revert();
      void document.fonts.ready.then(() => { if (!disposed) ScrollTrigger.refresh(); });
    }).catch(() => { /* The fully readable static composition is the fallback. */ });
    return () => { disposed = true; revert?.(); };
  }, [reduced]);
}
