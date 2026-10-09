import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // dev server is often reached through a preview proxy on 127.0.0.1
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
  poweredByHeader: false, // don't advertise the framework
  // deployed under the Lumen tenant mount, e.g. /sim/AHPortal — set via env on
  // the box so local dev stays prefix-free.
  basePath: process.env.NEXT_BASE_PATH || undefined,
  env: {
    // lets client code (BasePathPatch) see the same prefix
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.NEXT_BASE_PATH ?? "",
  },
  // webpack (required on the deploy box — glibc too old for swc/turbopack
  // natives) must not bundle node-pg into edge/client graphs: instrumentation
  // imports sync.ts which pulls db.ts.
  serverExternalPackages: ["pg", "pgpass", "pg-connection-string"],
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      // instrumentation's `await import("./lib/sync")` can't be dead-coded for
      // the edge bundle — swap in the stub so pg/fs never enter edge graphs.
      const stub = path.resolve(HERE, "src/lib/sync.edge.ts");
      for (const key of [path.resolve(HERE, "src/lib/sync.ts"), path.resolve(HERE, "src/lib/sync")])
        config.resolve.alias[key] = stub;
    }
    return config;
  },
};

export default nextConfig;
