import { CapacitorHttp } from '@capacitor/core';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { capacitorHttpAdapter } from '../capacitorHttpAdapter';

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: vi.fn(),
  },
}));

const requestMock = vi.mocked(CapacitorHttp.request);

const createConfig = (): InternalAxiosRequestConfig => ({
  baseURL: 'https://spectroniot.xyz',
  url: '/auth/login',
  method: 'post',
  data: JSON.stringify({
    email: 'owner@spectron.test',
    password: 'secret123',
  }),
  headers: new AxiosHeaders({
    'Content-Type': 'application/json',
  }),
  timeout: 60000,
});

describe('capacitorHttpAdapter', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('sends parsed JSON through CapacitorHttp and returns successful responses', async () => {
    requestMock.mockResolvedValue({
      data: { token: 'token-123' },
      status: 200,
      headers: { 'content-type': 'application/json' },
      url: 'https://spectroniot.xyz/auth/login',
    });

    const response = await capacitorHttpAdapter(createConfig());

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://spectroniot.xyz/auth/login',
        method: 'POST',
        data: {
          email: 'owner@spectron.test',
          password: 'secret123',
        },
        connectTimeout: 60000,
        readTimeout: 60000,
      })
    );
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ token: 'token-123' });
  });

  it('preserves HTTP error responses instead of reporting a network error', async () => {
    requestMock.mockResolvedValue({
      data: { message: 'Invalid email or password' },
      status: 401,
      headers: { 'content-type': 'application/json' },
      url: 'https://spectroniot.xyz/auth/login',
    });

    await expect(capacitorHttpAdapter(createConfig())).rejects.toMatchObject({
      code: AxiosError.ERR_BAD_REQUEST,
      response: {
        status: 401,
        data: { message: 'Invalid email or password' },
      },
    });
  });
});
