import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container, FormControl, Grid, InputLabel,
  MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Settings, ShowChart, Sensors, WarningAmber } from '@mui/icons-material';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLocation, useNavigate } from 'react-router-dom';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { MonitoringSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import { Farm, FarmMonitoringReading, Field, getFarmFields, getFarmMonitoringReadings, getFarms } from '../../services/farmService';
import { getSensor, Sensor } from '../../services/sensorService';
import { getLearningPhaseStatus, LearningPhaseStatusResponse } from '../../services/sensorConfigurationAiService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

type Measurement = { sensor?: Sensor; readings: FarmMonitoringReading[] };
type FieldMeasurementGroup = {
  fieldId: string;
  fieldName: string;
  measurements: Measurement[];
  controllerCount: number;
};

type SensorDisplayGroup = {
  fieldId: string;
  fieldName: string;
  readings: FarmMonitoringReading[];
};

const displayName = (reading: FarmMonitoringReading) =>
  reading.sensor_name || reading.type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const metricLabel = (reading: FarmMonitoringReading) =>
  reading.type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const sensorLabel = (sensor: Sensor | undefined, reading: FarmMonitoringReading) =>
  sensor?.name?.trim() ||
  sensor?.active_config?.friendly_name?.trim() ||
  reading.sensor_name ||
  sensor?.active_config?.hardware?.sensor_name?.trim() ||
  'Sensor';

const formatTime = (value: string, hours: number) => new Date(value).toLocaleString([], hours <= 24
  ? { hour: '2-digit', minute: '2-digit' }
  : { month: 'short', day: 'numeric' });

const buildFieldMeasurementGroup = (
  fieldId: string,
  fieldName: string,
  readings: FarmMonitoringReading[],
  sensorsById: Record<string, Sensor>,
): FieldMeasurementGroup => {
  const grouped = new Map<string, FarmMonitoringReading[]>();
  readings.forEach((reading) => {
    grouped.set(reading.sensor_id, [...(grouped.get(reading.sensor_id) || []), reading]);
  });
  return {
    fieldId,
    fieldName,
    measurements: Array.from(grouped.entries()).map(([id, values]) => ({
      sensor: sensorsById[id],
      readings: values.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
    })),
    controllerCount: new Set(readings.map((reading) => reading.controller_id).filter(Boolean)).size,
  };
};

const resolveSensorDisplayGroup = (
  sensorReadings: FarmMonitoringReading[],
  fieldsById: Record<string, Field>,
): SensorDisplayGroup => {
  const sorted = [...sensorReadings].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const latestAssigned = [...sorted].reverse().find((reading) => reading.field_id && fieldsById[reading.field_id]);

  if (latestAssigned?.field_id) {
    return {
      fieldId: latestAssigned.field_id,
      fieldName: latestAssigned.field_name || fieldsById[latestAssigned.field_id]?.name || 'Field',
      readings: sorted,
    };
  }

  return {
    fieldId: 'unassigned',
    fieldName: 'Not assigned to a Field',
    readings: sorted,
  };
};

const Monitoring: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = location.state as { farmId?: string; fieldId?: string } | null;
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState(navigationState?.farmId || '');
  const [fields, setFields] = useState<Field[]>([]);
  const [hours, setHours] = useState(24);
  const [readings, setReadings] = useState<FarmMonitoringReading[]>([]);
  const [sensorsById, setSensorsById] = useState<Record<string, Sensor>>({});
  const [learningBySensorId, setLearningBySensorId] = useState<Record<string, LearningPhaseStatusResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const readingRefreshInFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const nextFarms = await getFarms();
      setFarms(nextFarms);
      const selected = nextFarms.some((farm) => farm.id === farmId) ? farmId : nextFarms[0]?.id || '';
      if (selected !== farmId) setFarmId(selected);
      if (!selected) {
        setReadings([]);
        setFields([]);
        return;
      }

      const [nextReadings, nextFields] = await Promise.all([
        getFarmMonitoringReadings(selected, hours),
        getFarmFields(selected),
      ]);
      setReadings(nextReadings);
      setFields(nextFields);

      const ids = Array.from(new Set(nextReadings.map((reading) => reading.sensor_id)));
      const details = await Promise.all(ids.map(async (id) => {
        try {
          return [id, await getSensor(id)] as const;
        } catch {
          return null;
        }
      }));
      setSensorsById(Object.fromEntries(details.filter((item): item is readonly [string, Sensor] => item !== null)));

      const learningStatuses = await Promise.all(ids.map(async (id) => {
        try {
          return [id, await getLearningPhaseStatus(id)] as const;
        } catch {
          return null;
        }
      }));
      setLearningBySensorId(Object.fromEntries(
        learningStatuses.filter((item): item is readonly [string, LearningPhaseStatusResponse] => item !== null),
      ));

      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('Live measurements could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [farmId, hours]);

  useEffect(() => { void load(); }, [load]);
  useRealtimeRefresh('customer', load);

  // Readings are intentionally refreshed independently from the heavier Farm,
  // Field, sensor-detail, and learning-status requests. This gives the Live
  // screen a one-second update without repeatedly loading unchanged metadata.
  useEffect(() => {
    if (!farmId) return undefined;

    const refreshReadings = async () => {
      if (document.visibilityState !== 'visible' || readingRefreshInFlight.current) return;
      readingRefreshInFlight.current = true;
      try {
        setReadings(await getFarmMonitoringReadings(farmId, hours));
      } catch {
        // Keep the last good values. The normal page load and realtime refresh
        // paths continue to show actionable connection errors.
      } finally {
        readingRefreshInFlight.current = false;
      }
    };

    const intervalId = window.setInterval(() => { void refreshReadings(); }, 1000);
    return () => window.clearInterval(intervalId);
  }, [farmId, hours]);

  const downloadLearningPhaseReport = useCallback((sensorId: string) => {
    const status = learningBySensorId[sensorId];
    if (!status?.summary) return;

    const feedback = status.feedback;
    const lines = [
      'Sensor learning report',
      `Generated: ${new Date().toISOString()}`,
      `Window: ${status.summary.windowDays} days`,
      `Primary metric: ${status.summary.primaryMetric || 'N/A'}`,
      `Readings collected: ${status.summary.readingsCollected}`,
      `Alerts in window: ${status.summary.alertCount}`,
      `Warning alerts: ${status.summary.warningAlertCount}`,
      `Critical alerts: ${status.summary.criticalAlertCount}`,
      '',
      'Current thresholds',
      `Min: ${status.summary.currentThresholds.min ?? 'N/A'}`,
      `Max: ${status.summary.currentThresholds.max ?? 'N/A'}`,
      `Warning min: ${status.summary.currentThresholds.warning_min ?? 'N/A'}`,
      `Warning max: ${status.summary.currentThresholds.warning_max ?? 'N/A'}`,
    ];

    if (feedback) {
      lines.push('', 'AI feedback', `Summary: ${feedback.summary}`);
      if (feedback.recommendations?.length) {
        lines.push('Recommendations:');
        feedback.recommendations.forEach((item) => lines.push(`- ${item}`));
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sensor-learning-report-${sensorId}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [learningBySensorId]);

  const fieldGroups = useMemo(() => {
    const fieldsById = Object.fromEntries(fields.map((field) => [field.id, field] as const));
    const readingsBySensor = new Map<string, FarmMonitoringReading[]>();
    readings.forEach((reading) => {
      readingsBySensor.set(reading.sensor_id, [...(readingsBySensor.get(reading.sensor_id) || []), reading]);
    });

    const groupedReadings = new Map<string, FarmMonitoringReading[]>();
    readingsBySensor.forEach((sensorReadings) => {
      const target = resolveSensorDisplayGroup(sensorReadings, fieldsById);
      groupedReadings.set(target.fieldId, [...(groupedReadings.get(target.fieldId) || []), ...target.readings]);
    });

    const groups: FieldMeasurementGroup[] = fields.map((field) =>
      buildFieldMeasurementGroup(field.id, field.name, groupedReadings.get(field.id) || [], sensorsById),
    );

    const unassigned = groupedReadings.get('unassigned') || [];
    if (unassigned.length > 0) {
      groups.push(buildFieldMeasurementGroup('unassigned', 'Not assigned to a Field', unassigned, sensorsById));
    }
    return groups.sort((a, b) => {
      if (a.fieldId === navigationState?.fieldId) return -1;
      if (b.fieldId === navigationState?.fieldId) return 1;
      if (a.fieldId === 'unassigned') return 1;
      if (b.fieldId === 'unassigned') return -1;
      return a.fieldName.localeCompare(b.fieldName);
    });
  }, [fields, navigationState?.fieldId, readings, sensorsById]);

  if (loading && farms.length === 0) return <MonitoringSkeleton />;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>
      <PageShell>
        <PageHeaderPanel
          title="Live conditions"
          subtitle="See sensor trends together for each Field."
          icon={<ShowChart />}
          info="Each Field includes readings from its assigned Sensor Bases, even when they use different Controllers."
          actions={farms.length > 0 ? (
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
              <InputLabel id="monitoring-farm-label">Farm</InputLabel>
              <Select labelId="monitoring-farm-label" label="Farm" value={farmId} onChange={(event) => setFarmId(event.target.value)}>
                {farms.map((farm) => <MenuItem key={farm.id} value={farm.id}>{farm.name}</MenuItem>)}
              </Select>
            </FormControl>
          ) : undefined}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
          <ToggleButtonGroup exclusive size="small" value={hours} onChange={(_, value) => value && setHours(value)}>
            <ToggleButton value={24}>Today</ToggleButton>
            <ToggleButton value={168}>7 days</ToggleButton>
            <ToggleButton value={720}>30 days</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary">Updated automatically</Typography>
        </Stack>

        {!farmId ? (
          <EmptyStateCard icon={<Sensors sx={{ fontSize: 40 }} />} title="Add a farm first" />
        ) : fieldGroups.length === 0 ? (
          <EmptyStateCard icon={<Sensors sx={{ fontSize: 40 }} />} title="Add a Field to start monitoring" />
        ) : (
          <Stack spacing={3}>
            {fieldGroups.map((group) => (
              <Box
                key={group.fieldId}
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 3,
                  bgcolor: group.fieldId === 'unassigned' ? 'rgba(245,158,11,0.06)' : 'rgba(108,137,48,0.045)',
                  border: '1px solid',
                  borderColor: group.fieldId === 'unassigned' ? 'warning.light' : 'rgba(108,137,48,0.18)',
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.75} sx={{ mb: 1.5 }}>
                  <Box>
                    <Typography variant="h5">{group.fieldName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {group.measurements.length > 0
                        ? `${group.measurements.length} measurements · ${group.controllerCount} ${group.controllerCount === 1 ? 'Controller' : 'Controllers'}`
                        : 'No recent readings'}
                    </Typography>
                  </Box>
                  {group.fieldId === 'unassigned' && (
                    <Chip size="small" color="warning" label="Finish hardware setup" sx={{ alignSelf: 'flex-start' }} />
                  )}
                </Stack>
                {group.measurements.length === 0 ? (
                  <EmptyStateCard icon={<Sensors />} title="Waiting for Field readings" />
                ) : (
                  <Grid container spacing={2}>
                    {group.measurements.map(({ sensor, readings: values }) => {
                      const latest = values[values.length - 1];
                      const sensorControllerId = sensor?.controller_id || latest.controller_id || '';
                      const learningStatus = learningBySensorId[latest.sensor_id];
                      const thresholds = sensor?.active_config?.interpretation?.thresholds || sensor?.active_config?.thresholds;
                      const minimum = thresholds?.min;
                      const maximum = thresholds?.max;
                      const outside = (minimum !== undefined && latest.value < minimum) || (maximum !== undefined && latest.value > maximum);
                      const stale = Date.now() - new Date(latest.time).getTime() > 2 * 60 * 60 * 1000;

                      return (
                        <Grid item xs={12} md={6} key={latest.sensor_id}>
                          <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.96)' }}>
                            <CardContent>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                <Box>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                    {sensorLabel(sensor, latest)}
                                  </Typography>
                                  <Typography
                                    variant="subtitle1"
                                    color="text.primary"
                                    sx={{ fontWeight: 700, lineHeight: 1.2 }}
                                  >
                                    {metricLabel(latest)}
                                  </Typography>
                                  <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography variant="h4">{latest.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</Typography>
                                    <Typography color="text.secondary">{latest.unit || sensor?.unit || ''}</Typography>
                                  </Stack>
                                </Box>
                                <Chip
                                  size="small"
                                  color={stale ? 'default' : outside ? 'warning' : 'success'}
                                  icon={outside && !stale ? <WarningAmber /> : undefined}
                                  label={stale ? 'Waiting for data' : outside ? 'Check this' : 'Good'}
                                />
                              </Stack>
                              <Box sx={{ height: 220, mt: 1.5 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={values} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    {minimum !== undefined && maximum !== undefined && (
                                      <ReferenceArea y1={minimum} y2={maximum} fill="#5b8c51" fillOpacity={0.1} />
                                    )}
                                    <XAxis dataKey="time" tickFormatter={(value) => formatTime(value, hours)} minTickGap={30} />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
                                    <Line type="monotone" dataKey="value" stroke="#2f6b3c" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </Box>
                              <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                justifyContent="space-between"
                                alignItems={{ xs: 'flex-start', sm: 'center' }}
                                spacing={1}
                                sx={{ mt: 1 }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {minimum !== undefined && maximum !== undefined
                                    ? `Good range: ${minimum} to ${maximum} ${latest.unit || ''}`
                                    : 'Good range not set'}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                  {latest.quality === 'validated' && (
                                    <Chip size="small" variant="outlined" label="Reading checked" />
                                  )}
                                  {learningStatus?.phase === 'completed' && learningStatus.summary && (
                                    <Button size="small" variant="outlined" onClick={() => downloadLearningPhaseReport(latest.sensor_id)}>
                                      Download report
                                    </Button>
                                  )}
                                  <Button
                                    size="small"
                                    startIcon={<Settings />}
                                    disabled={!sensorControllerId}
                                    onClick={() => navigate(
                                      `/hardware/${encodeURIComponent(sensorControllerId)}/sensors/${encodeURIComponent(latest.sensor_id)}/configure`,
                                      {
                                        state: {
                                          returnTo: '/monitoring',
                                          controllerId: sensorControllerId,
                                          sensorId: latest.sensor_id,
                                        },
                                      },
                                    )}
                                  >
                                    Configure
                                  </Button>
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </PageShell>
    </Container>
  );
};

export default Monitoring;
