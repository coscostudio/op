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
//
// Additional hover interactions:
//   list mode         → mouse-follow card showing the hovered item's media image
//   list-expanded mode → dim + blur siblings of the hovered .worklist-item
// ─────────────────────────────────────────────────────────────────────────────

export type WorkViewMode = 'list' | 'list-expanded' | 'grid';

const DURATION_FAST = 0.22;
const DURATION_MED = 0.4;
const DURATION_SLOW = 0.55;
const DURATION_EXPAND = 0.45;
const EASE_OUT = 'power2.out';
const EASE_IN = 'power2.in';
const EASE_INOUT = 'power2.inOut';

let currentMode: WorkViewMode = 'list';
let container: HTMLElement | null = null;
let cleanupFns: (() => void)[] = [];

// Saved computed border colors so we can tween back to them correctly
let itemBorderColor = '';
let listBorderColor = '';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function q<T extends HTMLElement>(sel: string): T[] {
  return container ? Array.from(container.querySelectorAll<T>(sel)) : [];
}

function qs<T extends HTMLElement>(sel: string): T | null {
  return container ? container.querySelector<T>(sel) : null;
}

function setActiveToggle(mode: WorkViewMode) {
  q<HTMLElement>('.view-toggle').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('viewTrigger') === mode);
  });
}

// ─── Border helpers ───────────────────────────────────────────────────────────
// Tween border color alpha rather than border width — gives a true fade.

function hideBorders(duration = DURATION_SLOW) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length)
    gsap.to(items, {
      borderBottomColor: 'rgba(0,0,0,0)',
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
    });
  if (list)
    gsap.to(list, {
      borderTopColor: 'rgba(0,0,0,0)',
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
    });
}

function showBorders(duration = DURATION_SLOW) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length) {
    gsap.to(items, {
      borderBottomColor: itemBorderColor,
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(items, { clearProps: 'borderBottomColor' });
      },
    });
  }
  if (list) {
    gsap.to(list, {
      borderTopColor: listBorderColor,
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(list!, { clearProps: 'borderTopColor' });
      },
    });
  }
}

// ─── Expand / Collapse worklist-expand panels ─────────────────────────────────

function expandWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) {
    onComplete?.();
    return;
  }
  gsap.killTweensOf(items);
  items.forEach((el) =>
    gsap.set(el, { display: 'flex', height: 0, opacity: 0, overflow: 'hidden' })
  );
  gsap.to(items, {
    height: 'auto',
    opacity: 1,
    duration: DURATION_EXPAND,
    ease: EASE_OUT,
    stagger: 0.04,
    overwrite: 'auto',
    onComplete,
    clearProps: 'height,overflow',
  });
}

function collapseWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) {
    onComplete?.();
    return;
  }
  gsap.killTweensOf(items);
  // Phase 1: fade out content while holding height
  gsap.to(items, {
    opacity: 0,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.02,
    overwrite: 'auto',
    onComplete: () => {
      // Phase 2: collapse height
      gsap.to(items, {
        height: 0,
        duration: DURATION_FAST,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(items, { display: 'none', clearProps: 'height,opacity,overflow' });
          onComplete?.();
        },
      });
    },
  });
}

// ─── Staggered exit helpers ───────────────────────────────────────────────────

function staggerExitListItems(onComplete: () => void) {
  const items = q<HTMLElement>('.worklist-item');
  if (!items.length) {
    onComplete();
    return;
  }
  gsap.to(items, {
    opacity: 0,
    y: -8,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.03,
    overwrite: 'auto',
    onComplete,
  });
}

function staggerExitGridItems(onComplete: () => void) {
  const items = q<HTMLElement>('.workgrid-item');
  if (!items.length) {
    onComplete();
    return;
  }
  gsap.to(items, {
    opacity: 0,
    y: -8,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.03,
    overwrite: 'auto',
    onComplete,
  });
}

// ─── Mode transitions ─────────────────────────────────────────────────────────

function toList(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const listItems = q<HTMLElement>('.worklist-item');

  if (from === 'grid') {
    showBorders();
    staggerExitGridItems(() => {
      gsap.to(workgrid, {
        opacity: 0,
        duration: DURATION_MED,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(workgrid, { display: 'none' });
          // Expand panels may be open from a prior list-expanded state — hide them before reveal
          gsap.killTweensOf(expandPanels);
          expandPanels.forEach((el) =>
            gsap.set(el, { display: 'none', opacity: 0, height: 0, clearProps: 'overflow' })
          );
          gsap.set(worklist, { display: 'block', opacity: 0 });
          gsap.set(listItems, { opacity: 0, y: 12 });
          gsap.to(worklist, {
            opacity: 1,
            duration: DURATION_MED,
            ease: EASE_OUT,
            overwrite: 'auto',
          });
          gsap.to(listItems, {
            opacity: 1,
            y: 0,
            duration: DURATION_MED,
            ease: EASE_OUT,
            stagger: 0.05,
            overwrite: 'auto',
          });
        },
      });
    });
  } else if (from === 'list-expanded') {
    // Collapse expand panels first, then restore borders — so borders don't reappear
    // until the rows have fully compacted
    collapseWorklistExpand(expandPanels, () => {
      showBorders();
    });
  }
}

function toListExpanded(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');

  if (from === 'grid') {
    staggerExitGridItems(() => {
      gsap.to(workgrid, {
        opacity: 0,
        duration: DURATION_MED,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(workgrid, { display: 'none' });
          // Pre-configure expand panels to be fully visible so the list enters already expanded
          gsap.killTweensOf(expandPanels);
          expandPanels.forEach((el) =>
            gsap.set(el, { display: 'flex', height: 'auto', opacity: 1, clearProps: 'overflow' })
          );
          gsap.set(worklist, { display: 'block', opacity: 0 });

          hideBorders(0); // Instantly hide borders

          const listItems = q<HTMLElement>('.worklist-item');
          gsap.set(listItems, { opacity: 0, y: 12 });

          gsap.to(worklist, {
            opacity: 1,
            duration: DURATION_MED,
            ease: EASE_OUT,
            overwrite: 'auto',
          });
          gsap.to(listItems, {
            opacity: 1,
            y: 0,
            duration: DURATION_MED,
            ease: EASE_OUT,
            stagger: 0.05,
            overwrite: 'auto',
          });
        },
      });
    });
  } else if (from === 'list') {
    // List items stay in place — just open panels and hide borders
    hideBorders();
    expandWorklistExpand(expandPanels);
  }
}

function toGrid() {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const gridItems = q<HTMLElement>('.workgrid-item');

  const showGrid = () => {
    gsap.set(workgrid, { display: 'block', opacity: 0 });
    gsap.set(gridItems, { opacity: 0, y: 16 });
    gsap.to(workgrid, { opacity: 1, duration: DURATION_MED, ease: EASE_OUT, overwrite: 'auto' });
    gsap.to(gridItems, {
      opacity: 1,
      y: 0,
      duration: DURATION_MED,
      ease: EASE_OUT,
      stagger: 0.06,
      delay: 0.1,
      overwrite: 'auto',
    });
  };

  // For both list and list-expanded: stagger-exit items as-is, no collapse step
  staggerExitListItems(() => {
    gsap.to(worklist, {
      opacity: 0,
      duration: DURATION_FAST,
      ease: EASE_IN,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(worklist, { display: 'none' });
        showGrid();
      },
    });
  });
}

// ─── Cursor card (list mode) ──────────────────────────────────────────────────
// A fixed div that follows the mouse, showing the hovered list item's media image.
// CSS required in Webflow .global-styles embed (see CLAUDE.md comments in initWorkView).

let cursorCard: HTMLDivElement | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cursorXTo: ((...args: any[]) => any) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cursorYTo: ((...args: any[]) => any) | null = null;

function initCursorCard() {
  cursorCard = document.createElement('div');
  cursorCard.className = 'worklist-cursor-card';
  gsap.set(cursorCard, { opacity: 0, scale: 0.9 });
  document.body.appendChild(cursorCard);
  cursorXTo = gsap.quickTo(cursorCard, 'x', { duration: 0.45, ease: 'power3' });
  cursorYTo = gsap.quickTo(cursorCard, 'y', { duration: 0.45, ease: 'power3' });
}

function destroyCursorCard() {
  cursorCard?.remove();
  cursorCard = null;
  cursorXTo = null;
  cursorYTo = null;
}

// ─── Expanded hover dimming (list-expanded mode) ──────────────────────────────

function dimSiblings(hovered: HTMLElement) {
  const all = q<HTMLElement>('.worklist-item');
  all.forEach((el) => {
    if (el === hovered) {
      gsap.to(el, {
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.25,
        ease: EASE_OUT,
        overwrite: 'auto',
      });
    } else {
      gsap.to(el, {
        opacity: 0.35,
        filter: 'blur(12px)',
        duration: 0.25,
        ease: EASE_OUT,
        overwrite: 'auto',
      });
    }
  });
}

function restoreAllItems() {
  const all = q<HTMLElement>('.worklist-item');
  gsap.to(all, {
    opacity: 1,
    filter: 'blur(0px)',
    duration: 0.3,
    ease: EASE_OUT,
    overwrite: 'auto',
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initWorkView(pageContainer: HTMLElement) {
  container = pageContainer;
  currentMode = 'list';

  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const listItems = q<HTMLElement>('.worklist-item');
  const wl = qs<HTMLElement>('.worklist');

  // Capture border colors before any GSAP manipulation so showBorders can tween back
  if (listItems.length) itemBorderColor = getComputedStyle(listItems[0]).borderBottomColor;
  if (wl) listBorderColor = getComputedStyle(wl).borderTopColor;

  // Ensure initial state
  if (worklist) gsap.set(worklist, { display: 'block', opacity: 1 });
  if (workgrid) gsap.set(workgrid, { display: 'none', opacity: 0 });
  expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));

  setActiveToggle('list');

  // Create cursor card (CSS for .worklist-cursor-card must be in Webflow global styles:
  //   .worklist-cursor-card { position:fixed; width:320px; height:220px; top:0; left:0;
  //     background-size:cover; background-position:center; border-radius:4px;
  //     pointer-events:none; z-index:100; will-change:transform,opacity; }
  // )
  initCursorCard();

  // ── Shared event handlers ──────────────────────────────────────────────────

  // Mouse tracking for cursor card — always active, card only shows in list mode
  const onMouseMove = (e: MouseEvent) => {
    cursorXTo?.(e.clientX);
    cursorYTo?.(e.clientY);
  };
  document.addEventListener('mousemove', onMouseMove);

  // Per-item hover handlers for both list and list-expanded interactions
  const itemHandlers: { el: HTMLElement; enter: () => void; leave: () => void }[] = [];

  listItems.forEach((item) => {
    const mediaItem = item.querySelector<HTMLElement>('.worklist-media-item');

    const onEnter = () => {
      if (currentMode === 'list') {
        // Show cursor card with this item's image
        const bg = mediaItem?.style.backgroundImage ?? '';
        if (cursorCard && bg && bg !== 'none') {
          cursorCard.style.backgroundImage = bg;
          gsap.to(cursorCard, {
            opacity: 1,
            scale: 1,
            duration: 0.3,
            ease: EASE_OUT,
            overwrite: 'auto',
          });
        }
      } else if (currentMode === 'list-expanded') {
        dimSiblings(item);
      }
    };

    const onLeave = () => {
      if (currentMode === 'list') {
        gsap.to(cursorCard, {
          opacity: 0,
          scale: 0.9,
          duration: 0.2,
          ease: EASE_IN,
          overwrite: 'auto',
        });
      }
      // list-expanded: restore happens on container mouseleave, not per-item
    };

    item.addEventListener('mouseenter', onEnter);
    item.addEventListener('mouseleave', onLeave);
    itemHandlers.push({ el: item, enter: onEnter, leave: onLeave });
  });

  // Restore state when mouse leaves the entire worklist container
  const worklistEl = qs<HTMLElement>('.component-worklist');
  const onWorklistLeave = () => {
    gsap.to(cursorCard, {
      opacity: 0,
      scale: 0.9,
      duration: 0.2,
      ease: EASE_IN,
      overwrite: 'auto',
    });
    if (currentMode === 'list-expanded') {
      restoreAllItems();
    }
  };
  worklistEl?.addEventListener('mouseleave', onWorklistLeave);

  // ── Toggle clicks ──────────────────────────────────────────────────────────

  const toggles = q<HTMLElement>('.view-toggle');
  const toggleHandlers: { el: HTMLElement; fn: (e: Event) => void }[] = [];

  toggles.forEach((toggle) => {
    const trigger = toggle.getAttribute('viewTrigger') as WorkViewMode | null;
    if (!trigger) return;

    const handler = (e: Event) => {
      e.preventDefault();
      if (trigger === currentMode) return;

      // Hide cursor card and restore items on any mode switch
      gsap.killTweensOf(cursorCard);
      gsap.to(cursorCard, {
        opacity: 0,
        scale: 0.9,
        duration: 0.15,
        ease: EASE_IN,
        overwrite: 'auto',
      });
      restoreAllItems();

      const from = currentMode;
      currentMode = trigger;
      setActiveToggle(trigger);

      if (trigger === 'list') toList(from);
      else if (trigger === 'list-expanded') toListExpanded(from);
      else if (trigger === 'grid') toGrid();
    };

    toggle.addEventListener('click', handler);
    toggleHandlers.push({ el: toggle, fn: handler });
  });

  // ── Cleanup registry ───────────────────────────────────────────────────────
  cleanupFns = [
    () => document.removeEventListener('mousemove', onMouseMove),
    ...itemHandlers.map(({ el, enter, leave }) => () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    }),
    () => worklistEl?.removeEventListener('mouseleave', onWorklistLeave),
    ...toggleHandlers.map(
      ({ el, fn }) =>
        () =>
          el.removeEventListener('click', fn)
    ),
  ];
}

export function destroyWorkView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  destroyCursorCard();
  container = null;
  currentMode = 'list';
  itemBorderColor = '';
  listBorderColor = '';
}
