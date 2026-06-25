/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM in some sub-paths used by drei; let Next handle it.
  transpilePackages: ['three'],
};

export default nextConfig;
