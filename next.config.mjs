/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting runs as its own `npm run lint` step in CI; keep builds focused on type/compile errors.
    ignoreDuringBuilds: true,
  },
  // Trigger.dev's SDK is server-only; never let it get traced into a client bundle.
  // (Was `experimental.serverComponentsExternalPackages`, which Next promoted out of
  // `experimental` — the old key still worked but logged a warning on every start.)
  serverExternalPackages: ['@trigger.dev/sdk'],
};

export default nextConfig;
