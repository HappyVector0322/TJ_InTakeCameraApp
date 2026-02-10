/**
 * DOT/MC parsing and validation for Intake Camera.
 * - US DOT#: 7 numerical characters.
 * - MC#: 5–7 numerical characters.
 * Smarter extraction: use label context ("US DOT 3916245", "MC 1447165") to extract type and number correctly.
 */

/** US DOT numbers are 7 digits. MC numbers are typically 5–7 digits. */
const DOT_LENGTH = 7;
const MC_MIN_LENGTH = 5;
const MC_MAX_LENGTH = 7;

/** Regex: DOT label followed by 6-8 digits (allows OCR errors), capture digits */
const DOT_LABEL_REGEX = /(?:US\s*)?DOT\s*[#:]?\s*(\d{6,8})\b/gi;
/** Regex: MC label followed by 5-8 digits */
const MC_LABEL_REGEX = /\bMC\s*[#:]?\s*(\d{5,8})\b/gi;

function normalizeDot(num) {
  const d = (num || '').replace(/\D/g, '');
  if (d.length === DOT_LENGTH) return d;
  if (d.length > DOT_LENGTH) return d.slice(0, DOT_LENGTH);
  return d.length >= 6 ? d : '';
}

function normalizeMc(num) {
  const d = (num || '').replace(/\D/g, '');
  if (d.length >= MC_MIN_LENGTH && d.length <= MC_MAX_LENGTH) return d;
  if (d.length > MC_MAX_LENGTH) return d.slice(0, MC_MAX_LENGTH);
  return '';
}

/**
 * Parse both DOT and MC from raw text using label context.
 * Extracts type and number exactly: DOT 3916245, MC 1447165.
 * When both found, prefers DOT (primary carrier identifier).
 * @param {string} raw - Raw OCR text (e.g. "MILES X LLC US DOT 3916245 MC 1447165" or "39162451447165")
 * @returns {{ dot?: string, mc?: string, preferredType: 'dot'|'mc', preferredNum: string }}
 */
export function parseDotAndMc(raw) {
  if (!raw || typeof raw !== 'string') return { preferredType: 'dot', preferredNum: '' };
  const text = raw.trim();

  let dot = '';
  let mc = '';

  // 1. Label-based extraction (most reliable when labels present)
  const dotMatch = text.match(DOT_LABEL_REGEX);
  if (dotMatch) {
    const m = dotMatch[0].match(/(\d{6,8})/);
    if (m) dot = normalizeDot(m[1]);
  }
  const mcMatch = text.match(MC_LABEL_REGEX);
  if (mcMatch) {
    const m = mcMatch[0].match(/(\d{5,8})/);
    if (m) mc = normalizeMc(m[1]);
  }

  // 2. If both found via labels, prefer DOT
  if (dot) {
    return { dot, mc: mc || undefined, preferredType: 'dot', preferredNum: dot };
  }
  if (mc) {
    return { mc, preferredType: 'mc', preferredNum: mc };
  }

  // 3. Fallback: digits-only or concatenated (e.g. "39162451447165")
  const parsed = parseDotMcFromOcr(text);
  return {
    dot: parsed.dot,
    mc: parsed.mc,
    preferredType: parsed.preferred,
    preferredNum: parsed.preferredNum || '',
  };
}

/**
 * Extract only the US DOT number (convenience wrapper).
 * Uses parseDotAndMc internally.
 */
export function extractDotOnly(raw) {
  const parsed = parseDotAndMc(raw);
  return parsed.dot || (parsed.preferredType === 'dot' ? parsed.preferredNum : '') || '';
}

/**
 * Parse raw OCR value that may be DOT+MC concatenated.
 * E.g. "39162451447165" (13 digits) → { dot: "3916245", mc: "1447165", preferred: "dot" }
 * If value is valid single DOT (7 digits) or MC (5–7 digits), return that.
 * @param {string} raw - Raw string from OCR (digits only or mixed)
 * @returns {{ dot?: string, mc?: string, preferred: 'dot'|'mc', preferredNum: string }}
 */
export function parseDotMcFromOcr(raw) {
  const digits = (raw || '').replace(/\D/g, '').trim();
  if (!digits) return { preferred: 'dot', preferredNum: '' };

  // Single valid DOT (7 digits)
  if (digits.length === DOT_LENGTH) {
    return { dot: digits, preferred: 'dot', preferredNum: digits };
  }

  // Single valid MC (5–7 digits)
  if (digits.length >= MC_MIN_LENGTH && digits.length <= MC_MAX_LENGTH) {
    return { mc: digits, preferred: 'mc', preferredNum: digits };
  }

  // Likely DOT (7) + MC (6): 13 digits total
  if (digits.length === 13) {
    const dot = digits.slice(0, DOT_LENGTH);
    const mc = digits.slice(DOT_LENGTH);
    return { dot, mc, preferred: 'dot', preferredNum: dot };
  }

  // 12 digits: could be 6+6 (MC+MC) or 7+5 - assume 7+5 (DOT+MC)
  if (digits.length === 12) {
    const dot = digits.slice(0, DOT_LENGTH);
    const mc = digits.slice(DOT_LENGTH);
    return { dot, mc, preferred: 'dot', preferredNum: dot };
  }

  // 14 digits: 7+7 (DOT+longer MC or DOT+DOT) - take first 7 as DOT
  if (digits.length >= 12 && digits.length <= 15) {
    const dot = digits.slice(0, DOT_LENGTH);
    const rest = digits.slice(DOT_LENGTH);
    return { dot, mc: rest || undefined, preferred: 'dot', preferredNum: dot };
  }

  // Fallback: return raw digits truncated
  return {
    preferred: 'dot',
    preferredNum: digits.length > DOT_LENGTH ? digits.slice(0, DOT_LENGTH) : digits,
  };
}

/**
 * Validate carrier ID number against type (DOT, MC, CA).
 * @param {string} type - 'dot' | 'mc' | 'ca'
 * @param {string} num - The number to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCarrierId(type, num) {
  const n = (num || '').trim();
  if (!n) return { valid: true }; // Empty is ok; user can fill later

  const digits = n.replace(/\D/g, '');
  if (digits !== n) return { valid: false, error: 'Use only digits (no letters or spaces)' };

  if (type === 'dot') {
    if (digits.length !== DOT_LENGTH) {
      return { valid: false, error: `DOT# must be exactly ${DOT_LENGTH} digits` };
    }
  } else if (type === 'mc') {
    if (digits.length < MC_MIN_LENGTH || digits.length > MC_MAX_LENGTH) {
      return { valid: false, error: `MC# must be ${MC_MIN_LENGTH}–${MC_MAX_LENGTH} digits` };
    }
  }
  // CA#: no strict format

  return { valid: true };
}
