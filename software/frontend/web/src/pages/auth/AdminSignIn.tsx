import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  Fade,
  CircularProgress,
} from '@mui/material';
import {
  DevicesOther,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../utils/apiError';
import SpectronLogo from '../../components/SpectronLogo';

const AdminSignIn: React.FC = () => {
  const navigate = useNavigate();
  const { adminLogin, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showError, setShowError] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!error) return;
    setShowError(true);
    const timeout = window.setTimeout(() => setShowError(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setShowError(false);
    setLoading(true);

    try {
      const user = await adminLogin({ email, password });
      if (user.account_type !== 'ADMIN') {
        await logout();
        setError('This account does not have admin access.');
        return;
      }
      navigate('/admin');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to sign in as admin'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100dvh', display: 'grid', alignItems: 'center', py: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.95fr 1.05fr' }, gap: { xs: 1.5, md: 3 }, alignItems: 'stretch' }}>
        <Box
          sx={{
            p: { xs: 2.5, md: 5 },
            borderRadius: 2,
            bgcolor: '#262411',
            color: '#fffdf8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: { xs: 145, md: 560 },
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bgcolor: 'rgba(108, 137, 48, 0.28)', right: -70, top: -55 }} />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative' }}>
            <SpectronLogo size={42} />
            <Typography variant="h5">Spectron Admin</Typography>
          </Stack>
          <Box sx={{ position: 'relative', maxWidth: 540 }}>
            <Typography variant="h4" sx={{ fontSize: { xs: '1.45rem', sm: '2rem', md: undefined } }}>Register devices before users claim them.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)', display: { xs: 'none', sm: 'block' } }}>
              Admin accounts manage controller IDs, QR labels, users, and system readiness.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3', display: { xs: 'none', md: 'flex' } }}>
            <DevicesOther />
            <Typography variant="body2" fontWeight={800}>Hardware registry console</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 2, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Admin login
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Sign in with an administrator account.
          </Typography>

          {error && (
            <Fade in={showError} timeout={450} onExited={() => setError('')}>
              <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            </Fade>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Admin Email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              margin="normal"
              required
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter admin password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              margin="normal"
              required
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((current) => !current)}
                      onMouseDown={(event) => event.preventDefault()}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="secondary"
              sx={{
                mt: 3,
                mb: 2,
                minHeight: 46,
                '& .MuiCircularProgress-root': {
                  color: 'inherit',
                },
              }}
              disabled={loading}
            >
              {loading ? (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                  <CircularProgress size={18} thickness={5} />
                  <span>Signing in...</span>
                </Stack>
              ) : (
                'Sign In to Admin Portal'
              )}
            </Button>
            <Typography align="center" variant="body2">
              User account? <Link to="/signin">Go to user login</Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default AdminSignIn;
