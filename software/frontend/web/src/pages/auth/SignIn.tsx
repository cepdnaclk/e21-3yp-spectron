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
import { AdminPanelSettings, Spa, Sensors, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../utils/apiError';

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
      navigate('/controllers');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', display: 'grid', alignItems: 'center', py: 4 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' }, gap: 3, alignItems: 'stretch' }}>
        <Box
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 2,
            bgcolor: '#3c3911',
            color: '#fffdf8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: { xs: 280, md: 560 },
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bgcolor: 'rgba(235, 79, 18, 0.24)', right: -60, top: -50 }} />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative' }}>
            <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'secondary.main' }}>
              <Spa />
            </Box>
            <Typography variant="h5">Spectron</Typography>
          </Stack>
          <Box sx={{ position: 'relative', maxWidth: 520 }}>
            <Typography variant="h4">Smart monitoring that feels alive.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)' }}>
              Sign in to manage controllers, configure AI-assisted sensors, and keep your environment readings easy to understand.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3' }}>
            <Sensors />
            <Typography variant="body2" fontWeight={800}>Real-time IoT dashboard</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome back
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
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
