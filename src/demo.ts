import { useStore } from "./store";
import type { ProjectGraph, FileNode } from "./types/graph";

function f(
  id: string,
  name: string,
  path: string,
  moduleId: string,
  fileType: FileNode["fileType"]
): FileNode {
  return { id, name, path, moduleId, fileType, x: 0, y: 0 };
}

// Demo graph representing a typical Next.js SaaS project
const demoGraph: ProjectGraph = {
  modules: [
    { id: "mod-api", name: "api", path: "src/api", fileCount: 8, x: 0, y: 0 },
    { id: "mod-auth", name: "auth", path: "src/auth", fileCount: 5, x: 0, y: 0 },
    { id: "mod-payments", name: "payments", path: "src/payments", fileCount: 4, x: 0, y: 0 },
    { id: "mod-components", name: "components", path: "src/components", fileCount: 14, x: 0, y: 0 },
    { id: "mod-lib", name: "lib", path: "src/lib", fileCount: 6, x: 0, y: 0 },
    { id: "mod-hooks", name: "hooks", path: "src/hooks", fileCount: 7, x: 0, y: 0 },
    { id: "mod-store", name: "store", path: "src/store", fileCount: 3, x: 0, y: 0 },
  ],
  filesByModule: {
    "mod-api": [
      f("f-api-1", "client.ts", "src/api/client.ts", "mod-api", "util"),
      f("f-api-2", "routes.ts", "src/api/routes.ts", "mod-api", "route"),
      f("f-api-3", "middleware.ts", "src/api/middleware.ts", "mod-api", "util"),
      f("f-api-4", "users.ts", "src/api/users.ts", "mod-api", "route"),
      f("f-api-5", "projects.ts", "src/api/projects.ts", "mod-api", "route"),
    ],
    "mod-auth": [
      f("f-auth-1", "AuthProvider.tsx", "src/auth/AuthProvider.tsx", "mod-auth", "component"),
      f("f-auth-2", "LoginForm.tsx", "src/auth/LoginForm.tsx", "mod-auth", "component"),
      f("f-auth-3", "session.ts", "src/auth/session.ts", "mod-auth", "util"),
      f("f-auth-4", "guards.ts", "src/auth/guards.ts", "mod-auth", "util"),
    ],
    "mod-payments": [
      f("f-pay-1", "CheckoutForm.tsx", "src/payments/CheckoutForm.tsx", "mod-payments", "component"),
      f("f-pay-2", "stripe.ts", "src/payments/stripe.ts", "mod-payments", "util"),
      f("f-pay-3", "plans.ts", "src/payments/plans.ts", "mod-payments", "model"),
      f("f-pay-4", "webhooks.ts", "src/payments/webhooks.ts", "mod-payments", "route"),
    ],
    "mod-components": [
      f("f-comp-1", "Button.tsx", "src/components/Button.tsx", "mod-components", "component"),
      f("f-comp-2", "Modal.tsx", "src/components/Modal.tsx", "mod-components", "component"),
      f("f-comp-3", "DataTable.tsx", "src/components/DataTable.tsx", "mod-components", "component"),
      f("f-comp-4", "Sidebar.tsx", "src/components/Sidebar.tsx", "mod-components", "component"),
      f("f-comp-5", "Avatar.tsx", "src/components/Avatar.tsx", "mod-components", "component"),
    ],
    "mod-lib": [
      f("f-lib-1", "db.ts", "src/lib/db.ts", "mod-lib", "config"),
      f("f-lib-2", "logger.ts", "src/lib/logger.ts", "mod-lib", "util"),
      f("f-lib-3", "errors.ts", "src/lib/errors.ts", "mod-lib", "util"),
      f("f-lib-4", "env.ts", "src/lib/env.ts", "mod-lib", "config"),
    ],
    "mod-hooks": [
      f("f-hook-1", "useAuth.ts", "src/hooks/useAuth.ts", "mod-hooks", "hook"),
      f("f-hook-2", "useQuery.ts", "src/hooks/useQuery.ts", "mod-hooks", "hook"),
      f("f-hook-3", "useForm.ts", "src/hooks/useForm.ts", "mod-hooks", "hook"),
      f("f-hook-4", "useToast.ts", "src/hooks/useToast.ts", "mod-hooks", "hook"),
      f("f-hook-5", "useDebounce.ts", "src/hooks/useDebounce.ts", "mod-hooks", "hook"),
    ],
    "mod-store": [
      f("f-store-1", "index.ts", "src/store/index.ts", "mod-store", "config"),
      f("f-store-2", "user.ts", "src/store/user.ts", "mod-store", "model"),
      f("f-store-3", "ui.ts", "src/store/ui.ts", "mod-store", "model"),
    ],
  },
  services: [
    { id: "svc-postgres", name: "DATABASE_URL", label: "PostgreSQL", category: "database", envVars: ["DATABASE_URL"], x: 0, y: 0 },
    { id: "svc-redis", name: "REDIS_URL", label: "Redis", category: "cache", envVars: ["REDIS_URL"], x: 0, y: 0 },
    { id: "svc-stripe", name: "STRIPE_SECRET_KEY", label: "Stripe", category: "payments", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], x: 0, y: 0 },
    { id: "svc-supabase", name: "SUPABASE_URL", label: "Supabase Auth", category: "auth", envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"], x: 0, y: 0 },
    { id: "svc-s3", name: "AWS_S3_BUCKET", label: "S3", category: "storage", envVars: ["AWS_S3_BUCKET", "AWS_ACCESS_KEY_ID"], x: 0, y: 0 },
    { id: "svc-sentry", name: "SENTRY_DSN", label: "Sentry", category: "monitoring", envVars: ["SENTRY_DSN"], x: 0, y: 0 },
  ],
  moduleEdges: [
    { source: "mod-api", target: "mod-lib", weight: 6 },
    { source: "mod-api", target: "mod-auth", weight: 4 },
    { source: "mod-api", target: "mod-payments", weight: 3 },
    { source: "mod-auth", target: "mod-lib", weight: 3 },
    { source: "mod-payments", target: "mod-lib", weight: 2 },
    { source: "mod-payments", target: "mod-auth", weight: 2 },
    { source: "mod-components", target: "mod-hooks", weight: 8 },
    { source: "mod-components", target: "mod-store", weight: 5 },
    { source: "mod-hooks", target: "mod-store", weight: 4 },
    { source: "mod-hooks", target: "mod-api", weight: 3 },
    { source: "mod-hooks", target: "mod-lib", weight: 2 },
  ],
  fileEdges: [],
  serviceEdges: [
    { source: "mod-api", target: "svc-postgres", envVar: "DATABASE_URL" },
    { source: "mod-api", target: "svc-redis", envVar: "REDIS_URL" },
    { source: "mod-auth", target: "svc-supabase", envVar: "SUPABASE_URL" },
    { source: "mod-payments", target: "svc-stripe", envVar: "STRIPE_SECRET_KEY" },
    { source: "mod-api", target: "svc-s3", envVar: "AWS_S3_BUCKET" },
    { source: "mod-lib", target: "svc-sentry", envVar: "SENTRY_DSN" },
  ],
};

export function loadDemoGraph() {
  useStore.getState().setGraph(demoGraph);
}
