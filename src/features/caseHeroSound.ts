import gsap from 'gsap';

import { waitForIntroFadeOut } from './introSequence';
import { watchVideoAudio } from './videoPlayer';

/**
 * Mute / unmute switch for case study hero videos (Figma "sound-toggle").
 *
 * Webflow markup (toggle inside the hero, or beside it within .section_case-header):
 *   .component-case-header-top
 *     .case-hero-video > video.case-hero-video-bg
 *     [data-video-sound="toggle"]          ← pill wrapper
 *       [data-video-sound="indicator"]     ← sliding active background (absolute, behind buttons)
 *       [data-video-sound="mute"]          ← speaker-x button
 *       [data-video-sound="unmute"]        ← speaker button
 *
 * State classes set by JS:
 *   wrapper  .is-available  once the video is confirmed to contain an audio track (hide it until then)
 *   wrapper  .is-sound-on   while unmuted
 *   wrapper  .is-dragging   while the indicator is being dragged
 *   button   .is-active     on whichever of mute/unmute reflects the current state
 *
 * Interaction: click/tap either side, drag the indicator across, or use Enter/Space/arrow keys.
 *
 * Preference: turning sound on/off is remembered for the browser session (sessionStorage), and
 * re-applied on the next case page (or reload) whose video has audio. Restoring tries audible
 * playback at volume 0 and only fades up if the browser allows it; if autoplay-with-sound is
 * blocked (e.g. a reload with no prior interaction in Safari) it stays quietly muted and the
 * visitor can turn it back on with the toggle. Unrelated clicks never change the sound.
 */

const HERO_SELECTOR = '.component-case-header-top';
// The toggle may sit inside the hero or beside it in the header section (e.g. inside a
// 100svh wrapper that keeps it above mobile browser toolbars).
const HERO_SECTION_SELECTOR = '.section_case-header';
const VIDEO_SELECTOR = 'video.case-hero-video-bg';
const TOGGLE_SELECTOR = '[data-video-sound="toggle"]';
const INDICATOR_SELECTOR = '[data-video-sound="indicator"]';
const MUTE_SELECTOR = '[data-video-sound="mute"]';
const UNMUTE_SELECTOR = '[data-video-sound="unmute"]';
const AVAILABLE_CLASS = 'is-available';
const SOUND_ON_CLASS = 'is-sound-on';
const DRAGGING_CLASS = 'is-dragging';
const ACTIVE_CLASS = 'is-active';
const STORAGE_KEY = 'op:video-sound';
// Short fades that just take the click off the edges — longer ones read as lag.
const VOLUME_FADE_IN_DURATION = 0.35;
const VOLUME_FADE_IN_EASE = 'power1.out';
const VOLUME_FADE_OUT_DURATION = 0.3;
// Automatic restores fade in alongside the intro fade-out / page enter fade.
const VOLUME_RESTORE_FADE_DURATION = 0.6;
const VOLUME_FADE_OUT_EASE = 'power1.out';
// After an automatic (non-click) unmute, browsers that disallow audible playback let play()
// resolve and then pause the video a beat later. Watch this long for that pause.
const AUTOPLAY_VERIFY_MS = 1000;
const SLIDE_DURATION = 0.4;
const SLIDE_EASE = 'power3.out';
const DRAG_THRESHOLD_PX = 3;

let cleanups: Array<() => void> = [];

// ── Session preference ────────────────────────────────────────────────────────

const readSoundPref = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

const writeSoundPref = (on: boolean) => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode etc.) — preference just won't persist.
  }
};

const AUTOPLAY_PROBE_TIMEOUT_MS = 400;

/**
 * Asks the browser whether audible autoplay is allowed right now, without touching the video.
 * - Firefox: navigator.getAutoplayPolicy().
 * - Chrome/Safari: a new AudioContext is created 'suspended' and moves to 'running' a moment
 *   later only if audible playback is allowed (same autoplay policy as media elements). If it
 *   hasn't started within the timeout, treat it as blocked.
 * (navigator.userActivation isn't usable: Chrome allows sound on a same-origin reload after
 * prior interaction even though hasBeenActive is false in the new document.)
 */
const probeAudibleAutoplay = (video: HTMLVideoElement): Promise<boolean> => {
  const nav = navigator as Navigator & { getAutoplayPolicy?: (el: HTMLMediaElement) => string };
  try {
    if (nav.getAutoplayPolicy) return Promise.resolve(nav.getAutoplayPolicy(video) === 'allowed');
  } catch {
    // fall through to the AudioContext probe
  }

  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return Promise.resolve(false);

  return new Promise((resolve) => {
    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      resolve(false);
      return;
    }

    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      ctx.removeEventListener('statechange', onStateChange);
      const allowed = ctx.state === 'running';
      ctx.close().catch(() => {});
      resolve(allowed);
    };
    function onStateChange() {
      if (ctx.state === 'running') finish();
    }

    if (ctx.state === 'running') {
      finish();
      return;
    }
    ctx.addEventListener('statechange', onStateChange);
    timer = window.setTimeout(finish, AUTOPLAY_PROBE_TIMEOUT_MS);
  });
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ── Toggle ────────────────────────────────────────────────────────────────────

type Elements = {
  video: HTMLVideoElement;
  toggle: HTMLElement;
  indicator: HTMLElement | null;
  muteBtn: HTMLElement;
  unmuteBtn: HTMLElement;
};

const makeButtonAccessible = (el: HTMLElement, label: string) => {
  el.setAttribute('aria-label', label);
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
};

const bindHeroSound = ({ video, toggle, indicator, muteBtn, unmuteBtn }: Elements) => {
  let soundOn = false;
  let attemptId = 0;
  let stopVerify: (() => void) | null = null;
  let disposed = false;

  makeButtonAccessible(muteBtn, 'Mute video');
  makeButtonAccessible(unmuteBtn, 'Unmute video');

  // Indicator rests under the mute button at x=0; this is how far it travels to sit under unmute.
  const getTravel = () => unmuteBtn.offsetLeft - muteBtn.offsetLeft;
  const setIndicatorX = indicator ? gsap.quickSetter(indicator, 'x', 'px') : null;

  const render = (immediate = false) => {
    toggle.classList.toggle(SOUND_ON_CLASS, soundOn);
    muteBtn.classList.toggle(ACTIVE_CLASS, !soundOn);
    unmuteBtn.classList.toggle(ACTIVE_CLASS, soundOn);
    muteBtn.setAttribute('aria-pressed', String(!soundOn));
    unmuteBtn.setAttribute('aria-pressed', String(soundOn));

    if (!indicator) return;
    gsap.to(indicator, {
      x: soundOn ? getTravel() : 0,
      duration: immediate || prefersReducedMotion() ? 0 : SLIDE_DURATION,
      ease: SLIDE_EASE,
      overwrite: true,
    });
  };

  // ── Audio ──

  const fadeVolume = (to: number, duration: number, ease: string, onComplete?: () => void) =>
    gsap.to(video, { volume: to, duration, ease, overwrite: true, onComplete });

  /** Unmutes at volume 0 and resolves whether the browser actually allowed audible playback. */
  const startAudible = async () => {
    gsap.killTweensOf(video, 'volume');
    video.volume = 0;
    video.muted = false;
    try {
      await video.play();
      return !video.muted && !video.paused;
    } catch {
      // Blocked: browsers pause on a disallowed unmute — go back to silent playback.
      video.muted = true;
      video.volume = 1;
      video.play().catch(() => {});
      return false;
    }
  };

  /** Drop back to silent playback (the video must never be left paused/frozen). */
  const fallBackToMuted = () => {
    gsap.killTweensOf(video, 'volume');
    soundOn = false;
    video.muted = true;
    video.volume = 1;
    render();
    video.play().catch(() => {});
  };

  /** Catches the browser pausing an automatically unmuted video shortly after play() resolved. */
  const verifyAutoplay = (id: number) => {
    stopVerify?.();
    const onPause = () => {
      if (id === attemptId && !video.muted) fallBackToMuted();
    };
    const timer = window.setTimeout(() => stopVerify?.(), AUTOPLAY_VERIFY_MS);
    video.addEventListener('pause', onPause);
    stopVerify = () => {
      window.clearTimeout(timer);
      video.removeEventListener('pause', onPause);
      stopVerify = null;
    };
  };

  const turnSoundOn = async (fromUser: boolean) => {
    const id = (attemptId += 1);
    stopVerify?.();
    // A click gets instant visual feedback; an automatic restore only shows "on" once it worked.
    if (fromUser) {
      soundOn = true;
      render();
    }

    const allowed = await startAudible();
    if (id !== attemptId) return; // superseded by a later toggle

    if (!allowed) {
      soundOn = false;
      render();
      return;
    }

    if (!soundOn) {
      soundOn = true;
      render();
    }
    if (!fromUser) verifyAutoplay(id);
    fadeVolume(
      1,
      fromUser ? VOLUME_FADE_IN_DURATION : VOLUME_RESTORE_FADE_DURATION,
      VOLUME_FADE_IN_EASE
    );
  };

  const turnSoundOff = () => {
    attemptId += 1;
    stopVerify?.();
    soundOn = false;
    render();
    // iOS ignores .volume (always 1), so the mute at the end is what silences it there.
    fadeVolume(0, VOLUME_FADE_OUT_DURATION, VOLUME_FADE_OUT_EASE, () => {
      video.muted = true;
      video.volume = 1;
    });
  };

  const applySound = (on: boolean, fromUser: boolean) => {
    if (fromUser) writeSoundPref(on);

    if (on === soundOn) {
      render(); // re-snap the indicator (e.g. after a drag that ended on the same side)
      return;
    }

    if (on) void turnSoundOn(fromUser);
    else turnSoundOff();
  };

  // ── Restore session preference ──

  const restorePreference = async () => {
    if (!readSoundPref() || soundOn) return;
    const id = attemptId;
    await waitForIntroFadeOut(); // hard load: sound comes up with the page as the intro clears
    const allowed = await probeAudibleAutoplay(video);
    // Bail if the visitor toggled, or the page was torn down, while we were probing.
    if (disposed || id !== attemptId || soundOn || !readSoundPref()) return;
    // Blocked (e.g. reload with no prior interaction): leave the video playing muted. The
    // preference is kept, so the next case page restores it once the visitor has interacted.
    if (!allowed) return;
    applySound(true, false);
  };

  // ── Pointer: tap a side, or drag the indicator ──

  let drag: {
    pointerId: number;
    startClientX: number;
    startX: number;
    moved: boolean;
    target: 'mute' | 'unmute' | null;
  } | null = null;

  const getIndicatorX = () => (indicator ? Number(gsap.getProperty(indicator, 'x')) || 0 : 0);

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const side = (event.target as Element | null)?.closest(`${MUTE_SELECTOR}, ${UNMUTE_SELECTOR}`);

    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startX: getIndicatorX(),
      moved: false,
      target: side ? (side.matches(UNMUTE_SELECTOR) ? 'unmute' : 'mute') : null,
    };
    toggle.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId || !indicator || !setIndicatorX) return;
    const dx = event.clientX - drag.startClientX;

    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      toggle.classList.add(DRAGGING_CLASS);
      gsap.killTweensOf(indicator, 'x');
    }

    setIndicatorX(clamp(drag.startX + dx, 0, getTravel()));
  };

  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { moved, target } = drag;
    drag = null;
    toggle.classList.remove(DRAGGING_CLASS);
    if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);

    if (cancelled) {
      render();
      return;
    }

    if (moved) {
      applySound(getIndicatorX() > getTravel() / 2, true);
      return;
    }

    // Plain tap: the side that was tapped wins; tapping the pill padding flips it.
    applySound(target ? target === 'unmute' : !soundOn, true);
  };

  const onPointerUp = (event: PointerEvent) => endDrag(event, false);
  const onPointerCancel = (event: PointerEvent) => endDrag(event, true);

  // ── Keyboard ──

  const onKeyDown = (event: KeyboardEvent) => {
    const onUnmute = event.target === unmuteBtn;
    let next: boolean | null = null;

    if (event.key === 'Enter' || event.key === ' ') next = onUnmute;
    else if (event.key === 'ArrowRight') next = true;
    else if (event.key === 'ArrowLeft') next = false;
    if (next === null) return;

    event.preventDefault();
    applySound(next, true);
    (next ? unmuteBtn : muteBtn).focus();
  };

  // ── Wire up ──

  toggle.addEventListener('pointerdown', onPointerDown);
  toggle.addEventListener('pointermove', onPointerMove);
  toggle.addEventListener('pointerup', onPointerUp);
  toggle.addEventListener('pointercancel', onPointerCancel);
  muteBtn.addEventListener('keydown', onKeyDown);
  unmuteBtn.addEventListener('keydown', onKeyDown);

  // If something other than this toggle mutes the video (e.g. the browser refused to resume
  // it with sound after the page was in the background), show the toggle as muted. The
  // session preference is left as-is; one tap turns the sound back on.
  const onVolumeChange = () => {
    if (!soundOn || !video.muted) return;
    attemptId += 1;
    stopVerify?.();
    gsap.killTweensOf(video, 'volume');
    video.volume = 1;
    soundOn = false;
    render();
  };
  video.addEventListener('volumechange', onVolumeChange);

  render(true);
  toggle.classList.remove(AVAILABLE_CLASS);
  const stopWatching = watchVideoAudio(video, () => {
    toggle.classList.add(AVAILABLE_CLASS);
    void restorePreference();
  });

  cleanups.push(() => {
    disposed = true;
    video.removeEventListener('volumechange', onVolumeChange);
    stopWatching();
    stopVerify?.();
    attemptId += 1;
    toggle.removeEventListener('pointerdown', onPointerDown);
    toggle.removeEventListener('pointermove', onPointerMove);
    toggle.removeEventListener('pointerup', onPointerUp);
    toggle.removeEventListener('pointercancel', onPointerCancel);
    muteBtn.removeEventListener('keydown', onKeyDown);
    unmuteBtn.removeEventListener('keydown', onKeyDown);
    gsap.killTweensOf(video, 'volume');
    if (indicator) gsap.killTweensOf(indicator);
    video.muted = true;
    video.volume = 1;
    soundOn = false;
    drag = null;
    toggle.classList.remove(AVAILABLE_CLASS, DRAGGING_CLASS);
    render(true);
  });
};

export const initCaseHeroSound = (root: ParentNode = document) => {
  destroyCaseHeroSound();

  root.querySelectorAll<HTMLElement>(HERO_SELECTOR).forEach((hero) => {
    const video = hero.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    const scope = hero.closest<HTMLElement>(HERO_SECTION_SELECTOR) ?? hero;
    const toggle =
      hero.querySelector<HTMLElement>(TOGGLE_SELECTOR) ??
      scope.querySelector<HTMLElement>(TOGGLE_SELECTOR);
    const muteBtn = toggle?.querySelector<HTMLElement>(MUTE_SELECTOR);
    const unmuteBtn = toggle?.querySelector<HTMLElement>(UNMUTE_SELECTOR);
    if (!video || !toggle || !muteBtn || !unmuteBtn) return;

    const indicator = toggle.querySelector<HTMLElement>(INDICATOR_SELECTOR);
    bindHeroSound({ video, toggle, indicator, muteBtn, unmuteBtn });
  });
};

export const destroyCaseHeroSound = () => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
};
