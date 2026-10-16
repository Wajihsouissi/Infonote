/** Motion physics shared by the page, in the terms Apple's fluid-interface
 * guidance uses. Springs are described by a damping ratio and a response;
 * nothing here has a fixed duration. */

/** Convert damping ratio + response into the stiffness/damping pair Motion
 * expects (mass 1). Damping 1 settles without overshoot and is the default;
 * drop to ~0.8 only when the gesture itself carried momentum. */
export function spring(response = 0.4, dampingRatio = 1) {
  return {
    type: 'spring' as const,
    stiffness: ((2 * Math.PI) / response) ** 2,
    damping: (4 * Math.PI * dampingRatio) / response,
    mass: 1,
  };
}

/** Where a release at `velocity` (px/s) would come to rest under exponential
 * decay — the scroll-deceleration form, not v²/2a. 0.99 keeps a flick inside a
 * small region; 0.998 is the long scroll feel. */
export function project(velocity: number, decelerationRate = 0.99) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further out, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
