import { createTheme } from '@mui/material/styles';

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4361ee' },
    secondary: { main: '#06d6a0', dark: '#05b88a' },
    background: {
      default: '#0f0f1a',
      paper: '#1a1a2e',
    },
    text: {
      primary: '#e8e8ed',
      secondary: '#9ca3af',
    },
    divider: '#2d2d44',
  },
  shape: { borderRadius: 10 },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#0f0f1a',
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3d3d5c' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4361ee' },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          padding: '14px 40px 14px 16px',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#0f0f1a',
            padding: '4px 9px',
          },
        },
      },
    },
  },
});
