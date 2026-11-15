/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The native app ships through the React Compiler (mobile/app.json,
// experiments.reactCompiler), which memoises by reading values during render.
// Its screens are tested the same way, so a test catches what the compiler
// changes; the web pages and the production web build are left as they are.
// The tests render with React 18, hence `target: "18"` and the runtime stub.
const reactCompiler = path.resolve(__dirname, "./mobile/node_modules/babel-plugin-react-compiler");

export default defineConfig({
  plugins: [
    react(
      process.env.VITEST
        ? { babel: (id) => (/[\\/]mobile[\\/]src[\\/]/.test(id) ? { plugins: [[reactCompiler, { target: "18" }]] } : {}) }
        : {},
    ),
  ],
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
      { find: /^react-compiler-runtime$/, replacement: path.resolve(__dirname, "./src/test/stubs/react-compiler-runtime.ts") },
      { find: /^expo-constants$/, replacement: path.resolve(__dirname, "./src/test/stubs/expo-constants.ts") },
      {
        find: /^react-native-purchases$/,
        replacement: path.resolve(__dirname, "./src/test/stubs/react-native-purchases.ts"),
      },
    ],
  },
});
