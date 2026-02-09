# Intake Camera (MVP) 1

A camera app that guides users through step-by-step photo capture, runs OCR to extract data, and **creates a job file** in **TJ_FleetDashboard_Backend** (same API as the existing job file app / 99workflow).

## Flow

1. **Sign in** – Email/password login (same as job file app: `jobFile/api/user/login`).
2. **Company name** – Photo of the company name.
3. **DOT or MC** – Photo of DOT/MC number (optional; skip if in first photo).
4. **License plate & VIN** – Photo showing plate and VIN.
5. **Odometer** – Photo of the odometer reading.

After the last photo, the app runs OCR (Tesseract.js), shows a **Review** screen to edit fields, then **Create job file** sends the data to the backend (`jobFile/api/job/add`). The created job uses the same Job model as the existing job file app (customerInfo, vehicleInfo, mileage, basicJobInfo, etc.).

## Backend compatibility

- **Auth:** JWT via `jobFile/api/user/login`; token stored as `serviceToken` (same key as 99workflow).
- **Create job:** `POST jobFile/api/job/add` with `newJobInfo` shaped like the job file app (customerInfo, vehicleInfo, mileage, basicJobInfo, jobStatus, startDate, updateDate). No `customerId`/`equipmentId` required; backend accepts intake-from-camera with just customerInfo and vehicleInfo.

## Run locally (HTTP)

- **Camera on local:** Browsers treat **http://localhost** and **http://127.0.0.1** as secure contexts, so the camera works there. Use **http://localhost:3000** (or the port shown after `npm start`). Do **not** use your machine’s IP (e.g. 192.168.x.x) over HTTP—camera will not work without HTTPS.
- Backend (TJ_FleetDashboard_Backend) must be running and reachable at `API_URI`.

```bash
cd IntakeCamera
npm install
# Optional: set backend URL (default http://localhost:5000)
# echo "REACT_APP_API_URI=http://192.168.1.112:5000" > .env
# Optional: use port 5174 like before
# echo "PORT=5174" >> .env
npm start
```

Open **http://localhost:3000** in your browser (or the URL shown in the terminal). When the app asks for camera access, click **Allow**. Sign in with a job file app user, then run through the photo steps and create a job file.

## Tech

- **Create React App (React)** – UI, no Vite.
- **react-webcam** – Camera capture (same as 99workflow).
- **Tesseract.js** – Client-side OCR (English).
- **API** – Same base URL as 99workflow (`config.js` / `REACT_APP_API_URI`); login and job add use `jobFile` routes.

## Accuracy (MVP)

- OCR quality depends on lighting, focus, and text clarity. The review step lets users correct any field before creating the intake.
- For higher accuracy later: better preprocessing (crop/contrast), cloud OCR (e.g. Google Vision), or dedicated models for VIN/plate/odometer.

## Project layout

- `src/index.js` – Entry point.
- `src/App.jsx` – Screens and flow (welcome → capture → processing → review).
- `src/steps.js` – Step definitions (company, dotmc, platevin, odometer).
- `src/utils/ocr.js` – Tesseract wrapper and simple parsers (VIN, plate, odometer, company/DOT).
- `src/components/` – CameraCapture (react-webcam), StepWizard, IntakeReview, Login.

This app is separate from TJ_99glide and 99workflow; it can later POST the intake JSON to your backend or open in another app.
