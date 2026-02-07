/**
 * DOT/MC and Odometer OCR for US trucks.
 * - DOT/MC: Plate Recognizer USDOT Cloud API (https://guides.platerecognizer.com/docs/other-apps/usdot/cloud/)
 *   if REACT_APP_USDOT_OCR_API_TOKEN set, else backend OpenAI Vision fallback.
 * - Odometer: Backend only — YOLOv9 (optional) + OpenAI Vision.
 */
import axios from 'axios';
import { API_URI, USDOT_OCR_API_TOKEN } from '../config';
import { base64ToBlob } from './captureCoveredScreenshot';

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
    return { dotOrMc: data?.dotOrMc ?? '' };
  } catch (e) {
    console.warn('DOT/MC OCR (backend) failed:', e?.message);
    return { dotOrMc: '' };
  }
}

/**
 * Run DOT# OCR via Plate Recognizer USDOT Cloud API.
 * @see https://guides.platerecognizer.com/docs/other-apps/usdot/cloud/
 * POST to usdot.parkpow.com/api/v1/predict/ with Authorization: Token <api_token>, FormData image.
 * If token not set or request fails, falls back to backend OpenAI Vision.
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
      const usdot = data?.USDOT ?? data?.usdot ?? data?.results?.[0]?.USDOT ?? data?.predictions?.[0]?.usdot;
      const mc = data?.MC ?? data?.mc ?? data?.results?.[0]?.MC ?? data?.predictions?.[0]?.mc;
      const value = (usdot && String(usdot).trim()) || (mc && String(mc).trim()) || '';
      if (value) return { dotOrMc: value };
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
 * POST /api/utility/odometer-ocr with { base64Image }. Returns odometer string (digits only, no unit).
 * onProgress is ignored (no client-side OCR).
 */
export async function odometerOCR(base64DataUrl, onProgress) {
  const base64 = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  if (!base64 || !base64.trim()) return '';

  const base = (API_URI || '').replace(/\/$/, '');
  if (!base) {
    console.warn('Odometer OCR: API_URI not set. Set REACT_APP_API_URI in .env to your backend.');
    return '';
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
    return stripOdometerUnit(value);
  } catch (e) {
    console.warn('Odometer OCR (backend) failed:', e?.response?.data || e?.message || e);
    return '';
  }
}
