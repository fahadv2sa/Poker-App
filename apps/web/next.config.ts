import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NOTE: the build dir stays the default ".next" (Next.js requires distDir to
  // be project-relative). The repo lives under OneDrive, which races/locks files
  // in the build dir and corrupts dev compiles (EBUSY on
  // middleware-build-manifest.js → server actions return "an unexpected
  // response"). Fix: apps/web/.next is a directory junction to a path under
  // %TEMP% so OneDrive never syncs the build output. See README / setup.
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
