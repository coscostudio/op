import gsap from 'gsap';
import Hls from 'hls.js';
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer,
} from 'three';

const FAN_STYLE_ID = 'home-fan-wheel-styles';
const MOBILE_BREAKPOINT = 767;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

const SELECTORS = {
  root: [
    '[data-fan-wheel-root]',
    '[data-loop-slider="root"]',
    '.loop-slider-wrapper',
    '.slider-section',
  ],
  track: ['[data-loop-slider="track"]', '.loop-slider-track'],
  list: ['[data-loop-slider="list"]', '.loop-slider', '.slider-wrapper'],
  item: ['[data-fan-item]', '[data-loop-slider="item"]', '.slide', '.slide-w'],
  card: ['[data-loop-slider="content"]', '.home-project-card'],
  mediaWrap: ['.project-media-wrapper'],
  video: ['video.project-media'],
  source: '.activecard-source',
  sourceTitle: '.activecard-source-title',
  sourceSubtitle: '.activecard-source-subtitle',
  activeLink: '.activecard-details',
  activeTitle: '[data-activecard-target="title"]',
  activeSubtitle: '[data-activecard-target="subtitle"]',
} as const;

const CONFIG = {
  idleSpeed: 0.24,
  desktopCardWidth: 1.82,
  mobileCardWidth: 0.92,
  desktopAspect: 4 / 3,
  mobileAspect: 3 / 4,
  desktopInnerAxisGap: 0.8,
  mobileInnerAxisGap: 0.45,
  hoverYOffset: 0.24,
  hoverSlowdownFactor: 0.05,
  featuredZFront: 2.15,
  featuredZBackground: 0.18,
  featuredCoverage: 0.78,
  featuredSpacingRatio: 0.62,
  featuredBackgroundScale: 0.56,
  featuredWheelSensitivity: 0.006,
  featuredWheelSnapDelay: 0.3,
  featuredDamping: 12,
  featuredTransitionDuration: 0.48,
  returnTransitionDuration: 0.44,
  wheelFitPadding: 1.06,
  maxPixelRatio: 1.8,
  wheelRotateSpeed: 0.0008,
  maxSpinSpeed: 0.95,
  maxWheelAngleStep: 0.075,
  featuredDragThrowSeconds: 0.18,
  featuredDragThrowLimit: 1.2,
  maxFeaturedDragSpeed: 5,
  maxDragAngleStep: 0.14,
  featuredCameraY: 0,
  featuredCameraZ: 8.2,
};

type FanState = 'IDLE_SPIN' | 'HOVER' | 'FEATURED_SLIDER';

type FanItem = {
  id: string;
  node: HTMLElement;
  card: HTMLElement | null;
  source: HTMLElement | null;
  title: string;
  subtitle: string;
  href: string;
  posterSrc: string;
  videoSrc: string;
};

type FanBinding = {
  item: FanItem;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  material: MeshBasicMaterial;
  index: number;
  theta: number;
  basePosition: Vector3;
  baseRotationY: number;
  hoverYOffset: number;
  texture: Texture | CanvasTexture | VideoTexture | null;
  videoTexture: VideoTexture | null;
  videoElement: HTMLVideoElement | null;
  hls: Hls | null;
  isVideoReady: boolean;
  isVideoPlayPending: boolean;
  lastVideoPlayAttempt: number;
};

type InlineStyleSnapshot = {
  element: HTMLElement;
  height: string;
  minHeight: string;
  maxHeight: string;
  overflow: string;
  position: string;
};

type TransformSnapshot = {
  binding: FanBinding;
  position: Vector3;
  rotationY: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
};

const homeFanWheelInstances: HomeFanWheel[] = [];

let currentActiveItem: FanItem | null = null;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (start: number, end: number, alpha: number) => start + (end - start) * alpha;
const normalizeAngle = (value: number) => {
  const normalized = ((value + Math.PI) % TWO_PI) - Math.PI;
  return normalized < -Math.PI ? normalized + TWO_PI : normalized;
};

const lerpAngle = (start: number, end: number, alpha: number) => {
  let delta = (end - start) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return start + delta * alpha;
};

const queryElementWithFallback = <T extends Element>(
  root: ParentNode | Document,
  selectors: readonly string[]
): T | null => {
  for (const selector of selectors) {
    const element = root.querySelector<T>(selector);
    if (element) return element;
  }

  return null;
};

const queryAllWithFallback = <T extends Element>(
  root: ParentNode | Document,
  selectors: readonly string[]
): T[] => {
  for (const selector of selectors) {
    const elements = Array.from(root.querySelectorAll<T>(selector));
    if (elements.length) return elements;
  }

  return [];
};

const getFanRoots = (root: ParentNode | Document = document) => {
  const roots = queryAllWithFallback<HTMLElement>(root, SELECTORS.root);
  return roots.filter(
    (element) =>
      queryElementWithFallback(element, ['[data-fan-item]']) ||
      queryElementWithFallback(element, SELECTORS.list)
  );
};

const getHrefFromElement = (element: Element | null) => {
  if (!(element instanceof HTMLAnchorElement)) return '';

  const href = element.getAttribute('href')?.trim() || '';
  return href && href !== '#' ? href : '';
};

const getFirstHrefFromElements = (elements: Element[]) => {
  for (const element of elements) {
    const href = getHrefFromElement(element);
    if (href) return href;
  }

  return '';
};

const getActiveDetailsLink = (scope: ParentNode | Document = document) => {
  const target = scope.querySelector<HTMLElement>(SELECTORS.activeLink);
  if (target instanceof HTMLAnchorElement) return target;

  return target?.querySelector<HTMLAnchorElement>('a') ?? null;
};

const parseBackgroundImageUrl = (value: string) => {
  const match = value.match(/url\((['"]?)(.*?)\1\)/);
  return match?.[2] && match[2] !== 'none' ? match[2] : '';
};

const resolveProjectHref = (
  slide: HTMLElement,
  card: HTMLElement | null,
  source: HTMLElement | null
) => {
  const sourceHref = getHrefFromElement(source?.closest('a[href]') ?? null);
  if (sourceHref) return sourceHref;

  const cardHref = getHrefFromElement(card?.closest('a[href]') ?? null);
  if (cardHref) return cardHref;

  const slideHref = getHrefFromElement(slide.closest('a[href]'));
  if (slideHref) return slideHref;

  return getFirstHrefFromElements(Array.from(slide.querySelectorAll('a[href]')));
};

const collectFanItems = (root: HTMLElement): FanItem[] => {
  const slides = queryAllWithFallback<HTMLElement>(root, SELECTORS.item);

  return slides
    .map((slide, index): FanItem | null => {
      const card = queryElementWithFallback<HTMLElement>(slide, SELECTORS.card);
      const source = slide.querySelector<HTMLElement>(SELECTORS.source);
      const title =
        slide.dataset.fanTitle?.trim() ||
        source?.querySelector(SELECTORS.sourceTitle)?.textContent?.trim() ||
        '';
      const subtitle =
        slide.dataset.fanSubtitle?.trim() ||
        source?.querySelector(SELECTORS.sourceSubtitle)?.textContent?.trim() ||
        '';
      const mediaWrap = queryElementWithFallback<HTMLElement>(slide, SELECTORS.mediaWrap);
      const video = queryElementWithFallback<HTMLVideoElement>(slide, SELECTORS.video);
      const posterSrc =
        slide.dataset.fanImage?.trim() ||
        parseBackgroundImageUrl(mediaWrap?.style.backgroundImage || '') ||
        parseBackgroundImageUrl(
          mediaWrap ? window.getComputedStyle(mediaWrap).backgroundImage : ''
        ) ||
        video?.getAttribute('poster') ||
        video?.getAttribute('data-poster') ||
        slide.querySelector<HTMLImageElement>('img')?.currentSrc ||
        slide.querySelector<HTMLImageElement>('img')?.src ||
        '';
      const videoSrc =
        slide.dataset.fanVideo?.trim() ||
        video?.getAttribute('data-src')?.trim() ||
        video?.getAttribute('src')?.trim() ||
        video?.querySelector('source')?.getAttribute('src')?.trim() ||
        '';

      if (!title && !posterSrc && !videoSrc) return null;

      const explicitHref = slide.dataset.fanHref?.trim();

      return {
        id: slide.id || `home-fan-item-${index}`,
        node: slide,
        card,
        source,
        title: title || `Project ${index + 1}`,
        subtitle,
        href:
          explicitHref && explicitHref !== '#'
            ? explicitHref
            : resolveProjectHref(slide, card, source),
        posterSrc,
        videoSrc,
      };
    })
    .filter((item): item is FanItem => Boolean(item));
};

const updateActiveDetailsFromItem = (item: FanItem, scope: ParentNode | Document = document) => {
  const targetLink = getActiveDetailsLink(scope);
  const targetTitle = scope.querySelector<HTMLElement>(SELECTORS.activeTitle);
  const targetSubtitle = scope.querySelector<HTMLElement>(SELECTORS.activeSubtitle);
  const hasTarget = Boolean(targetLink || targetTitle || targetSubtitle);

  if (!hasTarget) return false;

  const linkMatches = !targetLink || !item.href || targetLink.getAttribute('href') === item.href;
  const titleMatches = !targetTitle || targetTitle.textContent === item.title;
  const subtitleMatches = !targetSubtitle || targetSubtitle.textContent === item.subtitle;

  if (item === currentActiveItem && linkMatches && titleMatches && subtitleMatches) {
    return false;
  }

  if (targetLink && item.href && targetLink.getAttribute('href') !== item.href) {
    targetLink.setAttribute('href', item.href);
  }

  if (targetTitle && targetTitle.textContent !== item.title) {
    targetTitle.textContent = item.title;
  }

  if (targetSubtitle && targetSubtitle.textContent !== item.subtitle) {
    targetSubtitle.textContent = item.subtitle;
  }

  currentActiveItem = item;

  return true;
};

const injectFanStyles = () => {
  if (document.getElementById(FAN_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = FAN_STYLE_ID;
  style.textContent = `
    .home-fan-wheel {
      position: fixed !important;
      inset: 0;
      width: 100vw;
      height: 100dvh;
      min-height: 0;
      overflow: hidden !important;
      touch-action: none;
    }

    .home-main.home-fan-wheel-home {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }

    .home-fan-wheel .loop-slider-track,
    .home-fan-wheel [data-loop-slider='track'] {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    .home-fan-wheel [data-fan-item] {
      display: none !important;
    }

    .home-fan-wheel-details {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      transition: opacity 0.2s ease, visibility 0s linear 0.2s;
    }

    .home-fan-wheel-details.is-visible {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      transition-delay: 0s;
    }

    .home-fan-wheel__stage {
      position: absolute;
      inset: 0;
      z-index: 1;
      opacity: 0;
      transition: opacity 0.45s ease;
      cursor: auto;
      user-select: none;
    }

    .home-fan-wheel.is-ready .home-fan-wheel__stage {
      opacity: 1;
    }

    .home-fan-wheel__stage.is-hovering {
      cursor: crosshair;
    }

    .home-fan-wheel__stage.is-linking {
      cursor: pointer;
    }

    .home-fan-wheel__stage.is-dragging {
      cursor: grabbing;
    }

    .home-fan-wheel__stage canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
      outline: none;
    }

  `;
  document.head.appendChild(style);
};

const createFallbackTexture = (item: FanItem) => {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#f1eee7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111111';
    ctx.font = '600 58px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const words = (item.title || 'Outside Perspective').split(/\s+/);
    const lines: string[] = [];
    let current = '';

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > 560 && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);

    lines.slice(0, 4).forEach((line, index) => {
      ctx.fillText(line, 82, 430 + index * 72);
    });

    if (item.subtitle) {
      ctx.font = '400 34px Arial, Helvetica, sans-serif';
      ctx.fillStyle = '#555555';
      ctx.fillText(item.subtitle, 82, 430 + Math.min(lines.length, 4) * 72 + 58);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const getWebGLAvailable = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
};

class HomeFanWheel {
  private readonly root: HTMLElement;
  private readonly items: FanItem[];
  private readonly stage: HTMLDivElement;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly detailsScope: HTMLElement | Document;
  private readonly activeDetailsElement: HTMLElement | null;
  private readonly hadDetailsMarker: boolean;
  private readonly hadDetailsVisibility: boolean;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2(20, 20);
  private readonly loader = new TextureLoader();
  private readonly bindings: FanBinding[] = [];
  private readonly styleSnapshots: InlineStyleSnapshot[] = [];
  private readonly prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  private state: FanState = 'IDLE_SPIN';
  private animationFrame: number | null = null;
  private destroyed = false;
  private isTransitioning = false;
  private cameraMode: 'WHEEL' | 'FEATURED' = 'WHEEL';
  private baseAngle = HALF_PI;
  private spinDirection = 1;
  private currentSpeed = 0;
  private targetSpeed = CONFIG.idleSpeed;
  private hovered: FanBinding | null = null;
  private frontActive: FanBinding | null = null;
  private resizeFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private layoutTween: gsap.core.Tween | null = null;
  private cameraTween: gsap.core.Tween | null = null;
  private transitionTarget: 'FEATURED' | 'WHEEL' | null = null;
  private activeIndex = -1;
  private featuredPosition = 0;
  private featuredTargetPosition = 0;
  private featuredWheelIdle = 0;
  private featuredDragVelocity = 0;
  private lastWheelInputTime = 0;
  private isPointerDown = false;
  private isWheelDragging = false;
  private isFeaturedDragging = false;
  private pointerDownTime = 0;
  private pointerDownCoords = { x: 0, y: 0 };
  private lastPointerX = 0;
  private lastPointerTime = 0;
  private lastPointerAngle: number | null = null;

  private readonly handlePointerMove = this.onPointerMove.bind(this);
  private readonly handlePointerDown = this.onPointerDown.bind(this);
  private readonly handlePointerUp = this.onPointerUp.bind(this);
  private readonly handlePointerLeave = this.onPointerLeave.bind(this);
  private readonly handleWheel = this.onWheel.bind(this);
  private readonly handleResize = this.scheduleResize.bind(this);
  private readonly handleKeydown = this.onKeydown.bind(this);

  constructor(root: HTMLElement) {
    injectFanStyles();

    this.root = root;
    this.items = collectFanItems(root);
    this.detailsScope = this.root.closest<HTMLElement>('.home-main') ?? document;
    this.activeDetailsElement = this.detailsScope.querySelector<HTMLElement>(SELECTORS.activeLink);
    this.hadDetailsMarker = Boolean(
      this.activeDetailsElement?.classList.contains('home-fan-wheel-details')
    );
    this.hadDetailsVisibility = Boolean(
      this.activeDetailsElement?.classList.contains('is-visible')
    );
    this.stage = document.createElement('div');
    this.stage.className = 'home-fan-wheel__stage';
    this.stage.tabIndex = 0;
    this.stage.setAttribute('aria-label', 'Featured project fan wheel');

    this.scene = new Scene();
    this.scene.background = null;
    this.scene.add(new AmbientLight(new Color('#ffffff'), 1.25));

    this.camera = new PerspectiveCamera(38, 1, 0.1, 100);
    this.applyCameraMode('WHEEL', true);

    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color('#ffffff'), 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.stage.appendChild(this.renderer.domElement);
    this.root.appendChild(this.stage);

    this.captureLayoutStyles();
    this.buildCards();
    this.installEvents();
    this.onResize();
    this.updateRadialBaseTransforms();
    this.applyRadialTransforms(1);
    this.updateActiveFromFront(true);
  }

  public init() {
    if (!this.items.length) return;

    this.activeDetailsElement?.classList.add('home-fan-wheel-details');
    this.setFeaturedDetailsVisible(false);
    this.root.classList.add('home-fan-wheel');
    this.root.dataset.homeFanWheel = 'ready';
    queryElementWithFallback<HTMLElement>(this.root, SELECTORS.track)?.setAttribute(
      'aria-hidden',
      'true'
    );

    requestAnimationFrame(() => {
      if (this.destroyed) return;
      this.root.classList.add('is-ready');
      this.scheduleResize();
      this.playIntro();
      this.start();
    });
  }

  public refresh() {
    this.onResize();
  }

  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }

    this.resizeObserver?.disconnect();
    this.layoutTween?.kill();
    this.cameraTween?.kill();
    this.removeEvents();
    this.bindings.forEach((binding) => this.disposeBinding(binding));
    this.bindings.length = 0;
    this.renderer.dispose();
    this.stage.remove();
    this.restoreLayoutStyles();

    this.root.classList.remove('home-fan-wheel', 'is-ready', 'is-featured');
    this.root.removeAttribute('data-home-fan-wheel');
    queryElementWithFallback<HTMLElement>(this.root, SELECTORS.track)?.removeAttribute(
      'aria-hidden'
    );
    this.activeDetailsElement?.classList.toggle('home-fan-wheel-details', this.hadDetailsMarker);
    this.activeDetailsElement?.classList.toggle('is-visible', this.hadDetailsVisibility);
  }

  private setFeaturedDetailsVisible(visible: boolean) {
    this.activeDetailsElement?.classList.toggle('is-visible', visible);
  }

  private captureLayoutStyles() {
    const homeMain = this.root.closest<HTMLElement>('.home-main');
    [homeMain, this.root].forEach((element) => {
      if (!element) return;
      this.styleSnapshots.push({
        element,
        height: element.style.height,
        minHeight: element.style.minHeight,
        maxHeight: element.style.maxHeight,
        overflow: element.style.overflow,
        position: element.style.position,
      });
    });

    homeMain?.classList.add('home-fan-wheel-home');
  }

  private restoreLayoutStyles() {
    this.styleSnapshots.forEach((snapshot) => {
      snapshot.element.style.height = snapshot.height;
      snapshot.element.style.minHeight = snapshot.minHeight;
      snapshot.element.style.maxHeight = snapshot.maxHeight;
      snapshot.element.style.overflow = snapshot.overflow;
      snapshot.element.style.position = snapshot.position;
      snapshot.element.classList.remove('home-fan-wheel-home');
    });
    this.styleSnapshots.length = 0;
  }

  private getCardDimensions() {
    const mobile = this.getViewportWidth() <= MOBILE_BREAKPOINT;
    const width = mobile ? CONFIG.mobileCardWidth : CONFIG.desktopCardWidth;
    const aspect = mobile ? CONFIG.mobileAspect : CONFIG.desktopAspect;
    return { width, height: width / aspect };
  }

  private getViewportWidth() {
    return this.stage.clientWidth || window.innerWidth || 1;
  }

  private getViewportHeight() {
    return this.stage.clientHeight || window.innerHeight || 1;
  }

  private getCardWidth() {
    return this.getCardDimensions().width;
  }

  private getCardHeight() {
    return this.getCardDimensions().height;
  }

  private getRadius() {
    const mobile = this.getViewportWidth() <= MOBILE_BREAKPOINT;
    const innerGap = mobile ? CONFIG.mobileInnerAxisGap : CONFIG.desktopInnerAxisGap;
    return innerGap + this.getCardWidth() / 2;
  }

  private getFeaturedScale() {
    const { width, height } = this.getCardDimensions();
    const aspect = this.getViewportWidth() / Math.max(this.getViewportHeight(), 1);
    const depth = Math.max(0.1, CONFIG.featuredCameraZ - CONFIG.featuredZFront);
    const viewHeight = 2 * depth * Math.tan((this.camera.fov * Math.PI) / 360);
    const viewWidth = viewHeight * aspect;

    return Math.min(
      (viewWidth * CONFIG.featuredCoverage) / width,
      (viewHeight * CONFIG.featuredCoverage) / height
    );
  }

  private getFeaturedSpacing() {
    return this.getCardWidth() * this.getFeaturedScale() * CONFIG.featuredSpacingRatio;
  }

  private getWheelCameraPosition() {
    const { width, height } = this.getCardDimensions();
    const outerRadius = this.getRadius() + width / 2;
    const boundsRadius = Math.hypot(outerRadius, height / 2);
    const aspect = this.getViewportWidth() / Math.max(this.getViewportHeight(), 1);
    const verticalFov = (this.camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const fitDistance = Math.max(
      boundsRadius / Math.tan(verticalFov / 2),
      boundsRadius / Math.tan(horizontalFov / 2)
    );
    const distance = fitDistance * CONFIG.wheelFitPadding;
    const direction = new Vector3(0, 4, 10).normalize();

    return new Vector3(direction.x * distance, direction.y * distance, direction.z * distance);
  }

  private applyCameraMode(mode: 'WHEEL' | 'FEATURED', immediate = false) {
    this.cameraMode = mode;
    this.cameraTween?.kill();

    const target =
      mode === 'FEATURED'
        ? new Vector3(0, CONFIG.featuredCameraY, CONFIG.featuredCameraZ)
        : this.getWheelCameraPosition();

    if (immediate || this.prefersReducedMotion) {
      this.camera.position.copy(target);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      return;
    }

    this.cameraTween = gsap.to(this.camera.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: CONFIG.featuredTransitionDuration,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => {
        this.camera.lookAt(0, 0, 0);
      },
      onComplete: () => {
        this.cameraTween = null;
        this.camera.lookAt(0, 0, 0);
      },
    });
  }

  private buildCards() {
    this.items.forEach((item, index) => {
      const texture = createFallbackTexture(item);
      const material = new MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        alphaTest: 0.001,
      });
      material.premultipliedAlpha = true;
      const mesh = new Mesh(new PlaneGeometry(1, 1), material);
      mesh.userData.fanIndex = index;

      const binding: FanBinding = {
        item,
        mesh,
        material,
        index,
        theta: 0,
        basePosition: new Vector3(),
        baseRotationY: 0,
        hoverYOffset: 0,
        texture,
        videoTexture: null,
        videoElement: null,
        hls: null,
        isVideoReady: false,
        isVideoPlayPending: false,
        lastVideoPlayAttempt: 0,
      };

      mesh.userData.fanBinding = binding;
      this.bindings.push(binding);
      this.scene.add(mesh);

      if (item.posterSrc) this.loadPoster(binding);
      if (item.videoSrc) this.setupVideo(binding);
    });
  }

  private loadPoster(binding: FanBinding) {
    this.loader.load(
      binding.item.posterSrc,
      (texture) => {
        if (this.destroyed) {
          texture.dispose();
          return;
        }

        texture.colorSpace = SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.magFilter = LinearFilter;

        const image = texture.image as {
          naturalWidth?: number;
          naturalHeight?: number;
          width?: number;
          height?: number;
        };
        const width = image?.naturalWidth ?? image?.width ?? 0;
        const height = image?.naturalHeight ?? image?.height ?? 0;
        if (width > 0 && height > 0) {
          this.applyTextureCover(texture, width / height);
        }

        binding.texture?.dispose();
        binding.texture = texture;
        if (!binding.isVideoReady) {
          binding.material.map = texture;
          binding.material.needsUpdate = true;
        }
      },
      undefined,
      () => {
        // Canvas fallback stays visible if the poster fails.
      }
    );
  }

  private applyTextureCover(texture: Texture | VideoTexture, mediaAspect: number) {
    const cardAspect = this.getCardWidth() / this.getCardHeight();
    const safeMediaAspect = clamp(mediaAspect, 0.05, 20);
    let repeatX = 1;
    let repeatY = 1;

    if (safeMediaAspect > cardAspect) {
      repeatX = cardAspect / safeMediaAspect;
    } else {
      repeatY = safeMediaAspect / cardAspect;
    }

    const needsUpdate =
      Math.abs(texture.repeat.x - repeatX) > 0.0001 ||
      Math.abs(texture.repeat.y - repeatY) > 0.0001 ||
      texture.center.x !== 0.5 ||
      texture.center.y !== 0.5 ||
      texture.offset.x !== 0 ||
      texture.offset.y !== 0;
    if (!needsUpdate) return;

    texture.offset.set(0, 0);
    texture.repeat.set(repeatX, repeatY);
    texture.center.set(0.5, 0.5);
    texture.needsUpdate = true;
  }

  private setupVideo(binding: FanBinding) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.setAttribute('muted', 'true');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('playsinline', 'true');

    if (Hls.isSupported() && binding.item.videoSrc.includes('.m3u8')) {
      const hls = new Hls({ startPosition: -1, maxBufferLength: 18, maxMaxBufferLength: 30 });
      hls.loadSource(binding.item.videoSrc);
      hls.attachMedia(video);
      binding.hls = hls;
    } else {
      video.src = binding.item.videoSrc;
    }

    binding.videoElement = video;

    const applyVideoTexture = () => {
      if (this.destroyed || binding.isVideoReady) return;

      const texture = new VideoTexture(video);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        this.applyTextureCover(texture, video.videoWidth / video.videoHeight);
      }

      binding.videoTexture = texture;
      binding.texture = texture;
      binding.isVideoReady = true;
      binding.material.map = texture;
      binding.material.needsUpdate = true;
      this.updateVideoPlayback();
    };

    video.addEventListener('loadedmetadata', () => {
      if (binding.videoTexture && video.videoWidth > 0 && video.videoHeight > 0) {
        this.applyTextureCover(binding.videoTexture, video.videoWidth / video.videoHeight);
      }
    });
    video.addEventListener('loadeddata', applyVideoTexture, { once: true });
    video.addEventListener('canplay', applyVideoTexture, { once: true });
    video.load();
  }

  private disposeBinding(binding: FanBinding) {
    gsap.killTweensOf(binding.mesh.position);
    gsap.killTweensOf(binding.mesh.rotation);
    gsap.killTweensOf(binding.mesh.scale);
    gsap.killTweensOf(binding.material);
    binding.hls?.destroy();
    binding.videoElement?.pause();
    binding.videoElement?.removeAttribute('src');
    binding.videoElement?.load();
    binding.texture?.dispose();
    if (binding.videoTexture && binding.videoTexture !== binding.texture) {
      binding.videoTexture.dispose();
    }
    binding.mesh.geometry.dispose();
    binding.material.dispose();
    this.scene.remove(binding.mesh);
  }

  private installEvents() {
    this.stage.addEventListener('pointermove', this.handlePointerMove);
    this.stage.addEventListener('pointerdown', this.handlePointerDown);
    this.stage.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    this.stage.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('resize', this.handleResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.root);
      this.resizeObserver.observe(this.stage);
    }
  }

  private removeEvents() {
    this.stage.removeEventListener('pointermove', this.handlePointerMove);
    this.stage.removeEventListener('pointerdown', this.handlePointerDown);
    this.stage.removeEventListener('pointerleave', this.handlePointerLeave);
    window.removeEventListener('wheel', this.handleWheel);
    this.stage.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private start() {
    if (this.animationFrame !== null) return;

    let lastTime = performance.now();
    const tick = (time: number) => {
      if (this.destroyed) return;

      const dt = Math.min((time - lastTime) / 1000, 1 / 24);
      lastTime = time;
      this.animate(dt);
      this.animationFrame = window.requestAnimationFrame(tick);
    };

    this.animationFrame = window.requestAnimationFrame(tick);
  }

  private playIntro() {
    const { width, height } = this.getCardDimensions();

    this.bindings.forEach((binding) => {
      binding.mesh.scale.set(width * 0.86, height * 0.86, 1);
      binding.material.opacity = 0;
    });

    gsap.to(
      this.bindings.map((binding) => binding.material),
      {
        opacity: 1,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.045,
      }
    );

    gsap.to(
      this.bindings.map((binding) => binding.mesh.scale),
      {
        x: width,
        y: height,
        z: 1,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.035,
      }
    );

    if (!this.prefersReducedMotion) {
      this.currentSpeed = CONFIG.idleSpeed * 2.8;
    }
  }

  private animate(dt: number) {
    if (this.isTransitioning) {
      this.updateVideoPlayback();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'FEATURED_SLIDER') {
      this.updateFeaturedPosition(dt);
      this.updateVideoPlayback();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const isWheelDragActive = this.isPointerDown && this.isWheelDragging;
    const spinMultiplier = this.state === 'HOVER' ? CONFIG.hoverSlowdownFactor : 1;
    this.targetSpeed = isWheelDragActive
      ? 0
      : this.spinDirection * CONFIG.idleSpeed * spinMultiplier;

    if (this.prefersReducedMotion) {
      this.targetSpeed = 0;
    }

    if (!isWheelDragActive) {
      const alpha = 1 - Math.exp(-3.8 * dt);
      this.currentSpeed = clamp(
        lerp(this.currentSpeed, this.targetSpeed, alpha),
        -CONFIG.maxSpinSpeed,
        CONFIG.maxSpinSpeed
      );
      this.baseAngle += this.currentSpeed * dt;
    }
    this.updateRadialBaseTransforms();
    this.applyRadialTransforms(0.16);
    this.updateActiveFromFront(false);
    this.updateVideoPlayback();
    this.renderer.render(this.scene, this.camera);
  }

  private updateFeaturedPosition(dt: number) {
    if (this.isFeaturedDragging) {
      this.featuredDragVelocity *= Math.exp(-10 * dt);
    } else {
      if (this.featuredWheelIdle > 0) {
        this.featuredWheelIdle = Math.max(0, this.featuredWheelIdle - dt);
        if (this.featuredWheelIdle === 0) {
          this.featuredTargetPosition = clamp(
            Math.round(this.featuredTargetPosition),
            0,
            Math.max(0, this.bindings.length - 1)
          );
        }
      }

      const alpha = this.prefersReducedMotion ? 1 : 1 - Math.exp(-CONFIG.featuredDamping * dt);
      this.featuredPosition = lerp(this.featuredPosition, this.featuredTargetPosition, alpha);
      if (Math.abs(this.featuredTargetPosition - this.featuredPosition) < 0.001) {
        this.featuredPosition = this.featuredTargetPosition;
      }
    }

    this.syncFeaturedActiveIndex();
    this.applyFeaturedLayoutNow();
  }

  private syncFeaturedActiveIndex() {
    const nextActiveIndex = clamp(
      Math.round(this.featuredPosition),
      0,
      Math.max(0, this.bindings.length - 1)
    );
    if (nextActiveIndex === this.activeIndex) return;

    this.activeIndex = nextActiveIndex;
    updateActiveDetailsFromItem(this.bindings[this.activeIndex].item, this.detailsScope);
  }

  private updateRadialBaseTransforms() {
    const total = Math.max(this.bindings.length, 1);
    const radius = this.getRadius();

    this.bindings.forEach((binding) => {
      const theta = normalizeAngle((TWO_PI * binding.index) / total + this.baseAngle);
      binding.theta = theta;
      binding.basePosition.set(radius * Math.cos(theta), 0, radius * Math.sin(theta));
      binding.baseRotationY = normalizeAngle(-theta);
    });
  }

  private applyWheelAngleInput(angleDelta: number, deltaTimeSeconds: number, maxAngleStep: number) {
    const boundedAngleDelta = clamp(angleDelta, -maxAngleStep, maxAngleStep);
    if (!boundedAngleDelta) return;

    this.baseAngle += boundedAngleDelta;
    this.spinDirection = Math.sign(boundedAngleDelta);
    const inputSpeed = clamp(
      boundedAngleDelta / Math.max(deltaTimeSeconds, 1 / 120),
      -CONFIG.maxSpinSpeed,
      CONFIG.maxSpinSpeed
    );
    this.currentSpeed =
      this.currentSpeed !== 0 && Math.sign(this.currentSpeed) !== Math.sign(inputSpeed)
        ? inputSpeed
        : lerp(this.currentSpeed, inputSpeed, 0.35);
  }

  private applyWheelInput(
    deltaPixels: number,
    deltaTimeSeconds: number,
    sensitivity = CONFIG.wheelRotateSpeed
  ) {
    this.applyWheelAngleInput(
      deltaPixels * sensitivity,
      deltaTimeSeconds,
      CONFIG.maxWheelAngleStep
    );
  }

  private getWheelPointerAngle(event: PointerEvent) {
    const bounds = this.stage.getBoundingClientRect();
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    if (Math.hypot(dx, dy) < 16) return null;
    return Math.atan2(dy, dx);
  }

  private applyRadialTransforms(alpha: number) {
    const radius = this.getRadius();
    const { width, height } = this.getCardDimensions();

    this.bindings.forEach((binding) => {
      const isHovered = binding === this.hovered;
      const targetYOffset = isHovered ? CONFIG.hoverYOffset : 0;
      binding.hoverYOffset = lerp(binding.hoverYOffset, targetYOffset, alpha);

      const targetPosition = new Vector3(
        radius * Math.cos(binding.theta),
        binding.hoverYOffset,
        radius * Math.sin(binding.theta)
      );

      binding.mesh.position.lerp(targetPosition, alpha);
      binding.mesh.rotation.set(
        0,
        lerpAngle(binding.mesh.rotation.y, binding.baseRotationY, alpha),
        0
      );
      const targetScale = isHovered ? 1.08 : 1;
      binding.mesh.scale.set(
        lerp(binding.mesh.scale.x, width * targetScale, alpha),
        lerp(binding.mesh.scale.y, height * targetScale, alpha),
        1
      );
      binding.material.opacity = lerp(binding.material.opacity, 1, alpha);
      binding.mesh.renderOrder = Math.round((binding.mesh.position.z + radius) * 100);
    });
  }

  private updateActiveFromFront(force: boolean) {
    if (!this.bindings.length || this.state === 'FEATURED_SLIDER' || this.hovered) return;

    const front = this.bindings.reduce<{ binding: FanBinding | null; score: number }>(
      (current, binding) => {
        const score = Math.sin(binding.theta);
        if (score > current.score) {
          return { binding, score };
        }
        return current;
      },
      { binding: null, score: -Infinity }
    ).binding;

    if (front && (force || front !== this.frontActive)) {
      this.frontActive = front;
      updateActiveDetailsFromItem(front.item, this.detailsScope);
    }
  }

  private updateVideoPlayback() {
    this.bindings.forEach((binding) => {
      const video = binding.videoElement;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.paused) return;
      if (binding.isVideoPlayPending) return;

      const now = performance.now();
      if (binding.lastVideoPlayAttempt && now - binding.lastVideoPlayAttempt < 1000) return;

      binding.lastVideoPlayAttempt = now;
      binding.isVideoPlayPending = true;
      video.play().then(
        () => {
          binding.isVideoPlayPending = false;
        },
        () => {
          binding.isVideoPlayPending = false;
        }
      );
    });
  }

  private enterFeatured(index: number) {
    if (this.isTransitioning || !this.bindings.length) return;

    this.isTransitioning = true;
    this.state = 'FEATURED_SLIDER';
    this.activeIndex = clamp(index, 0, this.bindings.length - 1);
    this.featuredPosition = this.activeIndex;
    this.featuredTargetPosition = this.activeIndex;
    this.featuredWheelIdle = 0;
    this.hovered = null;
    this.currentSpeed = 0;
    this.targetSpeed = 0;
    this.root.classList.add('is-featured');
    this.setFeaturedDetailsVisible(true);
    this.stage.classList.remove('is-hovering', 'is-linking', 'is-dragging');
    this.applyCameraMode('FEATURED');
    updateActiveDetailsFromItem(this.bindings[this.activeIndex].item, this.detailsScope);
    this.animateToFeaturedFromCurrent(() => {
      this.isTransitioning = false;
      this.updateVideoPlayback();
    });
  }

  private getCurrentSnapshots(): TransformSnapshot[] {
    return this.bindings.map((binding) => ({
      binding,
      position: binding.mesh.position.clone(),
      rotationY: normalizeAngle(binding.mesh.rotation.y),
      scaleX: binding.mesh.scale.x,
      scaleY: binding.mesh.scale.y,
      opacity: binding.material.opacity,
    }));
  }

  private getFeaturedTarget(binding: FanBinding) {
    const spacing = this.getFeaturedSpacing();
    const offset = binding.index - this.featuredPosition;
    const rawFocus = 1 - clamp(Math.abs(offset), 0, 1);
    const focus = rawFocus * rawFocus * (3 - 2 * rawFocus);
    const scale = this.getFeaturedScale() * lerp(CONFIG.featuredBackgroundScale, 1, focus);
    const { width, height } = this.getCardDimensions();

    return {
      offset,
      position: new Vector3(
        offset * spacing,
        0,
        lerp(CONFIG.featuredZBackground, CONFIG.featuredZFront, focus)
      ),
      rotationY: 0,
      scaleX: width * scale,
      scaleY: height * scale,
      opacity: lerp(0.38, 1, focus),
      renderOrder: Math.round(1000 - Math.abs(offset) + focus * 1000),
    };
  }

  private applyFeaturedLayoutProgress(snapshots: TransformSnapshot[], progress: number) {
    const t = clamp(progress, 0, 1);

    snapshots.forEach((snapshot) => {
      const { binding } = snapshot;
      const target = this.getFeaturedTarget(binding);
      binding.hoverYOffset = 0;
      binding.mesh.renderOrder = target.renderOrder;
      binding.mesh.position.set(
        lerp(snapshot.position.x, target.position.x, t),
        lerp(snapshot.position.y, target.position.y, t),
        lerp(snapshot.position.z, target.position.z, t)
      );
      binding.mesh.rotation.set(0, lerpAngle(snapshot.rotationY, target.rotationY, t), 0);
      binding.mesh.scale.set(
        lerp(snapshot.scaleX, target.scaleX, t),
        lerp(snapshot.scaleY, target.scaleY, t),
        1
      );
      binding.material.opacity = lerp(snapshot.opacity, target.opacity, t);
    });
  }

  private applyFeaturedLayoutNow() {
    this.bindings.forEach((binding) => {
      const target = this.getFeaturedTarget(binding);
      binding.hoverYOffset = 0;
      binding.mesh.position.copy(target.position);
      binding.mesh.rotation.set(0, target.rotationY, 0);
      binding.mesh.scale.set(target.scaleX, target.scaleY, 1);
      binding.mesh.renderOrder = target.renderOrder;
      binding.material.opacity = target.opacity;
    });
  }

  private animateToFeaturedFromCurrent(onComplete?: () => void) {
    this.layoutTween?.kill();
    const snapshots = this.getCurrentSnapshots();
    this.transitionTarget = 'FEATURED';

    if (!snapshots.length || this.prefersReducedMotion) {
      this.applyFeaturedLayoutProgress(snapshots, 1);
      this.transitionTarget = null;
      onComplete?.();
      return;
    }

    const proxy = { progress: 0 };
    this.layoutTween = gsap.to(proxy, {
      progress: 1,
      duration: CONFIG.featuredTransitionDuration,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => this.applyFeaturedLayoutProgress(snapshots, proxy.progress),
      onComplete: () => {
        this.layoutTween = null;
        this.transitionTarget = null;
        onComplete?.();
      },
    });
  }

  private setActiveIndex(index: number) {
    if (this.state !== 'FEATURED_SLIDER' || this.isTransitioning || !this.bindings.length) return;

    this.featuredTargetPosition = clamp(index, 0, this.bindings.length - 1);
    this.featuredWheelIdle = 0;
  }

  private releaseFeatured() {
    if (this.state !== 'FEATURED_SLIDER' || this.isTransitioning) return;

    this.isTransitioning = true;
    this.transitionTarget = 'WHEEL';
    this.layoutTween?.kill();
    this.layoutTween = null;
    this.root.classList.remove('is-featured');
    this.setFeaturedDetailsVisible(false);
    this.updateRadialBaseTransforms();
    this.applyCameraMode('WHEEL');
    this.stage.classList.remove('is-hovering', 'is-linking', 'is-dragging');

    const snapshots = this.getCurrentSnapshots();
    const radius = this.getRadius();
    const { width, height } = this.getCardDimensions();
    const applyReturnProgress = (progress: number) => {
      const t = clamp(progress, 0, 1);

      snapshots.forEach((snapshot) => {
        const { binding } = snapshot;
        const target = binding.basePosition;
        binding.mesh.position.set(
          lerp(snapshot.position.x, target.x, t),
          lerp(snapshot.position.y, target.y, t),
          lerp(snapshot.position.z, target.z, t)
        );
        binding.mesh.rotation.set(0, lerpAngle(snapshot.rotationY, binding.baseRotationY, t), 0);
        binding.mesh.scale.set(
          lerp(snapshot.scaleX, width, t),
          lerp(snapshot.scaleY, height, t),
          1
        );
        binding.material.opacity = lerp(snapshot.opacity, 1, t);
        binding.hoverYOffset = 0;
        binding.mesh.renderOrder = Math.round((target.z + radius) * 100);
      });
    };

    const finish = () => {
      this.activeIndex = -1;
      this.state = 'IDLE_SPIN';
      this.hovered = null;
      this.isTransitioning = false;
      this.transitionTarget = null;
      this.featuredPosition = 0;
      this.featuredTargetPosition = 0;
      this.featuredWheelIdle = 0;
      this.featuredDragVelocity = 0;
      this.currentSpeed = this.prefersReducedMotion
        ? 0
        : this.spinDirection * CONFIG.idleSpeed * 0.4;
      this.updateActiveFromFront(true);
      this.updateCursor(null);
    };

    if (!snapshots.length || this.prefersReducedMotion) {
      applyReturnProgress(1);
      finish();
      return;
    }

    const proxy = { progress: 0 };
    this.layoutTween = gsap.to(proxy, {
      progress: 1,
      duration: CONFIG.returnTransitionDuration,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => applyReturnProgress(proxy.progress),
      onComplete: () => {
        this.layoutTween = null;
        finish();
      },
    });
  }

  private onPointerMove(event: PointerEvent) {
    this.updatePointer(event);

    if (this.isPointerDown && this.state === 'FEATURED_SLIDER') {
      if (!this.isFeaturedDragging || this.isTransitioning) return;

      const deltaX = event.clientX - this.lastPointerX;
      const now = performance.now();
      const deltaTime = Math.max(now - this.lastPointerTime, 1) / 1000;
      const spacing = Math.max(this.getFeaturedSpacing(), 1);
      const aspect = this.getViewportWidth() / Math.max(this.getViewportHeight(), 1);
      const depth = Math.max(0.1, CONFIG.featuredCameraZ - CONFIG.featuredZFront);
      const viewWidth = 2 * depth * Math.tan((this.camera.fov * Math.PI) / 360) * aspect;
      const worldPerPixel = viewWidth / Math.max(this.getViewportWidth(), 1);
      const positionDelta = -(deltaX * worldPerPixel) / spacing;
      this.featuredPosition = clamp(
        this.featuredPosition + positionDelta,
        0,
        Math.max(0, this.bindings.length - 1)
      );
      this.featuredTargetPosition = this.featuredPosition;
      this.featuredDragVelocity = clamp(
        positionDelta / deltaTime,
        -CONFIG.maxFeaturedDragSpeed,
        CONFIG.maxFeaturedDragSpeed
      );
      this.featuredWheelIdle = 0;
      this.lastPointerX = event.clientX;
      this.lastPointerTime = now;
      this.syncFeaturedActiveIndex();
      this.applyFeaturedLayoutNow();
      return;
    }

    if (this.isPointerDown && this.state !== 'FEATURED_SLIDER') {
      if (!this.isWheelDragging) return;

      const now = performance.now();
      const deltaTime = Math.max(now - this.lastPointerTime, 1) / 1000;
      const pointerAngle = this.getWheelPointerAngle(event);
      if (pointerAngle !== null && this.lastPointerAngle !== null) {
        const angleDelta = normalizeAngle(pointerAngle - this.lastPointerAngle);
        this.applyWheelAngleInput(angleDelta, deltaTime, CONFIG.maxDragAngleStep);
      }
      this.lastPointerAngle = pointerAngle;
      this.lastPointerX = event.clientX;
      this.lastPointerTime = now;
      return;
    }

    if (this.state === 'FEATURED_SLIDER') {
      this.updateCursor(this.isTransitioning ? null : this.pickBindingAtPointer());
      return;
    }

    if (this.isTransitioning) {
      this.updateCursor(null);
      return;
    }

    const hit = this.pickBindingAtPointer();
    this.setHovered(hit);
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;

    this.stage.focus({ preventScroll: true });
    this.updatePointer(event);
    this.isPointerDown = true;
    this.isFeaturedDragging = this.state === 'FEATURED_SLIDER' && !this.isTransitioning;
    this.isWheelDragging = this.state !== 'FEATURED_SLIDER' && !this.isTransitioning;
    this.lastPointerAngle = this.isWheelDragging ? this.getWheelPointerAngle(event) : null;
    if (this.isFeaturedDragging) {
      this.featuredTargetPosition = this.featuredPosition;
      this.featuredWheelIdle = 0;
      this.featuredDragVelocity = 0;
    }

    if (this.isWheelDragging) {
      this.setHovered(null);
    } else if (this.state === 'FEATURED_SLIDER') {
      this.layoutTween?.kill();
      this.layoutTween = null;
      this.updateCursor(null);
    }

    this.stage.classList.toggle(
      'is-dragging',
      this.state === 'FEATURED_SLIDER' || this.isWheelDragging
    );
    this.pointerDownTime = performance.now();
    this.pointerDownCoords = { x: event.clientX, y: event.clientY };
    this.lastPointerX = event.clientX;
    this.lastPointerTime = this.pointerDownTime;
    try {
      this.stage.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for synthetic pointer events.
    }
  }

  private onPointerUp(event: PointerEvent) {
    if (!this.isPointerDown) return;

    this.isPointerDown = false;
    this.isWheelDragging = false;
    this.lastPointerAngle = null;
    this.stage.classList.remove('is-dragging');
    this.updatePointer(event);

    const elapsed = performance.now() - this.pointerDownTime;
    const deltaX = event.clientX - this.pointerDownCoords.x;
    const distance = Math.hypot(deltaX, event.clientY - this.pointerDownCoords.y);
    const isClick = distance < 12 && elapsed < 280;

    if (this.state === 'FEATURED_SLIDER') {
      const wasSliderDrag = this.isFeaturedDragging && Math.abs(deltaX) > 12;
      this.isFeaturedDragging = false;

      if (wasSliderDrag) {
        this.featuredTargetPosition = clamp(
          Math.round(
            this.featuredPosition +
              clamp(
                this.featuredDragVelocity * CONFIG.featuredDragThrowSeconds,
                -CONFIG.featuredDragThrowLimit,
                CONFIG.featuredDragThrowLimit
              )
          ),
          0,
          this.bindings.length - 1
        );
        this.featuredWheelIdle = 0;
        this.featuredDragVelocity = 0;
        this.updateCursor(this.pickBindingAtPointer());
        return;
      }

      if (!isClick) {
        this.featuredTargetPosition = clamp(
          Math.round(
            this.featuredPosition +
              clamp(
                this.featuredDragVelocity * CONFIG.featuredDragThrowSeconds,
                -CONFIG.featuredDragThrowLimit,
                CONFIG.featuredDragThrowLimit
              )
          ),
          0,
          this.bindings.length - 1
        );
        this.featuredWheelIdle = 0;
        this.featuredDragVelocity = 0;
        return;
      }

      const hit = this.pickBindingAtPointer();
      if (!hit) {
        this.releaseFeatured();
        return;
      }

      if (hit.index === this.activeIndex) {
        this.openProject(hit.item);
      } else {
        this.setActiveIndex(hit.index);
      }
      this.updateCursor(this.pickBindingAtPointer());
      return;
    }

    if (!isClick || this.isTransitioning) {
      this.setHovered(this.pickBindingAtPointer());
      return;
    }

    const hit = this.pickBindingAtPointer();
    if (hit) {
      this.enterFeatured(hit.index);
    } else {
      this.setHovered(null);
    }
  }

  private onPointerLeave() {
    if (this.isPointerDown) return;
    if (this.state !== 'FEATURED_SLIDER') {
      this.setHovered(null);
    } else {
      this.updateCursor(null);
    }
  }

  private onWheel(event: WheelEvent) {
    if (this.state === 'FEATURED_SLIDER') {
      if (this.isPointerDown || this.isTransitioning) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const unitScale =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.getViewportHeight() : 1;
      const deltaPixels = clamp(delta * unitScale, -120, 120);
      const nextPosition = clamp(
        this.featuredTargetPosition + deltaPixels * CONFIG.featuredWheelSensitivity,
        0,
        this.bindings.length - 1
      );
      if (nextPosition !== this.featuredTargetPosition) {
        event.preventDefault();
        this.featuredTargetPosition = nextPosition;
        this.featuredWheelIdle = CONFIG.featuredWheelSnapDelay;
      }
      return;
    }

    event.preventDefault();
    if (this.isPointerDown && this.isWheelDragging) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const unitScale =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.getViewportHeight() : 1;
    const deltaPixels = clamp(delta * unitScale, -120, 120);
    const now = performance.now();
    const deltaTime = this.lastWheelInputTime
      ? clamp((now - this.lastWheelInputTime) / 1000, 1 / 120, 0.08)
      : 1 / 60;
    this.lastWheelInputTime = now;
    if (deltaPixels !== 0) this.setHovered(null);
    this.applyWheelInput(deltaPixels, deltaTime);
  }

  private scheduleResize() {
    if (this.resizeFrame !== null) return;

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.onResize();
    });
  }

  private onResize() {
    const rect = this.stage.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth || 1);
    const height = Math.max(1, rect.height || window.innerHeight || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);

    if (Math.abs(this.renderer.getPixelRatio() - pixelRatio) > 0.001) {
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const { transitionTarget } = this;
    this.layoutTween?.kill();
    this.layoutTween = null;
    this.cameraTween?.kill();
    this.cameraTween = null;

    if (this.isTransitioning && transitionTarget) {
      this.isTransitioning = false;
      this.transitionTarget = null;

      if (transitionTarget === 'FEATURED') {
        this.state = 'FEATURED_SLIDER';
        this.cameraMode = 'FEATURED';
      } else {
        this.state = 'IDLE_SPIN';
        this.activeIndex = -1;
        this.hovered = null;
        this.featuredPosition = 0;
        this.featuredTargetPosition = 0;
        this.currentSpeed = this.prefersReducedMotion ? 0 : CONFIG.idleSpeed * 0.4;
        this.cameraMode = 'WHEEL';
      }
    }

    this.bindings.forEach((binding) => {
      gsap.killTweensOf(binding.mesh.scale);
      gsap.killTweensOf(binding.material);
    });

    this.applyCameraMode(this.cameraMode, true);

    this.bindings.forEach((binding) => {
      if (binding.texture?.image) {
        const image = binding.texture.image as {
          naturalWidth?: number;
          naturalHeight?: number;
          width?: number;
          height?: number;
          videoWidth?: number;
          videoHeight?: number;
        };
        const mediaWidth = image.naturalWidth ?? image.videoWidth ?? image.width ?? 0;
        const mediaHeight = image.naturalHeight ?? image.videoHeight ?? image.height ?? 0;
        if (mediaWidth > 0 && mediaHeight > 0) {
          this.applyTextureCover(binding.texture, mediaWidth / mediaHeight);
        }
      }
    });

    if (this.state === 'FEATURED_SLIDER') {
      this.applyFeaturedLayoutNow();
    } else {
      this.updateRadialBaseTransforms();
      this.applyRadialTransforms(1);
      if (transitionTarget === 'WHEEL') this.updateActiveFromFront(true);
    }

    this.updateVideoPlayback();

    this.renderer.render(this.scene, this.camera);
  }

  private onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.releaseFeatured();
      return;
    }

    if (this.state !== 'FEATURED_SLIDER') return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.setActiveIndex(Math.round(this.featuredTargetPosition) - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.setActiveIndex(Math.round(this.featuredTargetPosition) + 1);
      return;
    }

    if (event.key === 'Enter' && this.activeIndex >= 0) {
      event.preventDefault();
      this.openProject(this.bindings[this.activeIndex].item);
    }
  }

  private updatePointer(event: PointerEvent | MouseEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    this.pointer.x = ((event.clientX - bounds.left) / width) * 2 - 1;
    this.pointer.y = -(((event.clientY - bounds.top) / height) * 2 - 1);
  }

  private pickBindingAtPointer() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.bindings.map((binding) => binding.mesh),
      false
    );
    if (!hits.length) return null;

    return (hits[0].object.userData.fanBinding as FanBinding | undefined) ?? null;
  }

  private updateCursor(binding: FanBinding | null) {
    const isFeatured = this.state === 'FEATURED_SLIDER';
    const isFeaturedPrimary = Boolean(isFeatured && binding && binding.index === this.activeIndex);
    const isSelectable = Boolean(binding && !isFeaturedPrimary);

    this.stage.classList.toggle('is-linking', isFeaturedPrimary);
    this.stage.classList.toggle('is-hovering', isSelectable);
  }

  private setHovered(binding: FanBinding | null) {
    if (binding === this.hovered) return;

    this.hovered = binding;
    this.state = binding ? 'HOVER' : 'IDLE_SPIN';
    this.updateCursor(binding);

    if (binding) {
      updateActiveDetailsFromItem(binding.item, this.detailsScope);
    }
  }

  private openProject(item: FanItem) {
    if (!item.href) return;

    updateActiveDetailsFromItem(item, this.detailsScope);
    const target = getActiveDetailsLink(this.detailsScope);
    if (target) {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      const shouldContinue = target.dispatchEvent(clickEvent);
      if (!shouldContinue || clickEvent.defaultPrevented) return;
    }

    window.location.href = item.href;
  }
}

export const refreshHomeFanWheel = () => {
  homeFanWheelInstances.forEach((instance) => instance.refresh());
};

export const destroyHomeFanWheel = () => {
  homeFanWheelInstances.forEach((instance) => instance.destroy());
  homeFanWheelInstances.length = 0;
  currentActiveItem = null;
};

export const initHomeFanWheel = (root: ParentNode | Document = document) => {
  destroyHomeFanWheel();

  if (!getWebGLAvailable()) return;

  const fanRoots = getFanRoots(root);
  if (!fanRoots.length) return;

  const instances = fanRoots
    .map((fanRoot) => {
      try {
        const instance = new HomeFanWheel(fanRoot);
        instance.init();
        return instance;
      } catch (error) {
        console.error('[HomeFanWheel] Failed to initialize fan wheel', error);
        return null;
      }
    })
    .filter((instance): instance is HomeFanWheel => Boolean(instance));

  homeFanWheelInstances.push(...instances);
};
