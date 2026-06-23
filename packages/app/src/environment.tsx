import { createContext, useContext } from 'react';
import type { K8sApiClient } from '@k8s-ide/api-client';

export type PlatformTarget = 'web' | 'desktop' | 'mobile';

export type AppEnvironment = {
  apiClient: K8sApiClient;
  platform: PlatformTarget;
};

export const AppEnvironmentContext = createContext<AppEnvironment | null>(null);

export function useAppEnvironment(): AppEnvironment {
  const value = useContext(AppEnvironmentContext);
  if (!value) {
    throw new Error('AppEnvironmentContext is missing');
  }
  return value;
}
