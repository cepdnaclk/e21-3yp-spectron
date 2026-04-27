import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha, Theme } from '@mui/material/styles';
import {
  CheckCircle,
  DeviceHub,
  Refresh,
  Sensors,
  Thermostat,
  WaterDrop,
  Straighten,
  TipsAndUpdates,
  WarningAmber,
  Tune,
} from '@mui/icons-material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getSensorReadings,
  Sensor,
  SensorReading,
  SensorConfig,
} from '../../services/sensorService';
import {
  getHardwareSensors,
  getMyHardwareControllers,
} from '../../services/hardwarePairingService';
import { MonitoringSkeleton } from '../../components/LoadingSkeletons';
import { getSensorMetrics, ThresholdRange } from '../../utils/sensorConfig';

type SensorPoint = {
  label: string;
  shortLabel: string;
  value: number;
  time: string;
};

type SensorHealth = 'normal' | 'warning' | 'critical' | 'inactive';

type SensorCardData = {
  controllerName: string;
  controllerLocation?: string;
  controllerStatus: string;
  sensor: Sensor;
  trend: SensorPoint[];
  latestValue: number | null;
  latestTime?: string;
  health: SensorHealth;
  healthLabel: string;
  insight: string;
  threshold?: ThresholdRange;
  presentationProfile: string;
  useCase: string;
};

type ControllerMonitoringGroup = {
  id: string;
  name: string;
  location?: string;
  status: string;
  lastSeen?: string;
  sensors: SensorCardData[];
};

const formatTimeLabel = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const shouldRenderTick = (index: number, total: number) => {
  if (total <= 1) {
    return true;
  }

  const targetTicks = total <= 4 ? total : 4;
  const interval = Math.max(1, Math.floor((total - 1) / Math.max(1, targetTicks - 1)));
  return index === 0 || index === total - 1 || index % interval === 0;
};

const formatDateTime = (isoString?: string) => {
  if (!isoString) {
    return 'No recent update';
  }

  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatYAxisTick = (value: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (Math.abs(value) >= 100) {
    return Math.round(value).toString();
  }

  return value.toFixed(0);
};

const toReadingValue = (reading: SensorReading): number | null => {
  if (typeof reading.value === 'number') return reading.value;
  if (typeof reading.avg_value === 'number') return reading.avg_value;
  return null;
};

const sortReadingsAscending = (readings: SensorReading[]) =>
  [...readings].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

const getPrimaryThreshold = (sensor: Sensor): ThresholdRange | undefined => {
  const config = sensor.active_config as SensorConfig | undefined;
  if (!config) {
    return undefined;
  }

  const primaryMetric = getSensorMetrics(sensor.type)[0]?.key;
  if (primaryMetric && config.metric_thresholds?.[primaryMetric]) {
    return config.metric_thresholds[primaryMetric];
  }

  return config.thresholds;
};

const getPresentationProfile = (sensor: Sensor) => {
  const savedProfile = sensor.active_config?.presentation_profile?.trim();
  if (savedProfile) {
    return savedProfile;
  }

  switch (sensor.type.toLowerCase()) {
    case 'ultrasonic':
      return 'level_monitoring';
    case 'load':
    case 'load_cell':
    case 'gas_sensor':
    case 'air_quality':
      return 'gauge_status';
    default:
      return 'single_trend';
  }
};

const getUseCase = (sensor: Sensor) => {
  const savedUseCase = sensor.active_config?.use_case?.trim();
  if (savedUseCase) {
    return savedUseCase;
  }

  switch (sensor.type.toLowerCase()) {
    case 'temperature':
    case 'humidity':
    case 'temperature_humidity':
    case 'temp_humidity':
    case 'dht11':
    case 'dht22':
      return 'climate_monitoring';
    case 'ultrasonic':
      return 'fill_level_monitoring';
    case 'load':
    case 'load_cell':
      return 'load_monitoring';
    case 'gas_sensor':
    case 'air_quality':
      return 'safety_monitoring';
    default:
      return 'generic_monitoring';
  }
};

const formatUseCaseLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getProfileBadgeLabel = (profile: string) => {
  switch (profile) {
    case 'dual_climate':
      return 'Climate View';
    case 'level_monitoring':
      return 'Level View';
    case 'counter_status':
      return 'Status View';
    case 'gauge_status':
      return 'Gauge View';
    case 'event_timeline':
      return 'Timeline View';
    default:
      return 'Trend View';
  }
};

const getVisualizationMode = (useCase: string, profile: string, sensorType: string) => {
  if (profile === 'level_monitoring' || profile === 'gauge_status') {
    return 'gauge';
  }
  if (profile === 'counter_status' || useCase === 'occupancy_monitoring' || useCase === 'attendance_monitoring') {
    return 'bar';
  }
  if (profile === 'event_timeline') {
    return 'timeline';
  }
  if (
    profile === 'dual_climate' ||
    useCase === 'climate_monitoring' ||
    sensorType.toLowerCase() === 'humidity'
  ) {
    return 'area';
  }
  return 'line';
};

const getSensorIcon = (sensorType: string) => {
  switch (sensorType.toLowerCase()) {
    case 'temperature':
      return Thermostat;
    case 'humidity':
      return WaterDrop;
    case 'ultrasonic':
    case 'load':
    case 'load_cell':
      return Straighten;
    default:
      return Sensors;
  }
};

const getSensorUnit = (sensor: Sensor) => {
  return sensor.unit || (
    sensor.type === 'temperature'
      ? 'C'
      : sensor.type === 'humidity'
        ? '%RH'
        : sensor.type === 'ultrasonic'
          ? 'cm'
          : sensor.type === 'load' || sensor.type === 'load_cell'
            ? 'kg'
          : ''
  );
};

const getGaugeValue = (
  latestValue: number | null,
  threshold?: ThresholdRange,
  trend: SensorPoint[] = []
) => {
  if (latestValue === null) {
    return 0;
  }

  const maxReference =
    threshold?.warning_max ??
    threshold?.max ??
    Math.max(...trend.map((point) => point.value), latestValue, 1);

  if (!Number.isFinite(maxReference) || maxReference <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (latestValue / maxReference) * 100));
};

const formatSensorValue = (value: number | null, unit?: string) => {
  if (value === null) {
    return 'No live data';
  }
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
};

const evaluateHealth = (
  sensor: Sensor,
  latestValue: number | null,
  threshold?: ThresholdRange
): { health: SensorHealth; label: string; insight: string } => {
  if (latestValue === null) {
    return {
      health: sensor.status === 'OK' ? 'inactive' : 'critical',
      label: sensor.status === 'OK' ? 'Waiting for data' : 'Offline',
      insight:
        sensor.status === 'OK'
          ? 'Sensor is connected, but no recent readings are available yet.'
          : 'Sensor is not reporting right now.',
    };
  }

  if (!threshold) {
    return {
      health: sensor.status === 'OK' ? 'normal' : 'warning',
      label: sensor.status === 'OK' ? 'Live' : 'Check sensor',
      insight:
        sensor.status === 'OK'
          ? 'Live readings are coming in.'
          : 'Sensor needs attention before readings can be trusted.',
    };
  }

  if (threshold.warning_min !== undefined && latestValue < threshold.warning_min) {
    return {
      health: 'critical',
      label: 'Critical',
      insight: 'Reading is well below the safe minimum range.',
    };
  }

  if (threshold.warning_max !== undefined && latestValue > threshold.warning_max) {
    return {
      health: 'critical',
      label: 'Critical',
      insight: 'Reading is well above the safe maximum range.',
    };
  }

  if (threshold.min !== undefined && latestValue < threshold.min) {
    return {
      health: 'warning',
      label: 'Attention',
      insight: 'Reading is below the preferred minimum threshold.',
    };
  }

  if (threshold.max !== undefined && latestValue > threshold.max) {
    return {
      health: 'warning',
      label: 'Attention',
      insight: 'Reading is above the preferred maximum threshold.',
    };
  }

  return {
    health: 'normal',
    label: 'Normal',
    insight: 'Reading is comfortably within the configured range.',
  };
};

const getHealthStyles = (theme: Theme, health: SensorHealth) => {
  switch (health) {
    case 'critical':
      return {
        tint: alpha(theme.palette.error.main, 0.12),
        accent: theme.palette.error.main,
        readingColor: theme.palette.error.main,
        borderColor: alpha(theme.palette.error.main, 0.7),
        chipColor: 'error' as const,
      };
    case 'warning':
      return {
        tint: alpha(theme.palette.warning.main, 0.14),
        accent: theme.palette.warning.main,
        readingColor: theme.palette.warning.dark,
        borderColor: alpha(theme.palette.warning.main, 0.6),
        chipColor: 'warning' as const,
      };
    case 'inactive':
      return {
        tint: 'rgba(51, 122, 133, 0.12)',
        accent: theme.palette.info.main,
        readingColor: theme.palette.text.primary,
        borderColor: 'rgba(60, 57, 17, 0.08)',
        chipColor: 'info' as const,
      };
    default:
      return {
        tint: alpha(theme.palette.primary.main, 0.12),
        accent: theme.palette.primary.main,
        readingColor: theme.palette.primary.dark,
        borderColor: alpha(theme.palette.primary.main, 0.28),
        chipColor: 'success' as const,
      };
  }
};

const getTrendDelta = (trend: SensorPoint[]) => {
  if (trend.length < 2) {
    return null;
  }

  const first = trend[0].value;
  const last = trend[trend.length - 1].value;
  const delta = last - first;

  if (Math.abs(delta) < 0.2) {
    return '24h steady';
  }
  if (delta > 0) {
    return `24h change +${delta.toFixed(1)}`;
  }
  return `24h change -${Math.abs(delta).toFixed(1)}`;
};

const Monitoring: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [controllers, setControllers] = useState<ControllerMonitoringGroup[]>([]);

  const loadMonitoringData = useCallback(async ({ showSkeleton = false }: { showSkeleton?: boolean } = {}) => {
    try {
      if (showSkeleton) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setErrorMessage(null);

      const controllerList = await getMyHardwareControllers();

      const groupedControllers = await Promise.all(
        controllerList.map(async (controller) => {
          const sensors = await getHardwareSensors(controller.id);
          const to = new Date();
          const from = new Date();
          from.setDate(to.getDate() - 1);

          const sensorCards = await Promise.all(
            sensors.map(async (sensor) => {
              const readings = await getSensorReadings(sensor.id, {
                from: from.toISOString(),
                to: to.toISOString(),
              }).catch(() => []);

              const sorted = sortReadingsAscending(readings);
              const trend = sorted
                .map((reading) => {
                  const value = toReadingValue(reading);
                  if (value === null) {
                    return null;
                  }

                  return {
                    label: formatTimeLabel(reading.time),
                    shortLabel: formatTimeLabel(reading.time),
                    value,
                    time: reading.time,
                  };
                })
                .filter((point): point is SensorPoint => point !== null);

              const latestPoint = trend[trend.length - 1];
              const threshold = getPrimaryThreshold(sensor);
              const evaluated = evaluateHealth(sensor, latestPoint?.value ?? null, threshold);
              const presentationProfile = getPresentationProfile(sensor);
              const useCase = getUseCase(sensor);

              return {
                controllerName: controller.name || controller.hw_id || 'Controller',
                controllerLocation: controller.location,
                controllerStatus: controller.status,
                sensor,
                trend,
                latestValue: latestPoint?.value ?? null,
                latestTime: latestPoint?.time,
                threshold,
                health: evaluated.health,
                healthLabel: evaluated.label,
                insight: evaluated.insight,
                presentationProfile,
                useCase,
              } satisfies SensorCardData;
            })
          );

          return {
            id: controller.id,
            name: controller.name || controller.hw_id || 'Controller',
            location: controller.location,
            status: controller.status,
            lastSeen: controller.last_seen,
            sensors: sensorCards.sort(
              (a, b) =>
                a.sensor.type.localeCompare(b.sensor.type) ||
                (a.sensor.name || '').localeCompare(b.sensor.name || '')
            ),
          } satisfies ControllerMonitoringGroup;
        })
      );

      setControllers(groupedControllers);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      setErrorMessage('Failed to load monitoring data. Please try again.');
    } finally {
      if (showSkeleton) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoringData({ showSkeleton: true });
    const intervalId = window.setInterval(() => {
      loadMonitoringData({ showSkeleton: false });
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadMonitoringData]);

  const summary = useMemo(() => {
    const allSensors = controllers.flatMap((controller) => controller.sensors);
    return {
      controllers: controllers.length,
      healthy: allSensors.filter((sensor) => sensor.health === 'normal').length,
      needsAttention: allSensors.filter(
        (sensor) => sensor.health === 'warning' || sensor.health === 'critical'
      ).length,
    };
  }, [controllers]);

  if (loading) {
    return <MonitoringSkeleton />;
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" color="secondary" fontWeight={800}>
          Monitoring
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Box>
            <Typography variant="h4">Live Monitoring</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 700 }}>
              Keep the view simple: each controller gets its own section, and each sensor shows one
              clear status, one current reading, and one lightweight visual.
            </Typography>
            {lastUpdatedAt && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                Updated{' '}
                {lastUpdatedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Typography>
            )}
          </Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => loadMonitoringData({ showSkeleton: false })}
            disabled={refreshing}
            sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1, bgcolor: '#fffaf4' }}>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ p: 1.2, borderRadius: '50%', bgcolor: alpha(theme.palette.secondary.main, 0.12) }}>
              <DeviceHub color="secondary" />
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Controllers
              </Typography>
              <Typography variant="h5">{summary.controllers}</Typography>
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, bgcolor: '#f7fbf0' }}>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ p: 1.2, borderRadius: '50%', bgcolor: alpha(theme.palette.primary.main, 0.12) }}>
              <CheckCircle color="primary" />
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Within Range
              </Typography>
              <Typography variant="h5">{summary.healthy}</Typography>
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, bgcolor: '#fff7ef' }}>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ p: 1.2, borderRadius: '50%', bgcolor: alpha(theme.palette.warning.main, 0.18) }}>
              <WarningAmber sx={{ color: theme.palette.warning.dark }} />
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Needs Attention
              </Typography>
              <Typography variant="h5">{summary.needsAttention}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Stack>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {!errorMessage && controllers.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">
              No controllers are available yet. Pair a controller and let it send a discovery or
              reading packet to populate this view.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Stack spacing={2.5}>
        {controllers.map((controller) => {
          const warningCount = controller.sensors.filter(
            (sensor) => sensor.health === 'warning' || sensor.health === 'critical'
          ).length;
          const activeCount = controller.sensors.filter((sensor) => sensor.latestValue !== null).length;

          return (
            <Card key={controller.id} sx={{ overflow: 'hidden' }}>
              <Box
                sx={{
                  px: { xs: 2, md: 3 },
                  py: 2.25,
                  background:
                    'linear-gradient(135deg, rgba(60, 57, 17, 0.96) 0%, rgba(80, 74, 24, 0.94) 100%)',
                  color: '#fffdf8',
                }}
              >
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1.5}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                >
                  <Box>
                    <Typography variant="overline" sx={{ color: '#e8cb99', fontWeight: 800 }}>
                      Controller
                    </Typography>
                    <Typography variant="h5">{controller.name}</Typography>
                    <Typography sx={{ color: 'rgba(255, 253, 248, 0.76)', mt: 0.5 }}>
                      {controller.location || 'Location not set'} • Last update{' '}
                      {formatDateTime(controller.lastSeen)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip
                      label={controller.status === 'ONLINE' ? 'Online' : controller.status}
                      size="small"
                      sx={{
                        bgcolor:
                          controller.status === 'ONLINE'
                            ? '#6c8930'
                            : 'rgba(255, 253, 248, 0.12)',
                        color: '#fffdf8',
                        fontWeight: 800,
                      }}
                    />
                    <Chip
                      label={`${activeCount}/${controller.sensors.length} live`}
                      size="small"
                      sx={{
                        bgcolor: 'rgba(255, 253, 248, 0.12)',
                        color: '#fffdf8',
                        fontWeight: 800,
                      }}
                    />
                    <Chip
                      label={warningCount > 0 ? `${warningCount} to review` : 'All calm'}
                      size="small"
                      sx={{
                        bgcolor:
                          warningCount > 0 ? '#dba048' : 'rgba(255, 253, 248, 0.12)',
                        color: warningCount > 0 ? '#3c3911' : '#fffdf8',
                        fontWeight: 800,
                      }}
                    />
                  </Stack>
                </Stack>
              </Box>

              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Grid container spacing={2}>
                  {controller.sensors.map((item) => {
                    const styles = getHealthStyles(theme, item.health);
                    const SensorIcon = getSensorIcon(item.sensor.type);
                    const trendDelta = getTrendDelta(item.trend);
                    const thresholdSummary = item.threshold
                      ? [
                          item.threshold.min !== undefined ? `Min ${item.threshold.min}` : null,
                          item.threshold.max !== undefined ? `Max ${item.threshold.max}` : null,
                        ]
                          .filter(Boolean)
                          .join(' • ')
                      : item.sensor.config_active
                        ? 'Thresholds active'
                        : 'Thresholds not configured';

                    const visualizationMode = getVisualizationMode(
                      item.useCase,
                      item.presentationProfile,
                      item.sensor.type
                    );
                    const usesGauge = visualizationMode === 'gauge';
                    const chartTitle =
                      item.presentationProfile === 'counter_status'
                        ? 'Recent activity'
                        : item.presentationProfile === 'event_timeline'
                          ? 'Recent events'
                          : usesGauge
                            ? 'Status snapshot'
                            : 'Recent trend';

                    return (
                      <Grid item xs={12} lg={6} key={item.sensor.id}>
                        <Card
                          sx={{
                            height: '100%',
                            bgcolor: '#fffdfa',
                            border: '1px solid',
                            borderColor: styles.borderColor,
                            boxShadow:
                              item.health === 'critical'
                                ? `0 0 0 1px ${alpha(theme.palette.error.main, 0.18)}, 0 14px 28px rgba(60, 57, 17, 0.06)`
                                : '0 14px 28px rgba(60, 57, 17, 0.06)',
                            animation:
                              item.health === 'critical'
                                ? 'monitorCriticalPulse 1.6s ease-in-out infinite'
                                : 'none',
                            '@keyframes monitorCriticalPulse': {
                              '0%': {
                                borderColor: alpha(theme.palette.error.main, 0.45),
                                boxShadow: `0 0 0 0 ${alpha(
                                  theme.palette.error.main,
                                  0
                                )}, 0 14px 28px rgba(60, 57, 17, 0.06)`,
                              },
                              '50%': {
                                borderColor: alpha(theme.palette.error.main, 0.95),
                                boxShadow: `0 0 0 4px ${alpha(
                                  theme.palette.error.main,
                                  0.18
                                )}, 0 14px 28px rgba(60, 57, 17, 0.06)`,
                              },
                              '100%': {
                                borderColor: alpha(theme.palette.error.main, 0.45),
                                boxShadow: `0 0 0 0 ${alpha(
                                  theme.palette.error.main,
                                  0
                                )}, 0 14px 28px rgba(60, 57, 17, 0.06)`,
                              },
                            },
                          }}
                        >
                          <CardContent
                            sx={{ p: 2.25, height: '100%', display: 'flex', flexDirection: 'column' }}
                          >
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="flex-start"
                              spacing={2}
                            >
                              <Stack direction="row" spacing={1.4} alignItems="center">
                                <Box
                                  sx={{
                                    p: 1.1,
                                    borderRadius: 2,
                                    bgcolor: styles.tint,
                                    color: styles.accent,
                                  }}
                                >
                                  <SensorIcon />
                                </Box>
                                <Box>
                                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                                    {item.sensor.name || `${item.sensor.type} Sensor`}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {item.sensor.purpose ||
                                      item.sensor.context?.location?.label ||
                                      item.sensor.hw_id}
                                  </Typography>
                                </Box>
                              </Stack>
                              <Chip size="small" label={item.healthLabel} color={styles.chipColor} />
                            </Stack>

                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={2}
                              justifyContent="space-between"
                              sx={{ mt: 2 }}
                            >
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Current reading
                                </Typography>
                                <Typography
                                  variant="h4"
                                  sx={{
                                    mt: 0.4,
                                    color: styles.readingColor,
                                  }}
                                >
                                  {formatSensorValue(item.latestValue, getSensorUnit(item.sensor))}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                  {item.latestTime
                                    ? `Seen at ${formatDateTime(item.latestTime)}`
                                    : 'No timestamp available'}
                                </Typography>
                              </Box>
                              <Stack spacing={0.75} sx={{ minWidth: { sm: 220 } }}>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={getProfileBadgeLabel(item.presentationProfile)}
                                  sx={{ alignSelf: 'flex-start' }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {trendDelta || 'Needs more readings to show direction'} •{' '}
                                  {thresholdSummary}
                                </Typography>
                              </Stack>
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            {usesGauge ? (
                              <Box>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                  <Typography variant="subtitle2">{chartTitle}</Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {Math.round(
                                      getGaugeValue(
                                        item.latestValue,
                                        item.threshold,
                                        item.trend
                                      )
                                    )}
                                    %
                                  </Typography>
                                </Stack>
                                <LinearProgress
                                  variant="determinate"
                                  value={getGaugeValue(
                                    item.latestValue,
                                    item.threshold,
                                    item.trend
                                  )}
                                  sx={{
                                    height: 12,
                                    borderRadius: 999,
                                    bgcolor: alpha(styles.accent, 0.12),
                                    '& .MuiLinearProgress-bar': {
                                      borderRadius: 999,
                                      bgcolor: styles.accent,
                                    },
                                  }}
                                />
                              </Box>
                            ) : (
                              <Box sx={{ width: '100%', height: 160 }}>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                  sx={{ mb: 1 }}
                                >
                                  <Typography variant="subtitle2">{chartTitle}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {formatUseCaseLabel(item.useCase)}
                                  </Typography>
                                </Stack>
                                <ResponsiveContainer>
                                  {visualizationMode === 'area' ? (
                                    <AreaChart data={item.trend}>
                                      <defs>
                                        <linearGradient
                                          id={`humidity-fill-${item.sensor.id}`}
                                          x1="0"
                                          y1="0"
                                          x2="0"
                                          y2="1"
                                        >
                                          <stop offset="0%" stopColor="#337a85" stopOpacity={0.32} />
                                          <stop offset="100%" stopColor="#337a85" stopOpacity={0.02} />
                                        </linearGradient>
                                      </defs>
                                      <XAxis
                                        dataKey="shortLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        tick={{ fontSize: 11, fill: '#6a624f' }}
                                        tickFormatter={(value, index) =>
                                          shouldRenderTick(index, item.trend.length) ? value : ''
                                        }
                                        minTickGap={24}
                                      />
                                      <YAxis
                                        width={32}
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#8a806d' }}
                                        tickFormatter={formatYAxisTick}
                                      />
                                      <Tooltip />
                                      <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#337a85"
                                        strokeWidth={2}
                                        fill={`url(#humidity-fill-${item.sensor.id})`}
                                      />
                                    </AreaChart>
                                  ) : visualizationMode === 'bar' ? (
                                    <BarChart data={item.trend}>
                                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={alpha(styles.accent, 0.12)} />
                                      <XAxis
                                        dataKey="shortLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        tick={{ fontSize: 11, fill: '#6a624f' }}
                                        tickFormatter={(value, index) =>
                                          shouldRenderTick(index, item.trend.length) ? value : ''
                                        }
                                        minTickGap={24}
                                      />
                                      <YAxis
                                        width={32}
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#8a806d' }}
                                        tickFormatter={formatYAxisTick}
                                      />
                                      <Tooltip />
                                      <Bar
                                        dataKey="value"
                                        fill={alpha(styles.accent, 0.78)}
                                        radius={[6, 6, 0, 0]}
                                      />
                                    </BarChart>
                                  ) : visualizationMode === 'timeline' ? (
                                    <LineChart data={item.trend}>
                                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={alpha(styles.accent, 0.16)} />
                                      <XAxis
                                        dataKey="shortLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        tick={{ fontSize: 11, fill: '#6a624f' }}
                                        tickFormatter={(value, index) =>
                                          shouldRenderTick(index, item.trend.length) ? value : ''
                                        }
                                        minTickGap={24}
                                      />
                                      <YAxis
                                        width={32}
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#8a806d' }}
                                        tickFormatter={formatYAxisTick}
                                      />
                                      <Tooltip />
                                      <Line
                                        type="stepAfter"
                                        dataKey="value"
                                        stroke={styles.accent}
                                        strokeWidth={2.5}
                                        dot={{ r: 2.5, fill: styles.accent }}
                                        activeDot={{ r: 4 }}
                                      />
                                    </LineChart>
                                  ) : (
                                    <LineChart data={item.trend}>
                                      <XAxis
                                        dataKey="shortLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        tick={{ fontSize: 11, fill: '#6a624f' }}
                                        tickFormatter={(value, index) =>
                                          shouldRenderTick(index, item.trend.length) ? value : ''
                                        }
                                        minTickGap={24}
                                      />
                                      <YAxis
                                        width={32}
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#8a806d' }}
                                        tickFormatter={formatYAxisTick}
                                      />
                                      <Tooltip />
                                      <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke={styles.accent}
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                      />
                                    </LineChart>
                                  )}
                                </ResponsiveContainer>
                              </Box>
                            )}

                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1}
                              justifyContent="space-between"
                              alignItems={{ xs: 'stretch', sm: 'center' }}
                              sx={{ mt: 'auto', pt: 2 }}
                            >
                              <Typography variant="caption" color="text.secondary" sx={{ pr: 1 }}>
                                {item.sensor.config_active
                                  ? 'Configuration is active for this sensor.'
                                  : 'No configuration saved yet.'}
                              </Typography>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<Tune />}
                                onClick={() =>
                                  navigate(`/sensors/${item.sensor.id}/config`, {
                                    state: {
                                      preferredSetupMode: 'manual',
                                      returnTo: '/monitoring',
                                    },
                                  })
                                }
                                sx={{ alignSelf: { xs: 'stretch', sm: 'flex-end' }, ml: { sm: 'auto' } }}
                              >
                                Edit Config
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Card sx={{ mt: 3, bgcolor: '#fff9f1' }}>
        <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <TipsAndUpdates color="secondary" />
          <Typography color="text.secondary">
            Keep thresholds updated in sensor configuration. Once they are set, the monitoring view
            can explain readings in plain language instead of leaving users to interpret raw values.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Monitoring;
