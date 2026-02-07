/**
 * Capture what the user sees in the video element (crop to displayed area).
 * Matches job file app (99workflow/TJ_99glide): supports rotation and zoom so
 * the captured image reflects the on-screen frame (zoom = center crop then scale).
 * @param {HTMLVideoElement} video
 * @param {number} rotationDeg - 0, 90, 180, or 270 (clockwise); output image is rotated to match UI.
 * @param {number} zoom - 1 = full frame; >1 = center crop (1/zoom) then scale to output size (captures zoomed view).
 */
export function captureCoveredScreenshot(video, rotationDeg = 0, zoom = 1) {
  return new Promise((resolve, reject) => {
    try {
      if (!video || !video.videoWidth) {
        reject(new Error('Video not ready'));
        return;
      }
      const videoAspectRatio = video.videoWidth / video.videoHeight;
      const displayWidth = video.clientWidth;
      const displayHeight = video.clientHeight;
      const displayAspectRatio = displayWidth / displayHeight;

      let sx, sy, sWidth, sHeight;

      if (videoAspectRatio > displayAspectRatio) {
        sHeight = video.videoHeight;
        sWidth = video.videoHeight * displayAspectRatio;
        sx = (video.videoWidth - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = video.videoWidth;
        sHeight = video.videoWidth / displayAspectRatio;
        sx = 0;
        sy = (video.videoHeight - sHeight) / 2;
      }

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = displayWidth;
      srcCanvas.height = displayHeight;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, displayWidth, displayHeight);

      // Apply zoom: crop center (1/zoom) of the display and draw to full size (matches job file behavior)
      let drawWidth = displayWidth;
      let drawHeight = displayHeight;
      let drawSrcX = 0;
      let drawSrcY = 0;
      let drawSrcW = displayWidth;
      let drawSrcH = displayHeight;
      if (zoom > 1) {
        const inv = 1 / zoom;
        drawSrcW = Math.max(1, Math.floor(displayWidth * inv));
        drawSrcH = Math.max(1, Math.floor(displayHeight * inv));
        drawSrcX = (displayWidth - drawSrcW) / 2;
        drawSrcY = (displayHeight - drawSrcH) / 2;
      }

      const rot = ((rotationDeg % 360) + 360) % 360;
      const canvas = document.createElement('canvas');
      if (rot === 90 || rot === 270) {
        canvas.width = displayHeight;
        canvas.height = displayWidth;
      } else {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.save();
      if (rot === 90) {
        ctx.translate(displayHeight, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(srcCanvas, drawSrcX, drawSrcY, drawSrcW, drawSrcH, 0, 0, drawWidth, drawHeight);
      } else if (rot === 180) {
        ctx.translate(displayWidth, displayHeight);
        ctx.rotate(Math.PI);
        ctx.drawImage(srcCanvas, drawSrcX, drawSrcY, drawSrcW, drawSrcH, -displayWidth, -displayHeight, displayWidth, displayHeight);
      } else if (rot === 270) {
        ctx.translate(displayHeight, 0);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(srcCanvas, drawSrcX, drawSrcY, drawSrcW, drawSrcH, -displayWidth, 0, drawWidth, drawHeight);
      } else {
        ctx.drawImage(srcCanvas, drawSrcX, drawSrcY, drawSrcW, drawSrcH, 0, 0, drawWidth, drawHeight);
      }
      ctx.restore();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Crop a screenshot to the overlay element's region (same approach as 99workflow EnhancedCamera).
 * Maps viewport coordinates (getBoundingClientRect) to screenshot coordinates.
 * When the green box is rotated, getBoundingClientRect returns the axis-aligned bounding box – we crop that exact region.
 * @param {string} screenshotDataUrl - Full screenshot from captureCoveredScreenshot(video, 0, zoom)
 * @param {HTMLVideoElement} video - Video element (screenshot is based on its clientWidth/Height)
 * @param {HTMLElement} overlayElement - The green frame overlay element
 * @param {number} zoom - Zoom level (screenshot shows center 1/zoom of the video)
 * @returns {Promise<string>} Cropped image as data URL
 */
export function cropScreenshotToOverlay(screenshotDataUrl, video, overlayElement, zoom = 1) {
  return new Promise((resolve, reject) => {
    if (!video || !overlayElement) {
      reject(new Error('Video and overlay element required'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const videoRect = video.getBoundingClientRect();
        const overlayRect = overlayElement.getBoundingClientRect();
        const sw = video.clientWidth || img.width;
        const sh = video.clientHeight || img.height;
        // Screenshot shows the center (1/zoom) of the video; map viewport overlay to screenshot pixels
        const zoomFactor = Math.max(1, Number(zoom) || 1);
        const visibleW = videoRect.width / zoomFactor;
        const visibleH = videoRect.height / zoomFactor;
        const viewportStartX = videoRect.left + (videoRect.width - visibleW) / 2;
        const viewportStartY = videoRect.top + (videoRect.height - visibleH) / 2;
        const scaleX = sw / visibleW;
        const scaleY = sh / visibleH;
        const x = (overlayRect.left - viewportStartX) * scaleX;
        const y = (overlayRect.top - viewportStartY) * scaleY;
        const w = overlayRect.width * scaleX;
        const h = overlayRect.height * scaleY;
        let sx = Math.max(0, Math.floor(x));
        let sy = Math.max(0, Math.floor(y));
        let cw = Math.min(img.width - sx, Math.max(1, Math.round(w)));
        let ch = Math.min(img.height - sy, Math.max(1, Math.round(h)));
        if (sx + cw > img.width) cw = img.width - sx;
        if (sy + ch > img.height) ch = img.height - sy;
        if (cw < 1 || ch < 1) {
          resolve(screenshotDataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = screenshotDataUrl;
  });
}

/**
 * Convert base64 data URL to Blob (for APIs that expect file upload).
 */
export function base64ToBlob(dataUrl, mimeType = 'image/jpeg') {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
