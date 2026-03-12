/**
 * License plate and VIN OCR.
 * License: PlateRecognizer if token set, else backend OpenAI Vision.
 * VIN: Backend POST /api/utility/detect-vin-image (OpenAI Vision).
 */
import axios from 'axios';
import { API_URI, PLATE_RECOGNIZER_API_TOKEN } from '../config';
import { base64ToBlob } from './captureCoveredScreenshot';

const PLATE_API_URL = 'https://api.platerecognizer.com/v1/plate-reader/';
const OCR_TIMEOUT_MS = 25000;
const base = () => (API_URI || '').replace(/\/$/, '');

async function licensePlateViaBackend(base64DataUrl) {
  if (!base()) return { licenseRegion: '', licensePlateNumber: '' };
  try {
    const { data } = await axios({
      method: 'POST',
      url: `${base()}/api/utility/detect-license-image`,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      data: { base64Image: base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64DataUrl}` },
      timeout: OCR_TIMEOUT_MS,
    });
    return {
      licenseRegion: data?.licenseRegion ?? '',
      licensePlateNumber: (data?.licensePlate ?? data?.licensePlateNumber ?? ''),
    };
  } catch (e) {
    console.warn('License OCR (backend) failed:', e?.message);
    return { licenseRegion: '', licensePlateNumber: '' };
  }
}

/**
 * Run license plate OCR. PlateRecognizer if token set, else backend OpenAI Vision.
 */
export async function licensePlateOCR(base64DataUrl) {
  if (PLATE_RECOGNIZER_API_TOKEN?.trim()) {
    try {
      const blob = base64ToBlob(base64DataUrl, 'image/jpeg');
      if (!blob) return await licensePlateViaBackend(base64DataUrl);
      const form = new FormData();
      form.append('upload', blob, 'image.jpg');
      form.append('regions', 'us');
      const { data } = await axios({
        url: PLATE_API_URL,
        method: 'POST',
        headers: { Authorization: `Token ${PLATE_RECOGNIZER_API_TOKEN}` },
        data: form,
        timeout: OCR_TIMEOUT_MS,
      });
      const results = data.results || [];
      // When multiple detections exist (e.g. plate + registration sticker), pick the one with
      // the largest bounding box — the actual plate is always physically bigger than any sticker.
      const boxArea = (r) => {
        const b = r?.box;
        if (!b) return 0;
        return Math.max(0, (b.xmax - b.xmin) * (b.ymax - b.ymin));
      };
      const best = results.length
        ? results.reduce((a, b) => (boxArea(b) > boxArea(a) ? b : a))
        : null;
      const plateNumber = best ? String(best.plate || '').toUpperCase() : '';
      const plateRegion = best ? String(best.region?.code || '').trim() : '';
      const regionParts = plateRegion.split('-');
      // Handle "us-IN" → "IN", or plain "IN" (2-letter state code)
      const plateState = regionParts.length >= 2
        ? String(regionParts[regionParts.length - 1]).toUpperCase()
        : (plateRegion.length === 2 ? plateRegion.toUpperCase() : '');
      if (plateNumber || plateState) {
        // If confidence is low OR plate ends with 1-2 letters after digits (likely a plate-type suffix
        // e.g. "97B675S" from Illinois "ST" marker), use OpenAI Vision as a second opinion.
        const score = best?.score ?? 1;
        // Trailing 1-2 letters after digits = likely plate-type suffix (e.g. "ST" on IL plates)
        const hasSuspiciousSuffix = /\d[A-Z]{1,2}$/.test(plateNumber);
        if ((score < 0.90 || hasSuspiciousSuffix) && base()) {
          try {
            const backendResult = await licensePlateViaBackend(base64DataUrl);
            if (backendResult?.licensePlateNumber) return backendResult;
          } catch {
            // fall through to PlateRecognizer result
          }
        }
        return { licenseRegion: plateState, licensePlateNumber: plateNumber };
      }
    } catch (error) {
      console.warn('License plate OCR (PlateRecognizer) failed, trying backend:', error?.message);
    }
  }
  return licensePlateViaBackend(base64DataUrl);
}

/**
 * Company name OCR. Backend OpenAI Vision first, else returns empty (caller can use Tesseract fallback).
 */
export async function companyNameOCR(base64DataUrl) {
  if (!base()) return null;
  try {
    const { data } = await axios({
      method: 'POST',
      url: `${base()}/api/utility/detect-company-name-image`,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      data: { base64Image: base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64DataUrl}` },
      timeout: OCR_TIMEOUT_MS,
    });
    const name = data?.companyName ?? '';
    return name ? String(name).trim() : null;
  } catch (e) {
    console.warn('Company OCR (backend) failed:', e?.message);
    return null;
  }
}

/**
 * Unit number OCR. Backend OpenAI Vision first, else returns empty (caller can use Tesseract fallback).
 */
export async function unitNumberOCR(base64DataUrl) {
  if (!base()) return null;
  try {
    const { data } = await axios({
      method: 'POST',
      url: `${base()}/api/utility/detect-unit-number-image`,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      data: { base64Image: base64DataUrl.startsWith('data:') ? base64DataUrl : `data:image/jpeg;base64,${base64DataUrl}` },
      timeout: OCR_TIMEOUT_MS,
    });
    const unitNumber = data?.unitNumber ?? '';
    return unitNumber ? String(unitNumber).trim() : null;
  } catch (e) {
    console.warn('Unit number OCR (backend) failed:', e?.message);
    return null;
  }
}

/**
 * Run VIN detection via backend (POST /api/utility/detect-vin-image, RapidAPI VIN Recognition).
 * Returns { vin, year, make, model } when successful; vin is normalized to 17-char string, YMM from vindecode.
 * Retries once on network/connection failure (e.g. CORS or unreachable host when testing from phone).
 */
export async function extractVINFromBase64(base64DataUrl) {
  if (!API_URI || !API_URI.trim()) {
    console.warn('VIN OCR: API_URI not set. Set REACT_APP_API_URI in .env to your backend (e.g. http://localhost:5000)');
    return null;
  }
  const base64Image = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  if (!base64Image || !base64Image.trim()) return null;

  const sendRequest = () =>
    axios({
      url: `${API_URI}/api/utility/detect-vin-image`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      data: { base64Image },
      timeout: OCR_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 500,
    });

  try {
    let res = await sendRequest();
    if (res.status !== 200 && (res.status === 0 || res.status === 404 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 800));
      res = await sendRequest();
    }
    if (res.status !== 200) {
      console.warn('VIN extraction failed:', res.status, res.data);
      return null;
    }
    const data = res.data || {};
    const vin = data.vin != null ? data.vin : data.data?.vin;
    const vinStr = vin ? String(vin).trim().toUpperCase() : null;
    if (!vinStr) return null;
    return {
      vin: vinStr,
      year: data.year != null ? data.year : data.data?.year ?? undefined,
      make: data.make ?? data.data?.make ?? undefined,
      model: data.model ?? data.data?.model ?? undefined,
    };
  } catch (error) {
    const isNetwork = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message?.includes('Network'));
    if (isNetwork) {
      try {
        await new Promise((r) => setTimeout(r, 800));
        const res = await sendRequest();
        if (res.status === 200) {
          const data = res.data || {};
          const vin = data.vin != null ? data.vin : data.data?.vin;
          const vinStr = vin ? String(vin).trim().toUpperCase() : null;
          if (!vinStr) return null;
          return {
            vin: vinStr,
            year: data.year != null ? data.year : data.data?.year ?? undefined,
            make: data.make ?? data.data?.make ?? undefined,
            model: data.model ?? data.data?.model ?? undefined,
          };
        }
      } catch (retryErr) {
        console.warn('VIN extraction retry failed:', retryErr?.message || retryErr);
      }
    }
    console.warn('VIN extraction failed:', error?.response?.data || error?.message || error);
    return null;
  }
}
