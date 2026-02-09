/**
 * Backend API base URL (TJ_FleetDashboard_Backend).
 * Same as 99workflow config – use jobFile routes for login and job add.
 * Set REACT_APP_API_URI in .env to override.
 */
export const API_URI = 'https://99glidefleetserver.app';

/** PlateRecognizer.com API token for license plate OCR. Same as 99workflow – set REACT_APP_PLATE_RECOGNIZER_API_TOKEN in .env to override. */
export const PLATE_RECOGNIZER_API_TOKEN = '877866e9d8d7040725188a3b6469f3234c47d05f';

/** Plate Recognizer USDOT Cloud API token. Set REACT_APP_USDOT_OCR_API_TOKEN in .env to override. Get from USDOT Settings: https://app.platerecognizer.com */
export const USDOT_OCR_API_TOKEN = '9845f71a9eccd3bfbdfb7731b376cbcd8e52ddbc';

export const TOKEN_KEY = 'serviceToken';

/** Optional: after intake job is created, open job file app and go to description. Set REACT_APP_JOB_FILE_APP_URL (e.g. http://localhost:3000 or TJ_99glide URL). */
export const JOB_FILE_APP_URL = "https://99workflow.vercel.app/dashboard";
