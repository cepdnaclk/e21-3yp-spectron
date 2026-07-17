import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Agriculture, ArrowForward, Info, Place, Refresh, Terrain, VisibilityOutlined } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import FarmLocationPicker, { FarmLocationSelection } from '../../components/FarmLocationPicker';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import { createFarm, Farm, getFarms } from '../../services/farmService';

const shortPoint = (value?: number | null) => (typeof value === 'number' ? value.toFixed(4) : '—');
const roleLabel = (role: Farm['role']) => (role === 'owner' ? 'Owner' : 'Viewer');

const parseOptionalNumber = (value: string, label: string, min?: number, max?: number) => {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`${label} is too low.`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`${label} is too high.`);
  }
  return parsed;
};

const Farms: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || '';
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(navigationMessage);
  const [error, setError] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [form, setForm] = useState({ name: '', area: '' });
  const [selectedLocation, setSelectedLocation] = useState<FarmLocationSelection | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [formError, setFormError] = useState('');

  const ownerCount = useMemo(() => farms.filter((farm) => farm.role === 'owner').length, [farms]);
  const viewerCount = farms.length - ownerCount;

  const closeCreateDialog = () => {
    if (saving) {
      return;
    }
    setOpenCreate(false);
    setFormError('');
    setSelectedLocation(null);
    setLocationConfirmed(false);
  };

  const load = async () => {
    try {
      setLoading(true);
      setFarms(await getFarms());
    } catch (err) {
      console.error(err);
      setError('Failed to load farms.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const handleCreate = async () => {
    try {
      if (!form.name.trim()) {
        setFormError('Farm name is required.');
        return;
      }
      if (selectedLocation && !locationConfirmed) {
        setFormError('Confirm the selected farm location before creating.');
        return;
      }
      const area = parseOptionalNumber(form.area, 'Area', 0);
      if (selectedLocation) {
        if (selectedLocation.latitude < -90 || selectedLocation.latitude > 90) {
          setFormError('Latitude must be between -90 and 90.');
          return;
        }
        if (selectedLocation.longitude < -180 || selectedLocation.longitude > 180) {
          setFormError('Longitude must be between -180 and 180.');
          return;
        }
      }

      setSaving(true);
      const farm = await createFarm({
        name: form.name.trim(),
        area,
        latitude: selectedLocation?.latitude,
        longitude: selectedLocation?.longitude,
        location_accuracy_m: selectedLocation?.accuracyM,
        location_label: selectedLocation?.label,
        location_source: selectedLocation?.source,
      });
      setFarms((current) => [farm, ...current]);
      setOpenCreate(false);
      setForm({ name: '', area: '' });
      setSelectedLocation(null);
      setLocationConfirmed(false);
      setFormError('');
      setNotice('Farm created.');
      navigate(`/farms/${farm.id}`);
    } catch (err) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'Failed to create farm.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageHeaderSkeleton />;
  }

  return (
    <Container
      maxWidth="xl"
      sx={{
        py: { xs: 2, md: 3 },
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: { xs: '12px 12px auto 12px', md: '16px 24px auto 24px' },
          height: { xs: 110, md: 140 },
          borderRadius: 4,
          background:
            'linear-gradient(90deg, rgba(235, 79, 18, 0.08), rgba(108, 137, 48, 0.08) 55%, rgba(51, 122, 133, 0.06))',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          mb: 3,
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: '1px solid rgba(60, 57, 17, 0.1)',
          bgcolor: 'rgba(255, 253, 248, 0.9)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 16px 40px rgba(60, 57, 17, 0.08)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={2}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(108, 137, 48, 0.12)',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              <Agriculture />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography variant="h4" sx={{ overflowWrap: 'anywhere' }}>
                  My Farms
                </Typography>
                <Tooltip title="Farms hold the customer side of the system.">
                  <IconButton size="small" aria-label="Farm help">
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Short list. Fast access.
              </Typography>
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignSelf: { xs: 'stretch', md: 'auto' } }}>
            <Button startIcon={<Refresh />} variant="outlined" onClick={load} sx={{ minWidth: { xs: '100%', sm: 0 } }}>
              Refresh
            </Button>
            <Button
              startIcon={<Add />}
              variant="contained"
              onClick={() => {
                setFormError('');
                setSelectedLocation(null);
                setLocationConfirmed(false);
                setOpenCreate(true);
              }}
              sx={{ minWidth: { xs: '100%', sm: 0 } }}
            >
              Add Farm
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 2.5, position: 'relative', zIndex: 1 }}>
        {[
          { label: 'Farms', value: farms.length, icon: <Terrain fontSize="small" />, tone: 'primary.main' },
          { label: 'Owned', value: ownerCount, icon: <Agriculture fontSize="small" />, tone: 'secondary.main' },
          { label: 'Viewed', value: viewerCount, icon: <VisibilityOutlined fontSize="small" />, tone: 'info.main' },
        ].map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                bgcolor: 'rgba(255,253,248,0.92)',
                borderColor: 'rgba(60, 57, 17, 0.1)',
                boxShadow: '0 10px 24px rgba(60, 57, 17, 0.06)',
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(108, 137, 48, 0.12)',
                      color: item.tone,
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="h4" sx={{ lineHeight: 1 }}>
                      {item.value}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              bgcolor: 'rgba(255,253,248,0.92)',
              borderColor: 'rgba(60, 57, 17, 0.1)',
              boxShadow: '0 10px 24px rgba(60, 57, 17, 0.06)',
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Map detail
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Show coords
                  </Typography>
                </Box>
                <Tooltip title="Reveal latitude and longitude on each farm card.">
                  <IconButton size="small" aria-label="Coords help">
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Switch
                checked={showCoords}
                onChange={(e) => setShowCoords(e.target.checked)}
                inputProps={{ 'aria-label': 'Show coordinates' }}
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
        {farms.length === 0 ? (
          <Grid item xs={12}>
            <Card
              variant="outlined"
              sx={{
                borderStyle: 'dashed',
                bgcolor: 'rgba(255,253,248,0.86)',
                boxShadow: '0 10px 24px rgba(60, 57, 17, 0.05)',
              }}
            >
              <CardContent sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    mx: 'auto',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(108, 137, 48, 0.1)',
                    color: 'primary.main',
                  }}
                >
                  <Place sx={{ fontSize: 38 }} />
                </Box>
                <Typography variant="h6" sx={{ mt: 2 }}>
                  No farms yet
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Add one to begin.
                </Typography>
                <Button
                  startIcon={<Add />}
                  variant="contained"
                  sx={{ mt: 2.5 }}
                  onClick={() => {
                    setFormError('');
                    setOpenCreate(true);
                  }}
                >
                  Add Farm
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          farms.map((farm) => (
            <Grid item xs={12} md={6} lg={4} key={farm.id}>
              <Card
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  bgcolor: 'rgba(255,253,248,0.94)',
                  border: '1px solid rgba(60,57,17,0.1)',
                  boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)',
                  transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                  '&:hover': {
                    borderColor: 'rgba(108,137,48,0.35)',
                    boxShadow: '0 18px 36px rgba(60, 57, 17, 0.1)',
                    transform: 'translateY(-2px)',
                  },
                }}
                onClick={() => navigate(`/farms/${farm.id}`)}
              >
                <Box sx={{ height: 6, bgcolor: farm.role === 'owner' ? 'primary.main' : 'info.main' }} />
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.25}>
                    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2,
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: 'rgba(108, 137, 48, 0.12)',
                          color: 'primary.main',
                          flexShrink: 0,
                        }}
                      >
                        <Place fontSize="small" />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6" sx={{ lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                          {farm.name}
                        </Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                          <Chip size="small" label={roleLabel(farm.role)} />
                          <Chip size="small" label={farm.area ? `${farm.area} ha` : 'Area n/a'} variant="outlined" />
                        </Stack>
                      </Box>
                    </Stack>
                    <ArrowForward color="action" sx={{ mt: 0.25 }} />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.75 }} flexWrap="wrap">
                    {showCoords && (
                      <>
                        <Chip size="small" label={`Lat ${shortPoint(farm.latitude)}`} variant="outlined" />
                        <Chip size="small" label={`Lon ${shortPoint(farm.longitude)}`} variant="outlined" />
                      </>
                    )}
                  </Stack>
                  <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 1.75 }}>
                    <Button size="small" variant="outlined">
                      Open Farm
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      <Dialog open={openCreate} onClose={closeCreateDialog} fullWidth maxWidth="md">
        <DialogTitle>Add Farm</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(formError)} severity="error" onCloseAlert={() => setFormError('')}>
              {formError}
            </AutoDismissAlert>
            <TextField
              label="Farm name"
              placeholder="eg: North Paddy Farm"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              fullWidth
              autoFocus
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Area (ha)"
                placeholder="eg: 2.5"
                value={form.area}
                onChange={(e) => setForm((current) => ({ ...current, area: e.target.value }))}
                fullWidth
              />
            </Stack>
            <FarmLocationPicker
              value={selectedLocation}
              confirmed={locationConfirmed}
              disabled={saving}
              onChange={(location) => {
                setSelectedLocation(location);
                setLocationConfirmed(false);
              }}
              onConfirm={() => setLocationConfirmed(true)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateDialog} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !form.name.trim() || Boolean(selectedLocation && !locationConfirmed)}>
            {saving ? 'Saving' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Farms;
