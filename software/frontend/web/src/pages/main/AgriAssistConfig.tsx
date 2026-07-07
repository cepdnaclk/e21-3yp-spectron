import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, AutoAwesome, Grass } from '@mui/icons-material';
import {
  buildAgriConfig,
  getAgriSummary,
} from '../../services/agriAssistService';
import { getHardwareController, getHardwareSensors, saveHardwareSensorConfiguration } from '../../services/hardwarePairingService';
import { Sensor } from '../../services/sensorService';

const signalForSensor = (sensor: Sensor) => {
  const type = sensor.type.toLowerCase();
  const hwId = (sensor.hw_id || '').toLowerCase();
  if (type.includes('soil') || hwId.includes('soil')) return 'Soil moisture';
  if (type === 'humidity' || hwId.endsWith('-humidity')) return 'Humidity';
  if (type.includes('temperature') || type.includes('bme') || type.includes('bmp') || type.includes('sht')) return 'Temperature + humidity';
  return '';
};

const isAgriSensor = (sensor: Sensor) => Boolean(signalForSensor(sensor));

const toCamelCaseThresholdKey = (metricKey: string, suffix: string) => {
  return `${metricKey}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`.replace(
    /_([a-z])/g,
    (_, letter: string) => letter.toUpperCase()
  );
};

const buildHardwareConfig = (config: Sensor['active_config']) => {
  if (!config) {
    return {};
  }

  const hardwareConfig: Record<string, unknown> = {
    ...(config.hardware_config || {}),
    ...(config.hardware?.config || {}),
    reportsPerDay: config.report_interval_per_day || config.operational?.report_interval_per_day || 24,
    estimatedBatteryLifeDays:
      config.power_management?.battery_life_days ||
      config.operational?.power_management?.battery_life_days ||
      77,
  };

  if (config.operational?.reading_flow_type || config.settings?.reading_flow_type) {
    hardwareConfig.readingFlowType = config.operational?.reading_flow_type || config.settings?.reading_flow_type;
  }

  Object.entries(config.metric_thresholds || {}).forEach(([metricKey, threshold]) => {
    if (threshold.min !== undefined) {
      hardwareConfig[toCamelCaseThresholdKey(metricKey, 'min')] = threshold.min;
    }
    if (threshold.max !== undefined) {
      hardwareConfig[toCamelCaseThresholdKey(metricKey, 'max')] = threshold.max;
    }
    if (threshold.warning_min !== undefined) {
      hardwareConfig[toCamelCaseThresholdKey(metricKey, 'warningMin')] = threshold.warning_min;
    }
    if (threshold.warning_max !== undefined) {
      hardwareConfig[toCamelCaseThresholdKey(metricKey, 'warningMax')] = threshold.warning_max;
    }
  });

  Object.keys(hardwareConfig).forEach((key) => {
    if (hardwareConfig[key] === null || hardwareConfig[key] === '') {
      delete hardwareConfig[key];
    }
  });

  return hardwareConfig;
};

const AgriAssistConfig: React.FC = () => {
  const { controllerId = '' } = useParams<{ controllerId: string }>();
  const navigate = useNavigate();
  const [crops, setCrops] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [crop, setCrop] = useState('Paddy/Rice');
  const [stage, setStage] = useState('');
  const [fieldName, setFieldName] = useState('Paddy Field');
  const [location, setLocation] = useState('');
  const [useHostedAI, setUseHostedAI] = useState(false);
  const [systemName, setSystemName] = useState('AgriAssist Field');
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [summary, controller, sensorList] = await Promise.all([
          getAgriSummary(),
          getHardwareController(controllerId),
          getHardwareSensors(controllerId),
        ]);
        if (cancelled) return;
        setCrops(summary.crops);
        setStages(summary.stages);
        setCrop(summary.crops[0] || 'Paddy/Rice');
        setStage(summary.stages[0] || '');
        setSystemName(controller.name || 'AgriAssist Field');
        setFieldName(controller.name || 'Paddy Field');
        setLocation(controller.location || '');
        setSensors(sensorList);
      } catch (err) {
        console.error('Failed to load AgriAssist setup:', err);
        setError('Failed to load AgriAssist setup.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [controllerId]);

  const agriSensors = useMemo(() => sensors.filter(isAgriSensor), [sensors]);
  const signals = useMemo(
    () => Array.from(new Set(agriSensors.map(signalForSensor).filter(Boolean))),
    [agriSensors]
  );

  const handleEnable = async () => {
    try {
      setError('');
      setSaving(true);
      const primarySensorType = agriSensors[0]?.type || 'temperature_humidity';
      const primaryProposal = await buildAgriConfig({
        crop,
        stage,
        sensor_type: primarySensorType,
        field_name: fieldName,
        location,
        use_hosted_ai: useHostedAI,
        controller_id: controllerId,
      });

      for (const sensor of agriSensors) {
        const sensorProposal = sensor.type === agriSensors[0]?.type
          ? primaryProposal
          : await buildAgriConfig({
              crop,
              stage,
              sensor_type: sensor.type,
              field_name: fieldName,
              location,
              use_hosted_ai: false,
              controller_id: controllerId,
              sensor_id: sensor.id,
            });
        const hardwareConfig = buildHardwareConfig(sensorProposal.config);
        const appConfig = {
          ...sensorProposal.config,
          hardware_config: hardwareConfig,
          hardware: {
            ...(sensorProposal.config.hardware || {}),
            system_name: systemName,
            sensor_type: sensor.type,
            sensor_name: sensor.name || sensor.hw_id || sensor.type,
            config: hardwareConfig,
          },
        };

        await saveHardwareSensorConfiguration({
          controllerId,
          sensorId: sensor.id,
          systemName,
          sensorType: sensor.type,
          sensorName: sensor.name || sensor.hw_id || sensor.type,
          usedFor: sensorProposal.purpose,
          dashboardView: 'agriassist',
          config: hardwareConfig,
          appConfig,
        });
      }
      navigate(`/hardware/${encodeURIComponent(controllerId)}/agri-dashboard`, {
        replace: true,
        state: { crop, stage, saved: true },
      });
    } catch (err) {
      console.error('Failed to enable AgriAssist:', err);
      setError('Failed to enable AgriAssist.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography>Loading AgriAssist setup...</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hardware/${controllerId}/sensors`)} sx={{ alignSelf: 'flex-start' }}>
          Back to controller
        </Button>

        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Grass color="success" />
            <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>AgriAssist</Typography>
          </Stack>
          <Typography color="text.secondary">
            Choose the crop stage once. The dashboard will show readings, field notes, and alert actions from this setup.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {agriSensors.length === 0 && (
          <Alert severity="warning">
            No agriculture climate or moisture sensors were found on this controller.
          </Alert>
        )}

        <Grid container spacing={{ xs: 2, md: 3 }}>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2}>
                  <Typography variant="h6" fontWeight={700}>Field setup</Typography>
                  <TextField select label="Crop" value={crop} onChange={(event) => setCrop(event.target.value)}>
                    {crops.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                  <TextField select label="Growth stage" value={stage} onChange={(event) => setStage(event.target.value)}>
                    {stages.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                  <TextField label="Field name" value={fieldName} onChange={(event) => setFieldName(event.target.value)} />
                  <TextField label="Location (optional)" value={location} onChange={(event) => setLocation(event.target.value)} />
                  <FormControlLabel
                    control={<Checkbox checked={useHostedAI} onChange={(event) => setUseHostedAI(event.target.checked)} />}
                    label="Use AI to refine risk limits"
                  />
                  <Button
                    variant="contained"
                    startIcon={<AutoAwesome />}
                    onClick={handleEnable}
                    disabled={saving || !stage || agriSensors.length === 0}
                    fullWidth
                  >
                    {saving ? 'Enabling...' : 'Enable AgriAssist'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Stack spacing={2}>
              <Card>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Typography variant="h6" fontWeight={700}>Sensor coverage</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                    {signals.length === 0 && <Chip label="No climate/moisture sensors" color="warning" />}
                    {signals.map((signal) => <Chip key={signal} label={signal} color="success" />)}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Temperature, humidity, and soil moisture readings will be used in the dashboard and Alerts.
                  </Typography>
                </CardContent>
              </Card>

              <Card>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Typography variant="h6" fontWeight={700}>What happens next</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      The dashboard shows the latest field readings and crop-stage notes.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      If a reading crosses a saved limit, Alerts will show the recommended action.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      You can download the detailed field guide from the dashboard.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
};

export default AgriAssistConfig;
