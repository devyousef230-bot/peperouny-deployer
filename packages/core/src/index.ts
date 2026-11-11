export type ProjectId = "zeus" | "nexus" | "nova";
export type DeploymentTarget = "workers" | "pages";

export interface ResourceRequirement {
  kind: "d1" | "kv" | "r2";
  logicalName: string;
  required: boolean;
}

export interface ProjectDefinition {
  id: ProjectId;
  name: string;
  description: string;
  supportedTargets: DeploymentTarget[];
  resources: ResourceRequirement[];
}

export interface DeploymentContext {
  accountId: string;
  project: ProjectDefinition;
  target: DeploymentTarget;
}

export interface DeploymentAdapter {
  definition: ProjectDefinition;
  validate(context: DeploymentContext): Promise<string[]>;
  deploy(context: DeploymentContext): Promise<void>;
}
