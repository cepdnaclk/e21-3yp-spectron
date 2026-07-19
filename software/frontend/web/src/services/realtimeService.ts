import { API_BASE_URL } from '../config/api';
import { getToken } from './api';

export type RealtimeScope = 'customer' | 'admin';

export interface RealtimeEvent {
  scope: RealtimeScope;
  kind: string;
  resource?: string;
  accountId?: string;
  farmId?: string;
  occurredAt: string;
}

export const buildRealtimeUrl = (scope: RealtimeScope): string | null => {
  const token = getToken(scope === 'admin' ? 'admin' : 'user');
  if (!token) {
    return null;
  }

  const url = new URL('/ws/updates', API_BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
};

export const openRealtimeUpdates = (
  scope: RealtimeScope,
  onEvent: (event: RealtimeEvent) => void,
): (() => void) => {
  if (process.env.NODE_ENV === 'test') {
    return () => undefined;
  }

  const url = buildRealtimeUrl(scope);
  if (!url || typeof WebSocket === 'undefined') {
    return () => undefined;
  }

  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;

  const connect = () => {
    socket = new WebSocket(url);

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        if (event.scope === scope) {
          onEvent(event);
        }
      } catch {
        // Ignore malformed realtime payloads; the next valid event will refresh the page.
      }
    };

    socket.onclose = () => {
      socket = null;
      if (!closedByCaller) {
        reconnectTimer = window.setTimeout(connect, 4000);
      }
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
};
