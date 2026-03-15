import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:3000";

  return {
    plugins: [react({ fastRefresh: false })],
    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx"],
      dedupe: ["react", "react-dom"],
    },
    esbuild: {
      logOverride: {
        "this-is-undefined-in-esm": "silent",
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-query": ["@tanstack/react-query"],
            "vendor-lexical": [
              "lexical",
              "@lexical/rich-text",
              "@lexical/selection",
              "@lexical/utils",
            ],
            "vendor-motion": ["framer-motion"],
            "vendor-supabase": ["@supabase/supabase-js"],
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
