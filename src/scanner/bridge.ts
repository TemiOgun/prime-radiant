import { invoke } from "@tauri-apps/api/core";
import type { ProjectGraph } from "../types/graph";

export async function scanProject(path: string): Promise<ProjectGraph> {
  return invoke<ProjectGraph>("scan_project", { path });
}

export async function loadIntegrationOverrides(
  path: string
): Promise<Record<string, { type: string; label: string }>> {
  return invoke<Record<string, { type: string; label: string }>>(
    "load_integration_overrides",
    { path }
  );
}

export async function saveIntegrationOverrides(
  path: string,
  overrides: Record<string, { type: string; label: string }>
): Promise<void> {
  return invoke("save_integration_overrides", { path, overrides });
}
