import { flushSync } from 'react-dom';

export type TransitionOrigin = { x: number; y: number };

type ViewTransitionDocument = Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

const REVEAL_DURATION = 620;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Furthest distance from the origin to any corner of the viewport. */
function maxRadius({ x, y }: TransitionOrigin) {
    return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
}

/**
 * Applies a theme change behind a circular View Transition wipe that grows out of
 * `origin` (usually the toggle button's centre). Falls back to the plain
 * `.theme-transitioning` colour cross-fade when the API is unavailable or the
 * user asked for reduced motion.
 */
export function runThemeTransition(apply: () => void, origin?: TransitionOrigin) {
    const doc = document as ViewTransitionDocument;

    if (!origin || !doc.startViewTransition || prefersReducedMotion()) {
        document.documentElement.classList.add('theme-transitioning');
        requestAnimationFrame(() => {
            apply();
            setTimeout(() => {
                document.documentElement.classList.remove('theme-transitioning');
            }, 300);
        });
        return;
    }

    const { x, y } = origin;
    const radius = maxRadius(origin);

    const transition = doc.startViewTransition(() => {
        flushSync(apply);
    });

    transition.ready
        .then(() => {
            document.documentElement.animate(
                {
                    clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
                },
                {
                    duration: REVEAL_DURATION,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        })
        .catch(() => {
            /* transition skipped (e.g. tab hidden) — the theme is applied regardless */
        });
}

/** Centre point of the element that was clicked, for use as a transition origin. */
export function originFromEvent(
    event: { currentTarget: EventTarget | null }
): TransitionOrigin | undefined {
    const el = event.currentTarget;
    if (!(el instanceof Element)) return undefined;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
