import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { proxyClientMaxBodySize: "21mb" },
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist", "mammoth"],
};

export default nextConfig;
