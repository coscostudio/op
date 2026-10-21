import Hls from 'hls.js';

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
      startPosition: -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });
    controller.hls = hls;

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
  let leaveTimer: number | undefined;
  let pauseTimer: number | undefined;

  const onEnter = () => {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(pauseTimer);

    // Re-entered during fade-out — video is still playing, just fade it back in.
    if (controller.shouldPlayWhenReady) {
      if (!videoElement.paused) videoElement.classList.add(FEATURED_PLAYING_CLASS);
      return;
    }

    playManagedVideo(controller);
  };

  const onLeave = () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (targets.some((el) => el.matches(':hover'))) return;

      videoElement.classList.remove(FEATURED_PLAYING_CLASS);
      pauseTimer = window.setTimeout(() => pauseManagedVideo(controller), FEATURED_FADE_DURATION);
    }, FEATURED_HOVER_LEAVE_DELAY);
  };

  targets.forEach((el) => {
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
  });

  featuredHoverCleanups.push(() => {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(pauseTimer);
    targets.forEach((el) => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    });
  });
};

export const initPageVideoPlayers = (root: ParentNode = document) => {
  destroyPageVideoPlayers();

  const videoElements = root.querySelectorAll<HTMLVideoElement>('video');
  const canHover = window.matchMedia('(hover: hover)').matches;

  videoElements.forEach((videoElement) => {
    if (isHomeManagedVideo(videoElement) || isWorkManagedVideo(videoElement)) return;

    const videoUrl = getVideoUrl(videoElement);
    if (!videoUrl) return;

    const controller = setupVideo(videoElement, videoUrl, managedPageVideos);

    // Touch devices have no hover, so featured cards keep autoplaying there.
    const featuredCard = videoElement.closest<HTMLElement>(FEATURED_CARD_SELECTOR);
    if (featuredCard) bindFeaturedVideoReveal(controller);
    if (featuredCard && canHover) {
      bindFeaturedCardHover(featuredCard, controller);
      return;
    }

    playManagedVideo(controller);
  });
};

export const destroyPageVideoPlayers = () => {
  featuredHoverCleanups.forEach((cleanup) => cleanup());
  featuredHoverCleanups = [];
  destroyManagedVideos(managedPageVideos);
};
