import Hls from 'hls.js';

import { applyHlsQuality, HLS_QUALITY_CONFIG } from '$utils/hlsQuality';

import { waitForIntroFadeOut } from './introSequence';

type ManagedVideoController = {
  hls: Hls | null;
  videoElement: HTMLVideoElement;
  isReady: boolean;
  shouldPlayWhenReady: boolean;
  isPlaying: boolean;
};

const managedHomeVideos = new Map<HTMLVideoElement, ManagedVideoController>();
const managedPageVideos = new Map<HTMLVideoElement, ManagedVideoController>();

// Featured project cards only play while their media, heading, or a category bubble is hovered.
const FEATURED_CARD_SELECTOR = '.top-projects-card';
const FEATURED_HOVER_TARGETS = '.top-projects-media, .featured-card-heading, .category-bubble';
// Grace period so moving between sibling targets (across gaps) doesn't restart the video.
const FEATURED_HOVER_LEAVE_DELAY = 120;
// Video is hidden (thumbnail shows) until this class is set. Keep FADE in sync with the
// opacity transition in the .global-styles embed so pause/rewind happens after fade-out.
const FEATURED_PLAYING_CLASS = 'is-playing';
const FEATURED_FADE_DURATION = 250;
let featuredHoverCleanups: Array<() => void> = [];

const getVideoUrl = (videoElement: HTMLVideoElement) =>
  videoElement.getAttribute('data-src') || videoElement.currentSrc || videoElement.src || '';

const isHomeManagedVideo = (videoElement: HTMLVideoElement) =>
  Boolean(videoElement.closest('.home-project-card'));

const isWorkManagedVideo = (videoElement: HTMLVideoElement) =>
  Boolean(videoElement.closest('.work-media-embed'));

const prepareManagedVideo = (videoElement: HTMLVideoElement) => {
  videoElement.style.display = 'block';
  videoElement.muted = true;
  videoElement.autoplay = false;
  videoElement.loop = true;
  videoElement.playsInline = true;
  videoElement.preload = 'auto';
};

const resetVideoToStart = (videoElement: HTMLVideoElement) => {
  if (videoElement.readyState === 0) return;

  try {
    videoElement.currentTime = 0;
  } catch {
    // Some browsers can briefly reject currentTime writes before media is seekable.
  }
};

const playManagedVideo = (controller: ManagedVideoController) => {
  controller.shouldPlayWhenReady = true;

  if (!controller.isReady) {
    return;
  }

  resetVideoToStart(controller.videoElement);
  controller.isPlaying = true;
  controller.videoElement.play().catch((error) => {
    controller.isPlaying = false;
    console.error('Auto-play was prevented by the browser:', error);
  });
};

const pauseManagedVideo = (controller: ManagedVideoController) => {
  controller.shouldPlayWhenReady = false;

  if (controller.isPlaying || !controller.videoElement.paused) {
    controller.videoElement.pause();
  }

  resetVideoToStart(controller.videoElement);
  controller.isPlaying = false;
};

const setupVideo = (
  videoElement: HTMLVideoElement,
  videoUrl: string,
  registry: Map<HTMLVideoElement, ManagedVideoController>
) => {
  const existingController = registry.get(videoElement);
  if (existingController) {
    pauseManagedVideo(existingController);
    return existingController;
  }

  prepareManagedVideo(videoElement);

  const controller: ManagedVideoController = {
    hls: null,
    videoElement,
    isReady: false,
    shouldPlayWhenReady: false,
    isPlaying: false,
  };

  registry.set(videoElement, controller);

  const markReady = () => {
    controller.isReady = true;
    if (controller.shouldPlayWhenReady) {
      playManagedVideo(controller);
      return;
    }
    pauseManagedVideo(controller);
  };

  if (Hls.isSupported() && videoUrl.includes('.m3u8')) {
    const hls = new Hls({
      ...HLS_QUALITY_CONFIG,
      startPosition: -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });
    controller.hls = hls;
    applyHlsQuality(hls, videoElement);

    hls.loadSource(videoUrl);
    hls.attachMedia(videoElement);

    hls.on(Hls.Events.MANIFEST_PARSED, markReady);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error('Fatal network error encountered, try to recover');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error('Fatal media error encountered, try to recover');
            hls.recoverMediaError();
            break;
          default:
            console.error('Fatal error, cannot recover', data);
            hls.destroy();
            break;
        }
      }
    });
  } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS support (Safari)
    videoElement.src = videoUrl;
    videoElement.addEventListener('loadedmetadata', markReady, { once: true });
  } else {
    // Standard mp4/webm fallback
    videoElement.src = videoUrl;
    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      markReady();
    } else {
      videoElement.addEventListener('loadedmetadata', markReady, { once: true });
    }
  }

  return controller;
};

const destroyManagedVideos = (registry: Map<HTMLVideoElement, ManagedVideoController>) => {
  registry.forEach((controller) => {
    pauseManagedVideo(controller);
    controller.hls?.destroy();
  });

  registry.clear();
};

export const initVideoPlayers = () => {
  destroyManagedVideos(managedHomeVideos);
  installResumeListeners();

  const projectCards = document.querySelectorAll<HTMLElement>('.home-project-card');

  projectCards.forEach((card) => {
    const videoElement = card.querySelector<HTMLVideoElement>('video.project-media');

    if (!videoElement) return;

    const videoUrl = getVideoUrl(videoElement);

    if (!videoUrl) {
      videoElement.style.display = 'none';
      return;
    }

    setupVideo(videoElement, videoUrl, managedHomeVideos);
  });
};

export const syncHomeVideoPlayback = (
  videoElement: HTMLVideoElement | null,
  shouldPlay: boolean
) => {
  if (!videoElement) return;

  const controller = managedHomeVideos.get(videoElement);
  if (!controller) return;

  if (shouldPlay) {
    playManagedVideo(controller);
    return;
  }

  pauseManagedVideo(controller);
};

export const destroyHomeVideoPlayers = () => {
  destroyManagedVideos(managedHomeVideos);
};

// Reveal the video only once frames are rendering, so the thumbnail never flashes to black.
const bindFeaturedVideoReveal = (controller: ManagedVideoController) => {
  const { videoElement } = controller;

  const onPlaying = () => {
    if (controller.shouldPlayWhenReady) videoElement.classList.add(FEATURED_PLAYING_CLASS);
  };

  videoElement.addEventListener('playing', onPlaying);

  featuredHoverCleanups.push(() => {
    videoElement.removeEventListener('playing', onPlaying);
    videoElement.classList.remove(FEATURED_PLAYING_CLASS);
  });
};

const bindFeaturedCardHover = (card: HTMLElement, controller: ManagedVideoController) => {
  const targets = Array.from(card.querySelectorAll<HTMLElement>(FEATURED_HOVER_TARGETS));
  const { videoElement } = controller;
  // Tracked manually rather than via :hover — touch browsers leave :hover stuck after a tap.
  const activeTargets = new Set<EventTarget>();
  let leaveTimer: number | undefined;
  let pauseTimer: number | undefined;

  const start = () => {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(pauseTimer);

    // Re-entered during fade-out — video is still playing, just fade it back in.
    if (controller.shouldPlayWhenReady) {
      if (!videoElement.paused) videoElement.classList.add(FEATURED_PLAYING_CLASS);
      return;
    }

    playManagedVideo(controller);
  };

  const stop = () => {
    videoElement.classList.remove(FEATURED_PLAYING_CLASS);
    window.clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => pauseManagedVideo(controller), FEATURED_FADE_DURATION);
  };

  // Mouse: play while any target is hovered.
  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (event.currentTarget) activeTargets.add(event.currentTarget);
    start();
  };

  const onLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (event.currentTarget) activeTargets.delete(event.currentTarget);
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!activeTargets.size) stop();
    }, FEATURED_HOVER_LEAVE_DELAY);
  };

  // Touch/pen: pointerleave on lift is unreliable across mobile browsers, so mirror sticky
  // :hover instead — a touch on a target plays, a touch anywhere else stops.
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;

    const isOnTarget = targets.some((el) => el.contains(event.target as Node));
    if (isOnTarget) {
      start();
      return;
    }

    if (controller.shouldPlayWhenReady) stop();
  };

  targets.forEach((el) => {
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
  });
  document.addEventListener('pointerdown', onDocumentPointerDown, { capture: true, passive: true });

  featuredHoverCleanups.push(() => {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(pauseTimer);
    activeTargets.clear();
    targets.forEach((el) => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    });
    document.removeEventListener('pointerdown', onDocumentPointerDown, { capture: true });
  });
};

// ── Resume after the page was hidden (tab/app switch, phone lock) ─────────────
// Mobile browsers pause media while the page is in the background. Muted autoplay video
// usually resumes on its own, but video playing with sound stays paused on a frozen frame,
// and after a long absence the HLS stream can stall. On return, restart anything that should
// be playing; if the browser won't allow it with sound, fall back to muted so the picture
// never freezes (the sound toggle reflects that). If it still isn't moving shortly after,
// restart loading.
const RESUME_STALL_CHECK_MS = 1500;
let resumeListenersInstalled = false;

const playOrFallBackToMuted = (videoElement: HTMLVideoElement) => {
  videoElement.play().catch(() => {
    if (videoElement.muted) return;
    videoElement.muted = true;
    videoElement.play().catch(() => {});
  });
};

const resumeController = (controller: ManagedVideoController) => {
  if (!controller.shouldPlayWhenReady || !controller.isReady) return;
  const { videoElement } = controller;

  if (videoElement.paused) playOrFallBackToMuted(videoElement);

  const startTime = videoElement.currentTime;
  window.setTimeout(() => {
    if (document.hidden || !controller.shouldPlayWhenReady) return;
    if (!videoElement.paused && videoElement.currentTime !== startTime) return; // playing fine

    if (controller.hls) {
      controller.hls.recoverMediaError();
      controller.hls.startLoad(videoElement.currentTime);
    } else {
      videoElement.load();
    }
    playOrFallBackToMuted(videoElement);
  }, RESUME_STALL_CHECK_MS);
};

const resumeManagedVideos = () => {
  if (document.hidden) return;
  managedPageVideos.forEach(resumeController);
  managedHomeVideos.forEach(resumeController);
};

const installResumeListeners = () => {
  if (resumeListenersInstalled) return;
  resumeListenersInstalled = true;
  document.addEventListener('visibilitychange', resumeManagedVideos);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resumeManagedVideos();
  });
};

export const initPageVideoPlayers = (root: ParentNode = document) => {
  destroyPageVideoPlayers();
  installResumeListeners();

  const videoElements = root.querySelectorAll<HTMLVideoElement>('video');

  videoElements.forEach((videoElement) => {
    if (isHomeManagedVideo(videoElement) || isWorkManagedVideo(videoElement)) return;

    const videoUrl = getVideoUrl(videoElement);
    if (!videoUrl) return;

    const controller = setupVideo(videoElement, videoUrl, managedPageVideos);

    const featuredCard = videoElement.closest<HTMLElement>(FEATURED_CARD_SELECTOR);
    if (featuredCard) {
      bindFeaturedVideoReveal(controller);
      bindFeaturedCardHover(featuredCard, controller);
      return;
    }

    // Hard load: buffer behind the intro and start as it fades out. Barba navs: already resolved.
    waitForIntroFadeOut().then(() => {
      if (managedPageVideos.get(videoElement) === controller) playManagedVideo(controller);
    });
  });
};

// Non-standard per-browser hints for "does this media have an audio track".
type MediaWithAudioHints = HTMLVideoElement & {
  audioTracks?: { length: number }; // Safari
  mozHasAudio?: boolean; // Firefox
  webkitAudioDecodedByteCount?: number; // Chromium (grows once audio is decoded)
};

const AUDIO_CODEC_PATTERN = /mp4a|ac-3|ec-3|opus|vorbis|flac|mp3/i;

/**
 * Calls `onAudio` once if a managed page video turns out to contain an audio track.
 * Silent videos never fire. Returns a cleanup that stops watching.
 */
export const watchVideoAudio = (videoElement: HTMLVideoElement, onAudio: () => void) => {
  const cleanups: Array<() => void> = [];
  let done = false;

  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };

  const found = () => {
    if (done) return;
    done = true;
    cleanup();
    onAudio();
  };

  const hls = managedPageVideos.get(videoElement)?.hls;

  if (hls) {
    // Manifest CODECS (e.g. "avc1…,mp4a.40.2") — available before any media loads.
    if ((hls.levels ?? []).some((level) => level.audioCodec) || hls.audioTracks?.length) {
      found();
      return cleanup;
    }

    const onManifestParsed = (_event: unknown, data: { audio: boolean; altAudio: boolean }) => {
      if (data.audio || data.altAudio) found();
    };
    // Fallback for manifests that omit CODECS: inspect the first parsed segment.
    const onBufferCodecs = (
      _event: unknown,
      data: { audio?: unknown; audiovideo?: { codec?: string } }
    ) => {
      if (data.audio || AUDIO_CODEC_PATTERN.test(data.audiovideo?.codec ?? '')) found();
    };

    hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
    hls.on(Hls.Events.BUFFER_CODECS, onBufferCodecs);
    cleanups.push(() => {
      hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
      hls.off(Hls.Events.BUFFER_CODECS, onBufferCodecs);
    });
    return cleanup;
  }

  // Native playback (Safari HLS, mp4): no codec info, so read browser hints as media loads.
  const media = videoElement as MediaWithAudioHints;
  const check = () => {
    if (
      media.audioTracks?.length ||
      media.mozHasAudio ||
      (media.webkitAudioDecodedByteCount ?? 0) > 0
    ) {
      found();
    }
  };
  const events = ['loadedmetadata', 'playing', 'timeupdate'] as const;
  events.forEach((name) => videoElement.addEventListener(name, check));
  cleanups.push(() => events.forEach((name) => videoElement.removeEventListener(name, check)));
  check();

  return cleanup;
};

export const destroyPageVideoPlayers = () => {
  featuredHoverCleanups.forEach((cleanup) => cleanup());
  featuredHoverCleanups = [];
  destroyManagedVideos(managedPageVideos);
};
