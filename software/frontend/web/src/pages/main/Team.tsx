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
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteOutline, GroupAdd, Refresh } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { EmptyStateCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import {
  addFarmCollaborator,
  Collaborator,
  Farm,
  getFarmCollaborators,
  getFarms,
  removeFarmCollaborator,
} from '../../services/farmService';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Unknown';
  }
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Team: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.id === selectedFarmId),
    [farms, selectedFarmId],
  );
  const ownedFarms = useMemo(() => farms.filter((farm) => farm.role === 'owner'), [farms]);
  const viewers = useMemo(
    () => collaborators.filter((collaborator) => collaborator.role === 'viewer' && !collaborator.revoked_at),
    [collaborators],
  );
  const ownerRows = useMemo(
    () => collaborators.filter((collaborator) => collaborator.role === 'owner' && !collaborator.revoked_at),
    [collaborators],
  );

  const loadFarms = useCallback(async () => {
    const nextFarms = await getFarms();
    setFarms(nextFarms);
    setSelectedFarmId((current) => {
      if (current && nextFarms.some((farm) => farm.id === current && farm.role === 'owner')) {
        return current;
      }
      return nextFarms.find((farm) => farm.role === 'owner')?.id || '';
    });
  }, []);

  const loadCollaborators = useCallback(async (farmId: string) => {
    if (!farmId) {
      setCollaborators([]);
      return;
    }
    const nextCollaborators = await getFarmCollaborators(farmId);
    setCollaborators(nextCollaborators);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await loadFarms();
    } catch (err) {
      console.error(err);
      setError('Failed to load farms.');
    } finally {
      setLoading(false);
    }
  }, [loadFarms]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        await loadCollaborators(selectedFarmId);
      } catch (err) {
        console.error(err);
        setError('Failed to load viewers.');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [loadCollaborators, selectedFarmId]);

  const handleInviteViewer = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!selectedFarmId) {
      setError('Select a farm first.');
      return;
    }
    if (!emailPattern.test(trimmedEmail)) {
      setError('Enter a valid email.');
      return;
    }
    if (collaborators.some((collaborator) => collaborator.email.toLowerCase() === trimmedEmail && !collaborator.revoked_at)) {
      setError('Viewer already has access.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setNotice('');
      await addFarmCollaborator(selectedFarmId, { email: trimmedEmail, role: 'viewer' });
      setEmail('');
      setNotice('Viewer invited.');
      await loadCollaborators(selectedFarmId);
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to invite viewer.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveViewer = async (viewer: Collaborator) => {
    try {
      setRemovingUserId(viewer.user_id);
      setError('');
      setNotice('');
      await removeFarmCollaborator(selectedFarmId, viewer.user_id);
      setCollaborators((current) =>
        current.map((item) =>
          item.user_id === viewer.user_id ? { ...item, revoked_at: new Date().toISOString() } : item,
        ),
      );
      setNotice('Viewer removed.');
    } catch (err: any) {
      const responseData = err?.response?.data;
      setError(typeof responseData === 'string' ? responseData : 'Failed to remove viewer.');
    } finally {
      setRemovingUserId('');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
        <PageHeaderPanel
          title="Viewers"
          subtitle="Read-only farm access for customer-side users."
          icon={<GroupAdd />}
          info="Farm owners invite read-only viewers per farm. Admin users are separate."
          actions={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
                <InputLabel id="viewer-farm-label">Farm</InputLabel>
                <Select
                  labelId="viewer-farm-label"
                  label="Farm"
                  value={selectedFarmId}
                  onChange={(event) => setSelectedFarmId(event.target.value)}
                >
                  {ownedFarms.map((farm) => (
                    <MenuItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button startIcon={<Refresh />} variant="outlined" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
            </Stack>
          }
        />

      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>

      {ownedFarms.length === 0 ? (
        <EmptyStateCard icon={<GroupAdd sx={{ fontSize: 38 }} />} title="No owned farms" />
      ) : (
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={5}>
            <Card variant="outlined" sx={{ bgcolor: 'rgba(255,253,248,0.94)', boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)' }}>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <GroupAdd color="secondary" />
                  <Typography variant="h6">Invite viewer</Typography>
                </Stack>
                <Box component="form" onSubmit={handleInviteViewer}>
                  <Stack spacing={1.5}>
                    <TextField
                      fullWidth
                      required
                      label="Email"
                      type="email"
                      placeholder="eg: viewer@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      error={Boolean(email) && !emailPattern.test(email.trim().toLowerCase())}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      color="secondary"
                      disabled={saving || loading || !selectedFarmId || !email.trim()}
                    >
                      Invite
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card variant="outlined" sx={{ bgcolor: 'rgba(255,253,248,0.94)', boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)' }}>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                      {selectedFarm?.name || 'Farm'}
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                      <Chip size="small" label={`${viewers.length} viewers`} />
                      {ownerRows.map((owner) => (
                        <Chip key={owner.user_id} size="small" label={owner.name || owner.email} variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                </Stack>

                <Stack spacing={1}>
                  {viewers.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(108, 137, 48, 0.06)' }}>
                      <Typography>No viewers</Typography>
                    </Box>
                  ) : (
                    viewers.map((viewer) => (
                      <Box key={viewer.user_id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, bgcolor: 'rgba(255, 253, 248, 0.72)' }}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                              {viewer.name || viewer.email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {viewer.email}
                            </Typography>
                          </Box>
                          <Tooltip title="Remove viewer">
                            <span>
                              <IconButton
                                aria-label={`Remove viewer ${viewer.email}`}
                                color="error"
                                disabled={removingUserId === viewer.user_id}
                                onClick={() => handleRemoveViewer(viewer)}
                                size="small"
                              >
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          <Chip size="small" label="Viewer" />
                          <Chip size="small" label={formatDateTime(viewer.added_at)} variant="outlined" />
                        </Stack>
                      </Box>
                    ))
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      </PageShell>
    </Container>
  );
};

export default Team;
