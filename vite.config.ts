import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  // Offline art preview templates contain placeholders for their export scripts.
  optimizeDeps: { entries: ["index.html"] },
});
