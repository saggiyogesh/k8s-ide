import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WatchEvent, KubeResource } from "@k8s-ide/core";
import type { WatchOpts } from "@k8s-ide/api-client";
import { useK8sClient } from "./client-context.js";
import { queryKeys } from "./query-keys.js";
import { useSessionStore } from "./session-store.js";

/**
 * Subscribes to a watch stream and patches the list query cache on every event.
 * Re-connects automatically when the component is mounted.
 */
export function useWatchResources(opts: WatchOpts, enabled = true) {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  const { activeContext } = useSessionStore();
  const abortRef = useRef<AbortController | null>(null);
  const listKey = queryKeys.resourceList(activeContext ?? "", opts);

  useEffect(() => {
    if (!enabled || !activeContext) return;

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      let retryDelay = 1_000;
      while (!controller.signal.aborted) {
        try {
          for await (const event of client.watchResources(opts, controller.signal)) {
            applyWatchEvent(queryClient, listKey, event);
            retryDelay = 1_000;
          }
        } catch (err) {
          if (controller.signal.aborted) break;
          await sleep(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }
    })();

    return () => controller.abort();
  }, [enabled, activeContext, opts.group, opts.version, opts.resource, opts.namespace, opts.labelSelector]);
}

function applyWatchEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: readonly unknown[],
  event: WatchEvent,
) {
  queryClient.setQueryData<{ items: KubeResource[]; total: number; resourceVersion: string; continueToken?: string }>(
    listKey,
    (old) => {
      if (!old) return old;
      const obj = event.object;
      const uid = obj.metadata.uid;
      switch (event.type) {
        case "ADDED": {
          const exists = old.items.some((r) => r.metadata.uid === uid);
          return exists ? old : { ...old, items: [...old.items, obj], total: old.total + 1 };
        }
        case "MODIFIED":
          return { ...old, items: old.items.map((r) => (r.metadata.uid === uid ? obj : r)) };
        case "DELETED":
          return { ...old, items: old.items.filter((r) => r.metadata.uid !== uid), total: Math.max(0, old.total - 1) };
        default:
          return old;
      }
    },
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
