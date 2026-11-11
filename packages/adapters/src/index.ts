import type { DeploymentAdapter, ProjectId } from "@peperouny/core";

export const adapters: DeploymentAdapter[] = [];

export function getAdapter(projectId: ProjectId) {
  return adapters.find((adapter) => adapter.definition.id === projectId);
}
