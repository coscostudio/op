// Render-to-reality image comparison
//
// Expected Webflow embed:
//   <div data-render-to-reality
//        data-render-src="..."
//        data-reality-src="...">
//   </div>

// The interface is generated here so every CMS instance stays consistent.

type ComparisonEntry = {
  element: HTMLElement;
  host: HTMLElement | null;
  input: HTMLInputElement;
  onInput: () => void;
  onRealityLoad: () => void;
  cancelVisualUpdate: () => void;
};

const entries: ComparisonEntry[] = [];
const STYLE_ID = 'render-to-reality-styles';

const styles = `
  .embed-render-to-reality {
    display: block;
    align-self: stretch;
    width: 100%;
    max-width: none;
  }

  .component-case-media.rtr-host {
    width: 100%;
  }

  [data-render-to-reality] {
    --rtr-position: 50%;
    position: relative;
    width: 100%;
    max-width: none;
    max-height: inherit;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #d8d8d8;
    cursor: col-resize;
    user-select: none;
    -webkit-user-select: none;
  }

  [data-render-to-reality] .rtr-image {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    pointer-events: none;
    -webkit-user-drag: none;
  }

  [data-render-to-reality] .rtr-render {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    clip-path: inset(0 calc(100% - var(--rtr-position)) 0 0);
    will-change: clip-path;
  }

  [data-render-to-reality] .rtr-divider {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    left: var(--rtr-position);
    width: 2px;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 12%);
    pointer-events: none;
    transform: translateX(-50%);
    will-change: left;
  }

  [data-render-to-reality] .rtr-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 0.35rem;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0.55rem;
    color: #111;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0.15rem 0.75rem rgb(0 0 0 / 25%);
    transform: translate(-50%, -50%);
  }

  [data-render-to-reality] .rtr-handle::before,
  [data-render-to-reality] .rtr-handle::after {
    content: '';
    width: 0.45rem;
    height: 0.45rem;
    border-bottom: 1.5px solid currentColor;
  }

  [data-render-to-reality] .rtr-handle::before {
    justify-self: end;
    border-left: 1.5px solid currentColor;
    transform: rotate(45deg);
  }

  [data-render-to-reality] .rtr-handle::after {
    justify-self: start;
    border-right: 1.5px solid currentColor;
    transform: rotate(-45deg);
  }

  [data-render-to-reality] .rtr-label {
    position: absolute;
    z-index: 2;
    top: 1rem;
    padding: 0.4rem 0.65rem;
    color: #111;
    background: rgb(255 255 255 / 88%);
    border-radius: 999px;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
    pointer-events: none;
  }

  [data-render-to-reality] .rtr-label--render { left: 1rem; }
  [data-render-to-reality] .rtr-label--reality { right: 1rem; }

  [data-render-to-reality] .rtr-range {
    position: absolute;
    z-index: 3;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: col-resize;
    touch-action: pan-y;
  }

  [data-render-to-reality]:has(.rtr-range:focus-visible) .rtr-handle {
    outline: 2px solid rgb(255 255 255 / 90%);
    outline-offset: 3px;
  }
`;

function addStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

function getStartValue(element: HTMLElement): number {
  const value = Number(element.dataset.start);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;
}

function createComparison(element: HTMLElement): void {
  const renderSrc = element.dataset.renderSrc?.trim();
  const realitySrc = element.dataset.realitySrc?.trim();

  if (!renderSrc || !realitySrc) {
    return;
  }

  const renderLabel = element.dataset.renderLabel?.trim() || 'Render';
  const realityLabel = element.dataset.realityLabel?.trim() || 'Reality';
  const start = getStartValue(element);

  const realityImage = document.createElement('img');
  realityImage.className = 'rtr-image rtr-image--reality';
  realityImage.src = realitySrc;
  realityImage.alt = '';
  realityImage.draggable = false;

  const render = document.createElement('div');
  render.className = 'rtr-render';
  render.setAttribute('aria-hidden', 'true');

  const renderImage = document.createElement('img');
  renderImage.className = 'rtr-image';
  renderImage.src = renderSrc;
  renderImage.alt = '';
  renderImage.draggable = false;
  render.append(renderImage);

  const onRealityLoad = () => {
    if (!realityImage.naturalWidth || !realityImage.naturalHeight) return;
    element.style.aspectRatio = `${realityImage.naturalWidth} / ${realityImage.naturalHeight}`;
  };

  const divider = document.createElement('div');
  divider.className = 'rtr-divider';
  divider.setAttribute('aria-hidden', 'true');
  divider.innerHTML = '<span class="rtr-handle"></span>';

  const renderText = document.createElement('span');
  renderText.className = 'rtr-label rtr-label--render';
  renderText.textContent = renderLabel;
  renderText.setAttribute('aria-hidden', 'true');

  const realityText = document.createElement('span');
  realityText.className = 'rtr-label rtr-label--reality';
  realityText.textContent = realityLabel;
  realityText.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.className = 'rtr-range';
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '0.1';
  input.value = String(start);
  input.setAttribute('aria-label', `${renderLabel} to ${realityLabel} image comparison`);

  let position = start;
  let targetPosition = start;
  let animationFrame: number | null = null;
  let previousTime = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setVisualPosition = (value: number) => {
    element.style.setProperty('--rtr-position', `${value}%`);
  };

  const animatePosition = (time: number) => {
    const elapsed = Math.min(time - previousTime, 64);
    previousTime = time;
    const smoothing = 1 - Math.exp(-elapsed / 45);
    position += (targetPosition - position) * smoothing;

    if (Math.abs(targetPosition - position) < 0.01) {
      position = targetPosition;
      setVisualPosition(position);
      animationFrame = null;
      return;
    }

    setVisualPosition(position);
    animationFrame = requestAnimationFrame(animatePosition);
  };

  const onInput = () => {
    targetPosition = Number(input.value);
    input.setAttribute(
      'aria-valuetext',
      `${Math.round(targetPosition)}% ${renderLabel.toLowerCase()} visible`
    );

    if (reduceMotion) {
      position = targetPosition;
      setVisualPosition(position);
      return;
    }

    if (animationFrame === null) {
      previousTime = performance.now();
      animationFrame = requestAnimationFrame(animatePosition);
    }
  };

  const cancelVisualUpdate = () => {
    if (animationFrame === null) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  element.replaceChildren(realityImage, render, divider, renderText, realityText, input);
  element.dataset.rtrInitialized = 'true';
  const host = element.closest<HTMLElement>('.component-case-media');
  host?.classList.add('rtr-host');
  input.addEventListener('input', onInput);
  realityImage.addEventListener('load', onRealityLoad);
  if (realityImage.complete) onRealityLoad();
  setVisualPosition(start);
  onInput();

  entries.push({ element, host, input, onInput, onRealityLoad, cancelVisualUpdate });
}

export function initRenderToReality(root: ParentNode = document): void {
  addStyles();

  root
    .querySelectorAll<HTMLElement>('[data-render-to-reality]:not([data-rtr-initialized])')
    .forEach(createComparison);
}

export function destroyRenderToReality(): void {
  entries.forEach(({ element, host, input, onInput, onRealityLoad, cancelVisualUpdate }) => {
    input.removeEventListener('input', onInput);
    element.querySelector('.rtr-image--reality')?.removeEventListener('load', onRealityLoad);
    cancelVisualUpdate();
    host?.classList.remove('rtr-host');
    delete element.dataset.rtrInitialized;
  });
  entries.length = 0;
}
