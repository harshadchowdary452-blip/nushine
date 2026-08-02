import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "charts"
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "motion"
          if (id.includes("date-fns")) return "date-fns"
          if (id.includes("@tanstack/react-query") || id.includes("axios")) return "data"
          if (id.includes("@radix-ui") || id.includes("react-remove-scroll")) return "radix"
          if (id.includes("lucide-react") || id.includes("react-icons")) return "icons"
          if (id.includes("react-router") || id.includes("@remix-run")) return "router"
          if (id.includes("react-dom") || id.includes("scheduler")) return "react"
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const loc = proxyRes.headers["location"];
            if (loc && loc.startsWith("http://localhost:8000/")) {
              proxyRes.headers["location"] = loc.replace("http://localhost:8000", "");
            }
          });
        },
      },
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
