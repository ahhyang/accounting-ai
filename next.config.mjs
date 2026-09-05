/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    // Allow large client document uploads (any type)
    serverActions: {
      bodySizeLimit: "100mb"
    }
  }
};

export default nextConfig;
