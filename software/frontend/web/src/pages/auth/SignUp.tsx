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
} from '@mui/material';
import { PersonAddAlt, Spa, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!error) return;
    setShowError(true);
    const timeout = window.setTimeout(() => setShowError(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  React.useEffect(() => {
    if (!success) return;
    setShowSuccess(true);
    const timeout = window.setTimeout(() => setShowSuccess(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setShowError(false);
    setShowSuccess(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await register({
        email,
        password,
        phone: phone || undefined,
        name: name || undefined,
        organizationName: organizationName || undefined,
      });
      setSuccess('Signup request submitted. You can log in after the system admin approves your owner account.');
      setTimeout(() => navigate('/signin'), 1800);
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message =
        typeof responseData === 'string'
          ? responseData
          : responseData?.message || 'Failed to create account';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', display: 'grid', alignItems: 'center', py: 4 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.95fr 1.05fr' }, gap: 3, alignItems: 'stretch' }}>
        <Box
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 2,
            bgcolor: '#3c3911',
            color: '#fffdf8',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: { xs: 240, md: 620 },
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bgcolor: 'rgba(108, 137, 48, 0.28)', right: -40, bottom: -60 }} />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative' }}>
            <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'secondary.main' }}>
              <Spa />
            </Box>
            <Typography variant="h5">Spectron</Typography>
          </Stack>
          <Box sx={{ position: 'relative', maxWidth: 520 }}>
            <Typography variant="h4">Build a clearer sensing workspace.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)' }}>
            Request an owner account. Once approved, you can pair controllers and invite viewers.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3' }}>
            <PersonAddAlt />
            <Typography variant="body2" fontWeight={800}>Fast setup for teams and labs</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Create Account
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Submit an owner account request for admin approval.
          </Typography>

          {error && (
            <Fade in={showError} timeout={450} onExited={() => setError('')}>
              <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            </Fade>
          )}
          {success && (
            <Fade in={showSuccess} timeout={450} onExited={() => setSuccess('')}>
              <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>
            </Fade>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Organization"
              placeholder="Your lab, school, or company"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              margin="normal"
              disabled={loading}
            />
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
              label="Phone (Optional)"
              type="tel"
              placeholder="+94 77 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              margin="normal"
              disabled={loading}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
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
            <TextField
              fullWidth
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
              required
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      onMouseDown={(event) => event.preventDefault()}
                      edge="end"
                    >
                      {showConfirmPassword ? <Visibility /> : <VisibilityOff />}
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
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              Sign Up
            </Button>
            <Typography align="center">
              Already have an account? <Link to="/signin">Sign In</Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default SignUp;
