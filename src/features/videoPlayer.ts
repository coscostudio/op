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

export const initPageVideoPlayers = (root: ParentNode = document) => {
  destroyManagedVideos(managedPageVideos);

  const videoElements = root.querySelectorAll<HTMLVideoElement>('video');

  videoElements.forEach((videoElement) => {
    if (isHomeManagedVideo(videoElement) || isWorkManagedVideo(videoElement)) return;

    const videoUrl = getVideoUrl(videoElement);
    if (!videoUrl) return;

    const controller = setupVideo(videoElement, videoUrl, managedPageVideos);
    playManagedVideo(controller);
  });
};

export const destroyPageVideoPlayers = () => {
  destroyManagedVideos(managedPageVideos);
};
