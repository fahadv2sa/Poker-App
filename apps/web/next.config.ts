import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages are shipped as TypeScript source.
  transpilePackages: ["@fp/db", "@fp/shared", "@fp/engine"],
  // Native / engine-backed modules must not be bundled by the server compiler.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],
  webpack: (config) => {
    // The workspace TS sources use NodeNext-style ".js" import specifiers that
    // actually resolve to ".ts" files. tsc/vitest handle this; webpack needs an
    // explicit alias so `transpilePackages` can resolve them.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
