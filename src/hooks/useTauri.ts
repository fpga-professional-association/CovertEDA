/**
 * Tauri IPC hooks for communicating with the Rust backend.
 * Falls back gracefully when running in browser (dev without Tauri).
 */

// Check if we're running inside Tauri
const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

/**
 * Invoke a Tauri command. Returns mock data when running outside Tauri.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`[Tauri IPC] Not in Tauri environment, command '${cmd}' skipped`, args);
    throw new Error("Not running in Tauri");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/**
 * Listen to a Tauri event.
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri) {
    console.warn(`[Tauri IPC] Not in Tauri environment, event '${event}' not bound`);
    return () => {};
  }
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

// ── Typed command wrappers ──

export async function getFileTree(projectDir: string) {
  return invoke<unknown[]>("get_file_tree", { projectDir });
}

export async function getGitStatus(projectDir: string) {
  return invoke<unknown>("get_git_status", { projectDir });
}

export async function startBuild(backendId: string, projectDir: string) {
  return invoke<string>("start_build", { backendId, projectDir });
}

export async function cancelBuild(buildId: string) {
  return invoke<void>("cancel_build", { buildId });
}

export async function switchBackend(backendId: string) {
  return invoke<void>("switch_backend", { backendId });
}

export async function getAvailableBackends() {
  return invoke<unknown[]>("get_available_backends", {});
}

export async function getTimingReport(backendId: string, implDir: string) {
  return invoke<unknown>("get_timing_report", { backendId, implDir });
}

export async function getUtilizationReport(backendId: string, implDir: string) {
  return invoke<unknown>("get_utilization_report", { backendId, implDir });
}
