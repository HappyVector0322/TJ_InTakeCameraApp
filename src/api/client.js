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
 * POST jobFile/api/job/intake -> { intake: { companyName, dotOrMc, licensePlate, licenseRegion, vin, odometer } }
 * Backend matches existing customers (by company name + optional DOT/MC) and equipment (by VIN or license+region),
 * creates new only when no match. Returns { newJob, customerData, equipmentData, customerMatched, equipmentMatched }.
 * Intake shape matches 99workflow job file: carrierIdType (dot/ca/mc) + carrierIdNum.
 */
export async function createJobFromIntake(intake) {
  try {
    const { data } = await client.post('api/job/intake', {
      intake: {
        companyName: intake.companyName || '',
        carrierIdType: intake.carrierIdType || 'dot',
        carrierIdNum: intake.carrierIdNum || '',
        licensePlate: intake.licensePlate || '',
        licenseRegion: intake.licenseRegion || '',
        vin: intake.vin || '',
        odometer: intake.odometer || '',
      },
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
