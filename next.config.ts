import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev server is often reached through a preview proxy on 127.0.0.1
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
  poweredByHeader: false, // don't advertise the framework
};

export default nextConfig;
