import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Renderização roda num processo separado; estes pacotes nunca entram no bundle do servidor web.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "@remotion/install-whisper-cpp"],
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
