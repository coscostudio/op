import Core from 'smooothy';

const SEL = {
  /** Outermost wrapper — used to find slider roots on the page */
  root: '.loop-slider-wrapper',
  /** Direct parent of slides — this is what smooothy is instantiated on */
  sliderList: '.loop-slider',
  /** Individual slide items */
  slide: '.slide',
  /** Card / content node inside each slide */
  content: '.home-project-card',
  /** Media focus node (blur target) */
  media: '.home-project-card',
  /** Overlay title element */
  activeTitle: '.activeitem-title',
  /** Title text spans */
  titleNormal: '.list-title-normal',
  titleSub: '.list-subtitle, .list-title-super',
  /** CMS source block inside each slide */
  cmsSource: '.cms-homepage-source',
  cmsTitleField: '.cms-homepage-title',
  cmsSuperField: '.cms-homepage-super',
  /** Services */
  servicesList: '.activeitem-services-list',
  serviceSourceItem: '.active-services-source-item',
} as const;

const CONFIG = {
  baseScale: 0.6,
  focusScale: 0.825,
  blurMax: 100,
  lerp: 0.08,
  progressLerp: 0.12,
  minOpacity: 0.5,
  safeZoneBuffer: -32,
};

// ─── Slide state ────────────────────────────────────────────────────

type SlideState = {
  node: HTMLElement;
  contentNode: HTMLElement;
  focusNodes: HTMLElement[];
  progress: number;
  targetProgress: number;
  scale: number;
  targetScale: number;
};

const slideStates = new WeakMap<HTMLElement, SlideState>();

const getOrCreateSlideState = (node: HTMLElement): SlideState => {
  const existing = slideStates.get(node);
  if (existing) return existing;

  const contentNode = node.querySelector<HTMLElement>(SEL.content) ?? node;
  const focusTargets: HTMLElement[] = [];
  const primary = node.querySelector<HTMLElement>(SEL.media);
  const workTitle = node.querySelector<HTMLElement>('.work-title');
  if (primary) focusTargets.push(primary);
  if (workTitle) focusTargets.push(workTitle);
  if (!focusTargets.length) focusTargets.push(contentNode);

  // Dynamic style hints
  contentNode.style.willChange = 'transform, opacity, filter';
  contentNode.style.transformOrigin = 'center center';

  const state: SlideState = {
    node,
    contentNode,
    focusNodes: focusTargets,
    progress: 0,
    targetProgress: 0,
    scale: CONFIG.baseScale,
    targetScale: CONFIG.baseScale,
  };
  slideStates.set(node, state);
  return state;
};

// ─── Helpers ────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── Active item title ──────────────────────────────────────────────

const CROSSFADE_MS = 250;

const applyActiveDetails = (source: HTMLElement): boolean => {
  const titleEl = document.querySelector(SEL.titleNormal);
  const subEl = document.querySelector(SEL.titleSub);
  if (!titleEl || !source) return false;

  const srcTitle = source.querySelector(SEL.cmsTitleField)?.textContent?.trim() || '';
  const srcSub = source.querySelector(SEL.cmsSuperField)?.textContent?.trim() || '';

  let changed = false;

  if (titleEl.textContent !== srcTitle) {
    titleEl.textContent = srcTitle;
    changed = true;
  }

  if (subEl) {
    const formatted = srcSub ? ` // ${srcSub}` : '';
    if (subEl.textContent !== formatted) {
      subEl.textContent = formatted;
      changed = true;
    }
  }

  // Services
  const servicesOut = document.querySelector(SEL.servicesList);
  const currentLabels = new Set(
    Array.from(servicesOut?.children || []).map((li) => li.textContent?.trim())
  );
  const incomingLabels = new Set(
    Array.from(source.querySelectorAll(SEL.serviceSourceItem)).map(
      (el) => el.textContent?.trim() || ''
    )
  );

  let servicesChanged = currentLabels.size !== incomingLabels.size;
  if (!servicesChanged) {
    for (const l of incomingLabels) {
      if (!currentLabels.has(l)) {
        servicesChanged = true;
        break;
      }
    }
  }

  if (servicesChanged && servicesOut) {
    servicesOut.innerHTML = '';
    incomingLabels.forEach((label) => {
      if (!label) return;
      const li = document.createElement('li');
      li.className = 'activeitem-service-bubble';
      const inner = document.createElement('div');
      inner.textContent = label;
      li.appendChild(inner);
      servicesOut.appendChild(li);
    });
  }

  return changed || servicesChanged;
};

/**
 * Crossfade the title text when the active slide changes.
 */
const updateActiveDetailsFromSource = (source: HTMLElement) => {
  const titleEl = document.querySelector<HTMLElement>(SEL.titleNormal);
  const subEl = document.querySelector<HTMLElement>(SEL.titleSub);
  const servicesEl = document.querySelector<HTMLElement>(SEL.servicesList);
  if (!titleEl) return false;

  // Check whether content actually changed
  const srcTitle = source.querySelector(SEL.cmsTitleField)?.textContent?.trim() || '';
  const srcSub = source.querySelector(SEL.cmsSuperField)?.textContent?.trim() || '';
  const formatted = srcSub ? ` // ${srcSub}` : '';

  let same = titleEl.textContent === srcTitle;
  if (subEl) same = same && subEl.textContent === formatted;

  const currentLabels = new Set(
    Array.from(servicesEl?.children || []).map((li) => li.textContent?.trim())
  );
  const incomingLabels = new Set(
    Array.from(source.querySelectorAll(SEL.serviceSourceItem)).map(
      (el) => el.textContent?.trim() || ''
    )
  );
  let servicesSame = currentLabels.size === incomingLabels.size;
  if (servicesSame) {
    for (const l of incomingLabels) {
      if (!currentLabels.has(l)) {
        servicesSame = false;
        break;
      }
    }
  }

  if (same && servicesSame) return false;

  // Fade out
  const fadeEls = [titleEl, subEl, servicesEl].filter(Boolean) as HTMLElement[];
  fadeEls.forEach((el) => {
    el.style.transition = `opacity ${CROSSFADE_MS}ms ease`;
    el.style.opacity = '0';
  });

  // Swap content after fade-out completes, then fade back in
  setTimeout(() => {
    applyActiveDetails(source);
    fadeEls.forEach((el) => {
      el.style.opacity = '1';
    });
  }, CROSSFADE_MS);

  return true;
};

// ─── Slider instance ────────────────────────────────────────────────

let animationFrame: number | null = null;
let resizeAttached = false;
const instances: LoopSliderInstance[] = [];

class LoopSliderInstance {
  public readonly root: HTMLElement;
  private slider: Core | null = null;
  private mostVisibleNode: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    const list = root.querySelector<HTMLElement>(SEL.sliderList);
    if (!list) {
      throw new Error(`Loop slider: could not find "${SEL.sliderList}" inside "${SEL.root}".`);
    }

    this.initSmooothy(list);
  }

  destroy() {
    this.slider?.destroy();
    this.slider = null;
  }

  // ── Smooothy ──────────────────────────────────────────────────────

  private initSmooothy(list: HTMLElement) {
    if (this.slider) return;

    this.slider = new Core(list, {
      infinite: true,
      snap: true,
      vertical: true,
      scrollInput: true,
      onUpdate: () => this.measure(),
      onSlideChange: () => this.measure(),
    });

    // Disable mouse drag — scroll and touch only
    list.style.cursor = 'default';
    list.addEventListener('mousedown', (e) => e.stopPropagation(), true);

    // smooothy requires us to call .init() + .update() each frame
    this.slider.init();
    requestAnimationFrame(() => this.measure());
  }

  // ── Per-frame measurement ─────────────────────────────────────────

  measure() {
    const slides = this.root.querySelectorAll<HTMLElement>(SEL.slide);
    if (!slides.length) return;

    const vh = Math.max(window.innerHeight, 1);
    const buffer = CONFIG.safeZoneBuffer;

    let maxVis = -1;
    let bestNode: HTMLElement | null = null;

    slides.forEach((node) => {
      const state = getOrCreateSlideState(node);
      const rect = node.getBoundingClientRect();

      // Vertical distance of slide center from viewport center
      const nodeCenter = rect.top + rect.height / 2;
      const vpCenter = vh / 2;
      const distance = Math.abs(nodeCenter - vpCenter);
      const plateau = Math.max(0, (rect.height - vh) / 2);
      const activeDist = Math.max(0, distance - plateau);
      const transitionDist = vh / 2 + buffer - 1;

      let vis = 1 - activeDist / transitionDist;
      vis = clamp(vis * 2.5, 0, 1);
      vis = Math.pow(vis, 0.3);

      state.targetProgress = vis;
      state.targetScale = CONFIG.baseScale + (CONFIG.focusScale - CONFIG.baseScale) * vis;

      if (vis > maxVis) {
        maxVis = vis;
        bestNode = node;
      }
    });

    // Update active title content when slide changes
    if (bestNode && bestNode !== this.mostVisibleNode && maxVis > 0.5) {
      this.mostVisibleNode = bestNode;
      const src = (this.mostVisibleNode as HTMLElement).querySelector<HTMLElement>(SEL.cmsSource);
      if (src) updateActiveDetailsFromSource(src);
    }

    // Fade the title overlay in/out based on how settled the active slide is.
    // When swiping quickly, maxVis drops below threshold → title fades out
    // revealing the logo underneath.
    //
    // IMPORTANT: Only control opacity once slides have real dimensions.
    // Otherwise we override the index.ts reveal animation with opacity 0.
    const firstSlideRect = slides[0]?.getBoundingClientRect();
    const slidesHaveSize = firstSlideRect && firstSlideRect.width > 1 && firstSlideRect.height > 1;

    if (slidesHaveSize) {
      const titleContainer = document.querySelector<HTMLElement>(SEL.activeTitle);
      if (titleContainer) {
        const titleOpacity = clamp((maxVis - 0.7) / 0.2, 0, 1);
        // Must use !important to override the Webflow CSS rule
        titleContainer.style.setProperty('opacity', titleOpacity.toFixed(2), 'important');
        titleContainer.style.setProperty('transition', 'opacity 0.1s linear');
        titleContainer.style.pointerEvents = titleOpacity < 0.1 ? 'none' : 'auto';
      }
    }
  }

  // ── Per-frame interpolation (called from rAF loop) ────────────────

  animate() {
    // Drive smooothy's frame — it does NOT run its own rAF loop
    this.slider?.update();

    const slides = this.root.querySelectorAll<HTMLElement>(SEL.slide);
    slides.forEach((node) => {
      const s = getOrCreateSlideState(node);
      s.scale += (s.targetScale - s.scale) * CONFIG.lerp;
      s.progress += (s.targetProgress - s.progress) * CONFIG.progressLerp;
      this.applyStyles(s);
    });
  }

  syncToTargets() {
    const slides = this.root.querySelectorAll<HTMLElement>(SEL.slide);
    slides.forEach((node) => {
      const s = getOrCreateSlideState(node);
      s.scale = s.targetScale;
      s.progress = s.targetProgress;
      this.applyStyles(s);
    });
  }

  // ── Visual effects ────────────────────────────────────────────────

  private applyStyles(s: SlideState) {
    const opacity = CONFIG.minOpacity + (1 - CONFIG.minOpacity) * s.progress;
    s.contentNode.style.transform = `scale(${s.scale.toFixed(4)})`;
    s.contentNode.style.opacity = opacity.toFixed(3);

    s.focusNodes.forEach((target) => {
      const blur = (1 - s.progress) * CONFIG.blurMax;
      const xray = (1 - s.progress) * 100;
      target.style.filter = `blur(${blur.toFixed(2)}px) grayscale(${xray.toFixed(1)}%) invert(${xray.toFixed(1)}%)`;
    });
  }
}

// ─── Global lifecycle ───────────────────────────────────────────────

const handleResize = () => instances.forEach((i) => i.measure());

const startAnimationLoop = () => {
  if (animationFrame !== null) return;
  const loop = () => {
    instances.forEach((i) => i.animate());
    animationFrame = requestAnimationFrame(loop);
  };
  animationFrame = requestAnimationFrame(loop);
};

export const destroyLoopSlider = () => {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  if (resizeAttached) {
    window.removeEventListener('resize', handleResize);
    resizeAttached = false;
  }
  instances.forEach((i) => i.destroy());
  instances.length = 0;
};

export const initLoopSlider = () => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const roots = Array.from(document.querySelectorAll<HTMLElement>(SEL.root));
  if (!roots.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const created = roots
    .map((root) => {
      try {
        return new LoopSliderInstance(root);
      } catch (e) {
        console.error('[loopSlider]', e);
        return null;
      }
    })
    .filter((i): i is LoopSliderInstance => Boolean(i));

  if (!created.length) return;

  instances.push(...created);

  if (!resizeAttached) {
    window.addEventListener('resize', handleResize);
    resizeAttached = true;
  }

  instances.forEach((i) => i.measure());
  startAnimationLoop();

  // Populate the title from the first slide (with retries while CMS loads)
  const initTitle = (tries = 40, delay = 50) => {
    let count = 0;
    const tick = () => {
      const firstSlide = document.querySelector(SEL.slide);
      const src = firstSlide?.querySelector(SEL.cmsSource) as HTMLElement | null;
      if (src && applyActiveDetails(src)) return;
      count++;
      if (count >= tries) return;
      setTimeout(tick, delay);
    };
    tick();
  };
  initTitle();
};
