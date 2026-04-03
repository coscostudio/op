import gsap from 'gsap';

// ─────────────────────────────────────────────────────────────────────────────
// Work View Mode Switcher
//
// Manages three view modes on the Work page, driven by [viewTrigger] buttons:
//   'list'          → component-worklist visible, worklist-expand collapsed
//   'list-expanded' → component-worklist visible, worklist-expand open, no borders
//   'grid'          → component-workgrid visible, component-worklist hidden
//
// The "active" visual state is a combo class `is-active` on .view-toggle,
// which matches the :active (pressed) color: #171717.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkViewMode = 'list' | 'list-expanded' | 'grid';

const DURATION_FAST = 0.25;
const DURATION_MED = 0.4;
const DURATION_EXPAND = 0.45;
const EASE_OUT = 'power2.out';
const EASE_IN = 'power2.in';
const EASE_INOUT = 'power2.inOut';

let currentMode: WorkViewMode = 'list';
let container: HTMLElement | null = null;
let cleanupFns: (() => void)[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function q<T extends HTMLElement>(sel: string): T[] {
  return container ? Array.from(container.querySelectorAll<T>(sel)) : [];
}

function qs<T extends HTMLElement>(sel: string): T | null {
  return container ? container.querySelector<T>(sel) : null;
}

function setActiveToggle(mode: WorkViewMode) {
  const toggles = q<HTMLElement>('.view-toggle');
  toggles.forEach((el) => {
    const trigger = el.getAttribute('viewTrigger');
    if (trigger === mode) {
      el.classList.add('is-active');
    } else {
      el.classList.remove('is-active');
    }
  });
}

// ─── Expand / Collapse worklist-expand panels ─────────────────────────────────

function expandWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) { onComplete?.(); return; }

  // Set display first so elements are in flow, then tween height 0 → auto.
  // GSAP 3.2+ supports height:'auto' as a destination — it measures natural
  // height before tweening, so this correctly animates from 0 to full height.
  items.forEach((el) => {
    gsap.set(el, { display: 'flex', height: 0, opacity: 0, overflow: 'hidden' });
  });

  gsap.to(items, {
    height: 'auto',
    opacity: 1,
    duration: DURATION_EXPAND,
    ease: EASE_OUT,
    stagger: 0.04,
    onComplete,
    clearProps: 'height,overflow',
  });
}

function collapseWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) { onComplete?.(); return; }

  gsap.to(items, {
    height: 0,
    opacity: 0,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.02,
    onComplete: () => {
      gsap.set(items, { display: 'none', clearProps: 'height,opacity,overflow' });
      onComplete?.();
    },
  });
}

// ─── Border helpers ───────────────────────────────────────────────────────────

function hideBorders(duration = DURATION_MED) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length) gsap.to(items, { borderBottomWidth: 0, duration, ease: EASE_INOUT });
  if (list) gsap.to(list, { borderTopWidth: 0, duration, ease: EASE_INOUT });
}

function showBorders(duration = DURATION_MED) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length) gsap.to(items, { borderBottomWidth: '1px', duration, ease: EASE_INOUT });
  if (list) gsap.to(list, { borderTopWidth: '1px', duration, ease: EASE_INOUT });
}

// ─── Mode transitions ─────────────────────────────────────────────────────────

function toList(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const listItems = q<HTMLElement>('.worklist-item');

  if (from === 'grid') {
    // Fade out grid, then fade in worklist with item stagger
    gsap.to(workgrid, {
      opacity: 0,
      duration: DURATION_MED,
      ease: EASE_IN,
      onComplete: () => {
        gsap.set(workgrid, { display: 'none' });
        gsap.set(worklist, { display: 'block', opacity: 0 });
        gsap.to(worklist, { opacity: 1, duration: DURATION_MED, ease: EASE_OUT });

        // Stagger list items in
        gsap.from(listItems, {
          opacity: 0,
          y: 12,
          duration: DURATION_MED,
          ease: EASE_OUT,
          stagger: 0.05,
        });
      },
    });
  } else if (from === 'list-expanded') {
    // Collapse expand panels and restore borders simultaneously
    collapseWorklistExpand(expandPanels);
    showBorders();
  }
}

function toListExpanded(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');

  if (from === 'grid') {
    // Fade out grid, bring in worklist, then open expand panels
    gsap.to(workgrid, {
      opacity: 0,
      duration: DURATION_MED,
      ease: EASE_IN,
      onComplete: () => {
        gsap.set(workgrid, { display: 'none' });
        gsap.set(worklist, { display: 'block', opacity: 0 });
        gsap.to(worklist, {
          opacity: 1,
          duration: DURATION_MED,
          ease: EASE_OUT,
          onComplete: () => {
            hideBorders();
            expandWorklistExpand(expandPanels);
          },
        });
      },
    });
  } else if (from === 'list') {
    // Just open panels and hide borders
    hideBorders();
    expandWorklistExpand(expandPanels);
  }
}

function toGrid(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const gridItems = q<HTMLElement>('.workgrid-item');

  const showGrid = () => {
    gsap.set(workgrid, { display: 'block', opacity: 0 });
    gsap.set(gridItems, { opacity: 0, y: 16 });
    gsap.to(workgrid, { opacity: 1, duration: DURATION_MED, ease: EASE_OUT });
    gsap.to(gridItems, {
      opacity: 1,
      y: 0,
      duration: DURATION_MED,
      ease: EASE_OUT,
      stagger: 0.06,
      delay: 0.1,
    });
  };

  if (from === 'list-expanded') {
    // Collapse panels first, then fade out worklist
    collapseWorklistExpand(expandPanels, () => {
      gsap.to(worklist, {
        opacity: 0,
        duration: DURATION_FAST,
        ease: EASE_IN,
        onComplete: () => {
          gsap.set(worklist, { display: 'none' });
          showGrid();
        },
      });
    });
  } else {
    // from 'list' — just crossfade
    gsap.to(worklist, {
      opacity: 0,
      duration: DURATION_FAST,
      ease: EASE_IN,
      onComplete: () => {
        gsap.set(worklist, { display: 'none' });
        showGrid();
      },
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initWorkView(pageContainer: HTMLElement) {
  container = pageContainer;
  currentMode = 'list';

  // Ensure initial state: worklist visible, workgrid hidden, expand panels hidden
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');

  if (worklist) gsap.set(worklist, { display: 'block', opacity: 1 });
  if (workgrid) gsap.set(workgrid, { display: 'none', opacity: 0 });
  expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));

  setActiveToggle('list');

  // Wire up toggle clicks
  const toggles = q<HTMLElement>('.view-toggle');
  const handlers: { el: HTMLElement; fn: (e: Event) => void }[] = [];

  toggles.forEach((toggle) => {
    const trigger = toggle.getAttribute('viewTrigger') as WorkViewMode | null;
    if (!trigger) return;

    const handler = (e: Event) => {
      e.preventDefault();
      if (trigger === currentMode) return;

      const from = currentMode;
      currentMode = trigger;
      setActiveToggle(trigger);

      if (trigger === 'list') toList(from);
      else if (trigger === 'list-expanded') toListExpanded(from);
      else if (trigger === 'grid') toGrid(from);
    };

    toggle.addEventListener('click', handler);
    handlers.push({ el: toggle, fn: handler });
  });

  cleanupFns = handlers.map(({ el, fn }) => () => el.removeEventListener('click', fn));
}

export function destroyWorkView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  container = null;
  currentMode = 'list';
}
