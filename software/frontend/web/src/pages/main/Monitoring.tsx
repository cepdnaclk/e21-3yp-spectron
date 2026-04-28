import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Stack,
  TextField,
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
  Download,
  PictureAsPdf,
  TableChart,
} from '@mui/icons-material';
import type { jsPDF as JsPDFDocument } from 'jspdf';
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
import { useAuth } from '../../contexts/AuthContext';
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

type ReportSensorData = {
  sensor: Sensor;
  readings: SensorReading[];
};

type ReportControllerData = {
  id: string;
  name: string;
  location?: string;
  status: string;
  sensors: ReportSensorData[];
};

const REPORT_MAX_DAYS = 7;

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

const clampReportDays = (value: number) => {
  if (!Number.isFinite(value)) {
    return REPORT_MAX_DAYS;
  }
  return Math.max(1, Math.min(REPORT_MAX_DAYS, Math.floor(value)));
};

const reportDateStamp = () => new Date().toISOString().slice(0, 10);

const escapeCsvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadBlob = (content: BlobPart, mimeType: string, filename: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const buildCsvReport = (reportData: ReportControllerData[], days: number) => {
  const rows = [
    ['Spectron Monitoring Report'],
    ['Prepared At', new Date().toLocaleString()],
    ['Data Window', `${days} day${days === 1 ? '' : 's'}`],
    [],
    ['Controller', 'Controller Status', 'Sensor', 'Sensor Type', 'Timestamp', 'Value', 'Unit'],
  ];

  for (const controller of reportData) {
    const sortedSensors = [...controller.sensors].sort((a, b) =>
      (a.sensor.name || a.sensor.hw_id).localeCompare(b.sensor.name || b.sensor.hw_id)
    );
    for (const sensorData of sortedSensors) {
      const unit = getSensorUnit(sensorData.sensor);
      const sortedReadings = sortReadingsAscending(sensorData.readings);
      if (sortedReadings.length === 0) {
        rows.push([
          controller.name,
          controller.status,
          sensorData.sensor.name || sensorData.sensor.hw_id,
          sensorData.sensor.type,
          'No readings in selected window',
          '',
          unit,
        ]);
        continue;
      }
      for (const reading of sortedReadings) {
        const value = toReadingValue(reading);
        rows.push([
          controller.name,
          controller.status,
          sensorData.sensor.name || sensorData.sensor.hw_id,
          sensorData.sensor.type,
          new Date(reading.time).toLocaleString(),
          value === null ? '' : value.toString(),
          unit,
        ]);
      }
    }
  }

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
};

const drawSensorChart = (
  doc: JsPDFDocument,
  sensorData: ReportSensorData,
  x: number,
  y: number,
  width: number,
  height: number,
  unit: string
) => {
  const readings = sortReadingsAscending(sensorData.readings)
    .map((reading) => ({ time: reading.time, value: toReadingValue(reading) }))
    .filter((point): point is { time: string; value: number } => point.value !== null);

  const chartLeft = x + 20;
  const chartTop = y + 5;
  const chartWidth = width - 26;
  const chartHeight = height - 18;
  const chartBottom = chartTop + chartHeight;
  const chartRight = chartLeft + chartWidth;

  doc.setFontSize(8);
  doc.setTextColor('#6a624f');

  if (readings.length === 0) {
    doc.setDrawColor('#d8d0c1');
    doc.line(chartLeft, chartTop, chartLeft, chartBottom);
    doc.line(chartLeft, chartBottom, chartRight, chartBottom);
    doc.text('No readings available for the selected window.', chartLeft + 6, chartTop + 18);
    return;
  }

  const values = readings.map((point) => point.value);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const padding = (yMax - yMin) * 0.12;
  yMin -= padding;
  yMax += padding;

  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  doc.setDrawColor('#eee7dc');
  doc.setLineWidth(0.2);
  yTicks.forEach((tick) => {
    const tickY = chartBottom - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    doc.line(chartLeft, tickY, chartRight, tickY);
    const label = formatYAxisTick(tick);
    doc.text(label, chartLeft - 4 - doc.getTextWidth(label), tickY + 2);
  });

  const pointX = (index: number) =>
    readings.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (index / (readings.length - 1)) * chartWidth;
  const pointY = (value: number) => chartBottom - ((value - yMin) / (yMax - yMin)) * chartHeight;

  doc.setDrawColor('#cfc6b7');
  doc.setLineWidth(0.35);
  doc.line(chartLeft, chartTop, chartLeft, chartBottom);
  doc.line(chartLeft, chartBottom, chartRight, chartBottom);

  doc.setDrawColor('#337a85');
  doc.setLineWidth(0.9);
  for (let i = 1; i < readings.length; i += 1) {
    doc.line(pointX(i - 1), pointY(readings[i - 1].value), pointX(i), pointY(readings[i].value));
  }

  doc.setFillColor('#337a85');
  const dotEvery = Math.max(1, Math.ceil(readings.length / 16));
  readings.forEach((point, index) => {
    if (index === 0 || index === readings.length - 1 || index % dotEvery === 0) {
      doc.circle(pointX(index), pointY(point.value), 1.1, 'F');
    }
  });

  const tickCount = Math.min(5, readings.length);
  const xTickIndexes = Array.from({ length: tickCount }, (_, index) =>
    tickCount === 1 ? 0 : Math.round((index * (readings.length - 1)) / (tickCount - 1))
  );

  doc.setTextColor('#6a624f');
  xTickIndexes.forEach((readingIndex) => {
    const tick = readings[readingIndex];
    const tickX = pointX(readingIndex);
    doc.setDrawColor('#d8d0c1');
    doc.line(tickX, chartBottom, tickX, chartBottom + 1.8);
    const label = new Date(tick.time).toLocaleDateString([], { month: 'short', day: 'numeric' });
    doc.text(label, Math.max(chartLeft, Math.min(chartRight - doc.getTextWidth(label), tickX - doc.getTextWidth(label) / 2)), chartBottom + 6);
  });

  doc.setFontSize(7);
  doc.text(unit || 'Value', x + 1, chartTop + 2);
  doc.text('Time', chartRight - 10, chartBottom + 12);
};

const addPdfFooter = (doc: JsPDFDocument) => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor('#8a806d');
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 32, pageHeight - 10);
  }
};

const buildPdfReport = async (
  reportData: ReportControllerData[],
  days: number,
  ownerName: string,
  ownerEmail?: string,
  accountName?: string
) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentBottom = pageHeight - 18;
  const sensorBlockHeight = 74;

  const addPageBackground = () => {
    doc.setFillColor('#fffdf8');
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setDrawColor('#eee7dc');
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  };

  const addReportHeader = (subtitle: string) => {
    addPageBackground();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor('#6c8930');
    doc.text('Spectron', margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#8a806d');
    doc.text(subtitle, pageWidth - margin - doc.getTextWidth(subtitle), 13);
    doc.setDrawColor('#6c8930');
    doc.setLineWidth(0.45);
    doc.line(margin, 17, pageWidth - margin, 17);
  };

  addPageBackground();
  doc.setFillColor('#6c8930');
  doc.rect(0, 0, pageWidth, 42, 'F');
  doc.setTextColor('#fffdf8');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('Spectron', margin, 24);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('Monitoring Report', margin, 34);

  doc.setTextColor('#262411');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Report Details', margin, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#6a624f');
  const preparedAt = new Date().toLocaleString();
  const detailRows = [
    ['Prepared', preparedAt],
    ['Owner', `${ownerName}${ownerEmail ? ` (${ownerEmail})` : ''}`],
    ['Account', accountName || 'Not specified'],
    ['Data window', `Last ${days} day${days === 1 ? '' : 's'}`],
    ['Controllers', reportData.length.toString()],
    ['Sensors', reportData.reduce((total, controller) => total + controller.sensors.length, 0).toString()],
  ];
  let cursorY = 72;
  detailRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#262411');
    doc.text(label, margin, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#6a624f');
    doc.text(value, margin + 34, cursorY);
    cursorY += 7;
  });

  doc.setFillColor('#fffaf4');
  doc.setDrawColor('#e2dacd');
  doc.roundedRect(margin, 128, pageWidth - margin * 2, 42, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#262411');
  doc.text('Controller Summary', margin + 4, 138);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#6a624f');
  let summaryY = 148;
  reportData.slice(0, 4).forEach((controller) => {
    const controllerMeta = [
      `Status: ${controller.status}`,
      controller.location ? `Location: ${controller.location}` : null,
      `Sensors: ${controller.sensors.length}`,
    ].filter(Boolean).join('  |  ');
    doc.text(`${controller.name}: ${controllerMeta}`, margin + 4, summaryY);
    summaryY += 6;
  });
  if (reportData.length > 4) {
    doc.text(`+ ${reportData.length - 4} more controller${reportData.length - 4 === 1 ? '' : 's'}`, margin + 4, summaryY);
  }

  reportData.forEach((controller, controllerIndex) => {
    doc.addPage();
    addReportHeader(`Controller ${controllerIndex + 1} of ${reportData.length}`);
    cursorY = 30;

    const drawControllerHeading = (continued = false) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor('#262411');
      doc.text(`${controller.name}${continued ? ' (continued)' : ''}`, margin, cursorY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor('#6a624f');
      const meta = [
        `Status: ${controller.status}`,
        controller.location ? `Location: ${controller.location}` : null,
        `Sensors: ${controller.sensors.length}`,
      ].filter(Boolean).join('  |  ');
      cursorY += 6;
      doc.text(meta, margin, cursorY);
      cursorY += 8;
      doc.setDrawColor('#d8d0c1');
      doc.setLineWidth(0.35);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 8;
    };

    drawControllerHeading(false);

    const sensors = [...controller.sensors].sort((a, b) =>
      (a.sensor.name || a.sensor.hw_id).localeCompare(b.sensor.name || b.sensor.hw_id)
    );

    for (const sensorData of sensors) {
      if (cursorY + sensorBlockHeight > contentBottom) {
        doc.addPage();
        addReportHeader(controller.name);
        cursorY = 30;
        drawControllerHeading(true);
      }

      const unit = getSensorUnit(sensorData.sensor);
      const readings = sortReadingsAscending(sensorData.readings);
      const latest = readings.length > 0 ? readings[readings.length - 1] : undefined;
      const latestValue = latest ? toReadingValue(latest) : null;
      const values = readings.map(toReadingValue).filter((value): value is number => value !== null);
      const minValue = values.length ? Math.min(...values) : null;
      const maxValue = values.length ? Math.max(...values) : null;
      const avgValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor('#262411');
      doc.text(sensorData.sensor.name || `${sensorData.sensor.type} Sensor`, margin, cursorY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor('#6a624f');
      doc.text(`${sensorData.sensor.type}  |  ${sensorData.sensor.hw_id}`, margin, cursorY + 5);

      const metricSummary = [
        `Readings: ${readings.length}`,
        `Latest: ${latestValue === null ? 'No data' : `${latestValue.toFixed(2)}${unit ? ` ${unit}` : ''}`}`,
        minValue === null ? null : `Min: ${minValue.toFixed(2)}`,
        maxValue === null ? null : `Max: ${maxValue.toFixed(2)}`,
        avgValue === null ? null : `Avg: ${avgValue.toFixed(2)}`,
      ].filter(Boolean).join('    ');
      doc.text(metricSummary, margin, cursorY + 10);

      drawSensorChart(doc, sensorData, margin, cursorY + 14, pageWidth - margin * 2, 48, unit);
      cursorY += sensorBlockHeight;
    }
  });

  addPdfFooter(doc);
  doc.save(`spectron-monitoring-report-${reportDateStamp()}.pdf`);
};

const Monitoring: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [controllers, setControllers] = useState<ControllerMonitoringGroup[]>([]);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedReportControllerIds, setSelectedReportControllerIds] = useState<string[]>([]);
  const [reportDays, setReportDays] = useState(REPORT_MAX_DAYS.toString());
  const [reportError, setReportError] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState<'csv' | 'pdf' | null>(null);

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
          // Filter to only live/active sensors
          const activeSensors = sensors.filter((s) => s.status === 'OK');
          const to = new Date();
          const from = new Date();
          from.setDate(to.getDate() - 1);

          const sensorCards = await Promise.all(
            activeSensors.map(async (sensor) => {
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

  useEffect(() => {
    setSelectedReportControllerIds((current) => {
      if (current.length > 0) {
        return current.filter((id) => controllers.some((controller) => controller.id === id));
      }
      return controllers.map((controller) => controller.id);
    });
  }, [controllers]);

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

  const selectedReportDays = clampReportDays(Number(reportDays));

  const toggleReportController = (controllerId: string) => {
    setSelectedReportControllerIds((current) =>
      current.includes(controllerId)
        ? current.filter((id) => id !== controllerId)
        : [...current, controllerId]
    );
  };

  const buildReportData = async (): Promise<ReportControllerData[]> => {
    const selectedControllers = controllers.filter((controller) =>
      selectedReportControllerIds.includes(controller.id)
    );

    if (selectedControllers.length === 0) {
      throw new Error('Select at least one controller.');
    }

    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - selectedReportDays);

    return Promise.all(
      selectedControllers.map(async (controller) => {
        const sensors = await Promise.all(
          controller.sensors.map(async (item) => ({
            sensor: item.sensor,
            readings: await getSensorReadings(item.sensor.id, {
              from: from.toISOString(),
              to: to.toISOString(),
            }).catch(() => []),
          }))
        );

        return {
          id: controller.id,
          name: controller.name,
          location: controller.location,
          status: controller.status,
          sensors,
        };
      })
    );
  };

  const handleDownloadCsv = async () => {
    setReportError(null);
    setExportingReport('csv');
    try {
      const reportData = await buildReportData();
      const csv = buildCsvReport(reportData, selectedReportDays);
      downloadBlob(csv, 'text/csv;charset=utf-8', `spectron-monitoring-report-${reportDateStamp()}.csv`);
      setReportDialogOpen(false);
    } catch (error: any) {
      setReportError(error?.message || 'Failed to prepare CSV report.');
    } finally {
      setExportingReport(null);
    }
  };

  const handleDownloadPdf = async () => {
    setReportError(null);
    setExportingReport('pdf');
    try {
      const reportData = await buildReportData();
      const accountName = user?.accounts?.[0]?.name;
      await buildPdfReport(
        reportData,
        selectedReportDays,
        user?.name || user?.email || 'Spectron User',
        user?.email,
        accountName
      );
      setReportDialogOpen(false);
    } catch (error: any) {
      setReportError(error?.message || 'Failed to prepare PDF report.');
    } finally {
      setExportingReport(null);
    }
  };

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
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
          >
            <Button
              variant="contained"
              startIcon={<Download />}
              onClick={() => {
                setReportError(null);
                setReportDialogOpen(true);
              }}
              disabled={controllers.length === 0}
            >
              Download Report
            </Button>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => loadMonitoringData({ showSkeleton: false })}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </Stack>
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
                                  navigate(`/hardware/${controller.id}/sensors/${item.sensor.id}/configure`, {
                                    state: {
                                      preferredSetupMode: 'manual',
                                      controllerId: controller.id,
                                      sensorId: item.sensor.id,
                                      sensorType: item.sensor.type,
                                      sensorName: item.sensor.name || `${item.sensor.type} Sensor`,
                                      configured: Boolean(item.sensor.config_active),
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

      <Dialog
        open={reportDialogOpen}
        onClose={() => (exportingReport ? undefined : setReportDialogOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Download Monitoring Report</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Controllers
              </Typography>
              <Stack spacing={0.75}>
                {controllers.map((controller) => (
                  <FormControlLabel
                    key={controller.id}
                    control={
                      <Checkbox
                        checked={selectedReportControllerIds.includes(controller.id)}
                        onChange={() => toggleReportController(controller.id)}
                        disabled={Boolean(exportingReport)}
                      />
                    }
                    label={
                      <Box>
                        <Typography fontWeight={700}>{controller.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {controller.sensors.length} sensor{controller.sensors.length === 1 ? '' : 's'} -{' '}
                          {controller.status}
                        </Typography>
                      </Box>
                    }
                    sx={{
                      m: 0,
                      px: 1,
                      py: 0.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                    }}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  size="small"
                  onClick={() => setSelectedReportControllerIds(controllers.map((controller) => controller.id))}
                  disabled={Boolean(exportingReport)}
                >
                  Select all
                </Button>
                <Button
                  size="small"
                  onClick={() => setSelectedReportControllerIds([])}
                  disabled={Boolean(exportingReport)}
                >
                  Clear
                </Button>
              </Stack>
            </Box>

            <TextField
              label="Days of data"
              type="number"
              value={reportDays}
              onChange={(event) => setReportDays(event.target.value)}
              inputProps={{ min: 1, max: REPORT_MAX_DAYS }}
              helperText={`Readings are preserved for ${REPORT_MAX_DAYS} days, so reports are limited to ${REPORT_MAX_DAYS} days.`}
              disabled={Boolean(exportingReport)}
              fullWidth
            />

            {reportError && <Alert severity="error">{reportError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Button onClick={() => setReportDialogOpen(false)} disabled={Boolean(exportingReport)}>
            Cancel
          </Button>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="outlined"
              startIcon={exportingReport === 'csv' ? <CircularProgress size={18} /> : <TableChart />}
              onClick={handleDownloadCsv}
              disabled={Boolean(exportingReport)}
            >
              Download as CSV
            </Button>
            <Button
              variant="contained"
              startIcon={exportingReport === 'pdf' ? <CircularProgress size={18} /> : <PictureAsPdf />}
              onClick={handleDownloadPdf}
              disabled={Boolean(exportingReport)}
            >
              Download as PDF
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Monitoring;
