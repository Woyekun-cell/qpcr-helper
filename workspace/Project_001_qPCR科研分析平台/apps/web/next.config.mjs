const development = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@qpcr/contracts"],
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}; connect-src 'self' https://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
          }
        ]
      }
    ];
  }
};

export default nextConfig;
