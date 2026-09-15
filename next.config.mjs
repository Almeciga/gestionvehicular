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
  // runtime instead of bundling it. Netlify DOES ship node_modules, but only the
  // files Next.js output file tracing discovered — anything loaded via a dynamic
  // require that the tracer can't follow is missing at runtime (MODULE_NOT_FOUND
  // → HTTP 502). Dexie is client-only and is excluded from server bundles via the
  // webpack externals block below.
  //
  // '@react-pdf/renderer' is already in Next.js' built-in default externals list,
  // so it (and its pdfkit dependency) is always loaded from node_modules at
  // runtime. pdfkit resolves its standard fonts through a wildcard subpath import
  // ('#standard-fonts/*'), which @vercel/nft cannot expand, so those files must be
  // added to the trace explicitly via outputFileTracingIncludes below.
  outputFileTracingIncludes: {
    '/api/reports/[id]': [
      './node_modules/pdfkit/js/standard-fonts/**/*',
      './node_modules/pdfkit/js/data/**/*',
    ],
  },

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