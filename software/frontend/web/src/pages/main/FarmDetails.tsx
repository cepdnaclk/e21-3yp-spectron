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
import { Add, Agriculture, ArrowBack, CheckCircle, Info, PersonRemove, Place } from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import {
  addFarmCollaborator,
  Collaborator,
  confirmCropStage,
  createCropInstance,
  createField,
  Crop,
  CropInstance,
  Field,
  Farm,
  getCrops,
  getFarm,
  getFarmCollaborators,
  getFarmFields,
  getFieldCropInstances,
  removeFarmCollaborator,
} from '../../services/farmService';

type CropForm = {
  cropId: string;
  varietyId: string;
  plantingDate: string;
  plantingDatePrecision: 'exact' | 'approximate' | 'unknown';
  expectedHarvestDate: string;
};

const emptyCropForm: CropForm = {
  cropId: '',
  varietyId: '',
  plantingDate: '',
  plantingDatePrecision: 'exact',
  expectedHarvestDate: '',
};

const FarmDetails: React.FC = () => {
  const { farmId = '' } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropInstances, setCropInstances] = useState<Record<string, CropInstance[]>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openField, setOpenField] = useState(false);
  const [openAccess, setOpenAccess] = useState(false);
  const [openCrop, setOpenCrop] = useState(false);
  const [openStage, setOpenStage] = useState(false);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [selectedCropInstance, setSelectedCropInstance] = useState<CropInstance | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldForm, setFieldForm] = useState({ name: '', latitude: '', longitude: '', area: '' });
  const [accessForm, setAccessForm] = useState({ email: '' });
  const [cropForm, setCropForm] = useState<CropForm>(emptyCropForm);

  const ownerMode = farm?.role === 'owner';

  const load = async () => {
    try {
      setLoading(true);
      const [nextFarm, nextFields, nextCollaborators, nextCrops] = await Promise.all([
        getFarm(farmId),
        getFarmFields(farmId),
        getFarmCollaborators(farmId),
        getCrops(),
      ]);
      const cropPairs = await Promise.all(
        nextFields.map(async (field) => {
          const instances = await getFieldCropInstances(field.id);
          return [field.id, instances] as const;
        }),
      );
      const nextCropInstances: Record<string, CropInstance[]> = {};
      cropPairs.forEach(([fieldID, instances]) => {
        nextCropInstances[fieldID] = instances;
      });

      setFarm(nextFarm);
      setFields(nextFields);
      setCollaborators(nextCollaborators);
      setCrops(nextCrops);
      setCropInstances(nextCropInstances);
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
  const activeCropCount = useMemo(
    () => Object.values(cropInstances).filter((items) => items.some((item) => item.active)).length,
    [cropInstances],
  );
  const selectedCrop = useMemo(() => crops.find((crop) => crop.id === cropForm.cropId), [cropForm.cropId, crops]);
  const stageChoices = useMemo(() => {
    if (!selectedCropInstance) {
      return [];
    }
    return crops.find((crop) => crop.id === selectedCropInstance.crop_id)?.stages || [];
  }, [crops, selectedCropInstance]);

  const activeCropForField = (fieldId: string) => cropInstances[fieldId]?.find((instance) => instance.active);

  const parseOptionalNumber = (value: string, label: string, min?: number, max?: number) => {
    if (!value.trim()) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} must be a number.`);
    }
    if (min !== undefined && parsed < min) {
      throw new Error(`${label} is too low.`);
    }
    if (max !== undefined && parsed > max) {
      throw new Error(`${label} is too high.`);
    }
    return parsed;
  };

  const submitField = async () => {
    try {
      if (!fieldForm.name.trim()) {
        setError('Field name is required.');
        return;
      }
      setSaving(true);
      const field = await createField(farmId, {
        name: fieldForm.name.trim(),
        latitude: parseOptionalNumber(fieldForm.latitude, 'Latitude', -90, 90),
        longitude: parseOptionalNumber(fieldForm.longitude, 'Longitude', -180, 180),
        area: parseOptionalNumber(fieldForm.area, 'Area', 0),
      });
      setFields((current) => [field, ...current]);
      setCropInstances((current) => ({ ...current, [field.id]: [] }));
      setFieldForm({ name: '', latitude: '', longitude: '', area: '' });
      setOpenField(false);
      setNotice('Field added.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to add field.');
    } finally {
      setSaving(false);
    }
  };

  const submitAccess = async () => {
    try {
      const email = accessForm.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email.');
        return;
      }
      setSaving(true);
      await addFarmCollaborator(farmId, { email, role: 'viewer' });
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

  const openCropDialog = (field: Field) => {
    setSelectedField(field);
    setCropForm({ ...emptyCropForm, cropId: crops[0]?.id || '' });
    setOpenCrop(true);
  };

  const submitCrop = async () => {
    if (!selectedField) {
      return;
    }
    try {
      if (!cropForm.cropId) {
        setError('Select a crop.');
        return;
      }
      if (cropForm.plantingDatePrecision !== 'unknown' && !cropForm.plantingDate) {
        setError('Planting date is required.');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (cropForm.plantingDate && cropForm.plantingDate > today) {
        setError('Planting date cannot be future.');
        return;
      }
      if (cropForm.expectedHarvestDate && cropForm.plantingDate && cropForm.expectedHarvestDate < cropForm.plantingDate) {
        setError('Harvest date must be after planting.');
        return;
      }
      setSaving(true);
      const instance = await createCropInstance(selectedField.id, {
        crop_id: cropForm.cropId,
        variety_id: cropForm.varietyId || undefined,
        planting_date: cropForm.plantingDatePrecision === 'unknown' ? undefined : cropForm.plantingDate,
        planting_date_precision: cropForm.plantingDatePrecision,
        expected_harvest_date: cropForm.expectedHarvestDate || undefined,
      });
      setCropInstances((current) => ({
        ...current,
        [selectedField.id]: [instance, ...(current[selectedField.id] || [])],
      }));
      setOpenCrop(false);
      setSelectedField(null);
      setNotice('Crop set.');
    } catch (err) {
      console.error(err);
      setError('Failed to set crop.');
    } finally {
      setSaving(false);
    }
  };

  const openStageDialog = (instance: CropInstance) => {
    setSelectedCropInstance(instance);
    setOpenStage(true);
  };

  const confirmStage = async (stageId: string) => {
    if (!selectedCropInstance) {
      return;
    }
    try {
      setSaving(true);
      const updated = await confirmCropStage(selectedCropInstance.id, stageId);
      setCropInstances((current) => ({
        ...current,
        [updated.field_id]: (current[updated.field_id] || []).map((item) => (item.id === updated.id ? updated : item)),
      }));
      setSelectedCropInstance(updated);
      setOpenStage(false);
      setNotice('Stage confirmed.');
    } catch (err) {
      console.error(err);
      setError('Failed to confirm stage.');
    } finally {
      setSaving(false);
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
            <Tooltip title="Farm-level view. Fields, crops, and people live here.">
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
          <Card><CardContent><Typography color="text.secondary">Crops</Typography><Typography variant="h4">{activeCropCount}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary">Mode</Typography><Typography variant="h4">{ownerMode ? 'Edit' : 'Read'}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      {ownerMode && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
          <Button startIcon={<Add />} variant="contained" onClick={() => setOpenField(true)}>
            Add Field
          </Button>
          <Button variant="outlined" onClick={() => setOpenAccess(true)}>
            Access
          </Button>
        </Stack>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">Fields</Typography>
            <Tooltip title="Fields hold crop setup. Controller links come later through sensor bases.">
              <IconButton size="small" aria-label="Fields help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Grid container spacing={2}>
            {fields.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ py: 5, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Place color="primary" sx={{ fontSize: 42 }} />
                  <Typography sx={{ mt: 1 }}>No fields yet</Typography>
                </Box>
              </Grid>
            ) : (
              fields.map((field) => {
                const activeCrop = activeCropForField(field.id);
                return (
                  <Grid item xs={12} sm={6} key={field.id}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box>
                            <Typography fontWeight={800}>{field.name}</Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                              <Chip size="small" label={field.area ? `${field.area} ha` : 'Area n/a'} />
                            </Stack>
                          </Box>
                          {ownerMode && (
                            <Tooltip title="Set crop">
                              <IconButton size="small" onClick={() => openCropDialog(field)} aria-label={`Set crop for ${field.name}`}>
                                <Agriculture fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>

                        {activeCrop ? (
                          <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                              <Box>
                                <Typography fontWeight={700}>{activeCrop.crop_name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {activeCrop.current_stage?.name || 'Stage pending'}
                                </Typography>
                              </Box>
                              {ownerMode && activeCrop.current_stage && (
                                <Button size="small" onClick={() => openStageDialog(activeCrop)}>
                                  Stage
                                </Button>
                              )}
                            </Stack>
                          </Box>
                        ) : (
                          <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
                            <Chip size="small" icon={<Agriculture />} label="No crop" />
                            {ownerMode && (
                              <Button size="small" onClick={() => openCropDialog(field)}>
                                Set
                              </Button>
                            )}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })
            )}
          </Grid>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">People</Typography>
            <Tooltip title="Owners manage access. Viewers can only read.">
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
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={800} noWrap>{person.name || person.email}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
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
              <Box sx={{ py: 4, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography color="text.secondary">No people yet</Typography>
              </Box>
            )}
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={openField} onClose={() => setOpenField(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Add Field</span>
            <Tooltip title="Name is required. Location and area help maps and alerts.">
              <IconButton size="small" aria-label="Add field help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
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
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Access</span>
            <Tooltip title="Invited people can view only. Admin accounts are separate.">
              <IconButton size="small" aria-label="Access help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Viewer email" value={accessForm.email} onChange={(e) => setAccessForm({ email: e.target.value })} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAccess(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitAccess} disabled={saving || !accessForm.email.trim()}>
            {saving ? 'Sending' : 'Invite'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCrop} onClose={() => setOpenCrop(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Set Crop</span>
            <Tooltip title="Stage is estimated from planting date. Confirm only if needed.">
              <IconButton size="small" aria-label="Crop setup help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Crop</InputLabel>
              <Select
                label="Crop"
                value={cropForm.cropId}
                onChange={(event) => setCropForm((current) => ({ ...current, cropId: event.target.value, varietyId: '' }))}
              >
                {crops.map((crop) => (
                  <MenuItem key={crop.id} value={crop.id}>{crop.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!selectedCrop?.varieties.length}>
              <InputLabel>Variety</InputLabel>
              <Select
                label="Variety"
                value={cropForm.varietyId}
                onChange={(event) => setCropForm((current) => ({ ...current, varietyId: event.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {selectedCrop?.varieties.map((variety) => (
                  <MenuItem key={variety.id} value={variety.id}>{variety.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Planting</InputLabel>
              <Select
                label="Planting"
                value={cropForm.plantingDatePrecision}
                onChange={(event) => setCropForm((current) => ({
                  ...current,
                  plantingDatePrecision: event.target.value as CropForm['plantingDatePrecision'],
                  plantingDate: event.target.value === 'unknown' ? '' : current.plantingDate,
                }))}
              >
                <MenuItem value="exact">Exact</MenuItem>
                <MenuItem value="approximate">Approx</MenuItem>
                <MenuItem value="unknown">Unknown</MenuItem>
              </Select>
            </FormControl>
            {cropForm.plantingDatePrecision !== 'unknown' && (
              <TextField
                label="Date"
                type="date"
                value={cropForm.plantingDate}
                onChange={(event) => setCropForm((current) => ({ ...current, plantingDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            )}
            <TextField
              label="Harvest"
              type="date"
              value={cropForm.expectedHarvestDate}
              onChange={(event) => setCropForm((current) => ({ ...current, expectedHarvestDate: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCrop(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitCrop} disabled={saving || !cropForm.cropId}>
            {saving ? 'Saving' : 'Set'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openStage} onClose={() => setOpenStage(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Confirm Stage</span>
            <Tooltip title="Pick the closest visual stage when the estimate looks wrong.">
              <IconButton size="small" aria-label="Stage help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {stageChoices.map((stage) => {
              const selected = selectedCropInstance?.current_stage?.id === stage.id;
              return (
                <Button
                  key={stage.id}
                  variant={selected ? 'contained' : 'outlined'}
                  startIcon={selected ? <CheckCircle /> : undefined}
                  onClick={() => confirmStage(stage.id)}
                  disabled={saving}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  {stage.name}
                </Button>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStage(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FarmDetails;
