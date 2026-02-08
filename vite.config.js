import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages project site base path.
  base: "/e21-3yp-spectron/",
  plugins: [react()],
});
