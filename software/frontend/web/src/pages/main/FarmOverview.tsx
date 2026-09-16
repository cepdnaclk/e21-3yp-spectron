import React, { useCallback, useEffect, useState } from 'react';
import { Agriculture, ArrowBack, CheckCircle, Edit, HelpOutline, ShowChart, WarningAmber, WbSunny } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Container, Grid, IconButton, Stack, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { MonitoringSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import {
  CropInstance,
  Farm,
  FarmAlert,
  FarmMonitoringReading,
  FarmWeather,
  Field,
  acknowledgeFarmAlert,
  getFarm,
  getFarmAlerts,
  getFarmFields,
  getFarmMonitoringReadings,
  getFarmWeather,
  getFieldCropInstances,
} from '../../services/farmService';
import { FieldProblem, getFieldProblems } from '../../services/problemService';

type FieldSummary = {
  field: Field;
  crop?: CropInstance;
  problems: FieldProblem[];
  readings: FarmMonitoringReading[];
  alerts: FarmAlert[];
};

const alertPriority = (alert: FarmAlert) => {
  switch (alert.severity.toLowerCase()) {
    case 'critical':
      return 3;
    case 'warning':
    case 'warn':
      return 2;
    default:
      return 1;
  }
};

const mostImportantAlert = (alerts: FarmAlert[]) =>
  [...alerts].sort((a, b) => {
    const priorityDifference = alertPriority(b) - alertPriority(a);
    return priorityDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];

const latestMetric = (readings: FarmMonitoringReading[], metric: string) =>
  readings
    .filter((reading) => reading.type.toLowerCase() === metric)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

const readingAge = (time?: string) => {
  if (!time) return 'No readings yet';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(time).getTime()) / 60000));
  if (minutes < 2) return 'Updated now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return `Updated ${Math.floor(hours / 24)} days ago`;
};

const solvedAge = (time?: string) => readingAge(time)
  .replace('Updated', 'Solved')
  .replace('No readings yet', 'Recently solved');

const FarmOverview: React.FC = () => {
  const { farmId = '' } = useParams();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [farmAlerts, setFarmAlerts] = useState<FarmAlert[]>([]);
  const [alertsAvailable, setAlertsAvailable] = useState(true);
  const [weather, setWeather] = useState<FarmWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [nextFarm, nextFields, nextReadings, alertResult] = await Promise.all([
        getFarm(farmId),
        getFarmFields(farmId),
        getFarmMonitoringReadings(farmId, 168).catch(() => []),
        getFarmAlerts(farmId, { status: 'open' })
          .then((alerts) => ({ alerts, available: true }))
          .catch(() => ({ alerts: [] as FarmAlert[], available: false })),
      ]);
      const nextAlerts = alertResult.alerts;
      const summaries = await Promise.all(nextFields.map(async (field) => {
        const [crops, problems] = await Promise.all([
          getFieldCropInstances(field.id),
          getFieldProblems(field.id).catch(() => []),
        ]);
        return {
          field,
          crop: crops.find((crop) => crop.active),
          problems,
          readings: nextReadings.filter((reading) => reading.field_id === field.id),
          alerts: nextAlerts.filter((alert) => alert.field_id === field.id),
        };
      }));
      setFarm(nextFarm);
      setFields(summaries);
      setFarmAlerts(nextAlerts);
      setAlertsAvailable(alertResult.available);
      setWeather(null);
      setWeatherLoading(true);
      void getFarmWeather(farmId)
        .then(setWeather)
        .catch(() => setWeather(null))
        .finally(() => setWeatherLoading(false));
      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('This farm could not be loaded.');
    } finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { void load(); }, [load]);
  const openAlerts = farmAlerts.length;

  const handleAcknowledge = async (alert: FarmAlert) => {
    try {
      setAcknowledgingAlertId(alert.id);
      await acknowledgeFarmAlert(farmId, alert.id);
      setFields((current) => current.map((item) => ({
        ...item,
        alerts: item.alerts.filter((candidate) => candidate.id !== alert.id),
      })));
      setFarmAlerts((current) => current.filter((candidate) => candidate.id !== alert.id));
      setNotice('Alert acknowledged.');
      setError('');
    } catch (acknowledgeError) {
      console.error(acknowledgeError);
      setError('The alert could not be acknowledged. Please try again.');
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  if (loading) return <MonitoringSkeleton />;
  if (!farm) return <Container sx={{ py: 3 }}><AutoDismissAlert open severity="error">{error || 'Farm not found.'}</AutoDismissAlert></Container>;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <IconButton onClick={() => navigate('/farms')} aria-label="Back to farms"><ArrowBack /></IconButton>
        </Stack>
        <PageHeaderPanel
          title={farm.name}
          subtitle={farm.location_label || `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`}
          icon={<Agriculture />}
          info="This page shows the daily farm summary. Setup and editing are kept under Manage farm."
          actions={farm.role === 'owner' ? <Button variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/farms/${farm.id}/manage`)}>Farm settings</Button> : undefined}
        />
        <AutoDismissAlert open={Boolean(error)} severity="error" onCloseAlert={() => setError('')}>{error}</AutoDismissAlert>
        <AutoDismissAlert open={Boolean(notice)} severity="success" onCloseAlert={() => setNotice('')}>{notice}</AutoDismissAlert>

        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.95)' }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <WbSunny color="warning" />
                  <Box>
                    <Typography variant="h6">Weather</Typography>
                    {weather ? (
                      <>
                        <Typography color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          {weather.conditions} · {weather.temperature_c.toFixed(1)}°C
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Humidity {Math.round(weather.humidity_percent)}% · Wind {weather.wind_speed_kmh.toFixed(1)} km/h
                        </Typography>
                        {weather.today && (
                          <Typography variant="body2" color="text.secondary">
                            Today {weather.today.temperature_min_c.toFixed(0)}–{weather.today.temperature_max_c.toFixed(0)}°C · Rain {weather.today.precipitation_mm.toFixed(1)} mm
                          </Typography>
                        )}
                        {weather.next_days?.[0] && (
                          <Typography variant="body2" color="text.secondary">
                            Tomorrow: {weather.next_days[0].temperature_min_c.toFixed(0)}–
                            {weather.next_days[0].temperature_max_c.toFixed(0)}°C · Rain{" "}
                            {weather.next_days[0].precipitation_mm.toFixed(1)} mm
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Typography color="text.secondary">
                        {weatherLoading
                          ? 'Loading weather…'
                          : farm.latitude == null || farm.longitude == null
                            ? 'Set the farm location to see weather'
                            : 'Weather is unavailable right now'}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.95)' }}>
              <CardActionArea onClick={() => navigate('/monitoring', { state: { farmId: farm.id } })} sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <ShowChart color="primary" />
                    <Box><Typography variant="h6">Live conditions</Typography><Typography color="text.secondary">Temperature, humidity and pressure</Typography></Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.95)' }}>
              <CardActionArea onClick={() => navigate('/alerts', { state: { farmId: farm.id } })} sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    {!alertsAvailable || openAlerts ? <WarningAmber color="warning" /> : <CheckCircle color="success" />}
                    <Box>
                      <Typography variant="h6">
                        {!alertsAvailable
                          ? 'Alerts unavailable'
                          : openAlerts
                            ? `${openAlerts} ${openAlerts === 1 ? 'alert' : 'alerts'} to check`
                            : 'No open alerts'}
                      </Typography>
                      <Typography color="text.secondary">
                        {alertsAvailable ? 'Conditions that need your attention' : 'Open Alerts to try again'}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        </Grid>

        <Typography variant="h5" sx={{ mb: 1.5 }}>Fields</Typography>
        {fields.length === 0 ? (
          <EmptyStateCard title="No fields yet" icon={<Agriculture />} action={farm.role === 'owner' ? <Button onClick={() => navigate(`/farms/${farm.id}/manage`)}>Add a field</Button> : undefined} />
        ) : (
          <Grid container spacing={2}>
            {fields.map(({ field, crop, problems, readings, alerts }) => {
              const active = problems.filter((problem) => problem.status !== 'resolved');
              const recentlySolved = problems
                .filter((problem) => problem.status === 'resolved'
                  && problem.resolved_at
                  && Date.now() - new Date(problem.resolved_at).getTime() < 24 * 60 * 60 * 1000)
                .sort((a, b) => new Date(b.resolved_at || 0).getTime() - new Date(a.resolved_at || 0).getTime())[0];
              const importantAlert = mostImportantAlert(alerts);
              const adviceProblemId = importantAlert?.type === 'ADVICE_READY'
                && importantAlert.source_ref?.startsWith('problem:')
                ? importantAlert.source_ref.split(':')[1]
                : '';
              const latestProblem = [...active].sort(
                (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
              )[0];
              const newestReading = [...readings].sort(
                (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
              )[0];
              const stale = newestReading
                ? Date.now() - new Date(newestReading.time).getTime() > 2 * 60 * 60 * 1000
                : false;
              const status = !alertsAvailable
                ? { label: 'Status unavailable', color: 'default' as const }
                : alerts.length
                ? { label: 'Needs attention', color: 'warning' as const }
                : readings.length === 0
                  ? { label: 'Waiting setup', color: 'default' as const }
                  : stale
                    ? { label: 'Waiting for data', color: 'default' as const }
                    : { label: 'Good', color: 'success' as const };
              const controllerCount = new Set(readings.map((reading) => reading.controller_id).filter(Boolean)).size;
              return (
                <Grid item xs={12} md={6} key={field.id}>
                  <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.95)' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Box><Typography variant="h6">{field.name}</Typography><Typography color="text.secondary">{crop ? `${crop.crop_name} · ${crop.current_stage?.name || 'Stage being estimated'}` : 'Crop not set'}</Typography></Box>
                        <Chip size="small" color={status.color} label={status.label} />
                      </Stack>
                      <Grid container spacing={1} sx={{ mt: 1.5 }}>
                        {[
                          { key: 'temperature', label: 'Temperature', reading: latestMetric(readings, 'temperature') },
                          { key: 'humidity', label: 'Humidity', reading: latestMetric(readings, 'humidity') },
                          { key: 'pressure', label: 'Pressure', reading: latestMetric(readings, 'pressure') },
                        ].map(({ key, label, reading }) => (
                          <Grid item xs={4} key={key}>
                            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(108,137,48,0.07)', minHeight: 70 }}>
                              <Typography variant="caption" color="text.secondary">{label}</Typography>
                              <Typography fontWeight={800}>
                                {reading
                                  ? `${reading.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${reading.unit || ''}`
                                  : '—'}
                              </Typography>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
                      {importantAlert && (
                        <Box
                          sx={{
                            mt: 1.25,
                            p: 1.5,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: alertPriority(importantAlert) === 3 ? 'error.light' : 'warning.light',
                            bgcolor: alertPriority(importantAlert) === 3
                              ? 'rgba(211,47,47,0.06)'
                              : 'rgba(245,158,11,0.08)',
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <WarningAmber
                              color={alertPriority(importantAlert) === 3 ? 'error' : 'warning'}
                              fontSize="small"
                            />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" fontWeight={800}>
                                {alerts.length === 1 ? 'Why this needs attention' : `${alerts.length} alerts need attention`}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                {importantAlert.message}
                              </Typography>
                              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.25 }}>
                                {adviceProblemId ? (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => navigate(`/fields/${field.id}/advisor?problem=${adviceProblemId}`)}
                                  >
                                    View advice
                                  </Button>
                                ) : farm.role === 'owner' ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={acknowledgingAlertId === importantAlert.id}
                                    onClick={() => void handleAcknowledge(importantAlert)}
                                  >
                                    {acknowledgingAlertId === importantAlert.id ? 'Acknowledging…' : 'Acknowledge'}
                                  </Button>
                                ) : null}
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => navigate('/alerts', { state: { farmId: farm.id, fieldId: field.id } })}
                                >
                                  View alerts
                                </Button>
                              </Stack>
                            </Box>
                          </Stack>
                        </Box>
                      )}
                      <Box
                        sx={{
                          mt: 1.25,
                          p: 1.25,
                          borderRadius: 2,
                          bgcolor: active.length
                            ? 'rgba(245,158,11,0.08)'
                            : recentlySolved
                              ? 'rgba(46,125,50,0.07)'
                              : 'action.hover',
                        }}
                      >
                        <Typography variant="body2" fontWeight={800}>
                          {active.length
                            ? `${active.length} ${active.length === 1 ? 'problem' : 'problems'} to check`
                            : recentlySolved
                              ? 'Recently solved'
                              : 'No open problems'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {latestProblem?.title
                            || recentlySolved?.resolution_comment
                            || recentlySolved?.latest_advice?.headline
                            || recentlySolved?.title
                            || (readings.length ? 'Field conditions are being monitored' : 'Assign a Sensor Base to begin monitoring')}
                        </Typography>
                        {recentlySolved && (
                          <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.25 }}>
                            {solvedAge(recentlySolved.resolved_at)}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                        {readingAge(newestReading?.time)}
                        {controllerCount > 0 ? ` · ${controllerCount} ${controllerCount === 1 ? 'Controller' : 'Controllers'}` : ''}
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                        <Button
                          variant="contained"
                          startIcon={<HelpOutline />}
                          disabled={!crop}
                          onClick={() => navigate(
                            `/fields/${field.id}/advisor${latestProblem ? `?problem=${latestProblem.id}` : ''}`,
                          )}
                        >
                          Field problems
                        </Button>
                        <Button
                          variant="text"
                          startIcon={<ShowChart />}
                          onClick={() => navigate('/monitoring', { state: { farmId: farm.id, fieldId: field.id } })}
                        >
                          View conditions
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

export default FarmOverview;
