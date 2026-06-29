import gsap from 'gsap';

let isOpen = false;
let triggerLink: HTMLElement | null = null;
let wrapper: HTMLElement | null = null;
let container: HTMLElement | null = null;
let triggerText: HTMLElement | null = null;
let allLinks: HTMLElement[] = [];
let cleanupFns: Array<() => void> = [];

const getClipOrigin = (): string => {
  if (!triggerLink || !container) return '50% 0%';
  const tr = triggerLink.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const ox = tr.left + tr.width / 2 - cr.left;
  const oy = tr.top + tr.height / 2 - cr.top;
  return `${ox}px ${oy}px`;
};

const open = () => {
  isOpen = true;

  if (triggerText) triggerText.textContent = 'Close';

  gsap.set(wrapper, { display: 'block' });
  container?.classList.remove('invisible');

  const origin = getClipOrigin();
  gsap.killTweensOf([container, ...allLinks].filter(Boolean));

  gsap.fromTo(
    container,
    { clipPath: `circle(0px at ${origin})` },
    { clipPath: `circle(200vmax at ${origin})`, duration: 0.55, ease: 'power3.inOut' }
  );

  if (allLinks.length) {
    gsap.fromTo(
      allLinks,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.06, delay: 0.25 }
    );
  }
};

const close = (immediate = false) => {
  if (!isOpen && !immediate) return;
  isOpen = false;

  if (triggerText) triggerText.textContent = 'Menu';

  const targets = [container, ...allLinks].filter(Boolean) as HTMLElement[];
  gsap.killTweensOf(targets);

  if (immediate) {
    if (container) gsap.set(container, { clipPath: '' });
    if (wrapper) gsap.set(wrapper, { display: 'none' });
    container?.classList.add('invisible');
    if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    return;
  }

  const origin = getClipOrigin();

  if (allLinks.length) {
    gsap.to(allLinks, { opacity: 0, y: -6, duration: 0.15, ease: 'power2.in', stagger: 0.03 });
  }

  gsap.to(container, {
    clipPath: `circle(0px at ${origin})`,
    duration: 0.45,
    ease: 'power3.inOut',
    delay: 0.05,
    onComplete: () => {
      gsap.set(container, { clipPath: '' });
      gsap.set(wrapper, { display: 'none' });
      container?.classList.add('invisible');
      if (allLinks.length) gsap.set(allLinks, { clearProps: 'opacity,y' });
    },
  });
};

const handleTriggerClick = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (isOpen) {
    close();
  } else {
    open();
  }
};

const handleOutsideClick = (e: Event) => {
  if (!isOpen) return;
  const target = e.target as HTMLElement;
  if (!target.closest('.nav-unified')) close();
};

export const initMobileNav = () => {
  const navRoot = document.querySelector<HTMLElement>('.nav-unified');
  if (!navRoot) return;

  triggerLink = navRoot.querySelector<HTMLElement>('[nav-trigger="open-nav"], .nav-mobile-trigger');
  triggerText = triggerLink?.querySelector<HTMLElement>('.nav-link-text') ?? null;
  wrapper = navRoot.querySelector<HTMLElement>('.nav-wrapper-mobile');
  container = navRoot.querySelector<HTMLElement>('.nav-container-mobile');

  if (!triggerLink || !wrapper || !container) return;

  allLinks = Array.from(container.querySelectorAll<HTMLElement>('.nav-mobile-link'));

  triggerLink.addEventListener('click', handleTriggerClick);
  document.addEventListener('click', handleOutsideClick);
  document.addEventListener('touchend', handleOutsideClick, { passive: true });

  cleanupFns = [
    () => triggerLink?.removeEventListener('click', handleTriggerClick),
    () => document.removeEventListener('click', handleOutsideClick),
    () => document.removeEventListener('touchend', handleOutsideClick),
  ];
};

export const destroyMobileNav = () => {
  close(true);
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  triggerLink = null;
  wrapper = null;
  container = null;
  triggerText = null;
  allLinks = [];
};

export const closeMobileNav = (immediate = false) => close(immediate);
