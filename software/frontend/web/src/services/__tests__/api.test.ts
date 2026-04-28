describe('api helper', () => {
  const importApiWithAxiosMock = async () => {
    vi.resetModules();

    const handlers: {
      request?: (config: any) => any;
      responseRejected?: (error: any) => Promise<never>;
    } = {};

    const instance = {
      interceptors: {
        request: {
          use: vi.fn((fulfilled) => {
            handlers.request = fulfilled;
          }),
        },
        response: {
          use: vi.fn((_fulfilled, rejected) => {
            handlers.responseRejected = rejected;
          }),
        },
      },
    };

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn(() => instance),
      },
    }));

    const apiModule = await import('../api');

    return { apiModule, handlers };
  };

  it('attaches an Authorization Bearer token when a token exists', async () => {
    const { apiModule, handlers } = await importApiWithAxiosMock();
    apiModule.setToken('user-token-123', 'user');

    const config = handlers.request?.({ url: '/controllers', headers: {} });

    expect(config?.headers.Authorization).toBe('Bearer user-token-123');
  });

  it('removes a token and redirects to sign-in after a 401 response', async () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = {
      pathname: '/controllers',
      href: 'http://localhost/controllers',
    };

    const { apiModule, handlers } = await importApiWithAxiosMock();
    apiModule.setToken('expired-token', 'user');

    const error = {
      response: { status: 401 },
      config: { url: '/controllers' },
    };

    await expect(handlers.responseRejected?.(error)).rejects.toBe(error);

    expect(apiModule.getToken('user')).toBeNull();
    expect(window.location.href).toBe('/signin');

    window.location = originalLocation;
  });
});
