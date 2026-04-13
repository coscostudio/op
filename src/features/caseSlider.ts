import Core from 'smooothy';

// ─────────────────────────────────────────────────────────────────────────────
// Case study slider — finite, freely-draggable, mousewheel-enabled
//
// DOM expected per slider block:
//   .component-case-media (or similar)
//     .slider.w-dyn-list               ← a parent ancestor must clip overflow
//       .case-slider-wrapper.w-dyn-items  ← smooothy wrapper (flex row)
//         .slide-w.w-dyn-item          ← slides (flex children)
//           .case-slide
//
// setOffset: uses wrapperWidth so maxScroll = -(totalWidth - wrapperWidth) / itemWidth,
// meaning the slider stops exactly when the last slide is fully in view — no blank space.
//
// Required in Webflow global-styles embed:
//   .case-slider-wrapper img { pointer-events: none; -webkit-user-drag: none; }
//
// Interaction model: drag (mouse/touch) + horizontal trackpad swipe.
// Horizontal swipe → slider moves, page scroll suppressed.
// Vertical scroll → page scrolls normally, slider ignores it.
// ─────────────────────────────────────────────────────────────────────────────

type SliderEntry = {
  instance: Core;
  destroy: () => void;
};

const _sliders: SliderEntry[] = [];
let _rafId: number | null = null;

function tick(): void {
  _sliders.forEach(({ instance }) => instance.update());
  _rafId = requestAnimationFrame(tick);
}

function startLoop(): void {
  if (_rafId !== null) return;
  _rafId = requestAnimationFrame(tick);
}

function stopLoop(): void {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

export function initCaseSliders(): void {
  const sliderEls = document.querySelectorAll<HTMLElement>('.slider');

  sliderEls.forEach((sliderEl) => {
    const track = sliderEl.querySelector<HTMLElement>('.case-slider-wrapper');
    if (!track) return;

    const slides = track.querySelectorAll<HTMLElement>('.slide-w');
    if (slides.length < 2) return; // Single image — no interaction needed

    const instance = new Core(track, {
      infinite: false,
      snap: false,
      // scrollInput: false → only deltaX (horizontal trackpad swipe) drives the
      // slider. Vertical mouse-wheel produces deltaY, which smooothy ignores,
      // so the page scrolls normally. scrollInput: true would use whichever
      // axis has more movement, hijacking vertical scroll entirely.
      scrollInput: false,
      // Stop exactly when the last set of slides fills the container —
      // prevents blank space after the final slide.
      setOffset: ({ wrapperWidth }) => wrapperWidth,
    });

    // Prevent the browser from starting a native image-drag sequence when the
    // user mousedowns on an <img> inside the slider. Without this, Chrome
    // captures the event stream for its "drag image" gesture (showing the globe
    // cursor) before smooothy's mousemove handler ever fires.
    const onDragStart = (e: DragEvent) => e.preventDefault();
    track.addEventListener('dragstart', onDragStart);

    // When the gesture is predominantly horizontal, prevent the page from
    // also scrolling vertically. Purely vertical scrolls are left alone so
    // the page behaves normally when the user isn't swiping the slider.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    track.addEventListener('wheel', onWheel, { passive: false });

    _sliders.push({
      instance,
      destroy: () => {
        track.removeEventListener('dragstart', onDragStart);
        track.removeEventListener('wheel', onWheel);
        instance.destroy();
      },
    });
  });

  if (_sliders.length) startLoop();
}

export function destroyCaseSliders(): void {
  stopLoop();
  _sliders.forEach(({ destroy }) => destroy());
  _sliders.length = 0;
}
