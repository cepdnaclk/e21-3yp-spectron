import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Use relative paths so the build works on GitHub Pages regardless of repo name.
  base: "./",
  plugins: [react()],
});
