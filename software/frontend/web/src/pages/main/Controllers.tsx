import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { Add, Agriculture, Settings, Wifi } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { PageHeaderPanel, PageShell } from "../../components/ui/PageSurface";
import {
  attachFarmController,
  Farm,
  FarmController,
  getFarmControllers,
  getFarmSensorBases,
  getFarms,
  SensorBase,
} from "../../services/farmService";
import { Controller } from "../../services/controllerService";
import { getMyHardwareControllers } from "../../services/hardwarePairingService";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

type HardwareRow = {
  farm: Farm;
  connection: FarmController;
  fieldSensors: SensorBase[];
};

const simpleStatus = (status?: string) => {
  const normalized = status?.toLowerCase();
  if (normalized === "online" || normalized === "live")
    return { label: "Good", color: "success" as const };
  if (
    normalized === "pending_config" ||
    normalized === "pending_setup" ||
    normalized === "waiting_setup"
  ) {
    return { label: "Waiting setup", color: "warning" as const };
  }
  if (normalized === "offline")
    return { label: "Offline", color: "default" as const };
  return { label: "Needs attention", color: "error" as const };
};

const Controllers: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HardwareRow[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [unassigned, setUnassigned] = useState<Controller[]>([]);
  const [controllerToLink, setControllerToLink] = useState<Controller | null>(
    null,
  );
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [linking, setLinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [nextFarms, ownedControllers] = await Promise.all([
        getFarms(),
        // Viewers can see Farm hardware but do not own devices themselves.
        getMyHardwareControllers().catch(() => []),
      ]);
      const results = await Promise.all(
        nextFarms.map(async (farm) => {
          const [connections, sensors] = await Promise.all([
            getFarmControllers(farm.id),
            getFarmSensorBases(farm.id),
          ]);
          return connections.map((connection) => ({
            farm,
            connection,
            fieldSensors: sensors.filter(
              (sensor) => sensor.gateway_id === connection.id,
            ),
          }));
        }),
      );
      const nextRows = results.flat();
      const attachedCodes = new Set(
        nextRows.map(({ connection }) =>
          connection.serial_number.trim().toUpperCase(),
        ),
      );

      setFarms(nextFarms);
      setRows(nextRows);
      setUnassigned(
        ownedControllers.filter(
          (controller) =>
            !attachedCodes.has(
              (controller.hw_id || controller.id).trim().toUpperCase(),
            ),
        ),
      );
    } catch {
      setError("Hardware status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefresh("customer", load);

  const openFarmLink = (controller: Controller) => {
    const ownerFarms = farms.filter((farm) => farm.role === "owner");
    if (ownerFarms.length === 0) {
      navigate("/farms");
      return;
    }
    setControllerToLink(controller);
    setSelectedFarmId(ownerFarms[0].id);
  };

  const linkToFarm = async () => {
    if (!controllerToLink || !selectedFarmId) return;
    setLinking(true);
    setError("");
    try {
      await attachFarmController(selectedFarmId, {
        controller_id: controllerToLink.hw_id || controllerToLink.id,
      });
      setControllerToLink(null);
      await load();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data ||
          "Device could not be linked to the Farm.",
      );
    } finally {
      setLinking(false);
    }
  };

  const hasHardware = rows.length > 0 || unassigned.length > 0;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
        <Stack spacing={2.5}>
          <PageHeaderPanel
            title="Hardware"
            subtitle="Your devices, Farm links, and sensor status."
            icon={<Wifi />}
            actions={
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate("/hardware/setup")}
              >
                Set up hardware
              </Button>
            }
          />

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Typography>Loading hardware…</Typography>
        ) : !hasHardware ? (
          <Card>
            <CardContent>
              <Typography variant="h6">No hardware connected</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Connect a device now. You can link it to a Farm later.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/hardware/setup")}
              >
                Set up hardware
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {unassigned.map((controller) => {
              const status = simpleStatus(
                controller.operational_status || controller.status,
              );
              return (
                <Card key={`unassigned-${controller.id}`} variant="outlined">
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={1}
                        alignItems="flex-start"
                      >
                        <Box>
                          <Typography variant="h6">
                            {controller.name ||
                              controller.hw_id ||
                              "Farm device"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Not linked to a Farm
                          </Typography>
                        </Box>
                        <Chip
                          icon={<Wifi />}
                          color={status.color}
                          label={status.label}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Configure this device now, or link it to a Farm when the
                        Farm is ready.
                      </Typography>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                      >
                        <Button
                          variant="outlined"
                          startIcon={<Settings />}
                          onClick={() =>
                            navigate(
                              `/controllers/${encodeURIComponent(
                                controller.hw_id || controller.id,
                              )}`,
                            )
                          }
                        >
                          Configure
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<Agriculture />}
                          onClick={() => openFarmLink(controller)}
                        >
                          {farms.some((farm) => farm.role === "owner")
                            ? "Link to Farm"
                            : "Create Farm"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}

            {rows.map(({ farm, connection, fieldSensors }) => {
              const connectionStatus = simpleStatus(connection.status);
              return (
                <Card key={connection.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={1}
                        alignItems="flex-start"
                      >
                        <Box>
                          <Typography variant="h6">
                            {farm.name} connection
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Last update:{" "}
                            {connection.last_seen
                              ? new Date(connection.last_seen).toLocaleString()
                              : "Waiting for signal"}
                          </Typography>
                        </Box>
                        <Chip
                          icon={<Wifi />}
                          color={connectionStatus.color}
                          label={connectionStatus.label}
                        />
                      </Stack>
                      <Box>
                        <Typography fontWeight={800} sx={{ mb: 1 }}>
                          Field sensors
                        </Typography>
                        {fieldSensors.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No field sensors found yet.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            {fieldSensors.map((sensor) => {
                              const sensorStatus = simpleStatus(sensor.status);
                              return (
                                <Stack
                                  key={sensor.id}
                                  direction="row"
                                  justifyContent="space-between"
                                  spacing={1}
                                  sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    bgcolor: "action.hover",
                                  }}
                                >
                                  <Box>
                                    <Typography fontWeight={700}>
                                      {sensor.current_assignment?.field_name ||
                                        sensor.label ||
                                        "Sensor waiting for a Field"}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {sensor.current_assignment?.field_name
                                        ? "Field sensor"
                                        : "Choose a Field during setup"}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    size="small"
                                    color={sensorStatus.color}
                                    label={sensorStatus.label}
                                  />
                                </Stack>
                              );
                            })}
                          </Stack>
                        )}
                      </Box>
                      <Button
                        variant="outlined"
                        startIcon={<Settings />}
                        onClick={() =>
                          navigate(
                            `/controllers/${encodeURIComponent(
                              connection.legacy_controller_id ||
                                connection.serial_number,
                            )}`,
                          )
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Configure
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        <Dialog
          open={Boolean(controllerToLink)}
          onClose={() => !linking && setControllerToLink(null)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Link device to Farm</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel>Farm</InputLabel>
              <Select
                label="Farm"
                value={selectedFarmId}
                onChange={(event) => setSelectedFarmId(event.target.value)}
                disabled={linking}
              >
                {farms
                  .filter((farm) => farm.role === "owner")
                  .map((farm) => (
                    <MenuItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setControllerToLink(null)}
              disabled={linking}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={linkToFarm}
              disabled={linking || !selectedFarmId}
            >
              {linking ? "Linking…" : "Link device"}
            </Button>
          </DialogActions>
        </Dialog>
        </Stack>
      </PageShell>
    </Container>
  );
};

export default Controllers;
