import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import styles from './IntakeReview.module.css';
import { getCustomersList, checkExistingUnit, findEquipmentByVinOrLicense, getEquipmentList } from '../api/client';
import { decodeVIN } from '../utils/vinDecode';
import { validateVIN, correctVIN } from '../utils/vinValidation';
import { validateCarrierId } from '../utils/dotMcValidation';

const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY',
];

const CARRIER_ID_TYPES = [
  { value: 'dot', label: 'DOT#' },
  { value: 'ca', label: 'CA#' },
  { value: 'mc', label: 'MC#' },
];

function FieldImage({ src, alt, onOpenFullScreen }) {
  if (!src) return null;
  return (
    <Box
      className={styles.fieldImageWrap}
      onClick={() => onOpenFullScreen && onOpenFullScreen(src, alt)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenFullScreen?.(src, alt)}
      aria-label={`View ${alt} full screen`}
    >
      <img src={src} alt={alt} className={styles.fieldImage} draggable={false} />
    </Box>
  );
}

function FullScreenImageViewer({ open, src, alt, onClose }) {
  const [rotation, setRotation] = useState(0);
  const touchStart = React.useRef({ y: 0, fingers: 0, onZoomArea: false });

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleTouchStart = (e) => {
    const target = e.target;
    const onZoomArea = !!target?.closest?.('[data-zoom-area]');
    touchStart.current = {
      y: e.touches?.[0]?.clientY ?? 0,
      fingers: e.touches?.length ?? 0,
      onZoomArea,
    };
  };

  const handleTouchEnd = (e) => {
    const touch = e.changedTouches?.[0];
    if (!touch || touchStart.current.fingers !== 1) return;
    if (touchStart.current.onZoomArea) return;
    const deltaY = touch.clientY - touchStart.current.y;
    if (deltaY > 80) onClose();
  };

  useEffect(() => {
    if (open) {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = 'hidden';
      html.style.height = '100%';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = '0';
      body.style.left = '0';
      body.style.right = '0';
      body.style.bottom = '0';
      body.style.width = '100%';
      body.style.height = '100%';
      body.style.touchAction = 'none';
      body.style.overscrollBehavior = 'none';
    }
    return () => {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.bottom = '';
      body.style.width = '';
      body.style.height = '';
      body.style.touchAction = '';
      body.style.overscrollBehavior = '';
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const content = (
    <div
      className={styles.fullScreenOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={styles.fullScreenBackdrop}
        aria-hidden="true"
      />
      <Box className={styles.fullScreenControls} onClick={(e) => e.stopPropagation()}>
        <IconButton
          onClick={handleRotate}
          className={styles.fullScreenControlBtn}
          aria-label="Rotate"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z" />
          </svg>
        </IconButton>
        <IconButton
          onClick={onClose}
          className={styles.fullScreenControlBtn}
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </IconButton>
      </Box>
      <div className={styles.fullScreenContent} onClick={(e) => e.stopPropagation()}>
        <div data-zoom-area style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={8}
          centerOnInit
          wheel={{ step: 0.2 }}
          pinch={{ step: 5 }}
          doubleClick={{ mode: 'toggle' }}
        >
          <TransformComponent
            contentStyle={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              minWidth: '100%',
              minHeight: '100%',
            }}
          >
            <Box
              sx={{
                transform: `rotate(${rotation}deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                bgcolor: 'transparent',
              }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                className={styles.fullScreenImage}
              />
            </Box>
          </TransformComponent>
        </TransformWrapper>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}

export function IntakeReview({ data, photos = {}, odometerCroppedRef, onChange, onCreateIntake, creating, createError, onStartOver, onReCaptureVIN }) {
  const [customerOptions, setCustomerOptions] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [fullScreenImage, setFullScreenImage] = useState({ open: false, src: null, alt: '' });
  const [vinDecodeLoading, setVinDecodeLoading] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState('');
  const [existingUnitDialog, setExistingUnitDialog] = useState(null); // { companyName, unitNumber } when match found
  const [existingUnitChecked, setExistingUnitChecked] = useState(false);
  const [forceCreateNewUnit, setForceCreateNewUnit] = useState(false);
  const unitPreselected = React.useRef(false);

  useEffect(() => {
    getCustomersList()
      .then((list) => setCustomerOptions(list))
      .catch(() => setCustomerOptions([]));
  }, []);

  // Equipment list for Unit dropdown: fetch when we have customer (match companyName)
  const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
  const customerId = React.useMemo(() => {
    const company = normalize(data.companyName);
    if (!company) return null;
    const c = customerOptions.find((x) => normalize(x.name) === company);
    return c?._id || null;
  }, [data.companyName, customerOptions]);

  useEffect(() => {
    if (!customerId) {
      setEquipmentOptions([]);
      return;
    }
    getEquipmentList(customerId)
      .then((list) => setEquipmentOptions(list))
      .catch(() => setEquipmentOptions([]));
  }, [customerId]);

  // Pre-select Unit when captured VIN/license matches existing equipment (TJ: "Uni# should be pre-select as SJ-18")
  useEffect(() => {
    const vin = (data.vin || '').trim();
    const licensePlate = (data.licensePlate || '').trim();
    const licenseRegion = (data.licenseRegion || '').trim();
    const companyName = (data.companyName || '').trim();
    if (!vin && !licensePlate) return;
    if (unitPreselected.current) return;
    let cancelled = false;
    findEquipmentByVinOrLicense(vin, licensePlate, licenseRegion, companyName)
      .then((result) => {
        if (cancelled) return;
        if (result?.equipment?.unit) {
          onChange('unitNumber', result.equipment.unit);
          unitPreselected.current = true;
        } else {
          // No match: set Unit# as empty
          onChange('unitNumber', '');
        }
      });
    return () => { cancelled = true; };
  }, [data.vin, data.licensePlate, data.licenseRegion, data.companyName]);

  // YMM now comes from VIN OCR (RapidAPI vindecode), so auto VIN-decode is disabled to reduce loading time.
  // User can still use the "Decode VIN" button if they edit the VIN and want to refresh year/make/model.
  const vinForDecode = (data.vin || '').trim();

  // Auto-correct VIN when it contains I/O/Q (common OCR mistakes) so we don't show "VIN cannot contain I, O, or Q"
  useEffect(() => {
    if (vinForDecode.length !== 17) return;
    const validation = validateVIN(vinForDecode);
    if (validation.error !== 'VIN cannot contain I, O, or Q') return;
    const corrected = correctVIN(vinForDecode);
    if (validateVIN(corrected).valid && corrected !== vinForDecode) {
      onChange('vin', corrected);
    }
  }, [vinForDecode, onChange]);

  // const lastDecodedVin = React.useRef('');
  // useEffect(() => {
  //   if (vinForDecode.length !== 17) {
  //     lastDecodedVin.current = '';
  //     setVinDecodeError('');
  //     return;
  //   }
  //   if (lastDecodedVin.current === vinForDecode) return;
  //   lastDecodedVin.current = vinForDecode;
  //   let cancelled = false;
  //   setVinDecodeLoading(true);
  //   setVinDecodeError('');
  //   decodeVIN(vinForDecode)
  //     .then((decoded) => {
  //       if (cancelled) return;
  //       setVinDecodeLoading(false);
  //       if (decoded) {
  //         if (decoded.year) onChange('year', decoded.year);
  //         if (decoded.make) onChange('make', decoded.make);
  //         if (decoded.model) onChange('model', decoded.model);
  //       } else {
  //         setVinDecodeError('Decode failed or VIN not found');
  //       }
  //     })
  //     .catch(() => {
  //       if (!cancelled) {
  //         setVinDecodeLoading(false);
  //         setVinDecodeError('Decode failed');
  //       }
  //     });
  //   return () => { cancelled = true; };
  // }, [vinForDecode]);

  // Existing unit check: "If company name and unit # match an existing entry then need to ask..."
  const checkExisting = useCallback(async () => {
    const company = (data.companyName || '').trim();
    const unit = (data.unitNumber || '').trim();
    if (!company || !unit) return;
    const result = await checkExistingUnit(company, unit);
    if (result.exists) {
      setExistingUnitDialog({ companyName: company, unitNumber: unit });
    }
    setExistingUnitChecked(true);
  }, [data.companyName, data.unitNumber]);

  useEffect(() => {
    if (!existingUnitChecked && (data.companyName || '').trim() && (data.unitNumber || '').trim()) {
      checkExisting();
    }
  }, [existingUnitChecked, data.companyName, data.unitNumber, checkExisting]);

  const licenseRegionValue = data.licenseRegion
    ? { label: data.licenseRegion, code: data.licenseRegion }
    : null;

  const handleCustomerChange = (_, newValue) => {
    if (newValue && typeof newValue === 'object' && newValue.name) {
      onChange('companyName', newValue.name);
      if (newValue.carrierIdType) onChange('carrierIdType', newValue.carrierIdType);
      if (newValue.carrierIdNum != null) onChange('carrierIdNum', newValue.carrierIdNum || '');
    } else {
      onChange('companyName', typeof newValue === 'string' ? newValue : '');
    }
  };

  const handleSubmit = () => {
    onCreateIntake(forceCreateNewUnit);
  };

  const handleExistingUnitYes = () => {
    setExistingUnitDialog(null);
    setForceCreateNewUnit(false);
  };

  const handleExistingUnitNo = () => {
    setExistingUnitDialog(null);
    setForceCreateNewUnit(true);
  };

  // Manual decode: when user clicks "Decode VIN", fetch year/make/model (e.g. NHTSA)
  const handleDecodeVIN = useCallback(async () => {
    const vin = (data.vin || '').trim();
    if (vin.length !== 17) return;
    setVinDecodeLoading(true);
    setVinDecodeError('');
    try {
      const decoded = await decodeVIN(vin);
      if (decoded) {
        if (decoded.year) onChange('year', decoded.year);
        if (decoded.make) onChange('make', decoded.make);
        if (decoded.model) onChange('model', decoded.model);
        setVinDecodeError('');
      } else {
        setVinDecodeError('Decode failed or VIN not found');
      }
    } catch {
      setVinDecodeError('Decode failed');
    } finally {
      setVinDecodeLoading(false);
    }
  }, [data.vin, onChange]);

  return (
    <Box className={styles.wrapper}>
      <Paper elevation={0} className={styles.card} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        <h1 className={styles.title}>Review intake</h1>
        <p className={styles.subtitle}>
          Edit any field if OCR was wrong, then create your job file.
        </p>
        {createError && <p className={styles.createError}>{createError}</p>}
        <Box
          component="form"
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!creating) handleSubmit();
          }}
        >
          <Box className={styles.fieldWithImage}>
            <Autocomplete
              freeSolo
              options={customerOptions}
              getOptionLabel={(opt) => (opt && typeof opt === 'object' ? opt.name ?? '' : String(opt ?? ''))}
              inputValue={data.companyName ?? ''}
              onInputChange={(_, v) => onChange('companyName', v ?? '')}
              onChange={handleCustomerChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Company name"
                  placeholder="Choose or type customer name"
                  autoComplete="off"
                  size="medium"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
              )}
            />
            <FieldImage src={photos.company} alt="Company sign" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <Box className={styles.dotMcRow}>
              <TextField
                select
                label="Type"
                value={data.carrierIdType ?? 'dot'}
                onChange={(e) => onChange('carrierIdType', e.target.value)}
                sx={{ flex: '0 0 120px', '& .MuiInputBase-root': { borderRadius: 2 } }}
                size="medium"
              >
                {CARRIER_ID_TYPES.map(({ value, label }) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Number"
                value={data.carrierIdNum ?? ''}
                onChange={(e) => onChange('carrierIdNum', e.target.value)}
                placeholder="DOT or MC number"
                inputProps={{ inputMode: 'numeric' }}
                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                size="medium"
              />
            </Box>
            {(() => {
              const carrierType = data.carrierIdType ?? 'dot';
              const carrierNum = (data.carrierIdNum ?? '').trim();
              if (carrierType !== 'ca' && carrierNum) {
                const validation = validateCarrierId(carrierType, carrierNum);
                if (!validation.valid) {
                  return <Box sx={{ mt: 0.5 }}><span className={styles.vinDecodeError} role="alert">{validation.error}</span></Box>;
                }
                return <Box sx={{ mt: 0.5 }}><span className={styles.vinDecodeOk}>{carrierType === 'dot' ? 'DOT# valid (7 digits)' : 'MC# valid'}</span></Box>;
              }
              return null;
            })()}
            <FieldImage src={photos.dotmc} alt="DOT or MC" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <Autocomplete
              freeSolo
              options={equipmentOptions.map((eq) => ({ unit: eq.unit || '', _id: eq._id })).filter((o) => o.unit)}
              getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.unit || '')}
              value={data.unitNumber ?? ''}
              onChange={(_, newValue) => onChange('unitNumber', typeof newValue === 'string' ? newValue : (newValue?.unit ?? ''))}
              inputValue={data.unitNumber ?? ''}
              onInputChange={(_, val) => onChange('unitNumber', val ?? '')}
              isOptionEqualToValue={(opt, val) => (typeof val === 'string' ? opt?.unit === val : opt?.unit === val?.unit)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Unit number"
                  placeholder="Select existing or enter new unit #"
                  autoComplete="off"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                  size="medium"
                />
              )}
            />
          </Box>
          <Box className={styles.fieldWithImage}>
            <Autocomplete
              options={US_STATE_CODES.map((code) => ({ label: code, code }))}
              value={licenseRegionValue}
              onChange={(_, val) => onChange('licenseRegion', val?.code ?? '')}
              getOptionLabel={(opt) => opt.label}
              isOptionEqualToValue={(a, b) => a?.code === b?.code}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="License region (state)"
                  placeholder="Select or search state"
                  size="medium"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
              )}
              size="small"
            />
            <TextField
              fullWidth
              label="License plate"
              value={data.licensePlate ?? ''}
              onChange={(e) => onChange('licensePlate', e.target.value)}
              placeholder="Enter license plate"
              autoComplete="off"
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            <FieldImage src={photos.license} alt="License plate" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <TextField
              fullWidth
              label="VIN"
              value={data.vin ?? ''}
              onChange={(e) => onChange('vin', e.target.value)}
              placeholder="Enter VIN (17 characters)"
              autoComplete="off"
              inputProps={{ maxLength: 17 }}
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            {/* VIN verify/decode/edit: validation + live decode (interactive: validate in real time, re-capture option) */}
            <Box className={styles.vinVerifyRow}>
              {vinDecodeLoading && <span className={styles.vinDecodeStatus}>Decoding VIN…</span>}
              {vinDecodeError && <span className={styles.vinDecodeError}>{vinDecodeError}</span>}
              {!vinDecodeLoading && vinForDecode.length === 17 && (() => {
                const validation = validateVIN(vinForDecode);
                if (validation.valid) return <span className={styles.vinDecodeOk}>VIN valid ✓ – Verify and edit below if needed</span>;
                // Auto-correct I/O/Q (OCR confusion); if corrected VIN is valid, show success instead of error
                if (validation.error === 'VIN cannot contain I, O, or Q') {
                  const corrected = correctVIN(vinForDecode);
                  if (validateVIN(corrected).valid) return <span className={styles.vinDecodeOk}>VIN valid ✓ – Verify and edit below if needed</span>;
                }
                return <span className={styles.vinDecodeError} role="alert">{validation.error}</span>;
              })()}
              {!vinDecodeLoading && !vinDecodeError && vinForDecode.length > 0 && vinForDecode.length !== 17 && <span className={styles.vinDecodeError}>Enter 17 characters</span>}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={handleDecodeVIN}
                disabled={vinForDecode.length !== 17}
                className={styles.reCaptureBtn}
              >
                Decode VIN
              </Button>
              {onReCaptureVIN && (
                <Button type="button" size="small" onClick={onReCaptureVIN} className={styles.reCaptureBtn}>
                  Re-capture VIN photo
                </Button>
              )}
            </Box>
            <Box className={styles.yearMakeModelRow}>
              <TextField
                label="Year"
                value={data.year ?? ''}
                onChange={(e) => onChange('year', e.target.value)}
                placeholder="Year"
                size="small"
                sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Make"
                value={data.make ?? ''}
                onChange={(e) => onChange('make', e.target.value)}
                placeholder="Make"
                size="small"
                sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Model"
                value={data.model ?? ''}
                onChange={(e) => onChange('model', e.target.value)}
                placeholder="Model"
                size="small"
                sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-root': { borderRadius: 2 } }}
              />
            </Box>
            <FieldImage src={photos.vin} alt="VIN" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <TextField
              fullWidth
              label="Odometer"
              value={data.odometer ?? ''}
              onChange={(e) => onChange('odometer', e.target.value)}
              placeholder="Enter odometer reading"
              inputProps={{ inputMode: 'numeric' }}
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            <FieldImage src={photos.odometerCropped || (odometerCroppedRef?.current) || photos.odometer} alt="Odometer" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={creating}
            className={styles.createBtn}
            sx={{
              mt: 1,
              py: 1.5,
              fontSize: 16,
              fontWeight: 600,
              bgcolor: 'secondary.main',
              color: '#fff',
              borderRadius: 2,
              boxShadow: '0 2px 12px rgba(6, 214, 160, 0.25)',
              '&:hover': { bgcolor: 'secondary.dark', boxShadow: '0 4px 16px rgba(6, 214, 160, 0.3)' },
            }}
          >
            {creating ? 'Creating…' : 'Create job file'}
          </Button>
        </Box>
      </Paper>
      <FullScreenImageViewer
        open={fullScreenImage.open}
        src={fullScreenImage.src}
        alt={fullScreenImage.alt}
        onClose={() => setFullScreenImage({ open: false, src: null, alt: '' })}
      />
      <Dialog open={!!existingUnitDialog} onClose={handleExistingUnitYes} aria-labelledby="existing-unit-dialog-title">
        <DialogTitle id="existing-unit-dialog-title">Unit already exists</DialogTitle>
        <DialogContent>
          {existingUnitDialog && (
            <p>
              Unit <strong>{existingUnitDialog.unitNumber}</strong> already exists for <strong>{existingUnitDialog.companyName}</strong>. Use the same one?
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleExistingUnitNo} color="primary">No (create new unit)</Button>
          <Button onClick={handleExistingUnitYes} variant="contained" color="primary">Yes</Button>
        </DialogActions>
      </Dialog>
      {onStartOver && (
        <Button
          type="button"
          onClick={onStartOver}
          className={styles.startOver}
          sx={{ mt: 2.5, color: 'text.secondary', textTransform: 'none' }}
        >
          Start over
        </Button>
      )}
    </Box>
  );
}
