import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@engine": path.resolve(__dirname, "../engine"),
      "@math": path.resolve(__dirname, "../math"),
      "@rng": path.resolve(__dirname, "../rng"),
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
