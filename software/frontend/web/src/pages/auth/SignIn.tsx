import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  IconButton,
  InputAdornment,
  Fade,
  CircularProgress,
} from '@mui/material';
import { AdminPanelSettings, Sensors, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../utils/apiError';
import SpectronLogo from '../../components/SpectronLogo';

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowError(false);
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/farms');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      maxWidth="lg"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        alignItems: 'center',
        px: { xs: 2, sm: 3 },
        py: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' }, gap: { xs: 1.5, md: 3 }, alignItems: 'stretch' }}>
        <Box
          sx={{
            p: { xs: 2.25, md: 5 },
            borderRadius: { xs: 3, md: 2 },
            bgcolor: '#3c3911',
            color: '#fffdf8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: { xs: 'flex-start', md: 'space-between' },
            minHeight: { xs: 142, md: 560 },
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'absolute', width: { xs: 180, md: 260 }, height: { xs: 180, md: 260 }, borderRadius: '50%', bgcolor: 'rgba(235, 79, 18, 0.24)', right: -60, top: -50 }} />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative' }}>
            <SpectronLogo size={42} />
            <Typography variant="h5">Spectron</Typography>
          </Stack>
          <Box sx={{ position: 'relative', maxWidth: 520, mt: { xs: 2, md: 0 } }}>
            <Typography variant="h4" sx={{ fontSize: { xs: '1.55rem', sm: '2rem', md: undefined } }}>Smart monitoring that feels alive.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)', display: { xs: 'none', sm: 'block' } }}>
              Sign in to manage controllers, configure AI-assisted sensors, and keep your environment readings easy to understand.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3', display: { xs: 'none', md: 'flex' } }}>
            <Sensors />
            <Typography variant="body2" fontWeight={800}>Real-time IoT dashboard</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 2.25, sm: 3, md: 4 }, borderRadius: { xs: 3, md: 2 }, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome back
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: { xs: 2, md: 3 } }}>
            Sign in to manage your monitoring kit.
          </Typography>

          {error && (
            <Fade in={showError} timeout={450} onExited={() => setError('')}>
              <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            </Fade>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                      {showPassword ? <Visibility /> : <VisibilityOff />}
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
                mt: { xs: 2, md: 3 },
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
                'Sign In'
              )}
            </Button>
            <Typography align="center">
              Don't have an account? <Link to="/signup">Sign Up</Link>
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AdminPanelSettings />}
              sx={{ mt: 2 }}
              onClick={() => navigate('/admin/signin')}
            >
              Login as Admin
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default SignIn;
