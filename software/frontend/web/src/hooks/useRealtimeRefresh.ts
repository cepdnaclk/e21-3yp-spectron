import { useEffect, useRef } from 'react';
import { openRealtimeUpdates, RealtimeScope } from '../services/realtimeService';

export const useRealtimeRefresh = (scope: RealtimeScope, refresh: () => void | Promise<void>) => {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let refreshTimer: number | undefined;

    const close = openRealtimeUpdates(scope, () => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void refreshRef.current();
      }, 250);
    });

    return () => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
      close();
    };
  }, [scope]);
};
