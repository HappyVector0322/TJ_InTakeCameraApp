/**
 * Image processing for Lic# and VIN# captures – aligned with job file app (99workflow/TJ_99glide).
 * Crops to overlay aspect ratio, enhances for OCR, resizes license only (not VIN).
 */

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Center-crop image to overlay aspect ratio (license 2:1, VIN 6:1).
 * Matches job file cropToOverlay center-based logic.
 */
function centerCropToAspectRatio(img, overlayType) {
  const aspectRatio = overlayType === 'license' ? 2 / 1 : 6 / 1; // width/height
  const imgRatio = img.width / img.height;
  let w, h;
  if (imgRatio > aspectRatio) {
    h = img.height;
    w = Math.round(h * aspectRatio);
  } else {
    w = img.width;
    h = Math.round(w / aspectRatio);
  }
  const x = Math.max(0, Math.floor((img.width - w) / 2));
  const y = Math.max(0, Math.floor((img.height - h) / 2));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/**
 * Contrast, brightness and sharpen. For VIN we use stronger contrast to improve OCR accuracy.
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @param {'license'|'vin'} [overlayType] - 'vin' uses higher contrast for character clarity
 */
function enhanceImage(img, overlayType) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrast = overlayType === 'vin' ? 1.35 : 1.2;
  const brightness = overlayType === 'vin' ? 0.05 : 0.1;
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      data[i + j] = Math.min(255, Math.max(0,
        (data[i + j] - 128) * contrast + 128 + brightness * 255
      ));
    }
  }
  const sharpened = applySharpenFilter(data, canvas.width, canvas.height);
  imageData.data.set(sharpened);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function applySharpenFilter(data, width, height) {
  const out = new Uint8ClampedArray(data);
  const kernel = [[0, -1, 0], [-1, 5, -1], [0, -1, 0]];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += data[((y + ky) * width + (x + kx)) * 4 + c] * kernel[ky + 1][kx + 1];
          }
        }
        out[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
      }
    }
  }
  return out;
}

/**
 * Resize so longest side is at most maxSize. Used for license only (job file does not resize VIN).
 */
function resizeMaxLongSide(img, maxSize) {
  if (img.width <= maxSize && img.height <= maxSize) return img;
  const scale = maxSize / Math.max(img.width, img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToDataURL(canvas, quality = 0.9) {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Process a captured image for OCR like the job file app:
 * - Center-crop to license (2:1) or VIN (6:1) overlay
 * - Enhance (contrast, sharpen)
 * - License only: resize to max 800 on longest side (matches job file handleResize before plate API)
 * - VIN: no resize (job file explicitly avoids resizing VIN to prevent horizontal compression)
 *
 * @param {string} dataUrl - Captured image as data URL
 * @param {'license'|'vin'} overlayType
 * @returns {Promise<string>} Processed image as data URL
 */
export async function processForOCR(dataUrl, overlayType) {
  try {
    const img = await loadImage(dataUrl);
    let processed = centerCropToAspectRatio(img, overlayType);
    processed = enhanceImage(processed, overlayType);
    if (overlayType === 'license') {
      processed = resizeMaxLongSide(processed, 800);
    }
    return canvasToDataURL(processed);
  } catch (err) {
    console.warn('Image processing failed, using original:', err);
    return dataUrl;
  }
}

/**
 * Process an already-cropped overlay image (e.g. from cropScreenshotToOverlay).
 * No center-crop – only enhance and optional resize for license. Used when green box
 * is rotated and we crop by DOM rect (same as 99workflow).
 */
export async function processCroppedForOCR(dataUrl, overlayType) {
  try {
    const img = await loadImage(dataUrl);
    let processed = enhanceImage(img, overlayType);
    if (overlayType === 'license') {
      processed = resizeMaxLongSide(processed, 800);
    }
    return canvasToDataURL(processed);
  } catch (err) {
    console.warn('Process cropped for OCR failed, using original:', err);
    return dataUrl;
  }
}

/**
 * Normalize cropped image orientation for OCR and confirm screen.
 * When the green box was rotated (e.g. -90°), the crop is a tall strip with content sideways;
 * rotate the image so text reads in the right direction (reduces OCR failures from upside-down/sideways).
 * @param {string} dataUrl - Cropped image data URL
 * @param {number} greenBoxRotationDeg - 0 or -90 (current overlay rotation)
 * @returns {Promise<string>} Image in correct reading direction
 */
export async function normalizeOrientationForOCR(dataUrl, greenBoxRotationDeg) {
  const rot = Number(greenBoxRotationDeg);
  if (!rot || rot === 0) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const w = img.width;
    const h = img.height;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (rot === -90) {
      canvas.width = h;
      canvas.height = w;
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    } else if (rot === 90) {
      canvas.width = h;
      canvas.height = w;
      ctx.translate(0, w);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    } else if (rot === 180 || rot === -180) {
      canvas.width = w;
      canvas.height = h;
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, w, h, -w, -h, w, h);
    } else {
      return dataUrl;
    }
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.warn('Orientation normalize failed, using original:', err);
    return dataUrl;
  }
}
