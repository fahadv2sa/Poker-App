import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal workspace packages are shipped as TypeScript source.
  transpilePackages: ["@fp/db", "@fp/shared", "@fp/engine"],
  // Native / engine-backed modules must not be bundled by the server compiler.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],
};

export default nextConfig;
