import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  Typography,
  Box,
  Fab,
  Stack,
  Button,
} from '@mui/material';
import { Add, Hub as ChipIcon, Place, Sensors, ArrowForward } from '@mui/icons-material';
import { Controller } from '../../services/controllerService';
import { getMyHardwareControllers } from '../../services/hardwarePairingService';
import { ControllersSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const Controllers: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || '';
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(navigationMessage);

  useEffect(() => {
    loadControllers();
  }, []);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const loadControllers = async () => {
    try {
      const data = await getMyHardwareControllers();
      setControllers(data);
    } catch (error) {
      console.error('Error loading controllers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':    return { bg: 'rgba(108, 137, 48, 0.14)', text: '#4a6220', border: 'rgba(108,137,48,0.28)' };
      case 'OFFLINE':   return { bg: 'rgba(218, 54, 8, 0.10)',   text: '#b02a06', border: 'rgba(218,54,8,0.22)' };
      case 'PENDING_CONFIG': return { bg: 'rgba(219, 160, 72, 0.14)', text: '#8a5f10', border: 'rgba(219,160,72,0.3)' };
      default:          return { bg: 'rgba(60, 57, 17, 0.08)',   text: '#6a624f', border: 'rgba(60,57,17,0.18)' };
    }
  };

  if (loading) {
    return <ControllersSkeleton />;
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <Box
        sx={{
          mb: { xs: 2.5, md: 3 },
          p: { xs: '20px 20px 22px', md: '28px 32px 32px' },
          borderRadius: { xs: 3, md: 3 },
          bgcolor: '#3c3911',
          color: '#fffdf8',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255, 253, 248, 0.07)',
          boxShadow: '0 4px 24px rgba(60, 57, 17, 0.18)',
        }}
      >
        {/* decorative blob */}
        <Box
          sx={{
            position: 'absolute',
            right: { xs: -20, md: 40 },
            top: { xs: -50, md: 10 },
            width: { xs: 180, md: 240 },
            height: { xs: 180, md: 240 },
            borderRadius: '50%',
            bgcolor: 'rgba(235, 79, 18, 0.20)',
            pointerEvents: 'none',
          }}
        />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 2, md: 2 }}
          justifyContent="space-between"
          sx={{ position: 'relative' }}
        >
          <Box sx={{ maxWidth: { xs: '100%', md: 640 } }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 900,
                lineHeight: 1.2,
                fontSize: { xs: '1.45rem', sm: '1.75rem', md: '2rem' },
                wordBreak: 'break-word',
              }}
            >
              Keep every Spectron node in view.
            </Typography>
            <Typography
              sx={{
                mt: 1,
                color: 'rgba(255, 253, 248, 0.72)',
                fontSize: { xs: '0.82rem', sm: '0.95rem' },
                display: { xs: 'none', sm: 'block' },
                maxWidth: 580,
              }}
            >
              Add, configure, and monitor your connected sensing hardware from one calm workspace.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Add />}
            onClick={() => navigate('/controllers/pair')}
            sx={{
              alignSelf: { xs: 'stretch', md: 'flex-end' },
              display: { xs: 'none', md: 'inline-flex' },
              flexShrink: 0,
            }}
          >
            Add Controller
          </Button>
        </Stack>
      </Box>

      <AutoDismissAlert
        open={Boolean(successMessage)}
        severity="success"
        sx={{ mb: 2 }}
        onCloseAlert={() => setSuccessMessage('')}
      >
        {successMessage}
      </AutoDismissAlert>

      {/* ── Controller Cards ─────────────────────────────────────────── */}
      <Grid container spacing={{ xs: 1.5, sm: 2 }}>
        {controllers.length === 0 ? (
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 3 }}>
              <Box sx={{ py: 7, textAlign: 'center', px: 2 }}>
                <Sensors color="primary" sx={{ fontSize: 48, mb: 1.5, opacity: 0.7 }} />
                <Typography variant="h6" fontWeight={800}>No controllers paired yet</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75, mb: 2.5, fontSize: '0.9rem' }}>
                  Add your first controller to start collecting field data.
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<Add />}
                  onClick={() => navigate('/controllers/pair')}
                >
                  Add Controller
                </Button>
              </Box>
            </Card>
          </Grid>
        ) : (
          controllers.map((controller) => {
            const rawStatus = controller.operational_status || controller.status;
            const statusColors = getStatusColor(rawStatus);
            const claimStatus = controller.claim_status || 'CLAIMED';
            const isOnline = rawStatus === 'ONLINE';

            return (
              <Grid item xs={12} sm={6} md={4} key={controller.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '20px',
                    border: '1.5px solid rgba(60, 57, 17, 0.09)',
                    boxShadow: '0 2px 16px rgba(60, 57, 17, 0.07)',
                    overflow: 'hidden',
                    background: '#fffdf8',
                    transition: 'box-shadow 220ms ease, transform 220ms ease, border-color 220ms ease',
                    '&:hover': {
                      boxShadow: '0 10px 32px rgba(60, 57, 17, 0.14)',
                      borderColor: `${statusColors.border}`,
                      transform: 'translateY(-3px)',
                    },
                    '&:active': { transform: 'translateY(-1px)' },
                  }}
                  onClick={() => navigate(`/controllers/${controller.id}`)}
                >
                  {/* ── Coloured accent bar at top ── */}
                  <Box
                    sx={{
                      height: 5,
                      background: isOnline
                        ? 'linear-gradient(90deg, #3c3910 0%, #6a6820 100%)'
                        : rawStatus === 'OFFLINE'
                        ? 'linear-gradient(90deg, #da3608 0%, #f37b3f 100%)'
                        : 'linear-gradient(90deg, #dba048 0%, #f0c97a 100%)',
                    }}
                  />

                  {/* ── Card body ── */}
                  <Box sx={{ p: { xs: '18px 18px 14px', sm: '20px 22px 16px' }, flexGrow: 1 }}>

                    {/* Icon + name row */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.75, mb: 2 }}>

                      {/* Glassy icon bubble */}
                      <Box
                        sx={{
                          flexShrink: 0,
                          width: 50,
                          height: 50,
                          borderRadius: '14px',
                          background: 'linear-gradient(145deg, rgba(60,57,16,0.16) 0%, rgba(60,57,16,0.06) 100%)',
                          border: '1.5px solid rgba(60,57,16,0.22)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                        }}
                      >
                        <ChipIcon sx={{ color: 'primary.main', fontSize: 24 }} />
                      </Box>

                      {/* Name + hw_id */}
                      <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                        <Typography
                          sx={{
                            fontWeight: 900,
                            fontSize: { xs: '1.05rem', sm: '1.1rem' },
                            lineHeight: 1.2,
                            color: 'text.primary',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {controller.name || 'Unnamed Controller'}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.4,
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            fontFamily: 'monospace',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {controller.hw_id}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Purpose */}
                    {controller.purpose && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1.75,
                          fontSize: '0.82rem',
                          lineHeight: 1.55,
                          display: { xs: 'none', sm: '-webkit-box' },
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {controller.purpose}
                      </Typography>
                    )}

                    {/* ── Badge row ── */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: controller.purpose ? 0 : 0.5 }}>

                      {/* Claim badge */}
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          px: '10px',
                          py: '4px',
                          borderRadius: '999px',
                          background: 'linear-gradient(135deg, rgba(60,57,16,0.15) 0%, rgba(60,57,16,0.07) 100%)',
                          border: '1px solid rgba(60,57,16,0.30)',
                          color: '#3c3910',
                          fontSize: '0.63rem',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {claimStatus}
                      </Box>

                      {/* Status badge with live dot */}
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          px: '10px',
                          py: '4px',
                          borderRadius: '999px',
                          background: `linear-gradient(135deg, ${statusColors.bg} 0%, ${statusColors.bg.replace('0.14','0.06').replace('0.10','0.04').replace('0.08','0.03')} 100%)`,
                          border: `1px solid ${statusColors.border}`,
                          color: statusColors.text,
                          fontSize: '0.63rem',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {/* Live pulse dot */}
                        <Box
                          component="span"
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: statusColors.text,
                            flexShrink: 0,
                            ...(isOnline && {
                              animation: 'pulse-dot 1.8s ease-in-out infinite',
                              '@keyframes pulse-dot': {
                                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                '50%': { opacity: 0.45, transform: 'scale(0.7)' },
                              },
                            }),
                          }}
                        />
                        {rawStatus}
                      </Box>

                      {/* Location pill (if present) */}
                      {controller.location && (
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            px: '8px',
                            py: '4px',
                            borderRadius: '999px',
                            bgcolor: 'rgba(60,57,17,0.06)',
                            border: '1px solid rgba(60,57,17,0.12)',
                            color: 'text.secondary',
                            fontSize: '0.63rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <Place sx={{ fontSize: 10, flexShrink: 0 }} />
                          {controller.location}
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* ── Touch-friendly footer CTA ── */}
                  <Box
                    sx={{
                      minHeight: 46,
                      px: { xs: 2.25, sm: 2.75 },
                      borderTop: '1.5px solid rgba(60, 57, 17, 0.07)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'linear-gradient(90deg, rgba(60,57,16,0.06) 0%, rgba(60,57,16,0.02) 100%)',
                      transition: 'background 220ms ease',
                      '&:hover': {
                        background: 'linear-gradient(90deg, rgba(60,57,16,0.12) 0%, rgba(60,57,16,0.05) 100%)',
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#3c3910',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      View Dashboard
                    </Typography>
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        bgcolor: '#3c3910',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(60,57,16,0.35)',
                        flexShrink: 0,
                      }}
                    >
                      <ArrowForward sx={{ fontSize: 14, color: '#fffdf8' }} />
                    </Box>
                  </Box>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>

      {/* ── FAB ────────────────────────────────────────────────────── */}
      <Fab
        color="secondary"
        aria-label="add"
        sx={{
          position: 'fixed',
          bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', md: 28 },
          right: { xs: 16, md: 24 },
          width: { xs: 52, md: 56 },
          height: { xs: 52, md: 56 },
          boxShadow: '0 6px 20px rgba(235, 79, 18, 0.38)',
          transition: 'transform 160ms ease, box-shadow 160ms ease',
          '&:hover': {
            transform: 'scale(1.06)',
            boxShadow: '0 8px 28px rgba(235, 79, 18, 0.48)',
          },
          '&:active': { transform: 'scale(0.97)' },
        }}
        onClick={() => navigate('/controllers/pair')}
      >
        <Add />
      </Fab>
    </Container>
  );
};

export default Controllers;
