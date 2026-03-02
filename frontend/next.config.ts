/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Development: localhost
      ...(process.env.NODE_ENV !== "production"
        ? [
            {
              protocol: "http",
              hostname: "localhost",
              port: "3001",
              pathname: "/uploads/**",
            },
            {
              protocol: "http",
              hostname: "localhost",
              port: "3001",
              pathname: "/**",
            },
          ]
        : []),
      // Production: Use NEXT_PUBLIC_API_URL if set
      ...(process.env.NEXT_PUBLIC_API_URL
        ? (() => {
            try {
              const url = new URL(process.env.NEXT_PUBLIC_API_URL);
              return [
                {
                  protocol: url.protocol.slice(0, -1) as "http" | "https",
                  hostname: url.hostname,
                  port: url.port || undefined,
                  pathname: "/uploads/**",
                },
                {
                  protocol: url.protocol.slice(0, -1) as "http" | "https",
                  hostname: url.hostname,
                  port: url.port || undefined,
                  pathname: "/**",
                },
              ];
            } catch {
              return [];
            }
          })()
        : []),
    ],
  },
};

module.exports = nextConfig;
