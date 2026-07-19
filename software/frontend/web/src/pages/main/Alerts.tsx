import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { DoneAll, InfoOutlined, NotificationsActive, WarningAmber } from '@mui/icons-material';
import { format } from 'date-fns';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { AlertsSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, MetricCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import {
  acknowledgeFarmAlert,
  Farm,
  FarmAlert,
  getFarmAlerts,
  getFarms,
} from '../../services/farmService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

type AlertStatusFilter = 'open' | 'acknowledged' | 'all';

type FarmAlertRow = FarmAlert & {
  farm: Farm;
};

const statusOptions: { value: AlertStatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'all', label: 'All' },
];

const severityColor = (severity: FarmAlert['severity']) => {
  const normalized = String(severity).toLowerCase();
  if (normalized === 'critical') {
    return 'error' as const;
  }
  if (normalized === 'warning' || normalized === 'warn') {
    return 'warning' as const;
  }
  if (normalized === 'info') {
    return 'info' as const;
  }
  return 'default' as const;
};

const statusColor = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'open') {
    return 'warning' as const;
  }
  if (normalized === 'acknowledged' || normalized === 'resolved') {
    return 'success' as const;
  }
  return 'default' as const;
};

const humanize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeSeverity = (severity: FarmAlert['severity']) => {
  const normalized = String(severity).toLowerCase();
  return normalized === 'warn' ? 'Warning' : humanize(normalized);
};

const Alerts: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [alerts, setAlerts] = useState<FarmAlertRow[]>([]);
  const [farmFilter, setFarmFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>('open');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const nextFarms = await getFarms();
      setFarms(nextFarms);

      const farmsToLoad = farmFilter === 'all' ? nextFarms : nextFarms.filter((farm) => farm.id === farmFilter);
      const alertPairs = await Promise.all(
        farmsToLoad.map(async (farm) => {
          const farmAlerts = await getFarmAlerts(farm.id, statusFilter === 'all' ? undefined : { status: statusFilter });
          return farmAlerts.map((alert) => ({ ...alert, farm }));
        }),
      );

      setAlerts(
        alertPairs
          .flat()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch (err) {
      console.error(err);
      setError('Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, [farmFilter, statusFilter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);
  useRealtimeRefresh('customer', loadAlerts);

  const handleAcknowledge = async (alert: FarmAlertRow) => {
    try {
      setBusyAlertId(alert.id);
      const updated = await acknowledgeFarmAlert(alert.farm_id, alert.id);
      setAlerts((current) =>
        current.map((item) => (item.id === alert.id ? { ...updated, farm: alert.farm } : item)),
      );
      setNotice('Alert acknowledged.');
    } catch (err) {
      console.error(err);
      setError('Failed to acknowledge alert.');
    } finally {
      setBusyAlertId((current) => (current === alert.id ? null : current));
    }
  };

  const openCount = useMemo(() => alerts.filter((alert) => alert.status.toLowerCase() === 'open').length, [alerts]);
  const criticalCount = useMemo(
    () => alerts.filter((alert) => String(alert.severity).toLowerCase() === 'critical').length,
    [alerts],
  );
  const ownerFarmIds = useMemo(() => new Set(farms.filter((farm) => farm.role === 'owner').map((farm) => farm.id)), [farms]);

  if (loading) {
    return <AlertsSkeleton />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <PageShell>
        <PageHeaderPanel
          title="Alerts"
          subtitle={`${alerts.length} shown`}
          icon={<NotificationsActive />}
          info="Farm alerts follow farm access. Owners can acknowledge; viewers can only review."
        />

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}>
          <MetricCard label="Open" value={openCount} icon={<NotificationsActive fontSize="small" />} tone="warning.main" />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard label="Critical" value={criticalCount} icon={<WarningAmber fontSize="small" />} tone="error.main" />
        </Grid>
        <Grid item xs={12} md={6}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl size="small" fullWidth>
              <InputLabel id="farm-alert-filter-label">Farm</InputLabel>
              <Select
                labelId="farm-alert-filter-label"
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
            <FormControl size="small" fullWidth>
              <InputLabel id="status-alert-filter-label">Status</InputLabel>
              <Select
                labelId="status-alert-filter-label"
                label="Status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as AlertStatusFilter)}
              >
                {statusOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Grid>
      </Grid>

      {farms.length === 0 ? (
        <EmptyStateCard icon={<DoneAll sx={{ fontSize: 38 }} />} title="No farms" />
      ) : alerts.length === 0 ? (
        <EmptyStateCard icon={<DoneAll sx={{ fontSize: 38 }} />} title="No alerts" />
      ) : (
        <Stack spacing={1.5}>
          {alerts.map((alert) => {
            const canAcknowledge = ownerFarmIds.has(alert.farm_id) && alert.status.toLowerCase() === 'open';
            return (
              <Card
                key={alert.id}
                variant="outlined"
                sx={{
                  overflow: 'hidden',
                  bgcolor: 'rgba(255,253,248,0.94)',
                  boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)',
                  borderColor:
                    String(alert.severity).toLowerCase() === 'critical'
                      ? 'rgba(218, 54, 8, 0.28)'
                      : 'rgba(60, 57, 17, 0.1)',
                }}
              >
                <Box
                  sx={{
                    height: 5,
                    bgcolor:
                      String(alert.severity).toLowerCase() === 'critical'
                        ? 'error.main'
                        : String(alert.severity).toLowerCase() === 'warning' || String(alert.severity).toLowerCase() === 'warn'
                          ? 'warning.main'
                          : 'info.main',
                  }}
                />
                <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.25}>
                    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: 'rgba(235, 79, 18, 0.1)', flexShrink: 0 }}>
                        <NotificationsActive color="secondary" fontSize="small" />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
                            {humanize(alert.type)}
                          </Typography>
                          <Chip size="small" label={normalizeSeverity(alert.severity)} color={severityColor(alert.severity)} />
                          <Chip size="small" label={humanize(alert.status)} color={statusColor(alert.status)} variant="outlined" />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {alert.farm.name}
                          {alert.field_name ? ` / ${alert.field_name}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {format(new Date(alert.created_at), 'MMM dd, HH:mm')}
                    </Typography>
                  </Stack>

                  <Typography variant="body2" sx={{ mt: 1.25, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                    {alert.message}
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mt: 1.5 }}>
                    {canAcknowledge ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleAcknowledge(alert)}
                        disabled={busyAlertId === alert.id}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                      >
                        Acknowledge
                      </Button>
                    ) : alert.farm.role === 'viewer' && alert.status.toLowerCase() === 'open' ? (
                      <Tooltip title="Only farm owners can acknowledge alerts.">
                        <Chip icon={<InfoOutlined />} size="small" label="Viewer" variant="outlined" />
                      </Tooltip>
                    ) : null}
                    {String(alert.severity).toLowerCase() === 'critical' && (
                      <Chip icon={<WarningAmber />} size="small" label="Priority" color="error" variant="outlined" />
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
      </PageShell>
    </Container>
  );
};

export default Alerts;
