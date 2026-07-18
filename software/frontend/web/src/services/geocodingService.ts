import axios from 'axios';
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
  try {
    const response = await api.get<{ results?: LocationResult[] }>(API_ENDPOINTS.GEOCODING.SEARCH, {
      params: { q: query, limit: 5 },
    });
    return response.data.results || [];
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error('Location search is not available until the backend is restarted.');
    }
    throw error;
  }
};

export const reverseGeocode = async (latitude: number, longitude: number): Promise<LocationResult> => {
  try {
    const response = await api.get<{ location?: LocationResult }>(API_ENDPOINTS.GEOCODING.REVERSE, {
      params: { lat: latitude, lon: longitude },
    });
    if (!response.data.location) {
      throw new Error('Location name was not found.');
    }
    return response.data.location;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error('Location lookup is not available until the backend is restarted.');
    }
    throw error;
  }
};
