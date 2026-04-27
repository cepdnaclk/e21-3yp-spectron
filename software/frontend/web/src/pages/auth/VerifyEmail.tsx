import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MarkEmailRead, Spa } from '@mui/icons-material';
import { resendVerification, verifyEmail } from '../../services/authService';
import { getApiErrorMessage } from '../../utils/apiError';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verificationStartedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    if (verificationStartedRef.current) {
      return;
    }
    verificationStartedRef.current = true;

    const token = searchParams.get('token') || '';
    if (!token.trim()) {
      setError('Verification token is missing.');
      setLoading(false);
      return;
    }

    verifyEmail(token)
      .then((response) => {
        setSuccess(response.message || 'Email verified successfully.');
        window.setTimeout(() => navigate('/signin'), 1800);
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, 'Email verification failed.'));
      })
      .finally(() => setLoading(false));
  }, [navigate, searchParams]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResendMessage('');
    setResending(true);

    try {
      const response = await resendVerification(email);
      setResendMessage(response.message || 'If an account needs verification, a verification email has been sent.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not request a new verification email.'));
    } finally {
      setResending(false);
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
            minHeight: { xs: 240, md: 520 },
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
            <Typography variant="h4">Verify your email.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)' }}>
              Confirming your email keeps account access tied to a real inbox.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3' }}>
            <MarkEmailRead />
            <Typography variant="body2" fontWeight={800}>Account verification</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Email Verification
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            We are checking the verification link from your email.
          </Typography>

          {loading && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={22} />
              <Typography>Verifying email...</Typography>
            </Stack>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success} Redirecting to sign in...
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {error && (
            <Box component="form" onSubmit={handleResend} sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={resending}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="secondary"
                sx={{ mt: 2 }}
                disabled={resending}
              >
                {resending ? 'Sending...' : 'Resend Verification Email'}
              </Button>
            </Box>
          )}

          {resendMessage && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {resendMessage}
            </Alert>
          )}

          <Typography align="center" sx={{ mt: 3 }}>
            <Link to="/signin">Back to Sign In</Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmail;
