/**
 * DOT/MC and Odometer OCR for US trucks.
 * - DOT/MC: Plate Recognizer USDOT Cloud API (https://guides.platerecognizer.com/docs/other-apps/usdot/cloud/)
 *   if REACT_APP_USDOT_OCR_API_TOKEN set, else backend OpenAI Vision fallback.
 * - Odometer: Backend only — YOLOv9 (optional) + OpenAI Vision.
 */
import axios from 'axios';
import { API_URI, USDOT_OCR_API_TOKEN } from '../config';
import { base64ToBlob } from './captureCoveredScreenshot';
import { parseDotAndMc } from './dotMcValidation';

/** Plate Recognizer USDOT Cloud API - POST with Authorization: Token <api_token>, FormData image */
const USDOT_API_URL = 'https://usdot.parkpow.com/api/v1/predict/';
const OCR_TIMEOUT_MS = 25000;
const base = () => (API_URI || '').replace(/\/$/, '');

async function dotMcViaBackend(base64DataUrl) {
  if (!base()) return { dotOrMc: '' };
  try {
    const { data } = await axios({
      method: 'POST',
      url: `${base()}/api/utility/detect-dot-mc-image`,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      data: { base64Image: base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64DataUrl}` },
      timeout: OCR_TIMEOUT_MS,
    });
    const dot = data?.dot ?? '';
    const mc = data?.mc ?? '';
    const dotOrMc = data?.dotOrMc ?? (dot || mc);
    return { dot, mc, dotOrMc };
  } catch (e) {
    console.warn('DOT/MC OCR (backend) failed:', e?.message);
    return { dotOrMc: '' };
  }
}

/**
 * Run DOT# OCR via Plate Recognizer USDOT Cloud API.
 * Returns { dot, mc, dotOrMc } — structured when both available, dotOrMc for backward compat.
 * DOT is preferred when both exist.
 * @see https://guides.platerecognizer.com/docs/other-apps/usdot/cloud/
 */
export async function dotMcOCR(base64DataUrl) {
  if (USDOT_OCR_API_TOKEN?.trim()) {
    try {
      const blob = base64ToBlob(base64DataUrl, 'image/jpeg');
      if (!blob) return await dotMcViaBackend(base64DataUrl);
      const form = new FormData();
      form.append('image', blob, 'image.jpg');
      const { data } = await axios({
        url: USDOT_API_URL,
        method: 'POST',
        headers: { Authorization: `Token ${USDOT_OCR_API_TOKEN}` },
        data: form,
        timeout: OCR_TIMEOUT_MS,
      });
      const usdotRaw = data?.USDOT ?? data?.usdot ?? data?.results?.[0]?.USDOT ?? data?.predictions?.[0]?.usdot;
      const mcRaw = data?.MC ?? data?.mc ?? data?.results?.[0]?.MC ?? data?.predictions?.[0]?.mc;
      const usdot = usdotRaw != null ? String(usdotRaw).trim().replace(/\D/g, '') : '';
      const mc = mcRaw != null ? String(mcRaw).trim().replace(/\D/g, '') : '';
      // When both returned separately, use structured; prefer DOT
      if (usdot && mc) {
        const dotVal = usdot.length === 7 ? usdot : usdot.slice(0, 7);
        return { dot: dotVal, mc: mc.slice(0, 7), dotOrMc: dotVal };
      }
      if (usdot) {
        // If usdot looks concatenated (e.g. 13 digits = DOT+MC), parse to extract both
        if (usdot.length > 7) {
          const parsed = parseDotAndMc(usdot);
          return { dot: parsed.dot, mc: parsed.mc, dotOrMc: parsed.preferredNum || usdot.slice(0, 7) };
        }
        return { dot: usdot, dotOrMc: usdot };
      }
      if (mc) return { mc: mc.slice(0, 7), dotOrMc: mc };
    } catch (error) {
      console.warn('USDOT OCR (Plate Recognizer) failed, trying backend:', error?.message);
    }
  }
  return dotMcViaBackend(base64DataUrl);
}

/** Strip km, mi, miles etc. from odometer string. Return only digits. */
function stripOdometerUnit(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\s*(km|mi|miles?|kilometers?)\s*$/gi, '')
    .replace(/[^\d,]/g, '')
    .replace(/,/g, '')
    .trim() || '';
}

/**
 * Run odometer OCR via backend only (YOLOv9 + OpenAI Vision). Client stays light.
 * POST /api/utility/odometer-ocr with { base64Image }.
 * Returns { odometer: string, croppedImage?: string }. croppedImage is raw base64 when backend returned it (YOLO crop succeeded), for showing in review.
 * onProgress is ignored (no client-side OCR).
 */
export async function odometerOCR(base64DataUrl, onProgress) {
  const base64 = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  if (!base64 || !base64.trim()) return { odometer: '' };

  const base = (API_URI || '').replace(/\/$/, '');
  if (!base) {
    console.warn('Odometer OCR: API_URI not set. Set REACT_APP_API_URI in .env to your backend.');
    return { odometer: '' };
  }

  try {
    const { data } = await axios({
      method: 'POST',
      url: `${base}/api/utility/odometer-ocr`,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      data: { base64Image: base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64}` },
      timeout: OCR_TIMEOUT_MS,
    });
    const value = data?.odometer != null ? String(data.odometer).trim() : '';
    const odometer = stripOdometerUnit(value);
    const croppedImage = data?.croppedImage && typeof data.croppedImage === 'string' ? data.croppedImage : undefined;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[odometerOCR] Response:', {
        hasOdometer: !!odometer,
        hasCroppedImage: !!croppedImage,
        croppedImageLength: croppedImage?.length || 0,
        fullResponse: data
      });
    }
    
    return { odometer, croppedImage };
  } catch (e) {
    console.warn('Odometer OCR (backend) failed:', e?.response?.data || e?.message || e);
    return { odometer: '' };
  }
}
