import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { HttpK8sApiClient } from '@k8s-ide/api-client';
import { createQueryCache } from '@k8s-ide/store';
import { AppEnvironmentContext, type PlatformTarget } from './environment';
import { router } from './router';

export type K8sIdeAppProps = {
  apiBaseUrl: string;
  platform?: PlatformTarget;
};

export function K8sIdeApp({
  apiBaseUrl,
  platform = 'web',
}: K8sIdeAppProps) {
  const apiClient = useMemo(() => new HttpK8sApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const queryClient = useMemo(() => createQueryCache(), []);

  return (
    <AppEnvironmentContext.Provider value={{ apiClient, platform }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppEnvironmentContext.Provider>
  );
}

export type { PlatformTarget } from './environment';
