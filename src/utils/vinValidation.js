/**
 * VIN validation and rule-based correction (per TJ/Alex: fixed length, excluded chars, check-digit).
 * ISO 3779: position 9 is check digit; weights 8,7,6,5,4,3,2,10,_,9,8,7,6,5,4,3,2.
 */

const LENGTH = 17;
const EXCLUDED = /[IOQ]/i;
const VALID_CHARS = /^[A-HJ-NPR-Z0-9]+$/;

/** Character to value for check-digit calculation (ISO 3779). I,O,Q not valid in VIN. */
const VIN_VALUE = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
  'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
  'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
};

/** Position weights (index 0..16); position 8 is check digit so not used in sum. */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function getCharValue(c) {
  return VIN_VALUE[c] ?? -1;
}

/**
 * Compute expected check digit (0-9 or 'X' for 10) for 17-char string; position 8 is check digit.
 */
function computeCheckDigit(vin) {
  if (!vin || vin.length !== LENGTH) return null;
  let sum = 0;
  for (let i = 0; i < LENGTH; i++) {
    if (i === 8) continue;
    const v = getCharValue(vin[i]);
    if (v < 0) return null;
    sum += v * WEIGHTS[i];
  }
  const rem = sum % 11;
  return rem === 10 ? 'X' : String(rem);
}

/**
 * Validate VIN: length 17, no I/O/Q, valid chars only, check digit correct.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateVIN(vin) {
  const s = (vin || '').trim().toUpperCase();
  if (s.length !== LENGTH) {
    return { valid: false, error: s.length === 0 ? 'VIN is required' : `VIN must be ${LENGTH} characters (got ${s.length})` };
  }
  if (EXCLUDED.test(s)) {
    return { valid: false, error: 'VIN cannot contain I, O, or Q' };
  }
  if (!VALID_CHARS.test(s)) {
    return { valid: false, error: 'VIN can only contain letters A–H, J–N, P–R, S–Z and digits 0–9' };
  }
  const expected = computeCheckDigit(s);
  if (expected === null) return { valid: false, error: 'Invalid character in VIN' };
  const actual = s[8];
  if (actual !== expected) {
    return { valid: false, error: `Check digit invalid (expected ${expected}, got ${actual}). Please verify.` };
  }
  return { valid: true };
}

/** Common OCR confusions: letter to digit or digit to letter. */
const OCR_ALTERNATIVES = {
  'I': '1', '1': 'I',
  'O': '0', '0': 'O',
  'Q': '0',
  'S': '5', '5': 'S',
  'B': '8', '8': 'B',
  'Z': '2', '2': 'Z',
  'G': '6', '6': 'G',
};

/**
 * Try to fix OCR errors by substituting at position pos. At check-digit position (8), try 0-9 and X.
 */
function tryCorrectOneChar(vin, pos) {
  const c = vin[pos];
  const toTry = [];
  if (OCR_ALTERNATIVES[c]) toTry.push(OCR_ALTERNATIVES[c]);
  if (pos === 8) {
    for (const ch of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X']) {
      if (ch !== c) toTry.push(ch);
    }
  }
  for (const alt of toTry) {
    const candidate = vin.slice(0, pos) + alt + vin.slice(pos + 1);
    if (validateVIN(candidate).valid) return candidate;
  }
  return null;
}

/**
 * Apply rule-based corrections: normalize to uppercase, replace I/O/Q with common substitutes,
 * then try single-character corrections to satisfy check digit.
 * @returns {string} Corrected VIN if found and valid, otherwise original (trimmed, upper).
 */
export function correctVIN(vin) {
  let s = (vin || '').trim().toUpperCase().replace(/\s/g, '');
  if (s.length !== LENGTH) return s;
  const replaced = s.replace(/I/g, '1').replace(/O/g, '0').replace(/Q/g, '0');
  if (validateVIN(replaced).valid) return replaced;
  for (let i = 0; i < LENGTH; i++) {
    const fixed = tryCorrectOneChar(s, i) || tryCorrectOneChar(replaced, i);
    if (fixed) return fixed;
  }
  return s;
}
