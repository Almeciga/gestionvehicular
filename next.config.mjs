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

  // NOTE: Do NOT add 'dexie' to serverExternalPackages.
  // serverExternalPackages tells Next.js to load the package from node_modules at
  // runtime inside the serverless function — but Netlify Lambda does NOT ship
  // node_modules, so this causes a MODULE_NOT_FOUND crash (HTTP 502).
  // Dexie is excluded from server bundles via the webpack externals block below.

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

    if (dev) {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: [/node_modules/],
        use: [{
          loader: '@dhiwise/component-tagger/nextLoader',
        }],
      });
    }

    return config;
  }
};
export default nextConfig;