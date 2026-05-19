import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',
  serverExternalPackages: ['@napi-rs/canvas', 'tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng'],
  outputFileTracingIncludes: {
    '/api/claims/process': [
      './node_modules/tesseract.js/src/worker-script/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/@tesseract.js-data/eng/**/*',
    ],
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  }
};
export default nextConfig;
