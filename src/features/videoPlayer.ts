import Hls from 'hls.js';

export const initVideoPlayers = () => {
  const projectCards = document.querySelectorAll<HTMLElement>('.home-project-card');

  projectCards.forEach((card) => {
    const videoElement = card.querySelector<HTMLVideoElement>('video.project-media');

    if (!videoElement) return;

    // The video url could be in data-src (often used for lazy loading) or src
    const videoUrl = videoElement.getAttribute('data-src') || videoElement.src;

    if (!videoUrl) {
      // Hide the video element so the poster image on the wrapper shows through
      videoElement.style.display = 'none';
      return;
    }

    // Ensure video is visible if it has a URL
    videoElement.style.display = 'block';

    if (Hls.isSupported() && videoUrl.includes('.m3u8')) {
      const hls = new Hls({
        startPosition: -1, // start from live edge
        // Optional configuration for better performance with looping background videos
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

      // Handle errors gracefully
      hls.on(Hls.Events.ERROR, (event, data) => {
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
      // It's likely a standard mp4 or webm file, fallback to normal video playback
      videoElement.src = videoUrl;
      videoElement.play().catch((error) => {
        console.error('Auto-play was prevented by the browser:', error);
      });
    }
  });
};
