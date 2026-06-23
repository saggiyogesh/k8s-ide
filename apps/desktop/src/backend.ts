/**
 * Desktop backend lifecycle management.
 * Manages the local Go sidecar process via Tauri's shell plugin.
 */
import { Command } from "@tauri-apps/plugin-shell";

let backendChild: Awaited<ReturnType<typeof Command.prototype.spawn>> | null = null;

export async function startBackend(port = 8080): Promise<void> {
  if (backendChild) return;

  const cmd = Command.sidecar("binaries/k8s-ide-backend", [`-addr`, `:${port}`]);

  cmd.stdout.addListener("data", (line: string) => {
    console.log("[backend]", line);
  });
  cmd.stderr.addListener("data", (line: string) => {
    console.error("[backend:err]", line);
  });

  backendChild = await cmd.spawn();
}

export async function stopBackend(): Promise<void> {
  if (backendChild) {
    await backendChild.kill();
    backendChild = null;
  }
}

export function getBackendUrl(port = 8080): string {
  return `http://127.0.0.1:${port}`;
}
