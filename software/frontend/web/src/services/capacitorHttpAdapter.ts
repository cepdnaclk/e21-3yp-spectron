import { CapacitorHttp } from '@capacitor/core';
import axios, {
  AxiosAdapter,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const parseRequestData = (config: InternalAxiosRequestConfig) => {
  const contentType = String(config.headers.get('Content-Type') || '');

  if (contentType.includes('application/json') && typeof config.data === 'string') {
    try {
      return JSON.parse(config.data);
    } catch {
      return config.data;
    }
  }

  return config.data;
};

const rejectForStatus = (
  config: InternalAxiosRequestConfig,
  response: AxiosResponse
) => {
  const code =
    response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;

  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    code,
    config,
    undefined,
    response
  );
};

export const capacitorHttpAdapter: AxiosAdapter = async (config) => {
  const url = axios.getUri(config);
  const timeout = config.timeout || 60000;

  try {
    const nativeResponse = await CapacitorHttp.request({
      url,
      method: config.method?.toUpperCase() || 'GET',
      headers: config.headers.toJSON() as Record<string, string>,
      data: parseRequestData(config),
      connectTimeout: timeout,
      readTimeout: timeout,
      responseType: 'json',
    });

    const response: AxiosResponse = {
      data: nativeResponse.data,
      status: nativeResponse.status,
      statusText: String(nativeResponse.status),
      headers: nativeResponse.headers,
      config,
    };

    if (nativeResponse.status < 200 || nativeResponse.status >= 300) {
      rejectForStatus(config, response);
    }

    return response;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw error;
    }

    throw AxiosError.from(
      error,
      AxiosError.ERR_NETWORK,
      config,
      undefined,
      undefined,
      {
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Native HTTP request failed',
      }
    );
  }
};
