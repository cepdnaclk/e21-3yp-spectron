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

const tileURL = (z: number, x: number, y: number) =>
  MAP_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

const MiniMap: React.FC<{
  location: FarmLocationSelection | null;
  onPick: (latitude: number, longitude: number) => void;
}> = ({ location, onPick }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const center = location || sriLankaCenter;
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
            left: '50%',
            top: '50%',
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
        console.error(err);
        setError('Place search is not available right now.');
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [mode, searchText]);

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
      label: fallbackLabel || null,
      source,
    };
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
      console.error(err);
      setStatus('');
      setError('Location selected, but the place name could not be detected.');
    }
  };

  const useCurrentLocation = () => {
    setMode('device');
    setError('');
    setStatus('');
    if (!navigator.geolocation) {
      setError('This browser does not support current location. Use search or the map.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void pickLocation(
          position.coords.latitude,
          position.coords.longitude,
          'device_geolocation',
          position.coords.accuracy,
        );
      },
      (geoError) => {
        setLocating(false);
        setError(userLocationMessage(geoError.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
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
            InputProps={{
              endAdornment: searching ? <CircularProgress size={18} /> : undefined,
            }}
          />
          {searchResults.map((result) => (
            <Button
              key={`${result.latitude}-${result.longitude}-${result.label}`}
              variant="outlined"
              onClick={() => void pickLocation(result.latitude, result.longitude, 'place_search', result.accuracy_m, result.label)}
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
        <MiniMap location={value} onPick={(latitude, longitude) => void pickLocation(latitude, longitude, 'map_pin')} />
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
