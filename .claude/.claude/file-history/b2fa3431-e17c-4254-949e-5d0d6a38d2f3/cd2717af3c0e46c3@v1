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
