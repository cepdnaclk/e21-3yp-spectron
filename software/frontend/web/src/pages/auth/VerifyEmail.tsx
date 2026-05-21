import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Login, Spa } from '@mui/icons-material';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();

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
            minHeight: { xs: 240, md: 460 },
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
            <Typography variant="h4">Email verification is turned off.</Typography>
            <Typography sx={{ mt: 1.5, color: 'rgba(255, 253, 248, 0.76)' }}>
              Accounts can now sign in directly without confirming a verification link.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', color: '#e1c7a3' }}>
            <Login />
            <Typography variant="body2" fontWeight={800}>Sign in and continue setup</Typography>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, border: '1.5px solid rgba(60, 57, 17, 0.12)', alignSelf: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Sign In Directly
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            If you came here from an older verification link, you can safely ignore it and continue to sign in.
          </Typography>

          <Button
            fullWidth
            variant="contained"
            color="secondary"
            startIcon={<Login />}
            onClick={() => navigate('/signin')}
          >
            Go to Sign In
          </Button>

          <Typography align="center" sx={{ mt: 3 }}>
            <Link to="/signup">Need a new account?</Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmail;
