import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ArrowForward, Info, Place } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import { createFarm, Farm, getFarms } from '../../services/farmService';

const shortPoint = (value?: number | null) => (typeof value === 'number' ? value.toFixed(4) : '—');

const Farms: React.FC = () => {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', area: '' });

  const ownerCount = useMemo(() => farms.filter((farm) => farm.role === 'owner').length, [farms]);
  const viewerCount = farms.length - ownerCount;

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

  const handleCreate = async () => {
    try {
      setSaving(true);
      const farm = await createFarm({
        name: form.name.trim(),
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        area: form.area ? Number(form.area) : undefined,
      });
      setFarms((current) => [farm, ...current]);
      setOpenCreate(false);
      setForm({ name: '', latitude: '', longitude: '', area: '' });
      setNotice('Farm created.');
      navigate(`/farms/${farm.id}`);
    } catch (err) {
      console.error(err);
      setError('Failed to create farm.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageHeaderSkeleton />;
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4">My Farms</Typography>
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

        <Button startIcon={<Add />} variant="contained" onClick={() => setOpenCreate(true)} sx={{ alignSelf: 'flex-start' }}>
          Add Farm
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Farms</Typography>
              <Typography variant="h4">{farms.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Owner</Typography>
              <Typography variant="h4">{ownerCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Viewer</Typography>
              <Typography variant="h4">{viewerCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <FormControlLabel
                control={<Switch checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} />}
                label="Show coords"
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {farms.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 6, textAlign: 'center' }}>
                <Place color="primary" sx={{ fontSize: 44 }} />
                <Typography variant="h6" sx={{ mt: 1 }}>
                  No farms yet
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Add one to begin.
                </Typography>
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
                  border: '1px solid rgba(60,57,17,0.1)',
                  '&:hover': { borderColor: 'rgba(108,137,48,0.35)' },
                }}
                onClick={() => navigate(`/farms/${farm.id}`)}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box>
                      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                        {farm.name}
                      </Typography>
                      <Chip size="small" label={farm.role} sx={{ mt: 1 }} />
                    </Box>
                    <ArrowForward color="action" />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                    <Chip size="small" label={farm.area ? `${farm.area} ha` : 'Area n/a'} />
                    {showCoords && (
                      <>
                        <Chip size="small" label={`Lat ${shortPoint(farm.latitude)}`} />
                        <Chip size="small" label={`Lon ${shortPoint(farm.longitude)}`} />
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Farm</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Farm name"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              fullWidth
              autoFocus
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Latitude"
                value={form.latitude}
                onChange={(e) => setForm((current) => ({ ...current, latitude: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Longitude"
                value={form.longitude}
                onChange={(e) => setForm((current) => ({ ...current, longitude: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Area"
              value={form.area}
              onChange={(e) => setForm((current) => ({ ...current, area: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Farms;
