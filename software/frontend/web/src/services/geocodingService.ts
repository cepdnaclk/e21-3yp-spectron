import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface LocationResult {
  label: string;
  subtitle?: string | null;
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
}

export const searchPlaces = async (query: string): Promise<LocationResult[]> => {
  const response = await api.get<{ results?: LocationResult[] }>(API_ENDPOINTS.GEOCODING.SEARCH, {
    params: { q: query, limit: 5 },
  });
  return response.data.results || [];
};

export const reverseGeocode = async (latitude: number, longitude: number): Promise<LocationResult> => {
  const response = await api.get<{ location?: LocationResult }>(API_ENDPOINTS.GEOCODING.REVERSE, {
    params: { lat: latitude, lon: longitude },
  });
  if (!response.data.location) {
    throw new Error('Location name was not found.');
  }
  return response.data.location;
};
