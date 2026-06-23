/**
 * Desktop sidecar lifecycle management.
 * Starts and monitors the embedded Go backend process via Tauri's sidecar API.
 */
import { Command } from "@tauri-apps/plugin-shell";

let sidecarProcess: Awaited<ReturnType<typeof Command.prototype.spawn>> | null = null;

export async function startBackend(onReady: () => void, onError: (err: string) => void) {
  const cmd = Command.sidecar("binaries/k8s-ide-server");

  cmd.stdout.on("data", (line: string) => {
    if (line.includes("listening on")) {
      onReady();
    }
  });

  cmd.stderr.on("data", (line: string) => {
    console.error("[backend]", line);
  });

  cmd.on("close", ({ code }) => {
    if (code !== 0) {
      onError(`Backend exited with code ${code ?? "unknown"}`);
    }
  });

  cmd.on("error", (err) => {
    onError(String(err));
  });

  try {
    sidecarProcess = await cmd.spawn();
  } catch (e) {
    onError(String(e));
  }
}

export async function stopBackend() {
  if (sidecarProcess) {
    await sidecarProcess.kill();
    sidecarProcess = null;
  }
}
