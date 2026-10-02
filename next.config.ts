import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: [
    "pino",
    "prom-client",
    "@prisma/adapter-mariadb",
    "mariadb",
  ],
};

export default nextConfig;
