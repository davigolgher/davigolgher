/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
    alias: [
      // Edge Functions import npm packages the Deno way; tests resolve them from node_modules.
      { find: "npm:@supabase/supabase-js@2", replacement: "@supabase/supabase-js" },
      // The native app's own modules (mobile/tsconfig.json maps "~/" the same way).
      { find: /^~\//, replacement: path.resolve(__dirname, "./mobile/src") + "/" },
      // Native modules the app's purchase code imports, faked for unit tests.
      { find: /^react-native$/, replacement: path.resolve(__dirname, "./src/test/stubs/react-native.ts") },
      { find: /^expo-constants$/, replacement: path.resolve(__dirname, "./src/test/stubs/expo-constants.ts") },
      {
        find: /^react-native-purchases$/,
        replacement: path.resolve(__dirname, "./src/test/stubs/react-native-purchases.ts"),
      },
    ],
  },
});
