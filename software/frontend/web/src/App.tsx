import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, responsiveFontSizes } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignIn from './pages/auth/SignIn';
import AdminSignIn from './pages/auth/AdminSignIn';
import SignUp from './pages/auth/SignUp';
import VerifyEmail from './pages/auth/VerifyEmail';
import Controllers from './pages/main/Controllers';
import PairController from './pages/main/PairController';
import ControllerDashboard from './pages/main/ControllerDashboard';
import SensorConfig from './pages/main/SensorConfig';
import Monitoring from './pages/main/Monitoring';
import Alerts from './pages/main/Alerts';
import Profile from './pages/main/Profile';
import Team from './pages/main/Team';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import { AuthGateSkeleton } from './components/LoadingSkeletons';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminDevices from './pages/admin/AdminDevices';
import AdminAddDevice from './pages/admin/AdminAddDevice';
import AdminUsers from './pages/admin/AdminUsers';
import AdminSystem from './pages/admin/AdminSystem';
import AdminAudit from './pages/admin/AdminAudit';

let theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6c8930',
      light: '#8fae45',
      dark: '#3c3911',
      contrastText: '#fffdf8',
    },
    secondary: {
      main: '#eb4f12',
      light: '#f37b3f',
      dark: '#a93910',
      contrastText: '#fffdf8',
    },
    background: {
      default: '#faf0ea',
      paper: '#fffdf8',
    },
    text: {
      primary: '#262411',
      secondary: '#6a624f',
    },
    success: {
      main: '#6c8930',
    },
    warning: {
      main: '#dba048',
    },
    error: {
      main: '#da3608',
    },
    info: {
      main: '#337a85',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h5: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 750,
      letterSpacing: 0,
    },
    button: {
      fontWeight: 750,
      letterSpacing: 0,
      textTransform: 'none',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#faf0ea',
        },
        '@media (max-width: 599.95px)': {
          '.MuiContainer-root': {
            paddingLeft: '14px',
            paddingRight: '14px',
          },
          '.MuiCardContent-root': {
            padding: '16px',
          },
          '.MuiTypography-h4': {
            fontSize: '1.75rem',
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
          },
          '.MuiTypography-h5': {
            fontSize: '1.35rem',
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
          },
          '.MuiTypography-h6': {
            overflowWrap: 'anywhere',
          },
          '.MuiButton-root': {
            minWidth: 0,
          },
          '.MuiDialog-paper': {
            margin: '14px',
            width: 'calc(100% - 28px)',
            maxHeight: 'calc(100% - 28px)',
          },
          '.MuiDialogTitle-root': {
            padding: '18px 18px 8px',
          },
          '.MuiDialogContent-root': {
            paddingLeft: '18px',
            paddingRight: '18px',
          },
          '.MuiDialogActions-root': {
            padding: '12px 18px 18px',
            flexDirection: 'column-reverse',
            alignItems: 'stretch',
          },
          '.MuiDialogActions-root > .MuiButton-root': {
            marginLeft: '0 !important',
            width: '100%',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(60, 57, 17, 0.1)',
          borderRadius: 14,
          boxShadow: 'none',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          minHeight: 44,
          paddingLeft: 18,
          paddingRight: 18,
          whiteSpace: 'normal',
          lineHeight: 1.25,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          boxShadow: 'none',
        },
        containedSecondary: {
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 750,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        InputLabelProps: {
          shrink: true,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          position: 'relative',
          transform: 'none',
          marginBottom: 6,
          color: '#6a624f',
          fontWeight: 750,
          '&.Mui-focused': {
            color: '#6c8930',
          },
        },
        shrink: {
          transform: 'none',
        },
        asterisk: {
          color: '#eb4f12',
        },
      },
    },
    MuiFormControl: {
      styleOverrides: {
        root: {
          '& .MuiInputLabel-root + .MuiInputBase-root': {
            marginTop: 0,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: '#fffdf8',
        },
        input: {
          padding: '18px 20px',
          '&:-webkit-autofill': {
            WebkitBoxShadow: '0 0 0 100px #fffdf8 inset',
            WebkitTextFillColor: '#262411',
            caretColor: '#262411',
            borderRadius: 16,
            transition: 'background-color 9999s ease-out 0s',
          },
          '&:-webkit-autofill:hover': {
            WebkitBoxShadow: '0 0 0 100px #fffdf8 inset',
            WebkitTextFillColor: '#262411',
          },
          '&:-webkit-autofill:focus': {
            WebkitBoxShadow: '0 0 0 100px #fffdf8 inset',
            WebkitTextFillColor: '#262411',
          },
        },
        notchedOutline: {
          top: 0,
          legend: {
            display: 'none',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1.5px solid rgba(60, 57, 17, 0.12)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          textTransform: 'none',
        },
      },
    },
  },
});

theme = responsiveFontSizes(theme, { factor: 3 });

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthGateSkeleton />;
  }

  if (!user || user.account_type === 'ADMIN') {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
}

const hasAdminAccess = (user: ReturnType<typeof useAuth>['user']) => {
  return user?.account_type === 'ADMIN';
};

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthGateSkeleton />;
  }

  if (!user) {
    return <Navigate to="/admin/signin" />;
  }

  return hasAdminAccess(user) ? <>{children}</> : <Navigate to="/controllers" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/admin/signin" element={<AdminSignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/controllers" replace />} />
        <Route path="controllers" element={<Controllers />} />
        <Route path="controllers/pair" element={<PairController />} />
        <Route path="controllers/:id" element={<ControllerDashboard />} />
        <Route path="hardware/:controllerId/sensors" element={<ControllerDashboard />} />
        <Route path="hardware/:controllerId/sensors/:sensorId/configure" element={<SensorConfig />} />
        <Route path="sensors/:id/config" element={<SensorConfig />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="team" element={<Team />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="devices" element={<AdminDevices />} />
        <Route path="devices/new" element={<AdminAddDevice />} />
        <Route path="pairing" element={<Navigate to="/admin/devices" replace />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
