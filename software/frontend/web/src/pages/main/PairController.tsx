import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  Container,
  TextField,
  Button,
  Box,
  Alert,
} from "@mui/material";
import { CameraAlt, Memory, QrCodeScanner } from "@mui/icons-material";
import { Html5Qrcode } from "html5-qrcode";
import {
  extractControllerId,
  pairHardwareController,
} from "../../services/hardwarePairingService";
import AutoDismissAlert from "../../components/AutoDismissAlert";
import { PageHeaderPanel, PageShell } from "../../components/ui/PageSurface";

const SCANNER_REGION_ID = "spectron-controller-qr-reader";

const PairController: React.FC = () => {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);
  const [controllerCode, setControllerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanInfo, setScanInfo] = useState("");
  const [isScannerSupported, setIsScannerSupported] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);

  useEffect(() => {
    setIsScannerSupported(Boolean(navigator.mediaDevices?.getUserMedia));

    const controllerIdFromUrl = extractControllerId(window.location.href);
    if (controllerIdFromUrl) {
      setControllerCode(controllerIdFromUrl);
      setScanInfo("Device code loaded.");
    }

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // The scanner may already be stopped by the browser or by a completed scan.
      }
    }

    scannerRef.current = null;
    scanHandledRef.current = false;
    setIsCameraRunning(false);
  };

  const startCamera = async () => {
    setError("");
    setScanInfo("Scanning...");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access is not available. Enter the device code manually.",
      );
      return;
    }

    try {
      await stopCamera();
      setIsCameraRunning(true);
      scanHandledRef.current = false;

      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const scanner = new Html5Qrcode(SCANNER_REGION_ID);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (scanHandledRef.current) {
            return;
          }

          const value = extractControllerId(decodedText || "");
          if (!value) {
            setError("Invalid device QR code");
            return;
          }

          scanHandledRef.current = true;
          setControllerCode(value);
          setScanInfo("Device scanned successfully.");
          await stopCamera();
        },
        () => undefined,
      );
    } catch {
      await stopCamera();
      setError("Camera is unavailable. Enter the device code manually.");
    }
  };

  const handlePair = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const normalizedControllerId = extractControllerId(controllerCode);

    if (!normalizedControllerId) {
      setError(
        controllerCode.trim()
          ? "Invalid device QR code"
          : "Device code required",
      );
      return;
    }
    setLoading(true);
    try {
      const pairing = await pairHardwareController(normalizedControllerId);
      setControllerCode(normalizedControllerId);
      navigate(
        `/controllers/${encodeURIComponent(pairing.routeId || pairing.controllerId)}`,
        {
          state: {
            controllerId: pairing.controllerId,
            paired: true,
            message:
              "Device connected. You can configure it now and link it to a Farm later.",
          },
        },
      );
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message =
        err?.response?.status === 409
          ? typeof responseData === "string"
            ? responseData
            : "This device is already connected to another account."
          : typeof responseData === "string"
            ? responseData
            : responseData?.message || err?.message || "Pairing failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
        <PageHeaderPanel
          title="Connect farm device"
          subtitle="Scan the device and connect it to your account."
          icon={<QrCodeScanner />}
          info="Configure the device now. You can link it to a Farm whenever you are ready."
          actions={
            <Button
              variant="outlined"
              size="small"
              startIcon={<Memory />}
              sx={{ minHeight: 40, px: 2.25 }}
              onClick={() => navigate("/hardware")}
            >
              Hardware
            </Button>
          }
        />

        <AutoDismissAlert
          open={Boolean(error)}
          severity="error"
          sx={{ mb: 2 }}
          onCloseAlert={() => setError("")}
        >
          {error}
        </AutoDismissAlert>

        <Card
          variant="outlined"
          sx={{
            bgcolor: "rgba(255,253,248,0.94)",
            boxShadow: "0 12px 28px rgba(60, 57, 17, 0.06)",
          }}
        >
          <CardContent
            sx={{
              p: { xs: 2, sm: 2.5 },
              "&:last-child": { pb: { xs: 2, sm: 2.5 } },
            }}
          >
            <Box component="form" onSubmit={handlePair}>
              {isScannerSupported ? (
                <Box sx={{ mb: 2 }}>
                  {!isCameraRunning ? (
                    <Button
                      type="button"
                      variant="outlined"
                      fullWidth
                      onClick={startCamera}
                      startIcon={<CameraAlt />}
                    >
                      Scan device
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outlined"
                      color="secondary"
                      fullWidth
                      onClick={stopCamera}
                      startIcon={<CameraAlt />}
                    >
                      Stop scanning
                    </Button>
                  )}
                  <Box
                    sx={{
                      mt: 1,
                      borderRadius: 2,
                      overflow: "hidden",
                      border: "1.5px solid",
                      borderColor: "divider",
                      bgcolor: "#262411",
                      display: isCameraRunning ? "block" : "none",
                    }}
                  >
                    <Box
                      id={SCANNER_REGION_ID}
                      sx={{ width: "100%", maxHeight: 280 }}
                    />
                  </Box>
                </Box>
              ) : (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Camera scanning is unavailable. Enter the device code instead.
                </Alert>
              )}

              <AutoDismissAlert
                open={Boolean(scanInfo)}
                severity="success"
                sx={{ mb: 2 }}
                onCloseAlert={() => setScanInfo("")}
              >
                {scanInfo}
              </AutoDismissAlert>

              <TextField
                fullWidth
                label="Device code"
                value={controllerCode}
                onChange={(e) => setControllerCode(e.target.value)}
                placeholder="eg: CTRL-8F2A19"
                disabled={loading}
                required
              />
              <Button
                type="submit"
                variant="contained"
                color="secondary"
                fullWidth
                sx={{ mt: 2 }}
                disabled={loading}
              >
                {loading ? "Connecting…" : "Connect device"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </PageShell>
    </Container>
  );
};

export default PairController;
