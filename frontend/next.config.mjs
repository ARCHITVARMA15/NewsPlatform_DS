/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,

  // Expose the backend URL to client-side code
  env: {
    NEXT_PUBLIC_API_URL: BACKEND_URL,
  },

  // Proxy /api/* and /health to the FastAPI backend (useful for production)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
    ];
  },

  // Allow cross-origin images (e.g. Google hosted images on the landing page)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
