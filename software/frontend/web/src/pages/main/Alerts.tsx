import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Button,
  Stack,
} from '@mui/material';
import { NotificationsActive, DoneAll } from '@mui/icons-material';
import {
  getAlerts,
  acknowledgeAlert,
  applyAlertRecommendation,
  Alert as AlertItem,
} from '../../services/alertService';
import { format } from 'date-fns';
import { AlertsSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const data = (await getAlerts()) ?? [];
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAlerts(data);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      loadAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      setError('Failed to acknowledge alert.');
    }
  };

  const handleApplyRecommendation = async (alertId: string) => {
    try {
      setBusyAlertId(alertId);
      await applyAlertRecommendation(alertId);
      setNotice('AI recommendation applied successfully.');
      loadAlerts();
    } catch (error) {
      console.error('Error applying recommendation:', error);
      setError('Failed to apply AI recommendation.');
    } finally {
      setBusyAlertId((current) => (current === alertId ? null : current));
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'WARN':
        return 'warning';
      case 'INFO':
        return 'info';
      default:
        return 'default';
    }
  };

  if (loading) {
    return <AlertsSkeleton />;
  }

  const formatAlertType = (type: AlertItem['type']) => {
    if (type === 'LEARNING_PHASE_RECOMMENDATION') {
      return 'AI RECOMMENDATION';
    }
    return type.replace(/_/g, ' ');
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" color="secondary" fontWeight={800}>
          Attention center
        </Typography>
        <Typography variant="h4">Alerts</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Review critical events and clear resolved notifications.
        </Typography>
      </Box>

      {alerts.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <DoneAll color="primary" sx={{ fontSize: 46, mb: 1 }} />
            <Typography variant="h6">No alerts</Typography>
            <Typography color="text.secondary">
              You are all caught up.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        alerts.map((alert, index) => (
          <Card
            key={alert.id}
            sx={{
              mb: 2,
              opacity: alert.acknowledged_at ? 0.7 : 1,
              borderTop: index === 0 ? '1px solid rgba(60, 57, 17, 0.1)' : undefined,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} mb={1}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(235, 79, 18, 0.12)' }}>
                    <NotificationsActive color="secondary" />
                  </Box>
                  <Box>
                    <Typography variant="h6">
                      {formatAlertType(alert.type)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {format(new Date(alert.created_at), 'MMM dd, yyyy HH:mm')}
                    </Typography>
                  </Box>
                </Stack>
                <Chip
                  label={alert.severity}
                  color={getSeverityColor(alert.severity) as any}
                  size="small"
                />
              </Box>
              <Typography variant="body1" sx={{ mt: 1, pt: 2, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
                {alert.message}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                {!alert.acknowledged_at && alert.type === 'LEARNING_PHASE_RECOMMENDATION' && (
                  <Button
                    size="small"
                    variant="contained"
                    color="secondary"
                    onClick={() => handleApplyRecommendation(alert.id)}
                    disabled={busyAlertId === alert.id}
                  >
                    {busyAlertId === alert.id ? 'Applying...' : 'Apply recommendation'}
                  </Button>
                )}
                {!alert.acknowledged_at && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleAcknowledge(alert.id)}
                    disabled={busyAlertId === alert.id}
                  >
                    Acknowledge
                  </Button>
                )}
              </Stack>
              {alert.acknowledged_at && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Acknowledged at {format(new Date(alert.acknowledged_at), 'MMM dd, yyyy HH:mm')}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Container>
  );
};

export default Alerts;
