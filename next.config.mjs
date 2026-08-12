/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting runs as its own `npm run lint` step in CI; keep builds focused on type/compile errors.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Trigger.dev's SDK is server-only; never let it get traced into a client bundle.
    serverComponentsExternalPackages: ['@trigger.dev/sdk'],
  },
};

export default nextConfig;
