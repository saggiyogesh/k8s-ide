import { useEffect } from "react";
import type { K8sApiClient } from "@k8s-ide/api-client";
import {
  useContexts,
  useOpenSession,
  useSessionStore,
} from "@k8s-ide/store";
import { Badge, Button, Select, Spinner } from "@k8s-ide/ui";

interface TopBarProps {
  client: K8sApiClient;
}

export function TopBar({ client }: TopBarProps) {
  const {
    currentContext,
    setContexts,
    setCurrentContext,
    setNamespaces,
    setSelectedNamespace,
    selectedNamespace,
    namespaces,
  } = useSessionStore();

  const { data: contexts, isLoading } = useContexts(client);
  const openSession = useOpenSession(client);

  useEffect(() => {
    if (contexts) setContexts(contexts);
  }, [contexts, setContexts]);

  useEffect(() => {
    if (!currentContext && contexts?.length) {
      const current = contexts.find((c) => c.current) ?? contexts[0];
      setCurrentContext(current.name);
      openSession.mutate(current.name, {
        onSuccess: (info) => {
          setNamespaces(info.namespaces);
          setSelectedNamespace(info.namespaces[0]);
        },
      });
    }
  }, [contexts, currentContext, openSession, setCurrentContext, setNamespaces, setSelectedNamespace]);

  const handleContextChange = (name: string) => {
    setCurrentContext(name);
    openSession.mutate(name, {
      onSuccess: (info) => {
        setNamespaces(info.namespaces);
        setSelectedNamespace(info.namespaces[0]);
      },
    });
  };

  return (
    <header className="flex h-12 items-center gap-3 border-b border-white/10 px-4">
      <div className="text-sm font-bold tracking-tight">K8s IDE</div>
      <Badge>alpha</Badge>
      <div className="flex-1" />
      {isLoading ? (
        <Spinner />
      ) : (
        <Select
          value={currentContext ?? ""}
          onChange={(e) => handleContextChange(e.target.value)}
          className="min-w-40"
        >
          {(contexts ?? []).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      <Select
        value={selectedNamespace ?? ""}
        onChange={(e) => setSelectedNamespace(e.target.value || undefined)}
        className="min-w-36"
      >
        <option value="">All namespaces</option>
        {namespaces.map((ns) => (
          <option key={ns} value={ns}>
            {ns}
          </option>
        ))}
      </Select>
      <Button variant="ghost" size="sm" onClick={() => openSession.mutate(currentContext!)}>
        Refresh
      </Button>
    </header>
  );
}
