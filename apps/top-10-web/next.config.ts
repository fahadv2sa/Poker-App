import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship as TypeScript source.
  transpilePackages: ["@fb/db", "@fb/shared", "@fb/top-10-engine", "@fb/top-10-ui"],
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],
  webpack: (config) => {
    // Workspace TS sources use ".js" specifiers that resolve to ".ts" files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
