import gsap from 'gsap';

// Page-entrance stagger shared by the Work list/grid and About: each item fades up from 16px,
// one after another.
const ENTRANCE_Y = 16;
const ENTRANCE_DURATION = 0.45;
const ENTRANCE_EASE = 'power2.out';
const ENTRANCE_STAGGER = 0.07;

/** Call in barba `beforeEnter` (the container is still hidden) so nothing flashes in. */
export const hideForEntrance = (items: Element[]) => {
  if (items.length) gsap.set(items, { opacity: 0, y: ENTRANCE_Y });
};

/** Call in barba `afterEnter` (after `waitForIntro()` on hard loads). */
export const playEntrance = (items: Element[], onComplete?: () => void) => {
  if (!items.length) {
    onComplete?.();
    return;
  }
  gsap.to(items, {
    opacity: 1,
    y: 0,
    duration: ENTRANCE_DURATION,
    ease: ENTRANCE_EASE,
    stagger: ENTRANCE_STAGGER,
    overwrite: 'auto',
    clearProps: 'transform',
    onComplete,
  });
};
