import React, { useEffect, useMemo, useState } from 'react';
import { Add, ArrowBack, Agriculture, DeleteOutline, Save } from '@mui/icons-material';
import {
  Alert, Button, Card, CardContent, Chip, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel,
  MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { MonitoringSkeleton } from '../../components/LoadingSkeletons';
import { PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import FarmLocationPicker from '../../components/FarmLocationPicker';
import {
  confirmCropStage, createCropInstance, createField, Crop, CropInstance, deleteFarm,
  Farm, FarmController, Field, getCrops, getFarm, getFarmControllers, getFarmFields,
  getFarmSensorBases, getFieldCropInstances, getFarms, SensorBase, assignSensorBase, createSensorBase,
  attachFarmController, updateFarm,
} from '../../services/farmService';

const FarmSettings: React.FC = () => {
  const { farmId = '' } = useParams();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [allFarms, setAllFarms] = useState<Farm[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [controllers, setControllers] = useState<FarmController[]>([]);
  const [sensorBases, setSensorBases] = useState<SensorBase[]>([]);
  const [cropByField, setCropByField] = useState<Record<string, CropInstance | undefined>>({});
  const [name, setName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldLocationOpen, setFieldLocationOpen] = useState(false);
  const [setupField, setSetupField] = useState<Field | null>(null);
  const [cropId, setCropId] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [stageSelections, setStageSelections] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [moveBase, setMoveBase] = useState<SensorBase | null>(null);
  const [moveFieldId, setMoveFieldId] = useState('');
  const [moveController, setMoveController] = useState<FarmController | null>(null);
  const [targetFarmId, setTargetFarmId] = useState('');
  const [assignSetupField, setAssignSetupField] = useState<Field | null>(null);
  const [assignBaseId, setAssignBaseId] = useState('');
  const [assignControllerId, setAssignControllerId] = useState('');
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [createBaseControllerId, setCreateBaseControllerId] = useState('');
  const [createBaseSerial, setCreateBaseSerial] = useState('');
  const [createBaseLabel, setCreateBaseLabel] = useState('');
  const visibleControllers = useMemo(
    () =>
      controllers.filter((controller) => {
        const serial = (controller.serial_number || '').trim().toUpperCase();
        const legacy = (controller.legacy_controller_id || '').trim().toUpperCase();
        return !serial.includes('MOCK') && !legacy.includes('MOCK');
      }),
    [controllers],
  );

  const load = async () => {
    const [nextFarm, nextFields, nextCrops, nextControllers, nextSensorBases, nextAllFarms] = await Promise.all([
      getFarm(farmId),
      getFarmFields(farmId),
      getCrops(),
      getFarmControllers(farmId),
      getFarmSensorBases(farmId),
      getFarms(),
    ]);
    const instances = await Promise.all(nextFields.map((field) => getFieldCropInstances(field.id)));
    const nextByField: Record<string, CropInstance | undefined> = {};
    const nextStages: Record<string, string> = {};
    nextFields.forEach((field, index) => {
      const active = instances[index].find((instance) => instance.active);
      nextByField[field.id] = active;
      if (active?.current_stage?.id) nextStages[field.id] = active.current_stage.id;
    });
    setFarm(nextFarm); setName(nextFarm.name); setFields(nextFields); setCrops(nextCrops);
    setAllFarms(nextAllFarms);
    setControllers(nextControllers); setSensorBases(nextSensorBases);
    setCropByField(nextByField); setStageSelections(nextStages);
  };

  useEffect(() => { void load().catch(() => setError('Farm settings could not be loaded.')); }, [farmId]);

  const cropDefinition = (instance?: CropInstance) => crops.find((crop) => crop.id === instance?.crop_id);
  const selectedCrop = useMemo(() => crops.find((crop) => crop.id === cropId), [cropId, crops]);

  const saveName = async () => {
    if (!farm || name.trim().length < 2 || name.trim().length > 100) return setError('Farm name must be between 2 and 100 characters.');
    try {
      setBusy(true); setError(''); setNotice('');
      const updated = await updateFarm(farmId, {
        name: name.trim(), latitude: farm.latitude, longitude: farm.longitude, area: farm.area,
        location_accuracy_m: farm.location_accuracy_m, location_label: farm.location_label,
        location_source: farm.location_source,
      });
      setFarm(updated); setNotice('Farm name saved.');
    } catch { setError('Farm name could not be saved.'); } finally { setBusy(false); }
  };

  const addField = async () => {
    const nextName = fieldName.trim();
    if (nextName.length < 2 || nextName.length > 100) return setError('Field name must be between 2 and 100 characters.');
    if (fields.some((field) => field.name.trim().toLowerCase() === nextName.toLowerCase())) return setError('A field with this name already exists.');
    try {
      setBusy(true); setError('');
      const created = await createField(farmId, { name: nextName });
      setFields((current) => [...current, created]); setFieldName(''); setNotice('Field added.');
    } catch { setError('The field could not be added.'); } finally { setBusy(false); }
  };

  const saveCrop = async () => {
    if (!setupField || !cropId) return;
    try {
      setBusy(true); setError('');
      const created = await createCropInstance(setupField.id, {
        crop_id: cropId, planting_date: plantingDate || null,
        planting_date_precision: plantingDate ? 'exact' : 'unknown',
      });
      setCropByField((current) => ({ ...current, [setupField.id]: created }));
      if (created.current_stage?.id) setStageSelections((current) => ({ ...current, [setupField.id]: created.current_stage!.id }));
      setSetupField(null); setCropId(''); setPlantingDate(''); setNotice('Field crop saved.');
    } catch { setError('The crop setup could not be saved.'); } finally { setBusy(false); }
  };

  const saveStage = async (field: Field) => {
    const instance = cropByField[field.id];
    const stageId = stageSelections[field.id];
    if (!instance || !stageId) return;
    try {
      setBusy(true); setError('');
      const updated = await confirmCropStage(instance.id, stageId);
      setCropByField((current) => ({ ...current, [field.id]: updated })); setNotice('Growth stage confirmed.');
    } catch { setError('The growth stage could not be updated.'); } finally { setBusy(false); }
  };

  const removeFarm = async () => {
    if (!farm || deleteConfirmation.trim() !== farm.name) return;
    try {
      setBusy(true); setError(''); await deleteFarm(farm.id);
      navigate('/farms', { replace: true, state: { message: 'Farm deleted.' } });
    } catch { setError('The farm could not be deleted.'); setDeleteOpen(false); } finally { setBusy(false); }
  };

  const moveSensorBaseToField = async () => {
    if (!moveBase || !moveFieldId) return;
    try {
      setBusy(true); setError(''); setNotice('');
      const updated = await assignSensorBase(moveBase.id, { field_id: moveFieldId });
      setSensorBases((current) => current.map((base) => base.id === updated.id ? updated : base));
      const fieldName = fields.find((field) => field.id === moveFieldId)?.name || 'selected field';
      setNotice(`Sensor Base moved to ${fieldName}.`);
      setMoveBase(null);
      setMoveFieldId('');
      await load();
    } catch {
      setError('The Sensor Base could not be moved to the new Field.');
    } finally {
      setBusy(false);
    }
  };

  const moveControllerToAnotherFarm = async () => {
    if (!moveController || !targetFarmId) return;
    try {
      setBusy(true); setError(''); setNotice('');
      await attachFarmController(targetFarmId, {
        controller_id: moveController.legacy_controller_id || moveController.serial_number,
        model: moveController.model || undefined,
      });
      const targetFarmName = allFarms.find((item) => item.id === targetFarmId)?.name || 'selected farm';
      setNotice(`Hardware moved to ${targetFarmName}. The controller and its linked Sensor Bases now belong to that farm.`);
      setMoveController(null);
      setTargetFarmId('');
      await load();
    } catch {
      setError('The hardware could not be moved to the selected farm.');
    } finally {
      setBusy(false);
    }
  };

  const createFarmSensorBase = async () => {
    if (!createBaseControllerId || !createBaseSerial.trim()) return;
    try {
      setBusy(true); setError(''); setNotice('');
      await createSensorBase(farmId, {
        gateway_id: createBaseControllerId,
        serial_number: createBaseSerial.trim(),
        label: createBaseLabel.trim() || undefined,
      });
      setNotice('Sensor Base added to this farm.');
      setCreateBaseOpen(false);
      setCreateBaseControllerId('');
      setCreateBaseSerial('');
      setCreateBaseLabel('');
      await load();
    } catch {
      setError('The Sensor Base could not be added to this farm.');
    } finally {
      setBusy(false);
    }
  };

  const assignHardwareToField = async () => {
    if (!assignSetupField) return;
    try {
      setBusy(true); setError(''); setNotice('');

      let baseId = assignBaseId;
      if (!baseId && assignControllerId) {
        const selectedController = controllers.find((controller) => controller.id === assignControllerId);
        if (!selectedController) {
          setError('Choose the linked controller first.');
          return;
        }

        const nextBaseNumber = sensorBases.filter((base) => base.gateway_id === selectedController.id).length + 1;
        const createdBase = await createSensorBase(farmId, {
          gateway_id: selectedController.id,
          serial_number: `${selectedController.serial_number}-BASE-${nextBaseNumber}`,
          label: `${assignSetupField.name} Base`,
        });
        baseId = createdBase.id;
      }

      if (!baseId) {
        setError('Choose the hardware for this field first.');
        return;
      }

      await assignSensorBase(baseId, { field_id: assignSetupField.id });
      setNotice(`Hardware assigned to ${assignSetupField.name}.`);
      setAssignSetupField(null);
      setAssignBaseId('');
      setAssignControllerId('');
      await load();
    } catch {
      setError('The hardware could not be assigned to this Field.');
    } finally {
      setBusy(false);
    }
  };

  const availableTargetFarms = allFarms.filter((item) => item.role === 'owner' && item.id !== farmId);

  if (!farm && !error) return <MonitoringSkeleton />;

  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}><PageShell>
    <IconButton onClick={() => navigate(`/farms/${farmId}`)} aria-label="Back to farm" sx={{ mb: 1 }}><ArrowBack /></IconButton>
    <PageHeaderPanel title="Farm settings" subtitle="Manage this farm and its fields." icon={<Agriculture />} />
    <Stack spacing={2}>
      {farm && <Typography variant="h5">{farm.name}</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {farm?.role === 'viewer' && <Alert severity="info">Only the farm owner can change these settings.</Alert>}

      <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Typography variant="h6">Farm name</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField fullWidth label="Farm name" value={name} onChange={(event) => setName(event.target.value)} inputProps={{ maxLength: 100 }} disabled={farm?.role !== 'owner'} />
          {farm?.role === 'owner' && <Button variant="contained" startIcon={<Save />} onClick={saveName} disabled={busy || name.trim() === farm.name}>Save</Button>}
        </Stack>
      </Stack></CardContent></Card>

      <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><div><Typography variant="h6">Fields and crops</Typography><Typography variant="body2" color="text.secondary">Set one active crop for each field.</Typography></div><Chip size="small" label={fields.length} /></Stack>
        <Divider />
        {fields.map((field) => {
          const instance = cropByField[field.id];
          const definition = cropDefinition(instance);
          const assignedBases = sensorBases.filter((base) => base.current_assignment?.field_id === field.id);
          return <Stack key={field.id} spacing={1.25} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center"><div><Typography fontWeight={800}>{field.name}</Typography><Typography variant="body2" color="text.secondary">{instance ? `${instance.crop_name} · ${instance.current_stage?.name || 'Stage being estimated'}` : 'Crop not set'}</Typography></div>{farm?.role === 'owner' && <Button size="small" onClick={() => { setSetupField(field); setCropId(instance?.crop_id || ''); setPlantingDate(instance?.planting_date || ''); }}>{instance ? 'Change crop' : 'Set crop'}</Button>}</Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {assignedBases.length > 0 ? `Sensor Bases: ${assignedBases.map((base) => base.label || base.serial_number).join(', ')}` : 'No Sensor Base assigned yet'}
              </Typography>
              {farm?.role === 'owner' && <Button size="small" variant="outlined" onClick={() => { setAssignSetupField(field); setAssignBaseId(assignedBases[0]?.id || ''); setAssignControllerId(visibleControllers[0]?.id || ''); }}>{assignedBases.length > 0 ? 'Change hardware' : 'Assign hardware'}</Button>}
            </Stack>
            {farm?.role === 'owner' && instance && definition && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControl size="small" fullWidth><InputLabel id={`stage-${field.id}`}>Growth stage</InputLabel><Select labelId={`stage-${field.id}`} label="Growth stage" value={stageSelections[field.id] || ''} onChange={(event) => setStageSelections((current) => ({ ...current, [field.id]: event.target.value }))}>{definition.stages.map((stage) => <MenuItem key={stage.id} value={stage.id}>{stage.name}</MenuItem>)}</Select></FormControl>
              <Button variant="outlined" onClick={() => saveStage(field)} disabled={busy || !stageSelections[field.id] || stageSelections[field.id] === instance.current_stage?.id}>Confirm stage</Button>
            </Stack>}
          </Stack>;
        })}
        {fields.length === 0 && <Typography color="text.secondary">No fields added yet.</Typography>}
        {farm?.role === 'owner' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth size="small" label="New field name" placeholder="Example: North field" value={fieldName} onChange={(event) => setFieldName(event.target.value)} inputProps={{ maxLength: 100 }} /><Button variant="outlined" aria-label="Create a field to hold crops and monitoring areas" startIcon={<Add />} onClick={() => setFieldLocationOpen(true)} disabled={busy} sx={{ whiteSpace: 'nowrap' }}>Add field</Button></Stack>}
      </Stack></CardContent></Card>

      <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <div>
            <Typography variant="h6">Field hardware</Typography>
            <Typography variant="body2" color="text.secondary">Connect each field to the hardware installed there.</Typography>
          </div>
          <Chip size="small" label={sensorBases.length} />
        </Stack>
        <Divider />
        {visibleControllers.length > 0 && (
          <Stack spacing={1}>
            {farm?.role === 'owner' && (
              <Stack spacing={1}>
                {visibleControllers.map((controller) => (
                  <Stack key={controller.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(60, 57, 17, 0.04)' }}>
                    <div>
                      <Typography fontWeight={800}>Controller {controller.serial_number}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Move this controller only when the hardware is changing farms.
                      </Typography>
                    </div>
                    <Button size="small" variant="outlined" onClick={() => {
                      setMoveController(controller);
                      setTargetFarmId('');
                    }}>
                      Move to another farm
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        )}
        {sensorBases.length === 0 ? (
          <Stack spacing={1.25}>
            <Typography color="text.secondary">No field hardware is ready in this farm yet.</Typography>
            {farm?.role === 'owner' && visibleControllers.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Add />}
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => {
                  setCreateBaseOpen(true);
                  setCreateBaseControllerId(visibleControllers[0]?.id || '');
                }}
              >
                Prepare field hardware
              </Button>
            )}
          </Stack>
        ) : (
          <Stack spacing={1.25}>
            {sensorBases.map((base) => (
              <Stack key={base.id} spacing={1} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <div>
                    <Typography fontWeight={800}>{base.label || base.serial_number}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {base.current_assignment?.field_name || 'Not assigned to a field yet'}
                    </Typography>
                  </div>
                  {farm?.role === 'owner' && (
                    <Button size="small" variant="outlined" onClick={() => {
                      setMoveBase(base);
                      setMoveFieldId(base.current_assignment?.field_id || '');
                    }}>
                      Move to field
                    </Button>
                  )}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack></CardContent></Card>

      {farm?.role === 'owner' && <Card variant="outlined" sx={{ borderColor: 'error.light' }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><div><Typography variant="h6">Delete farm</Typography><Typography variant="body2" color="text.secondary">The farm will disappear from all customer accounts. Historical records are retained securely.</Typography></div><Button color="error" variant="outlined" startIcon={<DeleteOutline />} onClick={() => setDeleteOpen(true)}>Delete farm</Button></Stack></CardContent></Card>}
    </Stack>

    <Dialog open={Boolean(setupField)} onClose={() => !busy && setSetupField(null)} fullWidth maxWidth="sm"><DialogTitle>{setupField ? `Crop for ${setupField.name}` : 'Set crop'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><FormControl fullWidth><InputLabel id="crop-label">Crop</InputLabel><Select labelId="crop-label" label="Crop" value={cropId} onChange={(event) => setCropId(event.target.value)}>{crops.map((crop) => <MenuItem key={crop.id} value={crop.id}>{crop.name}</MenuItem>)}</Select></FormControl>{selectedCrop?.varieties.length ? <Typography variant="body2" color="text.secondary">Variety can be added later if needed.</Typography> : null}<TextField label="Planting date (optional)" type="date" value={plantingDate} onChange={(event) => setPlantingDate(event.target.value)} InputLabelProps={{ shrink: true }} /></Stack></DialogContent><DialogActions><Button onClick={() => setSetupField(null)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={saveCrop} disabled={busy || !cropId}>Save crop</Button></DialogActions></Dialog>

    <Dialog open={Boolean(assignSetupField)} onClose={() => !busy && setAssignSetupField(null)} fullWidth maxWidth="sm">
      <DialogTitle>{assignSetupField ? `Assign hardware to ${assignSetupField.name}` : 'Assign hardware'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Choose the hardware installed in this Field.
          </Typography>
          {sensorBases.length > 0 && (
            <FormControl fullWidth>
              <InputLabel id="assign-setup-base-label">Sensor Base</InputLabel>
              <Select
                labelId="assign-setup-base-label"
                label="Sensor Base"
                value={assignBaseId}
                onChange={(event) => setAssignBaseId(event.target.value)}
              >
                {sensorBases.map((base) => (
                  <MenuItem key={base.id} value={base.id}>{base.label || base.serial_number}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {sensorBases.length === 0 && visibleControllers.length > 0 && (
            <>
              <Alert severity="info">
                No field hardware is ready yet. Choose the linked controller and Spectron will prepare the field connection for you.
              </Alert>
              <FormControl fullWidth>
                <InputLabel id="assign-setup-controller-label">Linked controller</InputLabel>
                <Select
                  labelId="assign-setup-controller-label"
                  label="Linked controller"
                  value={assignControllerId}
                  onChange={(event) => setAssignControllerId(event.target.value)}
                >
                  {visibleControllers.map((controller) => (
                    <MenuItem key={controller.id} value={controller.id}>{controller.serial_number}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
          {sensorBases.length === 0 && visibleControllers.length === 0 && (
            <Alert severity="info">
              Link a controller to this farm first, then assign the hardware to the field.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAssignSetupField(null)} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy || !assignSetupField || (!assignBaseId && !assignControllerId)}
          onClick={assignHardwareToField}
        >
          Save hardware
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={createBaseOpen} onClose={() => !busy && setCreateBaseOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Add Sensor Base</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Prepare one field hardware record under a linked controller, then assign it to a field.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="create-base-controller-label">Controller</InputLabel>
            <Select
              labelId="create-base-controller-label"
              label="Controller"
              value={createBaseControllerId}
              onChange={(event) => setCreateBaseControllerId(event.target.value)}
            >
              {visibleControllers.map((controller) => (
                <MenuItem key={controller.id} value={controller.id}>{controller.serial_number}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Sensor Base serial"
            placeholder="Example: BASE-001"
            value={createBaseSerial}
            onChange={(event) => setCreateBaseSerial(event.target.value)}
            fullWidth
          />
          <TextField
            label="Label (optional)"
            placeholder="Example: Paddy 1 Base"
            value={createBaseLabel}
            onChange={(event) => setCreateBaseLabel(event.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCreateBaseOpen(false)} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={createFarmSensorBase} disabled={busy || !createBaseControllerId || !createBaseSerial.trim()}>
          {busy ? 'Saving...' : 'Add Sensor Base'}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(moveBase)} onClose={() => !busy && setMoveBase(null)} fullWidth maxWidth="sm">
      <DialogTitle>{moveBase ? `Move ${moveBase.label || moveBase.serial_number}` : 'Move Sensor Base'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Choose the Field where this Sensor Base is currently installed.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="move-base-field-label">Field</InputLabel>
            <Select
              labelId="move-base-field-label"
              label="Field"
              value={moveFieldId}
              onChange={(event) => setMoveFieldId(event.target.value)}
            >
              {fields.map((field) => (
                <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setMoveBase(null)} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={moveSensorBaseToField} disabled={busy || !moveFieldId}>Save field</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(moveController)} onClose={() => !busy && setMoveController(null)} fullWidth maxWidth="sm">
      <DialogTitle>{moveController ? `Move ${moveController.serial_number}` : 'Move hardware to another farm'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            This moves the controller and its linked Sensor Bases to another farm you own.
          </Alert>
          <FormControl fullWidth>
            <InputLabel id="move-controller-farm-label">Target farm</InputLabel>
            <Select
              labelId="move-controller-farm-label"
              label="Target farm"
              value={targetFarmId}
              onChange={(event) => setTargetFarmId(event.target.value)}
            >
              {availableTargetFarms.map((item) => (
                <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {availableTargetFarms.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Create another farm first before moving this hardware.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setMoveController(null)} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={moveControllerToAnotherFarm} disabled={busy || !targetFarmId}>
          Move hardware
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Delete {farm?.name}?</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>This removes the farm from the app for the owner and all viewers.</Alert><Typography variant="body2" sx={{ mb: 1 }}>Type the farm name to confirm.</Typography><TextField fullWidth value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} label="Farm name" /></DialogContent><DialogActions><Button onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</Button><Button color="error" variant="contained" onClick={removeFarm} disabled={busy || deleteConfirmation.trim() !== farm?.name}>Delete farm</Button></DialogActions></Dialog>
    <Dialog open={fieldLocationOpen} onClose={() => setFieldLocationOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Field location</DialogTitle>
      <DialogContent><FarmLocationPicker value={null} confirmed={false} onChange={() => undefined} onConfirm={() => undefined} /></DialogContent>
      <DialogActions><Button onClick={() => setFieldLocationOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </PageShell></Container>;
};

export default FarmSettings;
