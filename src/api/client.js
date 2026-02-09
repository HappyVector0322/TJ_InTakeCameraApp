/**
 * API client for TJ_FleetDashboard_Backend (job file app).
 * Compatible with jobFile routes: login, job/add.
 */

import axios from 'axios';
import { API_URI, TOKEN_KEY } from '../config';

const client = axios.create({
  baseURL: `${API_URI}/jobFile/`,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': true,
  },
});

client.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Login – same as 99workflow / job file app.
 * POST jobFile/api/user/login -> { data: { serviceToken, user }, error }
 */
export async function login(email, password) {
  try {
    const { data } = await client.post('api/user/login', { email, password });
    if (data.error) {
      throw new Error(data.error);
    }
    if (data.data?.serviceToken) {
      localStorage.setItem(TOKEN_KEY, data.data.serviceToken);
    }
    return data.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Login failed';
    throw new Error(msg);
  }
}

/**
 * Create job from intake with match-or-create customer/equipment.
 * POST jobFile/api/job/intake -> { intake: { companyName, carrierIdType, carrierIdNum, unitNumber, licensePlate, licenseRegion, vin, year, make, model, odometer }, createNewUnit?: boolean }
 * Backend matches existing customers and equipment (by VIN, license+region, or customer+unit); creates new only when no match.
 * Returns { newJob, customerData, equipmentData, customerMatched, equipmentMatched }.
 */
export async function createJobFromIntake(intake, createNewUnit = false) {
  try {
    const { data } = await client.post('api/job/intake', {
      intake: {
        companyName: intake.companyName || '',
        carrierIdType: intake.carrierIdType || 'dot',
        carrierIdNum: intake.carrierIdNum || '',
        unitNumber: (intake.unitNumber || '').trim(),
        licensePlate: intake.licensePlate || '',
        licenseRegion: intake.licenseRegion || '',
        vin: (intake.vin || '').trim(),
        year: (intake.year || '').trim(),
        make: (intake.make || '').trim(),
        model: (intake.model || '').trim(),
        odometer: intake.odometer || '',
      },
      createNewUnit: !!createNewUnit,
    });
    if (data.error) {
      throw new Error(data.error);
    }
    return data.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create job file';
    throw new Error(msg);
  }
}

/**
 * Check if a unit number already exists for the given company (for "Unit X already exists for Xyz. Use same one?").
 * POST jobFile/api/job/checkExistingUnit -> { companyName, unitNumber } -> { exists: boolean, companyName?: string, unitNumber?: string }
 */
export async function checkExistingUnit(companyName, unitNumber) {
  try {
    const { data } = await client.post('api/job/checkExistingUnit', {
      companyName: (companyName || '').trim(),
      unitNumber: (unitNumber || '').trim(),
    });
    if (data.error) {
      return { exists: false };
    }
    return data.data || { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Find equipment by VIN or license+region (for Unit dropdown pre-selection).
 * POST /jobFile/api/job/findEquipmentByVinOrLicense
 */
export async function findEquipmentByVinOrLicense(vin, licensePlate, licenseRegion, companyName) {
  try {
    const { data } = await client.post('api/job/findEquipmentByVinOrLicense', {
      vin: (vin || '').trim(),
      licensePlate: (licensePlate || '').trim(),
      licenseRegion: (licenseRegion || '').trim(),
      companyName: (companyName || '').trim(),
    });
    if (data.error) return { equipment: null };
    return data.data || { equipment: null };
  } catch {
    return { equipment: null };
  }
}

/**
 * Fetch equipment list by customer. GET /api/equipments/list/:customerId
 */
export async function getEquipmentList(customerId) {
  if (!customerId) return [];
  try {
    const token = getToken();
    const res = await axios.get(`${API_URI}/api/equipments/list/${customerId}`, {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': true,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = res.data?.data ?? res.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch customer list for autocomplete. GET /api/customers/list (Fleet API).
 */
export async function getCustomersList() {
  const token = getToken();
  const res = await axios.get(`${API_URI}/api/customers/list`, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': true,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = res.data?.data ?? res.data;
  return Array.isArray(data) ? data : [];
}

export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}
