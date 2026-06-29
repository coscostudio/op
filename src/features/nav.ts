import gsap from 'gsap';

// Left-anchored nav logo math for the 221 x 29 SVG.
const O_RIGHT = 26.13;
const PAREN_LEFT = 124.81;
const P_RIGHT = 139.92;
const CLOSE_LEFT = 216.03;
const CLOSE_RIGHT = 220.78;
const ICON_GAP = 2;
const ICON_PAREN_TX = O_RIGHT + ICON_GAP - PAREN_LEFT;
const LOGO_VIEWBOX_WIDTH = 221;
const ICON_VIEWBOX_WIDTH = 49;
const CLOSE_WIDTH = CLOSE_RIGHT - CLOSE_LEFT;
const LOGO_HITBOX_CLASS = 'op-logo-hitbox';

const TEXT_PRIMARY = 'var(--text-color--text-primary)';
const TEXT_SECONDARY = 'var(--text-color--text-secondary)';
const LIGHT_ACCENT = 'var(--base-color-brand--light-accent)';
const BACKGROUND_PRIMARY = 'var(--base-color-brand--nav-bg-light)';
const BACKGROUND_SECONDARY = 'var(--base-color-brand--nav-bg-dark)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const TOP_SCROLL_THRESHOLD = 4;
const CASE_TRIGGER_OFFSET = 4;
export const NAV_MOTION_DURATION = 0.52;
export const NAV_MOTION_EASE = 'power3.inOut';
const NAV_COLOR_DUR = NAV_MOTION_DURATION;
const LETTER_MASK_DUR = 0.38;
const LETTER_STAGGER = 0.008;
const OUTSIDE_WIPE_T = 0.04;
const PERSPECTIVE_WIPE_T = 0;
const PAREN_MOVE_DUR = NAV_MOTION_DURATION;
const PAREN_EXPAND_DUR = NAV_MOTION_DURATION;
const NAV_CLOCK_SELECTOR = '[nav-element="clock"]';
const NEW_YORK_TIME_ZONE = 'America/New_York';
const NEW_YORK_CLOCK_PREFIX = 'NY, NY';

type NavNamespace = 'about' | 'cases' | 'home' | 'work' | string;
type LogoMode = 'condensed' | 'full';

type LetterClip = {
  group: SVGGElement;
  rect: SVGRectElement;
  width: number;
  x: number;
};

type PreparedLogo = {
  gClose: SVGGElement;
  gO: SVGGElement;
  gParen: SVGGElement;
  gPerspective: SVGGElement;
  iconLinkWidth: number;
  hitbox: HTMLElement;
  logoEmbed: HTMLElement | null;
  logoLink: HTMLElement;
  svg: SVGSVGElement;
  outsideLetters: LetterClip[];
  perspectiveLetters: LetterClip[];
  fullLinkWidth: number;
};

let logoUid = 0;
let preparedLogo: PreparedLogo | null = null;
let activeLogoTl: gsap.core.Timeline | null = null;
let currentLogoMode: LogoMode | null = null;
let activeNamespace: NavNamespace | null = null;
let activeContainer: HTMLElement | null = null;
let isDrawerOpen = false;
let currentNavBackgroundKey = '';
let currentNavTextKey = '';
let rafId = 0;
let navClockTimer: number | null = null;
let newYorkTimeFormatter: Intl.DateTimeFormat | null = null;
let cleanupFns: Array<() => void> = [];

const getNav = () => document.querySelector<HTMLElement>('.nav-unified');

const getColorTargets = (nav: HTMLElement): Element[] => [
  nav,
  ...Array.from(
    nav.querySelectorAll(
      '.logo-container, .logo-1, .logo-1 svg, .logo-1 svg g, .logo-1 svg path, .nav, .nav-link, .nav-link-simple, .nav-trigger, .nav-trigger-text, .nav-link-text, .nav-mobile-trigger, .nav-mobile-link, [nav-element="clock"]'
    )
  ),
];

const getNewYorkTimeFormatter = () => {
  newYorkTimeFormatter ??= new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    second: '2-digit',
    timeZone: NEW_YORK_TIME_ZONE,
  });

  return newYorkTimeFormatter;
};

const getNewYorkClockLabel = (date = new Date()) => {
  const parts = getNewYorkTimeFormatter().formatToParts(date);
  const time = parts.reduce(
    (acc, part) => {
      if (part.type === 'hour' || part.type === 'minute' || part.type === 'second') {
        acc[part.type] = part.value;
      }
      return acc;
    },
    { hour: '00', minute: '00', second: '00' }
  );

  const hour = time.hour === '24' ? '00' : time.hour;
  return `${NEW_YORK_CLOCK_PREFIX}, ${hour}:${time.minute}:${time.second}`;
};

const updateNavClock = () => {
  document.querySelectorAll<HTMLElement>(NAV_CLOCK_SELECTOR).forEach((clock) => {
    clock.textContent = getNewYorkClockLabel();
  });
};

const scheduleNavClockTick = () => {
  if (navClockTimer !== null) {
    window.clearTimeout(navClockTimer);
  }

  const msUntilNextSecond = 1000 - (Date.now() % 1000);
  navClockTimer = window.setTimeout(() => {
    updateNavClock();
    scheduleNavClockTick();
  }, msUntilNextSecond);
};

export const initNavClock = () => {
  if (!document.querySelector(NAV_CLOCK_SELECTOR)) return;
  updateNavClock();
  scheduleNavClockTick();
};

export const destroyNavClock = () => {
  if (navClockTimer === null) return;
  window.clearTimeout(navClockTimer);
  navClockTimer = null;
};

const resolveCssColor = (color: string) => {
  const match = color.match(/^var\((--[^),\s]+)\)$/);
  if (!match) return color;

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  return resolved || color;
};

const getRenderedCssColor = (color: string) => {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.documentElement.appendChild(probe);
  const rendered = getComputedStyle(probe).color;
  probe.remove();
  return rendered || color;
};

const getTransparentCssColor = (color: string) => {
  const channels = getRenderedCssColor(color)
    .match(/[\d.]+/g)
    ?.slice(0, 3);

  if (!channels || channels.length < 3) return TRANSPARENT;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, 0)`;
};

const getNamespaceTextColor = (namespace: NavNamespace | null | undefined, isActiveBg = false) => {
  if (isActiveBg && namespace === 'about') return LIGHT_ACCENT;
  if (namespace === 'about' || namespace === 'cases') return TEXT_SECONDARY;
  return TEXT_PRIMARY;
};

const getNamespaceBackground = (namespace: NavNamespace | null | undefined) => {
  if (namespace === 'about') return BACKGROUND_SECONDARY;
  return BACKGROUND_PRIMARY;
};

const remToPx = (rem: number) =>
  rem * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

const ensureLogoUsesCurrentColor = (nav: HTMLElement) => {
  nav.querySelectorAll<SVGPathElement>('.logo-1 svg path').forEach((path) => {
    path.setAttribute('fill', 'currentColor');
  });
};

const ensureLogoHitbox = (logoLink: HTMLElement) => {
  const existing = logoLink.querySelector<HTMLElement>(`.${LOGO_HITBOX_CLASS}`);
  if (existing) return existing;

  const hitbox = document.createElement('span');
  hitbox.className = LOGO_HITBOX_CLASS;
  logoLink.appendChild(hitbox);
  return hitbox;
};

const ensureNavVisible = (nav: HTMLElement) => {
  gsap.killTweensOf(nav, 'opacity');
  gsap.set(nav, { opacity: 1 });
};

const getCurrentNamespace = () =>
  document
    .querySelector<HTMLElement>('[data-barba-namespace]')
    ?.getAttribute('data-barba-namespace');

const createLetterClip = (
  path: SVGPathElement,
  defs: SVGDefsElement,
  uid: number,
  label: string,
  index: number
): { clip: LetterClip; group: SVGGElement } => {
  const ns = 'http://www.w3.org/2000/svg';
  const bbox = path.getBBox();
  const clipPath = document.createElementNS(ns, 'clipPath');
  const rect = document.createElementNS(ns, 'rect') as SVGRectElement;
  const group = document.createElementNS(ns, 'g') as SVGGElement;
  const width = Math.max(bbox.width + 0.8, 0.1);
  const x = bbox.x - 0.4;

  clipPath.id = `op-nav-cp-${label}-${uid}-${index}`;
  clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(bbox.y - 2));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(bbox.height + 4));
  clipPath.appendChild(rect);
  defs.appendChild(clipPath);

  group.setAttribute('clip-path', `url(#${clipPath.id})`);
  group.appendChild(path);

  return { clip: { group, rect, width, x }, group };
};

const prepareLogo = (): PreparedLogo | null => {
  if (preparedLogo) return preparedLogo;

  const svg = document.querySelector<SVGSVGElement>('.nav-unified .logo-1 svg');
  if (!svg) return null;

  const logoLink = svg.closest<HTMLElement>('.logo-container');
  const logoEmbed = svg.closest<HTMLElement>('.logo-1');
  if (!logoLink) return null;
  const hitbox = ensureLogoHitbox(logoLink);

  const paths = Array.from(svg.querySelectorAll<SVGPathElement>(':scope > path'));
  if (paths.length < 20) return null;
  const fullLinkWidth =
    logoLink.getBoundingClientRect().width ||
    svg.getBoundingClientRect().width ||
    LOGO_VIEWBOX_WIDTH;
  const iconLinkWidth = fullLinkWidth * (ICON_VIEWBOX_WIDTH / LOGO_VIEWBOX_WIDTH);

  const ns = 'http://www.w3.org/2000/svg';
  const uid = (logoUid += 1);
  const gO = document.createElementNS(ns, 'g') as SVGGElement;
  const gParen = document.createElementNS(ns, 'g') as SVGGElement;
  const gPerspective = document.createElementNS(ns, 'g') as SVGGElement;
  const gClose = document.createElementNS(ns, 'g') as SVGGElement;
  const defs = document.createElementNS(ns, 'defs') as SVGDefsElement;
  const outsideLetters = paths
    .slice(1, 7)
    .map((path, index) => createLetterClip(path, defs, uid, 'outside', index));
  const perspectiveLetters = paths
    .slice(9, 19)
    .map((path, index) => createLetterClip(path, defs, uid, 'perspective', index));

  paths.forEach((path) => path.setAttribute('fill', 'currentColor'));

  gO.appendChild(paths[0]);
  for (let i = 7; i <= 8; i += 1) gParen.appendChild(paths[i]);
  gClose.appendChild(paths[19]);

  svg.innerHTML = '';
  svg.appendChild(defs);
  svg.appendChild(gO);
  outsideLetters.forEach(({ group }) => svg.appendChild(group));
  svg.appendChild(gParen);
  perspectiveLetters.forEach(({ group }) => gPerspective.appendChild(group));
  svg.appendChild(gPerspective);
  svg.appendChild(gClose);

  svg.setAttribute('overflow', 'visible');
  gsap.set(logoLink, {
    overflow: 'visible',
    position: 'relative',
    width: fullLinkWidth,
  });
  gsap.set(hitbox, {
    bottom: 0,
    display: 'block',
    left: 0,
    position: 'absolute',
    top: 0,
    width: fullLinkWidth,
  });
  gsap.set([svg, logoEmbed].filter(Boolean), {
    flexShrink: 0,
    maxWidth: 'none',
    overflow: 'visible',
    width: fullLinkWidth,
  });

  preparedLogo = {
    gClose,
    gO,
    gParen,
    gPerspective,
    hitbox,
    iconLinkWidth,
    logoEmbed,
    logoLink,
    svg,
    outsideLetters: outsideLetters.map(({ clip }) => clip),
    perspectiveLetters: perspectiveLetters.map(({ clip }) => clip),
    fullLinkWidth,
  };
  currentLogoMode = 'full';
  return preparedLogo;
};

const setLetters = (letters: LetterClip[], visible: boolean) => {
  letters.forEach((letter) => {
    gsap.set(letter.group, { x: 0 });
    gsap.set(letter.rect, {
      attr: { width: visible ? letter.width : 0, x: letter.x },
    });
  });
};

const getCurrentAttrNumber = (element: SVGElement, name: string, fallback: number) => {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
};

const setPerspectiveOffset = (logo: PreparedLogo, offset: number) => {
  gsap.set(logo.gPerspective, { x: 0 });
  logo.perspectiveLetters.forEach((letter) => {
    gsap.set(letter.group, { x: offset });
    gsap.set(letter.rect, { attr: { x: letter.x + offset } });
  });
};

const getVisiblePerspectiveRight = (logo: PreparedLogo, offset: number) => {
  let right = P_RIGHT + offset;

  logo.perspectiveLetters.forEach((letter) => {
    const width = getCurrentAttrNumber(letter.rect, 'width', letter.width);
    if (width <= 0.01) return;
    right = Math.max(right, letter.x + offset + width);
  });

  return right;
};

const syncCloseToPerspective = (logo: PreparedLogo, offset: number) => {
  const visibleRight = getVisiblePerspectiveRight(logo, offset);
  gsap.set(logo.gClose, { x: visibleRight - CLOSE_LEFT + 0.5 });
  return visibleRight;
};

const syncLogoHitbox = (logo: PreparedLogo, visibleRight: number) => {
  const visibleLogoRight = Math.min(
    LOGO_VIEWBOX_WIDTH,
    Math.max(ICON_VIEWBOX_WIDTH, visibleRight + CLOSE_WIDTH + 1.5)
  );
  gsap.set(logo.logoLink, {
    width: logo.fullLinkWidth,
  });
  gsap.set(logo.hitbox, {
    width: logo.fullLinkWidth * (visibleLogoRight / LOGO_VIEWBOX_WIDTH),
  });
};

const animateLetters = (
  tl: gsap.core.Timeline,
  letters: LetterClip[],
  visible: boolean,
  position: number
) => {
  const ordered = visible ? letters : [...letters].reverse();

  ordered.forEach((letter, index) => {
    tl.to(
      letter.rect,
      {
        attr: { width: visible ? letter.width : 0, x: letter.x },
        duration: LETTER_MASK_DUR,
        ease: NAV_MOTION_EASE,
      },
      position + index * LETTER_STAGGER
    );
  });
};

const setLogoMode = (mode: LogoMode, immediate = false) => {
  const logo = prepareLogo();
  if (!logo) {
    currentLogoMode = mode;
    return;
  }
  if (currentLogoMode === mode) return;

  currentLogoMode = mode;
  activeLogoTl?.kill();
  const letterRects = [...logo.outsideLetters, ...logo.perspectiveLetters].map(
    (letter) => letter.rect
  );
  gsap.killTweensOf([
    logo.gO,
    logo.gParen,
    logo.gPerspective,
    logo.gClose,
    logo.hitbox,
    ...letterRects,
  ]);
  gsap.set(logo.gO, { x: 0 });

  if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setLetters(logo.outsideLetters, mode === 'full');
    setLetters(logo.perspectiveLetters, mode === 'full');
    gsap.set(logo.logoLink, { width: logo.fullLinkWidth });
    gsap.set(logo.hitbox, {
      width: mode === 'condensed' ? logo.iconLinkWidth : logo.fullLinkWidth,
    });
    gsap.set(logo.gParen, { x: mode === 'condensed' ? ICON_PAREN_TX : 0 });
    setPerspectiveOffset(logo, mode === 'condensed' ? ICON_PAREN_TX : 0);
    const visibleRight = syncCloseToPerspective(logo, mode === 'condensed' ? ICON_PAREN_TX : 0);
    syncLogoHitbox(logo, visibleRight);
    return;
  }

  const motionState = {
    parenX:
      Number(gsap.getProperty(logo.gParen, 'x')) || (mode === 'condensed' ? 0 : ICON_PAREN_TX),
  };
  const renderLogo = () => {
    gsap.set(logo.gO, { x: 0 });
    gsap.set(logo.gParen, { x: motionState.parenX });
    setPerspectiveOffset(logo, motionState.parenX);
    const visibleRight = syncCloseToPerspective(logo, motionState.parenX);
    syncLogoHitbox(logo, visibleRight);
  };

  const tl = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: renderLogo,
    onUpdate: renderLogo,
  });
  activeLogoTl = tl;

  if (mode === 'condensed') {
    animateLetters(tl, logo.perspectiveLetters, false, PERSPECTIVE_WIPE_T);
    animateLetters(tl, logo.outsideLetters, false, OUTSIDE_WIPE_T);
    tl.to(
      motionState,
      { duration: PAREN_MOVE_DUR, ease: NAV_MOTION_EASE, parenX: ICON_PAREN_TX },
      0
    );
  } else {
    animateLetters(tl, logo.outsideLetters, true, OUTSIDE_WIPE_T);
    animateLetters(tl, logo.perspectiveLetters, true, OUTSIDE_WIPE_T + 0.06);
    tl.to(motionState, { duration: PAREN_EXPAND_DUR, ease: NAV_MOTION_EASE, parenX: 0 }, 0);
  }
};

export const setNavDrawerOpenState = (open: boolean) => {
  if (isDrawerOpen === open) return;
  isDrawerOpen = open;
  applyNavVisualState(shouldCondense());
};

const applyNavVisualState = (condensed: boolean, immediate = false, skipVisibility = false) => {
  if (activeNamespace === 'home') condensed = false;
  if (isDrawerOpen) condensed = false; // drawer forces full logo

  const isActiveBg = condensed || isDrawerOpen;

  applyNavTextState(isActiveBg, immediate, skipVisibility);

  const activeBackgroundColor = resolveCssColor(getNamespaceBackground(activeNamespace));
  const backgroundColor = isActiveBg
    ? activeBackgroundColor
    : getTransparentCssColor(activeBackgroundColor);
  const backgroundKey = [condensed, isDrawerOpen, backgroundColor].join('|');

  if (!immediate && backgroundKey === currentNavBackgroundKey) return;

  const nav = getNav();
  if (!nav) return;

  currentNavBackgroundKey = backgroundKey;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const backgroundDuration = immediate || reducedMotion ? 0 : NAV_MOTION_DURATION;

  setLogoMode(condensed ? 'condensed' : 'full', immediate);
  gsap.killTweensOf(nav, 'backgroundColor');
  gsap.to(nav, {
    backgroundColor,
    duration: backgroundDuration,
    ease: NAV_MOTION_EASE,
    overwrite: 'auto',
  });
};

const applyNavTextState = (isActiveBg = false, immediate = false, skipVisibility = false) => {
  const nav = getNav();
  if (!nav) return;

  if (!skipVisibility) {
    ensureNavVisible(nav);
  }
  ensureLogoUsesCurrentColor(nav);

  const textColor = resolveCssColor(getNamespaceTextColor(activeNamespace, isActiveBg));
  const textKey = [activeNamespace, isActiveBg, textColor].join('|');
  if (!immediate && textKey === currentNavTextKey) return;

  currentNavTextKey = textKey;
  const duration =
    immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NAV_COLOR_DUR;
  const targets = getColorTargets(nav);

  gsap.killTweensOf(targets, 'color');
  gsap.to(targets, {
    color: textColor,
    duration,
    ease: NAV_MOTION_EASE,
    overwrite: 'auto',
  });
};

const shouldCondense = () => {
  if (activeNamespace === 'work') {
    const trigger = activeContainer?.querySelector<HTMLElement>(
      '.section_worklist, .Section_worklist'
    );
    if (!trigger) return window.scrollY > TOP_SCROLL_THRESHOLD;
    return trigger.getBoundingClientRect().top <= 0;
  }

  if (activeNamespace === 'about') {
    const trigger = activeContainer?.querySelector<HTMLElement>(
      '.section_about-blurb, .Section_about-blurb'
    );
    if (!trigger) return window.scrollY > TOP_SCROLL_THRESHOLD;
    return trigger.getBoundingClientRect().top <= remToPx(3);
  }

  if (activeNamespace === 'cases') {
    const trigger = activeContainer?.querySelector<HTMLElement>(
      '.section_case-header .component-case-header-top'
    );
    const logo = document.querySelector<HTMLElement>('.nav-unified .logo-container');
    if (!trigger || !logo) return window.scrollY > window.innerHeight * 0.75;

    return (
      trigger.getBoundingClientRect().bottom <=
      logo.getBoundingClientRect().bottom + CASE_TRIGGER_OFFSET
    );
  }

  return false;
};

const updateFromScroll = () => {
  rafId = 0;
  applyNavVisualState(shouldCondense());
};

const requestScrollUpdate = () => {
  if (rafId) return;
  rafId = window.requestAnimationFrame(updateFromScroll);
};

const removeScrollListeners = () => {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
};

const installScrollListeners = () => {
  removeScrollListeners();
  if (!['about', 'cases', 'work'].includes(String(activeNamespace))) return;

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  cleanupFns = [
    () => window.removeEventListener('scroll', requestScrollUpdate),
    () => window.removeEventListener('resize', requestScrollUpdate),
  ];
};

export const updateNavPageState = (
  namespace: NavNamespace | null | undefined = getCurrentNamespace(),
  container: HTMLElement | null = document.querySelector<HTMLElement>('[data-barba="container"]'),
  immediate = false,
  skipVisibility = false
) => {
  const nextNamespace = namespace ?? null;
  if (activeNamespace !== nextNamespace) currentNavTextKey = '';

  activeNamespace = nextNamespace;
  activeContainer = container;
  installScrollListeners();

  applyNavVisualState(shouldCondense(), immediate, skipVisibility);
};

/**
 * Updates w--current on nav links to match the current pathname.
 * Webflow only sets this class on hard load — call after every barba transition.
 * Skips links with no real destination (empty href, hash-only) — these are modal/action triggers.
 */
export const updateNavCurrentState = () => {
  const currentPath = window.location.pathname;
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const raw = link.getAttribute('href') ?? '';
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) return;
    const linkPath = new URL(link.href, window.location.origin).pathname;
    if (linkPath === currentPath) {
      link.classList.add('w--current');
    } else {
      link.classList.remove('w--current');
    }
  });
};
