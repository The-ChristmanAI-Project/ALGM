import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Build verification should be portable in CI. The default `vercel` preset makes
// the production build depend on a Vercel-specific environment, while the app is
// routinely validated in plain Node-based GitHub Actions.
export default defineConfig(({ command, isPreview }) => {
  const isProdBuild = command === "build" || isPreview;

  return {
    server: {
      host: "127.0.0.1",
      port: 9099,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 9099,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      ...(isProdBuild ? [nitro({ preset: process.env.NITRO_PRESET || "node-server" })] : []),
      viteReact(),
    ],
  };
});
