import Hls, { type HlsConfig } from 'hls.js';

/**
 * Shared hls.js quality settings for every HLS video on the site.
 *
 * Problem: hls.js picks the first rendition from a default 0.5 Mbps bandwidth guess, so videos
 * opened on 240p/360p and only stepped up once real throughput was measured. Our videos are short
 * loops (often 3–8 four-second segments) and hls.js never re-fetches segments it already has
 * buffered, so every loop replayed that blurry opening segment.
 *
 * Fix: start from a realistic estimate so the very first segment is already ~1080p (the manifests
 * advertise peak bitrates up to ~8 Mbps for 1080p, and hls.js only picks a level when the estimate
 * comfortably clears it). Real throughput is measured after the first segment, so slow connections
 * still adapt down for later segments. Renditions above 1080p are dropped, and on-screen videos are
 * capped to what they actually need to cover their element (see `capToElementSize`).
 *
 * (Re-fetching a low-quality opening on loop was tried and dropped: flushing the buffer at the
 * loop point caused stalls and gaps.)
 */

const START_BANDWIDTH_ESTIMATE_BPS = 12_000_000;
const DEFAULT_MAX_HEIGHT = 1080;
const MAX_DPR = 2;
// Accept a rendition within 10% of the ideal width rather than jumping a whole level up.
const SIZE_TOLERANCE = 0.9;

export const HLS_QUALITY_CONFIG: Partial<HlsConfig> = {
  abrEwmaDefaultEstimate: START_BANDWIDTH_ESTIMATE_BPS,
};

type HlsQualityOptions = {
  /** Highest rendition height to keep (default 1080). */
  maxHeight?: number;
  /**
   * Cap quality to what's needed to cover the video element (object-fit: cover). Disable for
   * videos without a stable on-screen size (WebGL textures, the intro's growing circle).
   */
  matchElementSize?: boolean;
};

/**
 * Drops renditions above `maxHeight` and (optionally) caps ABR to the element's covered size.
 *
 * hls.js' own `capLevelToPlayerSize` picks the first rendition that is wide *or* tall enough,
 * which badly under-picks for cropped (object-fit: cover) video — e.g. a 402×938 portrait phone
 * hero would be capped to 480p because 854px is "wide enough". Here the required width is the
 * width the video is scaled to when covering the box: max(boxW, boxH × aspect) × DPR.
 */
export const applyHlsQuality = (
  hls: Hls,
  video: HTMLVideoElement,
  { maxHeight = DEFAULT_MAX_HEIGHT, matchElementSize = true }: HlsQualityOptions = {}
) => {
  const capToElementSize = () => {
    const { levels } = hls;
    const boxW = video.clientWidth;
    const boxH = video.clientHeight;
    if (!levels.length || !boxW || !boxH) {
      hls.autoLevelCapping = -1;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let cap = levels.length - 1;
    for (let i = 0; i < levels.length; i += 1) {
      const { width, height } = levels[i];
      if (!width || !height) continue;
      const neededWidth = Math.max(boxW, boxH * (width / height)) * dpr;
      if (width >= neededWidth * SIZE_TOLERANCE) {
        cap = i;
        break;
      }
    }
    hls.autoLevelCapping = cap;
  };

  let rafId = 0;
  const onResize = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      capToElementSize();
    });
  };

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    const hasAllowedLevel = hls.levels.some((level) => level.height && level.height <= maxHeight);
    if (hasAllowedLevel) {
      // Remove from the top so indices of the remaining (lower) levels don't shift.
      for (let i = hls.levels.length - 1; i >= 0; i -= 1) {
        const { height } = hls.levels[i];
        if (height && height > maxHeight) hls.removeLevel(i);
      }
    }
    if (matchElementSize) capToElementSize();
  });

  if (matchElementSize) {
    window.addEventListener('resize', onResize);
    hls.once(Hls.Events.DESTROYING, () => {
      window.removeEventListener('resize', onResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    });
  }
};
