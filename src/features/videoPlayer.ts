import Hls from 'hls.js';

const setupVideo = (videoElement: HTMLVideoElement, videoUrl: string) => {
  videoElement.style.display = 'block';

  if (Hls.isSupported() && videoUrl.includes('.m3u8')) {
    const hls = new Hls({
      startPosition: -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });

    hls.loadSource(videoUrl);
    hls.attachMedia(videoElement);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoElement.play().catch((error) => {
        console.error('Auto-play was prevented by the browser:', error);
      });
    });

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
    videoElement.addEventListener('loadedmetadata', () => {
      videoElement.play().catch((error) => {
        console.error('Auto-play was prevented by the browser:', error);
      });
    });
  } else {
    // Standard mp4/webm fallback
    videoElement.src = videoUrl;
    videoElement.play().catch((error) => {
      console.error('Auto-play was prevented by the browser:', error);
    });
  }
};

export const initVideoPlayers = () => {
  const projectCards = document.querySelectorAll<HTMLElement>('.home-project-card');

  projectCards.forEach((card) => {
    const videoElement = card.querySelector<HTMLVideoElement>('video.project-media');

    if (!videoElement) return;

    const videoUrl = videoElement.getAttribute('data-src') || videoElement.src;

    if (!videoUrl) {
      videoElement.style.display = 'none';
      return;
    }

    setupVideo(videoElement, videoUrl);
  });
};

export const initAboutVideo = () => {
  const videoElement = document.querySelector<HTMLVideoElement>('video.about-video');
  if (!videoElement) return;

  const videoUrl = videoElement.getAttribute('data-src') || videoElement.src;
  if (!videoUrl) return;

  setupVideo(videoElement, videoUrl);
};
