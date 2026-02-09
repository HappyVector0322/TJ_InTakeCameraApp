/**
 * Live VIN decode using NHTSA vPIC API (free, no key required).
 * Returns { year, make, model } or null if decode fails.
 */

const NHTSA_VIN_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

export async function decodeVIN(vin) {
  const v = (vin || '').trim().toUpperCase();
  if (v.length < 8) return null;
  try {
    const res = await fetch(`${NHTSA_VIN_URL}/${encodeURIComponent(v)}?format=json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.Results?.[0];
    if (!results) return null;
    const get = (key) => {
      const val = results[key];
      return val && String(val).trim() && String(val) !== 'Not Applicable' ? String(val).trim() : '';
    };
    return {
      year: get('ModelYear') || get('Year'),
      make: get('Make') || get('Manufacturer'),
      model: get('Model'),
    };
  } catch {
    return null;
  }
}
