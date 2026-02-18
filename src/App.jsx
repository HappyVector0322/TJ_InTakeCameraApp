import React, { useState, useCallback, useEffect, useRef } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { STEPS, STEP_IDS } from './steps';

const VIN_STEP_INDEX = STEP_IDS.indexOf('vin');
const ODOMETER_STEP_INDEX = STEP_IDS.indexOf('odometer');
const COMPANY_STEP_INDEX = STEP_IDS.indexOf('company');
import { StepWizard } from './components/StepWizard';
import { IntakeReview } from './components/IntakeReview';
import { Login } from './components/Login';
import { getToken, logout, createJobFromIntake, findEquipmentByVinOrLicense } from './api/client';
import { TOKEN_KEY, JOB_FILE_APP_URL } from './config';
import { extractTextFromImage, parseCompanyOrDotMc } from './utils/ocr';
import { licensePlateOCR, extractVINFromBase64, companyNameOCR } from './utils/plateVinOcr';
import { decodeVIN } from './utils/vinDecode';
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
  const [screen, setScreen] = useState('welcome'); // welcome | capture | processing | verifyUnit | review
  const [stepIndex, setStepIndex] = useState(0);
  const [reCapturingVIN, setReCapturingVIN] = useState(false);
  const [photos, setPhotos] = useState({});
  const [intake, setIntake] = useState(INITIAL_INTAKE);
  const [existingUnit, setExistingUnit] = useState(null); // { equipment, customer } when unit found by license
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [processingError, setProcessingError] = useState('');
  const processingStarted = useRef(false);
  const processingCancelledRef = useRef(false);
  const odometerCroppedRef = useRef(null);

  const handleStart = () => {
    processingStarted.current = false;
    setProcessingError('');
    setCreateError('');
    odometerCroppedRef.current = null;
    setStepIndex(0);
    setPhotos({});
    setIntake(INITIAL_INTAKE);
    setExistingUnit(null);
    setScreen('capture');
  };

  const handlePhoto = useCallback((stepId, dataUrl) => {
    setPhotos((prev) => ({ ...prev, [stepId]: dataUrl }));
  }, []);

  const handleNext = useCallback((photoForCurrentStep) => {
    if (stepIndex === 0 && STEP_IDS[0] === 'license') {
      if (photoForCurrentStep) {
        setScreen('processing');
      } else {
        setStepIndex(1);
      }
      return;
    }
    if (stepIndex + 1 >= STEPS.length) {
      setScreen('processing');
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex]);

  const handleBack = useCallback(() => {
    if (existingUnit && stepIndex === ODOMETER_STEP_INDEX) {
      setScreen('verifyUnit');
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      setScreen('welcome');
      setStepIndex(0);
      setPhotos({});
      setExistingUnit(null);
    }
  }, [stepIndex, existingUnit]);

  useEffect(() => {
    if (screen !== 'processing' || processingStarted.current) return;
    processingStarted.current = true;
    processingCancelledRef.current = false;
    setProcessingError('');
    // Use latest photos so existing-unit + odometer path isn't treated as license-only (which would loop back to Unit found)
    const currentPhotos = { ...photos };
    const stepsWithPhotos = STEP_IDS.filter((id) => currentPhotos[id]);

    const cleanup = () => {
      processingCancelledRef.current = true;
    };
    if (stepsWithPhotos.length === 0) {
      setIntake(INITIAL_INTAKE);
      setScreen('review');
      setOcrProgress(1);
      processingStarted.current = false;
      return;
    }

    const isLicenseOnly = stepsWithPhotos.length === 1 && stepsWithPhotos[0] === 'license';
    const isExistingUnitOdometer = existingUnit && stepsWithPhotos.length === 2 && stepsWithPhotos.includes('license') && stepsWithPhotos.includes('odometer');
    // User chose existing unit but skipped odometer (Next with no photo) → go to Review with current intake, no re-lookup
    const isExistingUnitSkippedOdometer = existingUnit && stepsWithPhotos.length === 1 && stepsWithPhotos[0] === 'license';

    (async () => {
      let next = { ...INITIAL_INTAKE };
      try {
        if (isExistingUnitSkippedOdometer) {
          setOcrProgress(1);
          setScreen('review');
          processingStarted.current = false;
          return;
        }
        if (isLicenseOnly) {
          setOcrProgress(0.2);
          const img = currentPhotos.license;
          const plateResult = await licensePlateOCR(img);
          const plate = (plateResult?.licensePlateNumber || '').trim();
          const region = (plateResult?.licenseRegion || '').trim();
          next.licensePlate = plate;
          next.licenseRegion = region;
          setOcrProgress(0.5);
          const result = await findEquipmentByVinOrLicense('', plate, region, '');
          setOcrProgress(0.9);
          if (processingCancelledRef.current) return;
          if (result?.equipment) {
            const eq = result.equipment;
            const cust = result.customer || {};
            setIntake({
              ...next,
              companyName: (cust.name || '').trim(),
              carrierIdType: cust.carrierIdType || 'dot',
              carrierIdNum: (cust.carrierIdNum || '').trim(),
              unitNumber: (eq.unit || '').trim(),
              licensePlate: plate || (eq.licensePlateNumber || '').trim(),
              licenseRegion: region || (eq.licenseRegion || '').trim(),
              vin: (eq.vin || '').trim(),
              year: (eq.year || '').trim(),
              make: (eq.make || '').trim(),
              model: (eq.model || '').trim(),
              odometer: '',
            });
            setExistingUnit({ equipment: eq, customer: cust });
            setScreen('verifyUnit');
          } else {
            setIntake(next);
            setStepIndex(1);
            setScreen('capture');
          }
          setOcrProgress(1);
          processingStarted.current = false;
          return;
        }

        if (isExistingUnitOdometer) {
          next = { ...intake };
          setOcrProgress(0.5);
          const odometerResult = await odometerOCR(currentPhotos.odometer, (p) => setOcrProgress(0.5 + p * 0.5));
          const odometerValue = typeof odometerResult === 'object' ? odometerResult?.odometer : odometerResult;
          if (odometerValue) next.odometer = odometerValue;
          if (odometerResult?.croppedImage) {
            const dataUrl = `data:image/jpeg;base64,${odometerResult.croppedImage}`;
            odometerCroppedRef.current = dataUrl;
            setPhotos((prev) => ({ ...prev, odometerCropped: dataUrl }));
          } else {
            odometerCroppedRef.current = null;
          }
          if (processingCancelledRef.current) return;
          setIntake(next);
          setScreen('review');
          setOcrProgress(1);
          processingStarted.current = false;
          return;
        }

        let done = 0;
        for (const stepId of stepsWithPhotos) {
          if (stepId === 'license') {
            const img = currentPhotos[stepId];
            setOcrProgress(done / stepsWithPhotos.length);
            const plateResult = await licensePlateOCR(img);
            if (plateResult?.licensePlateNumber) next.licensePlate = plateResult.licensePlateNumber;
            if (plateResult?.licenseRegion) next.licenseRegion = plateResult.licenseRegion;
          } else if (stepId === 'vin') {
            const img = currentPhotos[stepId];
            setOcrProgress(done / stepsWithPhotos.length);
            const vinResult = await extractVINFromBase64(img);
            if (vinResult && vinResult.vin) {
              next.vin = correctVIN(vinResult.vin);
              const hasYMM = vinResult.year != null || vinResult.make || vinResult.model;
              if (hasYMM) {
                if (vinResult.year != null) next.year = String(vinResult.year);
                if (vinResult.make) next.make = vinResult.make;
                if (vinResult.model) next.model = vinResult.model;
              } else {
                const decoded = await decodeVIN(vinResult.vin);
                if (decoded) {
                  if (decoded.year) next.year = String(decoded.year);
                  if (decoded.make) next.make = decoded.make;
                  if (decoded.model) next.model = decoded.model;
                }
              }
            }
          } else if (stepId === 'dotmc') {
            setOcrProgress(done / stepsWithPhotos.length);
            const dotResult = await dotMcOCR(currentPhotos[stepId]);
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
            } else {
              odometerCroppedRef.current = null;
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
          } else if (stepId === 'unit') {
            setOcrProgress(done / stepsWithPhotos.length);
            const text = await extractTextFromImage(currentPhotos[stepId], (p) => {
              setOcrProgress((done + p) / stepsWithPhotos.length);
            });
            const trimmed = (text || '').trim();
            const firstLine = trimmed.split(/\n/).map((s) => s.trim()).find(Boolean);
            const candidate = (firstLine || trimmed).replace(/\s+/g, ' ').slice(0, 20);
            if (candidate) next.unitNumber = candidate;
          }
          done += 1;
          setOcrProgress(done / stepsWithPhotos.length);
        }
        if (processingCancelledRef.current) return;
        setIntake(next);
        setScreen('review');
        setOcrProgress(1);
      } catch (err) {
        if (processingCancelledRef.current) return;
        setProcessingError(err?.message || 'Reading photos failed. You can still edit and create the job.');
        setIntake(next);
        setScreen('review');
        setOcrProgress(1);
      } finally {
        processingStarted.current = false;
      }
    })();
    return cleanup;
  }, [screen, existingUnit, intake, photos]);

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
            Start with a license plate photo. If we find the unit, you’ll only need to capture the odometer. Otherwise, capture company, DOT/MC/CA, VIN, unit #, and odometer. You can always type or edit any field on the review screen.
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

  if (screen === 'verifyUnit' && existingUnit) {
    const eq = existingUnit.equipment;
    const unitLabel = (eq?.unit || eq?.unitId || eq?.licensePlateNumber || eq?.vin || 'Unit').toString().trim();
    return (
      <>
        <div className={styles.app}>
          <div className={styles.welcome} style={{ padding: 24, textAlign: 'left' }}>
            <h1 className={styles.welcomeTitle}>Unit found</h1>
            <p className={styles.welcomeDesc}>
              We found an existing unit for this license plate. Please verify and then take the odometer photo.
            </p>
            <p style={{ marginTop: 16, marginBottom: 8, fontWeight: 600 }}>Unit: {unitLabel}</p>
            {existingUnit.customer?.name && <p style={{ marginBottom: 24 }}>Company: {existingUnit.customer.name}</p>}
            <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary, #666)' }}>
              Use this unit or skip and enter as new?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280 }}>
              <button
                type="button"
                className={styles.signOutBtn}
                style={{ margin: 0 }}
                onClick={() => {
                  setExistingUnit(null);
                  setIntake((prev) => ({
                    ...INITIAL_INTAKE,
                    licensePlate: prev.licensePlate,
                    licenseRegion: prev.licenseRegion,
                  }));
                  setPhotos((prev) => ({ license: prev.license }));
                  setStepIndex(COMPANY_STEP_INDEX);
                  setScreen('capture');
                }}
              >
                Skip — enter as new unit
              </button>
              <button
                type="button"
                className={styles.startBtn}
                onClick={() => {
                  setStepIndex(ODOMETER_STEP_INDEX);
                  setScreen('capture');
                }}
              >
                Yes, take odometer photo
              </button>
            </div>
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
                // Do not set screen to 'processing' – that would re-run the full OCR effect and call detect-vin-image again (causing duplicate call and possible null overwrite).
                try {
                  const vinResult = await extractVINFromBase64(dataUrl);
                  if (vinResult && vinResult.vin) {
                    const hasYMM = vinResult.year != null || vinResult.make || vinResult.model;
                    let yearVal = '', makeVal = '', modelVal = '';
                    if (hasYMM) {
                      yearVal = vinResult.year != null ? String(vinResult.year) : '';
                      makeVal = vinResult.make ?? '';
                      modelVal = vinResult.model ?? '';
                    } else {
                      const decoded = await decodeVIN(vinResult.vin);
                      if (decoded) {
                        yearVal = decoded.year ? String(decoded.year) : '';
                        makeVal = decoded.make ?? '';
                        modelVal = decoded.model ?? '';
                      }
                    }
                    setIntake((prev) => ({
                      ...prev,
                      vin: correctVIN(vinResult.vin),
                      year: yearVal || prev.year,
                      make: makeVal || prev.make,
                      model: modelVal || prev.model,
                    }));
                  }
                } catch {
                  // keep existing vin on error
                }
              }
              // Stay on review; no second processing run
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
              setExistingUnit(null);
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
