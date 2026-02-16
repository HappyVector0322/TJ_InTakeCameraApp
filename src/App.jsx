import React, { useState, useCallback, useEffect, useRef } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { STEPS, STEP_IDS } from './steps';

const VIN_STEP_INDEX = STEP_IDS.indexOf('vin');
import { StepWizard } from './components/StepWizard';
import { IntakeReview } from './components/IntakeReview';
import { Login } from './components/Login';
import { getToken, logout, createJobFromIntake } from './api/client';
import { TOKEN_KEY, JOB_FILE_APP_URL } from './config';
import { extractTextFromImage, parseCompanyOrDotMc } from './utils/ocr';
import { licensePlateOCR, extractVINFromBase64, companyNameOCR } from './utils/plateVinOcr';
import { correctVIN } from './utils/vinValidation';
import { dotMcOCR, odometerOCR } from './utils/dotOdometerOcr';
import { parseDotAndMc } from './utils/dotMcValidation';
import styles from './App.module.css';

/** Intake shape matches 99workflow job file: carrierIdType (dot/ca/mc) + carrierIdNum for DOT/MC/CA#. */
const INITIAL_INTAKE = {
  companyName: '',
  carrierIdType: 'dot',
  carrierIdNum: '',
  unitNumber: '',
  licensePlate: '',
  licenseRegion: '',
  vin: '',
  year: '',
  make: '',
  model: '',
  odometer: '',
};

/** Parse token from URL hash (#token=...) for SSO from TJ_99glide. Store and strip from URL. */
function consumeTokenFromUrl() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const match = hash.match(/#token=([^&]+)/);
  if (!match) return false;
  try {
    const token = decodeURIComponent(match[1].replace(/\+/g, ' '));
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      const newHash = hash.replace(/#token=[^&]+&?/, '').replace(/^#&?|#$/, '') || '';
      window.history.replaceState(null, '', window.location.pathname + window.location.search + (newHash ? `#${newHash}` : ''));
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [authChecked, setAuthChecked] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // SSO: consume token from URL when opened from TJ_99glide (App Drawer), then skip login
  useEffect(() => {
    if (consumeTokenFromUrl()) {
      setAuthenticated(true);
    }
    setAuthChecked(true);
  }, []);
  const [screen, setScreen] = useState('welcome'); // welcome | capture | processing | review
  const [stepIndex, setStepIndex] = useState(0);
  const [reCapturingVIN, setReCapturingVIN] = useState(false); // true = only VIN capture, then return to review
  const [photos, setPhotos] = useState({});
  const [intake, setIntake] = useState(INITIAL_INTAKE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [processingError, setProcessingError] = useState('');
  const processingStarted = useRef(false);
  const odometerCroppedRef = useRef(null);

  const handleStart = () => {
    processingStarted.current = false;
    setProcessingError('');
    setCreateError('');
    odometerCroppedRef.current = null;
    setScreen('capture');
  };

  const handlePhoto = useCallback((stepId, dataUrl) => {
    setPhotos((prev) => ({ ...prev, [stepId]: dataUrl }));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex + 1 >= STEPS.length) {
      setScreen('processing');
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      setScreen('welcome');
      setStepIndex(0);
      setPhotos({});
    }
  }, [stepIndex]);

  useEffect(() => {
    if (screen !== 'processing' || processingStarted.current) return;
    processingStarted.current = true;
    setProcessingError('');
    const currentPhotos = { ...photos };
    const stepsWithPhotos = STEP_IDS.filter((id) => currentPhotos[id]);
    if (stepsWithPhotos.length === 0) {
      setIntake(INITIAL_INTAKE);
      setScreen('review');
      setOcrProgress(1);
      processingStarted.current = false;
      return;
    }

    let done = 0;
    const next = { ...INITIAL_INTAKE };

    (async () => {
      try {
        for (const stepId of stepsWithPhotos) {
          if (stepId === 'license') {
            const img = currentPhotos[stepId]; // already cropped (greenbox) on confirm page
            setOcrProgress(done / stepsWithPhotos.length);
            const plateResult = await licensePlateOCR(img);
            if (plateResult?.licensePlateNumber) next.licensePlate = plateResult.licensePlateNumber;
            if (plateResult?.licenseRegion) next.licenseRegion = plateResult.licenseRegion;
            // Do NOT fall back to Tesseract for license – it often produces wrong results (e.g. "303430" from numbers in image).
            // If PlateRecognizer fails, leave plate/region empty so user can type/select; same approach as VIN.
          } else if (stepId === 'vin') {
            const img = currentPhotos[stepId]; // already cropped and preprocessed (greenbox) on confirm page
            setOcrProgress(done / stepsWithPhotos.length);
            const vinResult = await extractVINFromBase64(img);
            if (vinResult) {
              // Apply VIN validation rules: auto-correct I/O/Q and check-digit errors (TJ/Alex: rule-based corrections)
              next.vin = correctVIN(vinResult);
            }
            // Do NOT fall back to Tesseract for VIN when backend fails – it produces wrong results.
            // If backend fails, leave VIN empty so user can type it.
          } else if (stepId === 'dotmc') {
            setOcrProgress(done / stepsWithPhotos.length);
            const dotResult = await dotMcOCR(currentPhotos[stepId]);
            // Use structured { dot, mc } when OCR returns both; otherwise parse raw
            if (dotResult?.dot || dotResult?.mc) {
              const dot = dotResult.dot || '';
              const mc = dotResult.mc || '';
              next.carrierIdType = dot ? 'dot' : 'mc';
              next.carrierIdNum = dot || mc;
            } else {
              let rawValue = dotResult?.dotOrMc || '';
              if (!rawValue) {
                const text = await extractTextFromImage(currentPhotos[stepId], (p) => {
                  setOcrProgress((done + p) / stepsWithPhotos.length);
                });
                rawValue = parseCompanyOrDotMc(text) || text || '';
              }
              if (rawValue) {
                const parsed = parseDotAndMc(rawValue);
                next.carrierIdType = parsed.preferredType;
                next.carrierIdNum = parsed.preferredNum || rawValue.replace(/\D/g, '').trim().slice(0, 15);
              }
            }
          } else if (stepId === 'odometer') {
            setOcrProgress(done / stepsWithPhotos.length);
            const odometerResult = await odometerOCR(currentPhotos[stepId], (p) => {
              setOcrProgress((done + p) / stepsWithPhotos.length);
            });
            const odometerValue = typeof odometerResult === 'object' ? odometerResult?.odometer : odometerResult;
            if (odometerValue) next.odometer = odometerValue;
            if (odometerResult?.croppedImage) {
              const dataUrl = `data:image/jpeg;base64,${odometerResult.croppedImage}`;
              odometerCroppedRef.current = dataUrl;
              setPhotos((prev) => ({ ...prev, odometerCropped: dataUrl }));
              console.log('[App] Odometer cropped image set:', { 
                hasCropped: true, 
                dataUrlLength: dataUrl.length,
                refSet: !!odometerCroppedRef.current 
              });
            } else {
              odometerCroppedRef.current = null;
              console.log('[App] No cropped image received from backend');
            }
          } else if (stepId === 'company') {
            setOcrProgress(done / stepsWithPhotos.length);
            const company = await companyNameOCR(currentPhotos[stepId]);
            if (company) next.companyName = company;
            else {
              const text = await extractTextFromImage(currentPhotos[stepId], (p) => {
                setOcrProgress((done + p) / stepsWithPhotos.length);
              });
              next.companyName = parseCompanyOrDotMc(text);
            }
          }
          done += 1;
          setOcrProgress(done / stepsWithPhotos.length);
        }
        setIntake(next);
        setScreen('review');
        setOcrProgress(1);
      } catch (err) {
        setProcessingError(err?.message || 'Reading photos failed. You can still edit and create the job.');
        setIntake(next);
        setScreen('review');
        setOcrProgress(1);
      } finally {
        processingStarted.current = false;
      }
    })();
  }, [screen]);

  const handleIntakeChange = useCallback((key, value) => {
    setIntake((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateIntake = useCallback(async (createNewUnit = false) => {
    setCreating(true);
    setCreateError('');
    try {
      const result = await createJobFromIntake(intake, createNewUnit);
      const jobId = result?.newJob?._id;
      const customerMatched = result?.customerMatched === true;
      const equipmentMatched = result?.equipmentMatched === true;
      processingStarted.current = false;
      setScreen('welcome');
      setStepIndex(0);
      setPhotos({});
      setIntake(INITIAL_INTAKE);
      let message = jobId ? `Job file created successfully. Job ID: ${jobId}` : 'Job file created successfully.';
      if (customerMatched) message += ' Customer matched existing.';
      else message += ' New customer created.';
      if (equipmentMatched) message += ' Unit matched existing.';
      else if (result?.equipmentData) message += ' New unit created.';
      setSnackbar({ open: true, message, severity: 'success' });
      // Open job file app and go to description (TJ: "open the job file and go to description once submitted")
      if (jobId && JOB_FILE_APP_URL) {
        const url = `${JOB_FILE_APP_URL.replace(/\/$/, '')}?openJob=${jobId}&focus=description`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create job file');
    } finally {
      setCreating(false);
    }
  }, [intake]);

  const handleCloseSnackbar = () => setSnackbar((s) => ({ ...s, open: false }));

  const snackbarEl = (
    <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
        {snackbar.message}
      </Alert>
    </Snackbar>
  );

  if (!authChecked) {
    return (
      <>
        <div className={styles.app}>
          <div className={styles.welcome} style={{ padding: 24 }}>
            <p>Loading…</p>
          </div>
        </div>
        {snackbarEl}
      </>
    );
  }

  if (!authenticated) {
    return (
      <>
        <div className={styles.app}>
          <Login onSuccess={() => setAuthenticated(true)} />
        </div>
        {snackbarEl}
      </>
    );
  }

  if (screen === 'welcome') {
    return (
      <>
        <div className={styles.app}>
          <div className={styles.welcome}>
          <button type="button" className={styles.signOutBtn} onClick={() => { logout(); setAuthenticated(false); }}>
            Sign out
          </button>
          <h1 className={styles.welcomeTitle}>Intake Camera</h1>
          <p className={styles.welcomeDesc}>
            Capture company name, DOT/MC, license plate, VIN, and odometer. We’ll read the data from your photos and create a job file automatically.
          </p>
          <button type="button" className={styles.startBtn} onClick={handleStart}>
            Start
          </button>
        </div>
      </div>
        {snackbarEl}
      </>
    );
  }

  if (screen === 'capture') {
    return (
      <>
        <div className={styles.app}>
          <StepWizard
            stepIndex={stepIndex}
            photos={photos}
            onPhoto={handlePhoto}
            onSkip={() => {}}
            onNext={handleNext}
            onBack={reCapturingVIN ? () => { setReCapturingVIN(false); setScreen('review'); } : handleBack}
            reCapturingVIN={reCapturingVIN}
            onReCaptureComplete={async (stepId, dataUrl) => {
              if (stepId !== 'vin') return;
              setReCapturingVIN(false);
              if (dataUrl) {
                setPhotos((prev) => ({ ...prev, vin: dataUrl }));
                setScreen('processing');
                try {
                  const vinResult = await extractVINFromBase64(dataUrl);
                  if (vinResult) setIntake((prev) => ({ ...prev, vin: correctVIN(vinResult) }));
                } catch {
                  // keep existing vin on error
                }
              }
              setScreen('review');
              processingStarted.current = false;
            }}
          />
        </div>
        {snackbarEl}
      </>
    );
  }

  if (screen === 'processing') {
    return (
      <>
        <div className={styles.app}>
          <div className={styles.processing}>
            <h1 className={styles.processingTitle}>Reading your photos…</h1>
            <div className={styles.progressWrap}>
              <div className={styles.progressBar} style={{ width: `${ocrProgress * 100}%` }} />
            </div>
            <p className={styles.processingDesc}>Extracting text for accuracy.</p>
          </div>
        </div>
        {snackbarEl}
      </>
    );
  }

  if (screen === 'review') {
    return (
      <>
        <div className={styles.app}>
          {processingError && (
            <p className={styles.createError} role="alert">
              {processingError}
            </p>
          )}
          <IntakeReview
            data={intake}
            photos={photos}
            odometerCroppedRef={odometerCroppedRef}
            onChange={handleIntakeChange}
            onCreateIntake={handleCreateIntake}
            creating={creating}
            createError={createError}
            onStartOver={() => {
              setCreateError('');
              setProcessingError('');
              setStepIndex(0);
              odometerCroppedRef.current = null;
              setPhotos({});
              setIntake(INITIAL_INTAKE);
              setScreen('welcome');
            }}
            onReCaptureVIN={() => {
              setReCapturingVIN(true);
              setScreen('capture');
              setStepIndex(VIN_STEP_INDEX);
            }}
          />
        </div>
        {snackbarEl}
      </>
    );
  }

  return null;
}
