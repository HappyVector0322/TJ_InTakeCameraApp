import Tesseract from 'tesseract.js';

/**
 * Run OCR on an image (file or data URL).
 * Returns raw text; caller can parse for VIN, plate, odometer, etc.
 */
export async function extractTextFromImage(imageSource, onProgress) {
  const result = await Tesseract.recognize(imageSource, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
    },
  });
  return result.data.text?.trim() || '';
}

/**
 * Parse odometer reading from OCR text (dashboard images: "ODO 34672 km", "53193 km", "40697 km", etc.).
 * Prefer a digit sequence of 4–7 digits, optionally with "km" or "mi"; strip other text.
 */
export function parseOdometerText(text) {
  if (!text) return '';
  const t = text.trim();
  // Match "ODO 34672 km", "53193 km", "40697 km", "34672 km", "ODO 53193", etc.
  const withUnit = t.match(/(\d{4,7})\s*(km|mi|miles?|kilometers?)/i);
  if (withUnit) return `${withUnit[1]} ${withUnit[2].toLowerCase().replace(/s$/, '')}`.replace(/kilometers?/i, 'km').replace(/miles?/i, 'mi');
  const odoPrefix = t.match(/odo\s*[:\s]*(\d{4,7})/i);
  if (odoPrefix) return odoPrefix[1];
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(0, 7);
  return digits ? digits.slice(0, 7) : '';
}

export function parseVinFromText(text) {
  if (!text) return '';
  const upper = text.toUpperCase().replace(/\s/g, '');
  const vinMatch = upper.match(/[A-HJ-NPR-Z0-9]{17}/);
  return vinMatch ? vinMatch[0] : '';
}

export function parsePlateFromText(text) {
  if (!text) return '';
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line.replace(/\s/g, '').replace(/[^A-Za-z0-9]/g, '');
    if (cleaned.length >= 5 && cleaned.length <= 10) return cleaned;
  }
  return text.replace(/\s/g, '').slice(0, 10) || text.slice(0, 20);
}

export function parseCompanyOrDotMc(text) {
  if (!text) return '';
  return text.split(/\n/).map((s) => s.trim()).filter(Boolean).join(' ') || text.slice(0, 200);
}
