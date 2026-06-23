import { createK8sApiClient } from "@k8s-ide/api-client";
import { StoreProvider, useSessionStore } from "@k8s-ide/store";
import "@k8s-ide/ui/styles.css";
import { useMemo } from "react";
import { AppRouterProvider } from "./router.js";

export type K8sIdeAppProps = {
  backendUrl?: string;
};

export function K8sIdeApp({ backendUrl }: K8sIdeAppProps) {
  const storedUrl = useSessionStore((s) => s.backendUrl);
  const resolvedUrl = backendUrl ?? storedUrl;

  const client = useMemo(
    () => createK8sApiClient({ baseUrl: resolvedUrl }),
    [resolvedUrl],
  );

  return (
    <StoreProvider client={client}>
      <AppRouterProvider />
    </StoreProvider>
  );
}

export { ExplorerPage } from "./pages/ExplorerPage.js";
export { AppRouterProvider } from "./router.js";
