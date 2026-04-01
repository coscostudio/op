import gsap from 'gsap';

/** Persistent nav/logo that lives outside the barba wrapper — revealed once on hard load only. */
export const PERSISTENT_NAV = '.logo-container, .nav, .nav-wrapper-mobile';

/**
 * Inject a CSS rule at module load time so every barba container is hidden the instant
 * it's added to the DOM — before any JS hooks can fire. Without this, there's a flash
 * between barba inserting the container and our beforeEnter gsap.set running.
 * JS-injected so it doesn't affect visibility in the Webflow designer.
 */
(() => {
  const id = 'barba-container-init';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = '[data-barba="container"] { opacity: 0; }';
  document.head.appendChild(style);
})();

/** Toggle .dark combo class on body — about page is dark, all others are light. */
export const updateBodyTheme = (namespace: string | undefined | null) => {
  document.body.classList.toggle('dark', namespace === 'about');
};

/**
 * Webflow injects opacity:0 (sometimes with !important, sometimes display:none) on .main-wrapper
 * via inline <style> blocks. Strip those rules and replace with a plain opacity:0 GSAP can override.
 */
export const patchMainWrapperCSS = () => {
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) continue;
    try {
      const rules = Array.from(sheet.cssRules || []);
      for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i] as CSSStyleRule;
        if (rule.selectorText?.includes('main-wrapper')) {
          const hasDisplayNone = rule.style.display === 'none';
          const hasImportantOpacity = rule.style.getPropertyPriority('opacity') === 'important';
          if (hasDisplayNone || hasImportantOpacity) {
            sheet.deleteRule(i);
            sheet.insertRule('.main-wrapper { opacity: 0; }', i);
          }
        }
      }
    } catch {
      // Cross-origin sheets throw — skip silently
    }
  }
};

/**
 * If .main-wrapper is a child of the barba container, Webflow's CSS opacity:0 rule carries
 * into every new page fetch. Reset it so the container-level fade works correctly.
 */
const resetInnerMainWrapper = (container: HTMLElement) => {
  const inner = container.querySelector<HTMLElement>('.main-wrapper');
  if (inner) gsap.set(inner, { opacity: 1 });
};

export const fadeTransition = {
  name: 'fade',

  // ── Hard load ─────────────────────────────────────────────────────────────────
  // Same 0.4s duration as enter — keeps direct loads feeling identical to barba
  // entrances so view-specific afterEnter animations fire at the same relative point.
  async once(data: { next: { container: HTMLElement } }) {
    gsap.set([data.next.container, PERSISTENT_NAV], { opacity: 0 });
    await gsap.to([data.next.container, PERSISTENT_NAV], {
      opacity: 1,
      duration: 0.4,
      ease: 'power1.out',
    });
  },

  // ── Fade out leaving page ─────────────────────────────────────────────────────
  async leave(data: { current: { container: HTMLElement } }) {
    await gsap.to(data.current.container, {
      opacity: 0,
      duration: 0.35,
      ease: 'power1.in',
    });
  },

  // ── Prepare incoming page ─────────────────────────────────────────────────────
  // CSS rule already hides the container — gsap.set here is belt-and-suspenders.
  // Theme update intentionally omitted here: it moves to enter() so the color
  // change plays simultaneously with the content fade, not in the blank gap between.
  beforeEnter(data: { next: { container: HTMLElement; namespace: string } }) {
    resetInnerMainWrapper(data.next.container);
    gsap.set(data.next.container, { opacity: 0 });
  },

  // ── Fade in incoming page ─────────────────────────────────────────────────────
  // Theme update at the top of enter so the background color change is visually
  // absorbed by the simultaneous fade — not visible as an isolated background flash.
  async enter(data: { next: { container: HTMLElement; namespace: string } }) {
    updateBodyTheme(data.next.namespace);
    await gsap.to(data.next.container, {
      opacity: 1,
      duration: 0.4,
      ease: 'power1.out',
    });
  },
};
