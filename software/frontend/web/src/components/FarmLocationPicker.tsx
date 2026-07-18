import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { GpsFixed, Info, Map, MyLocation, Place, Search } from '@mui/icons-material';
import { MAP_TILE_URL } from '../config/api';
import { FarmLocationSource } from '../services/farmService';
import { LocationResult, reverseGeocode, searchPlaces } from '../services/geocodingService';

export type FarmLocationSelection = {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  label?: string | null;
  source: FarmLocationSource;
};

type Props = {
  value: FarmLocationSelection | null;
  confirmed: boolean;
  disabled?: boolean;
  onChange: (location: FarmLocationSelection | null) => void;
  onConfirm: () => void;
};

type LocationMode = 'device' | 'map' | 'search';

const sriLankaCenter = { latitude: 7.8731, longitude: 80.7718 };

const tileSize = 256;
const currentLocationScanMs = 9000;
const goodAccuracyM = 75;
const approximateAccuracyM = 1000;

const lonToPixelX = (lon: number, zoom: number) => ((lon + 180) / 360) * tileSize * 2 ** zoom;

const latToPixelY = (lat: number, zoom: number) => {
  const rad = (lat * Math.PI) / 180;
  const scale = tileSize * 2 ** zoom;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
};

const pixelXToLon = (x: number, zoom: number) => (x / (tileSize * 2 ** zoom)) * 360 - 180;

const pixelYToLat = (y: number, zoom: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (tileSize * 2 ** zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const formatCoord = (value: number) => value.toFixed(6);
const coordinateLabel = (latitude: number, longitude: number) => `${formatCoord(latitude)}, ${formatCoord(longitude)}`;

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

const userLocationMessage = (code: number) => {
  switch (code) {
    case 1:
      return 'Location permission was denied. You can search a place or choose on the map.';
    case 2:
      return 'Your device location is unavailable right now.';
    case 3:
      return 'Location request timed out. Try again or search a place.';
    default:
      return 'Could not detect your current location.';
  }
};

const currentLocationHint = (accuracyM?: number | null) => {
  if (accuracyM === undefined || accuracyM === null) {
    return 'Pin placed from your device. Please check it on the map.';
  }
  if (accuracyM > approximateAccuracyM) {
    return 'This location looks approximate. Please adjust the pin on the map.';
  }
  return 'Pin placed from your device. You can adjust it on the map.';
};

const tileURL = (z: number, x: number, y: number) =>
  MAP_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

const MiniMap: React.FC<{
  center: { latitude: number; longitude: number };
  location: FarmLocationSelection | null;
  onPick: (latitude: number, longitude: number) => void;
}> = ({ center, location, onPick }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const zoom = location ? 13 : 8;
  const centerX = lonToPixelX(center.longitude, zoom);
  const centerY = latToPixelY(center.latitude, zoom);
  const centerTileX = Math.floor(centerX / tileSize);
  const centerTileY = Math.floor(centerY / tileSize);

  const tiles = useMemo(() => {
    const items: Array<{ x: number; y: number; z: number; left: number; top: number }> = [];
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const x = centerTileX + dx;
        const y = centerTileY + dy;
        if (x >= 0 && y >= 0) {
          items.push({
            x,
            y,
            z: zoom,
            left: x * tileSize - centerX,
            top: y * tileSize - centerY,
          });
        }
      }
    }
    return items;
  }, [centerTileX, centerTileY, centerX, centerY, zoom]);

  const handlePick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const pickedX = centerX + (event.clientX - rect.left - rect.width / 2);
    const pickedY = centerY + (event.clientY - rect.top - rect.height / 2);
    const latitude = pixelYToLat(pickedY, zoom);
    const longitude = pixelXToLon(pickedX, zoom);
    if (isValidLatitude(latitude) && isValidLongitude(longitude)) {
      onPick(latitude, longitude);
    }
  };

  return (
    <Box
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label="Choose farm location on map"
      onPointerUp={handlePick}
      sx={{
        height: { xs: 220, sm: 280 },
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid rgba(60, 57, 17, 0.16)',
        bgcolor: '#e6eadc',
        cursor: 'crosshair',
      }}
    >
      {tiles.map((tile) => (
        <Box
          component="img"
          key={`${tile.z}-${tile.x}-${tile.y}`}
          src={tileURL(tile.z, tile.x, tile.y)}
          alt=""
          draggable={false}
          sx={{
            position: 'absolute',
            width: tileSize,
            height: tileSize,
            left: `calc(50% + ${tile.left}px)`,
            top: `calc(50% + ${tile.top}px)`,
            userSelect: 'none',
          }}
        />
      ))}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,253,248,0.02), rgba(38,36,17,0.08))',
          pointerEvents: 'none',
        }}
      />
      {location && (
        <Place
          color="secondary"
          sx={{
            position: 'absolute',
            left: `calc(50% + ${lonToPixelX(location.longitude, zoom) - centerX}px)`,
            top: `calc(50% + ${latToPixelY(location.latitude, zoom) - centerY}px)`,
            transform: 'translate(-50%, -95%)',
            fontSize: 46,
            filter: 'drop-shadow(0 6px 10px rgba(38,36,17,0.35))',
            pointerEvents: 'none',
          }}
        />
      )}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          left: 12,
          bottom: 10,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: 'rgba(255,253,248,0.88)',
          color: 'text.secondary',
        }}
      >
        Tap the farm location
      </Typography>
    </Box>
  );
};

const FarmLocationPicker: React.FC<Props> = ({ value, confirmed, disabled, onChange, onConfirm }) => {
  const [mode, setMode] = useState<LocationMode>('device');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [mapCenter, setMapCenter] = useState(sriLankaCenter);
  const [locationHint, setLocationHint] = useState('');
  const watchIdRef = useRef<number | null>(null);
  const locationTimerRef = useRef<number | null>(null);
  const bestPositionRef = useRef<GeolocationPosition | null>(null);

  useEffect(() => {
    setManualLat(value ? formatCoord(value.latitude) : '');
    setManualLon(value ? formatCoord(value.longitude) : '');
  }, [value]);

  useEffect(() => {
    if (mode !== 'search') {
      return undefined;
    }
    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        setError('');
        setSearchResults(await searchPlaces(trimmed));
      } catch (err) {
        if (!(err instanceof Error && /backend is restarted/i.test(err.message))) {
          console.error(err);
        }
        setError(err instanceof Error ? err.message : 'Place search is not available right now.');
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [mode, searchText]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (locationTimerRef.current !== null) {
        window.clearTimeout(locationTimerRef.current);
      }
    };
  }, []);

  const pickLocation = async (
    latitude: number,
    longitude: number,
    source: FarmLocationSource,
    accuracyM?: number | null,
    fallbackLabel?: string,
  ) => {
    const baseLocation: FarmLocationSelection = {
      latitude,
      longitude,
      accuracyM,
      label: fallbackLabel || `Selected location (${coordinateLabel(latitude, longitude)})`,
      source,
    };
    if (source !== 'map_pin') {
      setMapCenter({ latitude, longitude });
    }
    if (source !== 'device_geolocation') {
      setLocationHint('');
    }
    onChange(baseLocation);
    setStatus('Detecting location name...');
    setError('');
    try {
      const detected = await reverseGeocode(latitude, longitude);
      onChange({
        ...baseLocation,
        label: detected.label,
      });
      setStatus('');
    } catch (err) {
      if (!(err instanceof Error && /backend is restarted/i.test(err.message))) {
        console.error(err);
      }
      setStatus('');
      setError(err instanceof Error ? err.message : 'Place name is unavailable right now. You can still confirm this location.');
    }
  };

  const stopCurrentLocationScan = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (locationTimerRef.current !== null) {
      window.clearTimeout(locationTimerRef.current);
      locationTimerRef.current = null;
    }
  };

  const applyDevicePosition = (position: GeolocationPosition) => {
    stopCurrentLocationScan();
    setLocating(false);
    setMode('map');
    setStatus('');
    setLocationHint(currentLocationHint(position.coords.accuracy));
    setMapCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    void pickLocation(
      position.coords.latitude,
      position.coords.longitude,
      'device_geolocation',
      position.coords.accuracy,
    );
  };

  const useCurrentLocation = () => {
    setMode('device');
    setError('');
    setLocationHint('');
    if (!navigator.geolocation) {
      setError('This browser does not support current location. Use search or the map.');
      return;
    }
    stopCurrentLocationScan();
    bestPositionRef.current = null;
    setLocating(true);
    setStatus('Finding your current location...');

    const handlePosition = (position: GeolocationPosition) => {
      const currentBest = bestPositionRef.current;
      if (!currentBest || position.coords.accuracy < currentBest.coords.accuracy) {
        bestPositionRef.current = position;
        setStatus(`Finding best location... Accuracy about ${Math.round(position.coords.accuracy)} m`);
      }
      if (position.coords.accuracy <= goodAccuracyM) {
        applyDevicePosition(position);
      }
    };

    const handleError = (geoError: GeolocationPositionError) => {
      if (bestPositionRef.current) {
        applyDevicePosition(bestPositionRef.current);
        return;
      }
      stopCurrentLocationScan();
      setLocating(false);
      setStatus('');
      setError(userLocationMessage(geoError.code));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: currentLocationScanMs, maximumAge: 0 },
    );

    locationTimerRef.current = window.setTimeout(() => {
      if (bestPositionRef.current) {
        applyDevicePosition(bestPositionRef.current);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyDevicePosition(position);
        },
        (geoError) => {
          stopCurrentLocationScan();
          setLocating(false);
          setStatus('');
          setError(userLocationMessage(geoError.code));
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 },
      );
    }, currentLocationScanMs);
  };

  const applyManualCoordinates = () => {
    const latitude = Number(manualLat);
    const longitude = Number(manualLon);
    if (!isValidLatitude(latitude)) {
      setError('Latitude must be between -90 and 90.');
      return;
    }
    if (!isValidLongitude(longitude)) {
      setError('Longitude must be between -180 and 180.');
      return;
    }
    setLocationHint('');
    setMapCenter({ latitude, longitude });
    void pickLocation(latitude, longitude, 'manual_coordinates');
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1" fontWeight={800}>
          Farm location
        </Typography>
        <Tooltip title="Pick a location without typing coordinates. Coordinates are in Advanced.">
          <IconButton size="small" aria-label="Farm location help">
            <Info fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          variant={mode === 'device' ? 'contained' : 'outlined'}
          startIcon={locating ? <CircularProgress size={16} color="inherit" /> : <MyLocation />}
          onClick={useCurrentLocation}
          disabled={disabled || locating}
        >
          Use My Current Location
        </Button>
        <Button
          variant={mode === 'map' ? 'contained' : 'outlined'}
          startIcon={<Map />}
          onClick={() => setMode('map')}
          disabled={disabled}
        >
          Choose on Map
        </Button>
        <Button
          variant={mode === 'search' ? 'contained' : 'outlined'}
          startIcon={<Search />}
          onClick={() => setMode('search')}
          disabled={disabled}
        >
          Search a Place
        </Button>
      </Stack>

      <Collapse in={mode === 'search'} timeout={200} unmountOnExit>
        <Stack spacing={1}>
          <TextField
            label="Search place"
            placeholder="eg: Galgamuwa"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            disabled={disabled}
            helperText={searching ? 'Searching...' : ' '}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: searching ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} aria-label="Searching places" />
                </InputAdornment>
              ) : undefined,
            }}
          />
          {searchResults.map((result) => (
            <Button
              key={`${result.latitude}-${result.longitude}-${result.label}`}
              variant="outlined"
              onClick={() => {
                setMode('map');
                setMapCenter({ latitude: result.latitude, longitude: result.longitude });
                void pickLocation(result.latitude, result.longitude, 'place_search', result.accuracy_m, result.label);
              }}
              sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <Box>
                <Typography fontWeight={800}>{result.label}</Typography>
                {result.subtitle && (
                  <Typography variant="caption" color="text.secondary">
                    {result.subtitle}
                  </Typography>
                )}
              </Box>
            </Button>
          ))}
        </Stack>
      </Collapse>

      <Collapse in={mode === 'map' || mode === 'search'} timeout={200}>
        <MiniMap
          center={mapCenter}
          location={value}
          onPick={(latitude, longitude) => void pickLocation(latitude, longitude, 'map_pin')}
        />
      </Collapse>

      <Button
        variant="text"
        startIcon={<GpsFixed />}
        onClick={() => setAdvancedOpen((current) => !current)}
        sx={{ alignSelf: 'flex-start' }}
      >
        Advanced
      </Button>
      <Collapse in={advancedOpen} timeout={200} unmountOnExit>
        <Card variant="outlined" sx={{ bgcolor: 'rgba(255,253,248,0.72)' }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Latitude"
                  placeholder="eg: 7.995600"
                  value={manualLat}
                  onChange={(event) => setManualLat(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Longitude"
                  placeholder="eg: 80.267400"
                  value={manualLon}
                  onChange={(event) => setManualLon(event.target.value)}
                  fullWidth
                />
              </Stack>
              <Button variant="outlined" onClick={applyManualCoordinates} sx={{ alignSelf: 'flex-start' }}>
                Apply coordinates
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      {status && <Alert severity="info">{status}</Alert>}
      {locationHint && <Alert severity={value?.accuracyM && value.accuracyM > approximateAccuracyM ? 'warning' : 'info'}>{locationHint}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      {value && (
        <Card variant="outlined" sx={{ bgcolor: 'rgba(108,137,48,0.08)' }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={800}>
                  Detected location: {value.label || 'Selected location'}
                </Typography>
                {value.accuracyM !== undefined && value.accuracyM !== null && (
                  <Typography variant="caption" color="text.secondary">
                    Accuracy about {Math.round(value.accuracyM)} m
                  </Typography>
                )}
              </Box>
              <Button variant={confirmed ? 'outlined' : 'contained'} onClick={onConfirm} disabled={disabled}>
                {confirmed ? 'Location Confirmed' : 'Confirm Location'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
};

export default FarmLocationPicker;
