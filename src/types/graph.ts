export type ServiceCategory =
  | "database"
  | "cache"
  | "auth"
  | "payments"
  | "storage"
  | "email"
  | "monitoring"
  | "queue"
  | "external_api"
  | "internal_service"
  | "config";

export interface ModuleNode {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  x: number;
  y: number;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  moduleId: string;
  fileType: "component" | "route" | "util" | "hook" | "model" | "config" | "other";
  x: number;
  y: number;
}

export interface ServiceNode {
  id: string;
  name: string;
  label: string;
  category: ServiceCategory;
  envVars: string[];
  x: number;
  y: number;
}

export interface ModuleEdge {
  source: string;
  target: string;
  weight: number;
}

export interface FileEdge {
  source: string;
  target: string;
}

export interface ServiceEdge {
  source: string; // module or file id
  target: string; // service id
  envVar: string;
}

export interface ProjectGraph {
  modules: ModuleNode[];
  filesByModule: Record<string, FileNode[]>;
  services: ServiceNode[];
  moduleEdges: ModuleEdge[];
  fileEdges: FileEdge[];
  serviceEdges: ServiceEdge[];
}

export type ViewLevel = "strategic" | "tactical";

export interface EnvClassification {
  type: ServiceCategory;
  label: string;
}
