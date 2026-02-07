import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import styles from './IntakeReview.module.css';
import { getCustomersList } from '../api/client';

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

export function IntakeReview({ data, onChange, onCreateIntake, creating, createError, onStartOver }) {
  const [customerOptions, setCustomerOptions] = useState([]);

  useEffect(() => {
    getCustomersList()
      .then((list) => setCustomerOptions(list))
      .catch(() => setCustomerOptions([]));
  }, []);

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
            if (!creating) onCreateIntake();
          }}
        >
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
