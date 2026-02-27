import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy API requests to the Flask backend during development
    // This avoids CORS issues when running both servers locally
    proxy: {
      "/static": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
