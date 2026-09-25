import type { NextConfig } from "next";

const nextConfig: any = {
  typescript: {
    ignoreBuildErrors: true,
  },

  allowedDevOrigins: [
    "188.245.42.178",
    "188.245.42.178:3000",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "0.0.0.0:3000",
  ],

  // Exclude private_tiles from file tracing (58k+ PNG files causing slow builds)
  outputFileTracingExcludes: {
    "*": ["**/private_tiles/**"],
  },

  outputFileTracingIncludes: {
    "**/*": ["./node_modules/pdfjs-dist/**/*"],
  },

  // Mobile static export support
  ...(process.env.NEXT_PUBLIC_PLATFORM === "mobile" && {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
  }),

  output: "standalone",

  ...(process.env.NEXT_PUBLIC_PLATFORM !== "mobile" && {
    async headers() {
      return [
        {
          source: "/api/:path*",
          headers: [
            { key: "Access-Control-Allow-Credentials", value: "true" },
            { key: "Access-Control-Allow-Origin", value: "*" },
            { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
            {
              key: "Access-Control-Allow-Headers",
              value:
                "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-App-Token",
            },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
