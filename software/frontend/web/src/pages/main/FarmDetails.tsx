import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ArrowBack, Info, PersonRemove, Place } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import {
  addFarmCollaborator,
  Collaborator,
  createField,
  Field,
  Farm,
  getFarm,
  getFarmCollaborators,
  getFarmFields,
  removeFarmCollaborator,
} from '../../services/farmService';

const FarmDetails: React.FC = () => {
  const { farmId = '' } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openField, setOpenField] = useState(false);
  const [openAccess, setOpenAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldForm, setFieldForm] = useState({ name: '', latitude: '', longitude: '', area: '' });
  const [accessForm, setAccessForm] = useState({ email: '' });

  const ownerMode = farm?.role === 'owner';

  const load = async () => {
    try {
      setLoading(true);
      const [nextFarm, nextFields, nextCollaborators] = await Promise.all([
        getFarm(farmId),
        getFarmFields(farmId),
        getFarmCollaborators(farmId),
      ]);
      setFarm(nextFarm);
      setFields(nextFields);
      setCollaborators(nextCollaborators);
    } catch (err) {
      console.error(err);
      setError('Failed to load farm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [farmId]);

  const fieldCount = useMemo(() => fields.length, [fields]);
  const collaboratorCount = useMemo(() => collaborators.length, [collaborators]);

  const submitField = async () => {
    try {
      setSaving(true);
      const field = await createField(farmId, {
        name: fieldForm.name.trim(),
        latitude: fieldForm.latitude ? Number(fieldForm.latitude) : undefined,
        longitude: fieldForm.longitude ? Number(fieldForm.longitude) : undefined,
        area: fieldForm.area ? Number(fieldForm.area) : undefined,
      });
      setFields((current) => [field, ...current]);
      setFieldForm({ name: '', latitude: '', longitude: '', area: '' });
      setOpenField(false);
      setNotice('Field added.');
    } catch (err) {
      console.error(err);
      setError('Failed to add field.');
    } finally {
      setSaving(false);
    }
  };

  const submitAccess = async () => {
    try {
      setSaving(true);
      await addFarmCollaborator(farmId, { email: accessForm.email.trim(), role: 'viewer' });
      setAccessForm({ email: '' });
      setOpenAccess(false);
      setNotice('Access sent.');
      setCollaborators(await getFarmCollaborators(farmId));
    } catch (err) {
      console.error(err);
      setError('Failed to add access.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeFarmCollaborator(farmId, userId);
      setCollaborators(await getFarmCollaborators(farmId));
      setNotice('Access removed.');
    } catch (err) {
      console.error(err);
      setError('Failed to remove access.');
    }
  };

  if (loading) {
    return <PageHeaderSkeleton />;
  }

  if (!farm) {
    return null;
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/farms')} aria-label="Back to farms">
          <ArrowBack />
        </IconButton>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4">{farm.name}</Typography>
            <Tooltip title="Farm-level view. Fields, people, and setup live here.">
              <IconButton size="small" aria-label="Farm details help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {farm.role} access
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary">Fields</Typography><Typography variant="h4">{fieldCount}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary">People</Typography><Typography variant="h4">{collaboratorCount}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary">Area</Typography><Typography variant="h4">{farm.area ?? '—'}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary">Mode</Typography><Typography variant="h4">{ownerMode ? 'Edit' : 'Read'}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        {ownerMode && (
          <>
            <Button startIcon={<Add />} variant="contained" onClick={() => setOpenField(true)}>
              Add Field
            </Button>
            <Button variant="outlined" onClick={() => setOpenAccess(true)}>
              Manage Access
            </Button>
          </>
        )}
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">Fields</Typography>
                <Tooltip title="Each field can hold one or more crop instances.">
                  <IconButton size="small" aria-label="Fields help">
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Grid container spacing={2}>
                {fields.length === 0 ? (
                  <Grid item xs={12}>
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Place color="primary" sx={{ fontSize: 42 }} />
                      <Typography sx={{ mt: 1 }}>No fields yet</Typography>
                    </Box>
                  </Grid>
                ) : (
                  fields.map((field) => (
                    <Grid item xs={12} sm={6} key={field.id}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                          <Typography fontWeight={800}>{field.name}</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                            <Chip size="small" label={field.area ? `${field.area} ha` : 'Area n/a'} />
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">People</Typography>
                <Tooltip title="Owners can manage access. Viewers can only read.">
                  <IconButton size="small" aria-label="People help">
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Stack spacing={1.25}>
                {collaborators.map((person) => (
                  <Card key={person.user_id} variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Box>
                          <Typography fontWeight={800}>{person.name || person.email}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {person.email}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={person.role} />
                          {ownerMode && person.role === 'viewer' && (
                            <IconButton size="small" onClick={() => handleRemove(person.user_id)} aria-label="Remove viewer">
                              <PersonRemove fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                {collaborators.length === 0 && (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No people yet</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={openField} onClose={() => setOpenField(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Field</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Field name" value={fieldForm.name} onChange={(e) => setFieldForm((c) => ({ ...c, name: e.target.value }))} autoFocus />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Latitude" value={fieldForm.latitude} onChange={(e) => setFieldForm((c) => ({ ...c, latitude: e.target.value }))} fullWidth />
              <TextField label="Longitude" value={fieldForm.longitude} onChange={(e) => setFieldForm((c) => ({ ...c, longitude: e.target.value }))} fullWidth />
            </Stack>
            <TextField label="Area" value={fieldForm.area} onChange={(e) => setFieldForm((c) => ({ ...c, area: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenField(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitField} disabled={saving || !fieldForm.name.trim()}>
            {saving ? 'Saving' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openAccess} onClose={() => setOpenAccess(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Access</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Viewer email"
              value={accessForm.email}
              onChange={(e) => setAccessForm({ email: e.target.value })}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAccess(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitAccess} disabled={saving || !accessForm.email.trim()}>
            {saving ? 'Sending' : 'Invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FarmDetails;
