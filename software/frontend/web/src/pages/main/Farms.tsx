import React, { useEffect, useState } from 'react';
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
  TextField,
  Typography,
} from '@mui/material';
import { Add, Agriculture, ArrowForward, Place } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import FarmLocationPicker, { FarmLocationSelection } from '../../components/FarmLocationPicker';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import { createFarm, Farm, getFarms } from '../../services/farmService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const roleLabel = (role: Farm['role']) => (role === 'owner' ? 'Owner' : 'Viewer');

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
  const [farmName, setFarmName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<FarmLocationSelection | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [formError, setFormError] = useState('');

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
  useRealtimeRefresh('customer', load);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const handleCreate = async () => {
    try {
      if (!farmName.trim()) {
        setFormError('Farm name is required.');
        return;
      }
      if (selectedLocation && !locationConfirmed) {
        setFormError('Confirm the selected farm location before creating.');
        return;
      }
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
        name: farmName.trim(),
        latitude: selectedLocation?.latitude,
        longitude: selectedLocation?.longitude,
        location_accuracy_m: selectedLocation?.accuracyM,
        location_label: selectedLocation?.label,
        location_source: selectedLocation?.source,
      });
      setFarms((current) => [farm, ...current]);
      setOpenCreate(false);
      setFarmName('');
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
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <PageHeaderPanel
        title="My Farms"
        subtitle="Short list. Fast access."
        icon={<Agriculture />}
        info="Farms hold the customer side of the system."
        actions={
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
        }
      />

      <Grid container spacing={2}>
        {farms.length === 0 ? (
          <Grid item xs={12}>
            <EmptyStateCard
              title="No farms yet"
              icon={<Place sx={{ fontSize: 38 }} />}
              action={
                <Button
                  startIcon={<Add />}
                  variant="contained"
                  onClick={() => {
                    setFormError('');
                    setOpenCreate(true);
                  }}
                >
                  Add Farm
                </Button>
              }
            />
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
                        </Stack>
                      </Box>
                    </Stack>
                    <ArrowForward color="action" sx={{ mt: 0.25 }} />
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
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              fullWidth
              autoFocus
            />
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
          <Button variant="contained" onClick={handleCreate} disabled={saving || !farmName.trim()}>
            {saving ? 'Saving' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      </PageShell>
    </Container>
  );
};

export default Farms;
