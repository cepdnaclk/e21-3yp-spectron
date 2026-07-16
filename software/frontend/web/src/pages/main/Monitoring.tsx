import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Agriculture,
  DeviceHub,
  DoneAll,
  InfoOutlined,
  Memory,
  Sensors,
  WarningAmber,
} from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { MonitoringSkeleton } from '../../components/LoadingSkeletons';
import {
  Farm,
  FarmController,
  Field,
  getFarmControllers,
  getFarmFields,
  getFarmSensorBases,
  getFarms,
  getSensorModules,
  SensorBase,
  SensorModule,
} from '../../services/farmService';

type FarmMonitoringSummary = {
  farm: Farm;
  fields: Field[];
  controllers: FarmController[];
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

const Monitoring: React.FC = () => {
  const [farmFilter, setFarmFilter] = useState('all');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [summaries, setSummaries] = useState<FarmMonitoringSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMonitoring = useCallback(async () => {
    try {
      setLoading(true);
      const nextFarms = await getFarms();
      setFarms(nextFarms);
      const selectedFarms = farmFilter === 'all' ? nextFarms : nextFarms.filter((farm) => farm.id === farmFilter);
      const nextSummaries = await Promise.all(
        selectedFarms.map(async (farm) => {
          const [fields, controllers, bases] = await Promise.all([
            getFarmFields(farm.id),
            getFarmControllers(farm.id),
            getFarmSensorBases(farm.id),
          ]);
          const modulePairs = await Promise.all(
            bases.map(async (base) => [base.id, await getSensorModules(base.id)] as const),
          );
          return {
            farm,
            fields,
            controllers,
            bases,
            modulesByBase: Object.fromEntries(modulePairs),
          };
        }),
      );
      setSummaries(nextSummaries);
    } catch (err) {
      console.error(err);
      setError('Failed to load monitoring.');
    } finally {
      setLoading(false);
    }
  }, [farmFilter]);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring]);

  const totalFields = useMemo(() => summaries.reduce((sum, item) => sum + item.fields.length, 0), [summaries]);
  const totalBases = useMemo(() => summaries.reduce((sum, item) => sum + item.bases.length, 0), [summaries]);
  const totalChannels = useMemo(
    () =>
      summaries.reduce(
        (sum, item) =>
          sum +
          Object.values(item.modulesByBase).reduce(
            (moduleSum, modules) => moduleSum + modules.reduce((channelSum, module) => channelSum + module.channels.length, 0),
            0,
          ),
        0,
      ),
    [summaries],
  );
  const liveBases = useMemo(
    () => summaries.reduce((sum, item) => sum + item.bases.filter((base) => base.status === 'live').length, 0),
    [summaries],
  );
  const livePercent = totalBases ? Math.round((liveBases / totalBases) * 100) : 0;

  if (loading) {
    return <MonitoringSkeleton />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h4">Monitoring</Typography>
          <Tooltip title="Live status is grouped by farm, field assignment, sensor base, module, and channel.">
            <IconButton size="small" aria-label="Monitoring details">
              <InfoOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
          <InputLabel id="monitoring-farm-filter-label">Farm</InputLabel>
          <Select
            labelId="monitoring-farm-filter-label"
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
      </Stack>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Fields</Typography>
              <Typography variant="h5">{totalFields}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Bases</Typography>
              <Typography variant="h5">{totalBases}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Channels</Typography>
              <Typography variant="h5">{totalChannels}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Live</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5">{livePercent}%</Typography>
                <LinearProgress variant="determinate" value={livePercent} sx={{ flex: 1, height: 8, borderRadius: 999 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {summaries.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <DoneAll color="primary" sx={{ fontSize: 44, mb: 1 }} />
            <Typography variant="h6">No farms</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {summaries.map((summary) => {
            const assignedBaseCount = summary.bases.filter((base) => Boolean(base.current_assignment?.field_id)).length;
            const farmChannelCount = Object.values(summary.modulesByBase).reduce(
              (sum, modules) => sum + modules.reduce((moduleSum, module) => moduleSum + module.channels.length, 0),
              0,
            );

            return (
              <Card key={summary.farm.id} variant="outlined">
                <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                    <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Agriculture color="primary" fontSize="small" />
                        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                          {summary.farm.name}
                        </Typography>
                        <Chip size="small" label={humanize(summary.farm.role)} variant="outlined" />
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        <Chip size="small" icon={<DeviceHub />} label={`${summary.controllers.length} controllers`} />
                        <Chip size="small" icon={<Sensors />} label={`${assignedBaseCount}/${summary.bases.length} bases`} />
                        <Chip size="small" icon={<Memory />} label={`${farmChannelCount} channels`} />
                      </Stack>
                    </Stack>
                    {summary.bases.some((base) => ['offline', 'error'].includes(base.status)) && (
                      <Chip icon={<WarningAmber />} color="error" label="Needs attention" size="small" />
                    )}
                  </Stack>

                  <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                    {summary.controllers.map((controller) => {
                      const controllerBases = summary.bases.filter((base) => base.gateway_id === controller.id);
                      return (
                        <Grid item xs={12} md={6} key={controller.id}>
                          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                                  {controller.serial_number}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {formatDateTime(controller.last_seen)}
                                </Typography>
                              </Box>
                              <Chip size="small" label={humanize(controller.status)} color={statusColor(controller.status)} />
                            </Stack>

                            <Stack spacing={1} sx={{ mt: 1.25 }}>
                              {controllerBases.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                  No bases
                                </Typography>
                              ) : (
                                controllerBases.map((base) => {
                                  const modules = summary.modulesByBase[base.id] || [];
                                  const channelCount = modules.reduce((sum, module) => sum + module.channels.length, 0);
                                  return (
                                    <Box key={base.id} sx={{ bgcolor: 'rgba(108, 137, 48, 0.08)', borderRadius: 1, p: 1 }}>
                                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
                                            {base.label || base.serial_number}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            {base.current_assignment?.field_name || base.current_assignment?.monitoring_zone || 'Unassigned'}
                                          </Typography>
                                        </Box>
                                        <Chip size="small" label={humanize(base.status)} color={statusColor(base.status)} />
                                      </Stack>
                                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                                        <Chip size="small" label={`${modules.length} modules`} variant="outlined" />
                                        <Chip size="small" label={`${channelCount} channels`} variant="outlined" />
                                        {modules.flatMap((module) => module.channels).slice(0, 4).map((channel) => (
                                          <Chip
                                            key={channel.id}
                                            size="small"
                                            label={`${humanize(channel.measurement_type)}${channel.unit ? ` ${channel.unit}` : ''}`}
                                          />
                                        ))}
                                      </Stack>
                                    </Box>
                                  );
                                })
                              )}
                            </Stack>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Container>
  );
};

export default Monitoring;
