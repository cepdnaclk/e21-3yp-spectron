import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { ArrowBack, Download, Grass, Opacity, Settings, Thermostat, WaterDrop } from '@mui/icons-material';
import { getAgriAdvisories, AgriAdvisory } from '../../services/agriAssistService';
import { getHardwareController, getHardwareSensors } from '../../services/hardwarePairingService';
import { getSensorReadings, RecommendationRule, Sensor, SensorReading } from '../../services/sensorService';

type NavigationState = {
  crop?: string;
  stage?: string;
  saved?: boolean;
};

type SensorReadingBundle = {
  sensor: Sensor;
  readings: SensorReading[];
};

const signalKey = (sensor: Sensor) => {
  const type = sensor.type.toLowerCase();
  const hwId = (sensor.hw_id || '').toLowerCase();
  if (type.includes('soil') || hwId.includes('soil')) return 'soil_moisture';
  if (type === 'humidity' || hwId.endsWith('-humidity')) return 'humidity';
  if (type.includes('temperature') || type.includes('bme') || type.includes('bmp') || type.includes('sht')) return 'temperature';
  return '';
};

const normalizeMetricKey = (key: string) => {
  const normalized = key.toLowerCase().trim();
  if (normalized === 'temp' || normalized.includes('temperature')) return 'temperature';
  if (normalized.includes('humidity')) return 'humidity';
  if (normalized.includes('soil')) return 'soil_moisture';
  return normalized;
};

const signalLabel = (key: string) => {
  switch (normalizeMetricKey(key)) {
    case 'temperature': return 'Temperature';
    case 'humidity': return 'Humidity';
    case 'soil_moisture': return 'Soil moisture';
    default: return 'Signal';
  }
};

const signalUnit = (key: string) => {
  switch (normalizeMetricKey(key)) {
    case 'temperature': return 'C';
    case 'humidity': return '%';
    case 'soil_moisture': return '%';
    default: return '';
  }
};

const latestValue = (readings: SensorReading[]) => {
  const latest = readings.reduce<SensorReading | undefined>((current, reading) => {
    if (!current) return reading;
    return new Date(reading.time).getTime() > new Date(current.time).getTime() ? reading : current;
  }, undefined);
  return latest?.value ?? latest?.avg_value ?? null;
};

const recentReadingWindow = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 7);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

const shortAdvice = (item: AgriAdvisory) => {
  const source = item.treatment || item.text;
  return source.replace(/\s+/g, ' ').slice(0, 140);
};

const uniqueRules = (sensors: Sensor[]) => {
  const rules: RecommendationRule[] = [];
  const seen = new Set<string>();
  sensors.forEach((sensor) => {
    (sensor.active_config?.recommendation_rules || []).forEach((rule) => {
      const key = `${rule.metric_type}|${rule.operator}|${rule.threshold_min}|${rule.threshold_max}|${rule.action_recommendation}`;
      if (!seen.has(key)) {
        seen.add(key);
        rules.push(rule);
      }
    });
  });
  return rules;
};

const evaluateRule = (rule: RecommendationRule, value: number | null) => {
  if (value === null) return 'waiting';
  const min = rule.threshold_min;
  const max = rule.threshold_max;
  switch (rule.operator) {
    case 'GREATER_THAN':
      return max !== undefined && value > max ? 'triggered' : 'normal';
    case 'LESS_THAN':
      return min !== undefined && value < min ? 'triggered' : 'normal';
    case 'OUTSIDE_RANGE':
      return (min !== undefined && value < min) || (max !== undefined && value > max) ? 'triggered' : 'normal';
    default:
      return 'waiting';
  }
};

const AgriAssistDashboard: React.FC = () => {
  const { controllerId = '' } = useParams<{ controllerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as NavigationState;
  const [controllerName, setControllerName] = useState('AgriAssist Field');
  const [bundles, setBundles] = useState<SensorReadingBundle[]>([]);
  const [advisories, setAdvisories] = useState<AgriAdvisory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sensors = bundles.map((bundle) => bundle.sensor);
  const configuredSensors = sensors.filter((sensor) => sensor.config_active && (sensor.active_config?.recommendation_rules || []).length > 0);
  const rules = useMemo(() => uniqueRules(sensors), [sensors]);
  const firstContext = configuredSensors[0]?.active_config?.interpretation?.context || configuredSensors[0]?.context;
  const crop = navState.crop || firstContext?.asset_type?.replace(/\s*crop$/i, '') || 'Paddy/Rice';
  const stage = navState.stage || firstContext?.installation_notes?.replace(/^AgriAssist stage:\s*/i, '') || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [controller, sensorList] = await Promise.all([
          getHardwareController(controllerId),
          getHardwareSensors(controllerId),
        ]);
        if (cancelled) return;
        setControllerName(controller.name || 'AgriAssist Field');
        const agriSensors = sensorList.filter((sensor) => Boolean(signalKey(sensor)) || (sensor.active_config?.recommendation_rules || []).length > 0);
        const range = recentReadingWindow();
        const nextBundles = await Promise.all(
          agriSensors.map(async (sensor) => ({
            sensor,
            readings: await getSensorReadings(sensor.id, range),
          }))
        );
        if (!cancelled) {
          setBundles(nextBundles);
        }
      } catch (err) {
        console.error('Failed to load AgriAssist dashboard:', err);
        if (!cancelled) setError('Failed to load AgriAssist dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [controllerId]);

  useEffect(() => {
    if (!crop || !stage) return;
    let cancelled = false;
    getAgriAdvisories(crop, stage)
      .then((items) => !cancelled && setAdvisories(items))
      .catch(() => !cancelled && setAdvisories([]));
    return () => {
      cancelled = true;
    };
  }, [crop, stage]);

  const signalCards = ['temperature', 'humidity', 'soil_moisture'].map((key) => {
    const bundle = bundles.find((item) => signalKey(item.sensor) === key);
    return {
      key,
      sensor: bundle?.sensor,
      value: bundle ? latestValue(bundle.readings) : null,
      readingCount: bundle?.readings.length || 0,
    };
  });

  const latestByMetric = signalCards.reduce<Record<string, number | null>>((values, card) => {
    values[card.key] = card.value;
    return values;
  }, {});

  const evaluatedRules = rules.map((rule) => {
    const metricKey = normalizeMetricKey(rule.metric_type);
    const value = latestByMetric[metricKey] ?? null;
    const status = evaluateRule(rule, value);
    const severity = status === 'triggered'
      ? (rule.risk_level === 'CRITICAL' ? 'error' : 'warning')
      : status === 'normal'
        ? 'success'
        : 'info';
    return { rule, metricKey, value, status, severity };
  });
  const triggeredRules = evaluatedRules.filter((item) => item.status === 'triggered');
  const waitingRules = evaluatedRules.filter((item) => item.status === 'waiting');
  const primaryRecommendation = triggeredRules[0];

  const handleDownloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Spectron AgriAssist Field Guide', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${controllerName} | ${crop} | ${stage || 'No stage selected'}`, margin, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('Stage recommendations', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');

    advisories.slice(0, 10).forEach((item, index) => {
      const title = `${index + 1}. ${item.issue || 'Field action'}`;
      const text = shortAdvice(item);
      const lines = doc.splitTextToSize(`${title}: ${text}`, 180);
      if (y + lines.length * 5 > 280) {
        doc.addPage();
        y = 18;
      }
      doc.text(lines, margin, y);
      y += lines.length * 5 + 3;
    });

    if (rules.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Sensor-based risk actions', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      rules.forEach((rule, index) => {
        const lines = doc.splitTextToSize(`${index + 1}. ${rule.risk_level} ${signalLabel(rule.metric_type)}: ${rule.action_recommendation}`, 180);
        if (y + lines.length * 5 > 280) {
          doc.addPage();
          y = 18;
        }
        doc.text(lines, margin, y);
        y += lines.length * 5 + 3;
      });
    }

    doc.save(`spectron-agriassist-${Date.now()}.pdf`);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography>Loading AgriAssist dashboard...</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hardware/${controllerId}/sensors`)} sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: { xs: 'flex-start', sm: 'center' } }}>
            Back to controller
          </Button>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button variant="outlined" startIcon={<Download />} onClick={handleDownloadPdf} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Download guide
            </Button>
            <Button variant="outlined" startIcon={<Settings />} onClick={() => navigate('/farms')} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Farm Setup
            </Button>
          </Stack>
        </Stack>

        {navState.saved && <Alert severity="success">AgriAssist enabled for this controller.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Grass color="success" />
            <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>AgriAssist Dashboard</Typography>
          </Stack>
          <Typography color="text.secondary">
            {controllerName} - {crop} - {stage || 'No stage selected'}
          </Typography>
        </Box>

        {configuredSensors.length === 0 && (
          <Alert severity="info">
            AgriAssist is in advisory mode. Use farm setup for crop and stage confirmation.
          </Alert>
        )}

        <Grid container spacing={2}>
          {signalCards.map((card) => (
            <Grid item xs={12} md={4} key={card.key}>
              <Card>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {card.key === 'temperature' ? <Thermostat color="warning" /> : card.key === 'humidity' ? <WaterDrop color="primary" /> : <Opacity color="success" />}
                      <Typography variant="h6" fontWeight={700}>{signalLabel(card.key)}</Typography>
                    </Stack>
                    <Typography variant="h3" fontWeight={800}>
                      {card.value === null ? '--' : `${card.value.toFixed(1)} ${signalUnit(card.key)}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.sensor ? `${card.sensor.name || card.sensor.hw_id} - ${card.readingCount} readings` : 'Sensor not connected'}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Alert
          severity={primaryRecommendation ? (primaryRecommendation.rule.risk_level === 'CRITICAL' ? 'error' : 'warning') : waitingRules.length === evaluatedRules.length && evaluatedRules.length > 0 ? 'info' : 'success'}
          icon={false}
        >
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip
                size="small"
                color={primaryRecommendation ? (primaryRecommendation.rule.risk_level === 'CRITICAL' ? 'error' : 'warning') : waitingRules.length === evaluatedRules.length && evaluatedRules.length > 0 ? 'info' : 'success'}
                label={primaryRecommendation ? primaryRecommendation.rule.risk_level : waitingRules.length === evaluatedRules.length && evaluatedRules.length > 0 ? 'Waiting for readings' : 'No active risk'}
              />
              {primaryRecommendation && (
                <>
                  <Chip size="small" label={signalLabel(primaryRecommendation.metricKey)} />
                  <Chip size="small" label={primaryRecommendation.value === null ? 'No reading' : `${primaryRecommendation.value.toFixed(1)} ${signalUnit(primaryRecommendation.metricKey)}`} />
                </>
              )}
            </Stack>
            <Typography variant="subtitle1" fontWeight={700}>
              {primaryRecommendation ? 'Current field recommendation' : waitingRules.length === evaluatedRules.length && evaluatedRules.length > 0 ? 'Waiting for current sensor readings' : 'No immediate action needed'}
            </Typography>
            <Typography variant="body2">
              {primaryRecommendation
                ? primaryRecommendation.rule.action_recommendation
                : waitingRules.length === evaluatedRules.length && evaluatedRules.length > 0
                  ? 'When a saved limit is breached, this action appears in Alerts as the recommended field response.'
                  : 'Current readings are inside the saved limits. Keep monitoring the field.'}
            </Typography>
          </Stack>
        </Alert>

        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" fontWeight={700}>This stage needs attention</Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {advisories.slice(0, 6).map((item, index) => (
                <Grid item xs={12} md={4} key={`${item.issue || 'advice'}-${index}`}>
                  <Box sx={{ p: 1.5, border: '1px solid rgba(108, 137, 48, 0.22)', borderRadius: 2, height: '100%' }}>
                    <Stack spacing={0.75}>
                      <Chip size="small" color={item.issue ? 'success' : 'default'} label={item.issue || 'Field action'} sx={{ alignSelf: 'flex-start' }} />
                      <Typography variant="body2">{shortAdvice(item)}{shortAdvice(item).length >= 140 ? '...' : ''}</Typography>
                    </Stack>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

export default AgriAssistDashboard;
