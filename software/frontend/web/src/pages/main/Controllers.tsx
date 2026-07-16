import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { Agriculture, DeviceHub, DoneAll, Sensors, SettingsInputAntenna } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { ControllersSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, MetricCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import {
  Farm,
  FarmController,
  getFarmControllers,
  getFarmSensorBases,
  getFarms,
  getSensorModules,
  SensorBase,
  SensorModule,
} from '../../services/farmService';

type ControllerRow = {
  farm: Farm;
  controller: FarmController;
  bases: SensorBase[];
  modulesByBase: Record<string, SensorModule[]>;
};

const statusColor = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'online' || normalized === 'live') {
    return 'success' as const;
  }
  if (normalized === 'pending_setup' || normalized === 'waiting_setup') {
    return 'warning' as const;
  }
  if (normalized === 'offline' || normalized === 'error') {
    return 'error' as const;
  }
  return 'default' as const;
};

const humanize = (value?: string | null) =>
  (value || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'No update';
  }
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Controllers: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || '';
  const [farms, setFarms] = useState<Farm[]>([]);
  const [rows, setRows] = useState<ControllerRow[]>([]);
  const [farmFilter, setFarmFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(navigationMessage);
  const [error, setError] = useState('');

  const loadControllers = useCallback(async () => {
    try {
      setLoading(true);
      const nextFarms = await getFarms();
      setFarms(nextFarms);
      const selectedFarms = farmFilter === 'all' ? nextFarms : nextFarms.filter((farm) => farm.id === farmFilter);

      const nextRows = await Promise.all(
        selectedFarms.map(async (farm) => {
          const [controllers, bases] = await Promise.all([
            getFarmControllers(farm.id),
            getFarmSensorBases(farm.id),
          ]);
          const modulePairs = await Promise.all(
            bases.map(async (base) => [base.id, await getSensorModules(base.id)] as const),
          );
          const modulesByBase = Object.fromEntries(modulePairs);

          return controllers.map((controller) => ({
            farm,
            controller,
            bases: bases.filter((base) => base.gateway_id === controller.id),
            modulesByBase,
          }));
        }),
      );

      setRows(nextRows.flat().sort((a, b) => a.farm.name.localeCompare(b.farm.name)));
    } catch (err) {
      console.error(err);
      setError('Failed to load controllers.');
    } finally {
      setLoading(false);
    }
  }, [farmFilter]);

  useEffect(() => {
    loadControllers();
  }, [loadControllers]);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          const channels = row.bases.reduce(
            (sum, base) =>
              sum + (row.modulesByBase[base.id] || []).reduce((moduleSum, module) => moduleSum + module.channels.length, 0),
            0,
          );
          acc.controllers += 1;
          acc.bases += row.bases.length;
          acc.channels += channels;
          if (row.controller.status === 'online') {
            acc.online += 1;
          }
          return acc;
        },
        { controllers: 0, bases: 0, channels: 0, online: 0 },
      ),
    [rows],
  );

  if (loading) {
    return <ControllersSkeleton />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(successMessage)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setSuccessMessage('')}>
        {successMessage}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <PageShell>
        <PageHeaderPanel
          title="Controllers"
          subtitle="Farm gateways, sensor bases, and channels."
          icon={<DeviceHub />}
          info="Controllers belong to farms. Field links come from sensor base assignments."
          actions={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
                <InputLabel id="controller-farm-filter-label">Farm</InputLabel>
                <Select
                  labelId="controller-farm-filter-label"
                  label="Farm"
                  value={farmFilter}
                  onChange={(event) => setFarmFilter(event.target.value)}
                >
                  <MenuItem value="all">All farms</MenuItem>
                  {farms.map((farm) => (
                    <MenuItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="contained" color="secondary" onClick={() => navigate('/farms')}>
                Farm Setup
              </Button>
            </Stack>
          }
        />

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}>
          <MetricCard label="Controllers" value={totals.controllers} icon={<DeviceHub fontSize="small" />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard label="Online" value={totals.online} icon={<DoneAll fontSize="small" />} tone="success.main" />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard label="Bases" value={totals.bases} icon={<Sensors fontSize="small" />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard label="Channels" value={totals.channels} icon={<SettingsInputAntenna fontSize="small" />} tone="info.main" />
        </Grid>
      </Grid>

      {farms.length === 0 ? (
        <EmptyStateCard
          icon={<Agriculture sx={{ fontSize: 38 }} />}
          title="No farms"
          action={
            <Button variant="contained" color="secondary" sx={{ mt: 2 }} onClick={() => navigate('/farms')}>
              Farm Setup
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyStateCard
          icon={<DoneAll sx={{ fontSize: 38 }} />}
          title="No controllers"
          action={
            <Button variant="contained" color="secondary" sx={{ mt: 2 }} onClick={() => navigate('/farms')}>
              Farm Setup
            </Button>
          }
        />
      ) : (
        <Grid container spacing={1.5}>
          {rows.map(({ farm, controller, bases, modulesByBase }) => {
            const fieldNames = Array.from(
              new Set(
                bases
                  .map((base) => base.current_assignment?.field_name || base.current_assignment?.monitoring_zone)
                  .filter(Boolean),
              ),
            ) as string[];
            const channelCount = bases.reduce(
              (sum, base) =>
                sum + (modulesByBase[base.id] || []).reduce((moduleSum, module) => moduleSum + module.channels.length, 0),
              0,
            );

            return (
              <Grid item xs={12} md={6} key={controller.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    bgcolor: 'rgba(255,253,248,0.94)',
                    boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)',
                    transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                    '&:hover': {
                      borderColor: 'rgba(108,137,48,0.35)',
                      boxShadow: '0 18px 36px rgba(60, 57, 17, 0.1)',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                    <Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="flex-start">
                      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                        <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: 'rgba(108, 137, 48, 0.12)', flexShrink: 0 }}>
                          <DeviceHub color="primary" fontSize="small" />
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                            {controller.serial_number}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {farm.name}
                          </Typography>
                        </Box>
                      </Stack>
                      <Chip size="small" label={humanize(controller.status)} color={statusColor(controller.status)} />
                    </Stack>

                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                      <Chip size="small" icon={<Sensors />} label={`${bases.length} bases`} />
                      <Chip size="small" icon={<SettingsInputAntenna />} label={`${channelCount} channels`} />
                      {controller.model && <Chip size="small" label={controller.model} variant="outlined" />}
                    </Stack>

                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary">Fields</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {fieldNames.length ? (
                          fieldNames.slice(0, 5).map((name) => <Chip key={name} size="small" label={name} variant="outlined" />)
                        ) : (
                          <Chip size="small" label="No field link" variant="outlined" />
                        )}
                      </Stack>
                    </Box>

                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(controller.last_seen)}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => navigate(`/farms/${farm.id}`)}>
                        Open Farm
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
      </PageShell>
    </Container>
  );
};

export default Controllers;
