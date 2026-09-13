import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  distDir: process.env.DIST_DIR || '.next',

  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint: keep ignoreDuringBuilds true until all existing any/lint issues are resolved
  // This prevents the build from failing due to pre-existing lint warnings
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Prevent Dexie (IndexedDB) from being bundled into server/serverless functions.
  // Dexie is a browser-only library; importing it on the server crashes the function.
  serverExternalPackages: ['dexie'],

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },

  webpack(config, { dev, isServer }) {
    // Exclude dexie from server-side bundles to prevent serverless crash
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
        'dexie',
      ];
    }

    return config;
  }
};
export default nextConfig;