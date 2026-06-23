import { Command } from "@tauri-apps/plugin-shell";
import { usePreferencesStore } from "@k8s-ide/store";

/**
 * Manages the lifecycle of the bundled Go backend sidecar process.
 * This is the only place in the desktop app where Tauri-specific code lives.
 */
export class BackendManager {
  private _process: Awaited<ReturnType<typeof Command.prototype.spawn>> | null = null;
  private _port = 7777;

  get port() {
    return this._port;
  }

  async start(): Promise<void> {
    const prefs = usePreferencesStore.getState();
    const backendUrl = prefs.backendUrl;
    const portMatch = backendUrl.match(/:(\d+)$/);
    if (portMatch) {
      this._port = parseInt(portMatch[1]!, 10);
    }

    const command = Command.sidecar("binaries/k8s-ide-server", [
      `--addr=127.0.0.1:${this._port}`,
    ]);

    command.stdout.on("data", (line: string) => {
      console.log("[backend]", line);
    });
    command.stderr.on("data", (line: string) => {
      console.error("[backend]", line);
    });
    command.on("close", (data: { code: number | null }) => {
      console.log("[backend] exited with code", data.code);
    });

    this._process = await command.spawn();

    // Give the server a moment to initialize.
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (this._process) {
      await this._process.kill();
      this._process = null;
    }
  }

  private async waitForReady(attempts = 20, delayMs = 250): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this._port}/api/contexts`);
        if (res.ok) return;
      } catch {
        // not ready yet
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error("Backend failed to start after multiple attempts");
  }
}
