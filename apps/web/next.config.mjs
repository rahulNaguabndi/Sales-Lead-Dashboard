/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@leaddesk/shared'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'ioredis'],
    instrumentationHook: true,
  },
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
