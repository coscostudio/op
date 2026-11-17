// ─────────────────────────────────────────────────────────────────────────────
// Case study slider — finite, draggable, horizontal-trackpad enabled
//
// DOM expected per slider block:
//   .component-case-media (or similar)
//     .slider.w-dyn-list               ← a parent ancestor must clip overflow
//       .case-slider-wrapper.w-dyn-items  ← track (flex row)
//         .slide-w.w-dyn-item          ← slides (flex children, translated together)
//           .case-slide
//
// Required in Webflow global-styles embed:
//   .case-slider-wrapper img { pointer-events: none; -webkit-user-drag: none; }
//   .case-slider-wrapper { -webkit-user-select: none; user-select: none;
//     -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
//
// Behaviour (replaces smooothy, whose drag eased ~300ms behind the pointer at 1.8× speed —
// near the ends the slider kept moving after the hand stopped, or the wrong way after a reversal):
// - Drag (mouse / touch) moves the slides 1:1 with the pointer, no lag.
// - Past either end it gives with rubber-band resistance and springs back on release; it
//   never moves against the pointer.
// - Release keeps the drag's velocity and glides to a stop (clamped to the ends).
// - Pressing while it glides or springs catches it where it is.
// - Touch: the first 6px decide — sideways drags the slider, vertical scrolls the page.
// - Horizontal trackpad / shift-wheel scrolls it (vertical wheel is left to the page).
// - Mouse drags never start a text/element selection (Safari ignores the unprefixed
//   user-select in .global-styles).
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTION_LOCK_PX = 6;
const CLICK_SUPPRESS_PX = 4;
// iOS-style rubber band: give = (1 - 1 / (d·c / dim + 1)) · dim, where dim is a fraction of the
// slider width — the give approaches it asymptotically (a 100px pull past an end gives ~45px).
const RUBBER_BAND_COEF = 0.55;
const RUBBER_BAND_MAX_FRACTION = 0.3;
// Exponential approach rate (1/s) for glides and spring-backs. A release glides
// velocity / rate further, so the glide starts at the release speed.
const SETTLE_RATE = 5;
const VELOCITY_WINDOW_MS = 100;
// Wheel deltas below this are trackpad pixels (applied 1:1); above it, mouse-wheel notches (eased).
const TRACKPAD_DELTA_MAX = 40;

type SliderEntry = { destroy: () => void };

const _sliders: SliderEntry[] = [];

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createSlider(track: HTMLElement, slides: HTMLElement[]): SliderEntry {
  let width = 0; // visible track width
  let minX = 0; // furthest scroll position (≤ 0)
  let x = 0; // rendered offset
  let target = 0; // where x is settling to when not dragging
  let rafId = 0;
  let lastFrame = 0;

  // Drag state. `raw` is the unconstrained pointer-driven offset; x = rubberBand(raw).
  let pressed = false;
  let dragging = false;
  let startPointer = 0;
  let startRaw = 0;
  let raw = 0;
  let samples: Array<[number, number]> = [];
  let maxTravel = 0;
  let suppressClick = false;

  // Touch direction lock
  let touchId: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchAxis: 'x' | 'y' | null = null;

  const clamp = (value: number) => Math.min(0, Math.max(minX, value));
  const rubberBandDim = () => Math.max(1, width * RUBBER_BAND_MAX_FRACTION);
  const canScroll = () => minX < 0;

  const rubberBand = (value: number) => {
    const over = value > 0 ? value : value < minX ? value - minX : 0;
    if (!over) return value;
    const dim = rubberBandDim();
    const give = (1 - 1 / ((Math.abs(over) * RUBBER_BAND_COEF) / dim + 1)) * dim;
    return (over > 0 ? 0 : minX) + Math.sign(over) * give;
  };

  const inverseRubberBand = (value: number) => {
    const over = value > 0 ? value : value < minX ? value - minX : 0;
    if (!over) return value;
    const dim = rubberBandDim();
    const ratio = Math.min(Math.abs(over) / dim, 0.99);
    const distance = (dim / RUBBER_BAND_COEF) * (1 / (1 - ratio) - 1);
    return (over > 0 ? 0 : minX) + Math.sign(over) * distance;
  };

  const render = () => {
    const transform = `translateX(${x}px)`;
    slides.forEach((slide) => {
      slide.style.transform = transform;
    });
  };

  const tick = (now: number) => {
    const dt = Math.min(0.064, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!dragging) {
      x += (target - x) * (1 - Math.exp(-SETTLE_RATE * dt));
      if (Math.abs(target - x) < 0.1) x = target;
    }
    render();
    rafId = dragging || x !== target ? requestAnimationFrame(tick) : 0;
  };

  const kick = () => {
    if (rafId) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  };

  const measure = () => {
    const first = slides[0];
    const last = slides[slides.length - 1];
    width = track.getBoundingClientRect().width;
    // Rects (fractional) rather than offsetWidth (rounded); every slide carries the same
    // translate, so it cancels out.
    const content = last.getBoundingClientRect().right - first.getBoundingClientRect().left;
    minX = Math.min(0, width - content);
    if (!dragging) {
      target = clamp(target);
      if (prefersReducedMotion()) x = target;
      kick();
    }
  };

  // ── Drag core ──────────────────────────────────────────────────────────────
  const press = (pointerX: number) => {
    pressed = true;
    // Catch a glide / spring-back where it is.
    target = x;
    startRaw = inverseRubberBand(x);
    raw = startRaw;
    startPointer = pointerX;
    samples = [[performance.now(), raw]];
    maxTravel = 0;
  };

  const move = (pointerX: number) => {
    dragging = true;
    raw = startRaw + (pointerX - startPointer);
    x = rubberBand(raw);
    target = x;
    maxTravel = Math.max(maxTravel, Math.abs(pointerX - startPointer));
    const now = performance.now();
    samples.push([now, raw]);
    while (samples.length > 2 && now - samples[0][0] > VELOCITY_WINDOW_MS) samples.shift();
    kick();
  };

  const release = () => {
    const wasDragging = dragging;
    pressed = false;
    dragging = false;
    if (!wasDragging) {
      // A tap or a vertical scroll that only paused a glide: settle back inside the ends.
      target = clamp(target);
      kick();
      return;
    }
    const now = performance.now();
    const recent = samples.filter(([t]) => now - t <= VELOCITY_WINDOW_MS);
    let velocity = 0; // px/ms
    if (recent.length >= 2) {
      const [t0, r0] = recent[0];
      const [t1, r1] = recent[recent.length - 1];
      velocity = (r1 - r0) / Math.max(1, t1 - t0);
    }
    const throwDistance = prefersReducedMotion() ? 0 : (velocity * 1000) / SETTLE_RATE;
    // From inside the bounds a throw glides on; from the rubber band zone it springs back.
    target = clamp(x === raw ? raw + throwDistance : raw);
    if (prefersReducedMotion()) x = target;
    kick();
  };

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const onMouseMove = (e: MouseEvent) => move(e.clientX);
  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    suppressClick = maxTravel > CLICK_SUPPRESS_PX;
    track.style.cursor = 'grab';
    release();
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !canScroll()) return;
    e.preventDefault(); // no text/element selection or native image drag
    suppressClick = false;
    press(e.clientX);
    track.style.cursor = 'grabbing';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // A drag that ends over a slide shouldn't count as a click on it (or on a link inside).
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // ── Touch ─────────────────────────────────────────────────────────────────
  const findTouch = (list: TouchList) => Array.from(list).find((t) => t.identifier === touchId);

  const endTouch = () => {
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    touchId = null;
    if (pressed) release();
  };

  const onTouchMove = (e: TouchEvent) => {
    const touch = findTouch(e.touches);
    if (!touch) return;
    if (!touchAxis) {
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_LOCK_PX) return;
      touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (touchAxis === 'y') {
        endTouch(); // the page scrolls; leave it alone
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    move(touch.clientX);
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (findTouch(e.touches)) return; // our finger is still down
    endTouch();
  };

  const onTouchStart = (e: TouchEvent) => {
    if (touchId !== null || e.touches.length !== 1 || !canScroll()) return;
    const touch = e.touches[0];
    touchId = touch.identifier;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchAxis = null;
    press(touch.clientX);
    // Non-passive only while a touch that started here is down, so other page scrolling
    // never waits on this listener.
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
  };

  // ── Wheel / trackpad ──────────────────────────────────────────────────────
  const onWheel = (e: WheelEvent) => {
    // Vertical scrolls belong to the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    // Claim horizontal ones, also at the ends, so they don't trigger browser back/forward.
    e.preventDefault();
    if (!canScroll() || pressed) return;
    const delta = e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1);
    if (Math.abs(delta) < TRACKPAD_DELTA_MAX) {
      // Trackpad: follow 1:1 from where the slider is (the OS supplies the momentum).
      x = clamp(x - delta);
      target = x;
    } else {
      target = clamp(target - delta);
    }
    kick();
  };

  const onDragStart = (e: DragEvent) => e.preventDefault();
  const onSelectStart = (e: Event) => e.preventDefault();

  const resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(track);
  slides.forEach((slide) => resizeObserver.observe(slide));

  track.addEventListener('mousedown', onMouseDown);
  track.addEventListener('click', onClickCapture, true);
  track.addEventListener('touchstart', onTouchStart, { passive: true });
  track.addEventListener('wheel', onWheel, { passive: false });
  track.addEventListener('dragstart', onDragStart);
  track.addEventListener('selectstart', onSelectStart);
  track.style.cursor = 'grab';

  measure();
  render();

  return {
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      track.removeEventListener('mousedown', onMouseDown);
      track.removeEventListener('click', onClickCapture, true);
      track.removeEventListener('touchstart', onTouchStart);
      track.removeEventListener('wheel', onWheel);
      track.removeEventListener('dragstart', onDragStart);
      track.removeEventListener('selectstart', onSelectStart);
      track.style.cursor = '';
      slides.forEach((slide) => {
        slide.style.transform = '';
      });
    },
  };
}

export function initCaseSliders(): void {
  document.querySelectorAll<HTMLElement>('.slider').forEach((sliderEl) => {
    const track = sliderEl.querySelector<HTMLElement>('.case-slider-wrapper');
    if (!track) return;

    const slides = Array.from(track.querySelectorAll<HTMLElement>(':scope > .slide-w'));
    if (slides.length < 2) return; // Single image — no interaction needed

    _sliders.push(createSlider(track, slides));
  });
}

export function destroyCaseSliders(): void {
  _sliders.forEach(({ destroy }) => destroy());
  _sliders.length = 0;
}
