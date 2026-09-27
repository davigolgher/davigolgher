/**
 * Check installed native modules against the versions Expo ships for this SDK.
 *
 * Expo Go embeds those exact native modules. Install a JS package on a different
 * major and it calls into native methods that aren't there — which surfaces at
 * runtime as "native module is null", long after the build and the typecheck
 * have both passed happily. `npx expo install` picks the right versions
 * automatically; this is the offline equivalent for when it can't reach Expo's
 * API, and a guard against a plain `npm install` quietly upgrading one.
 *
 *   node scripts/check-native-versions.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bundled = require("expo/bundledNativeModules.json");
const pkg = require("../package.json");
const semver = require("semver");

const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const problems = [];

for (const [name, expected] of Object.entries(bundled)) {
  if (!deps[name]) continue;
  let installed;
  try {
    installed = require(`${name}/package.json`).version;
  } catch {
    problems.push(`${name}: listed in package.json but not installed`);
    continue;
  }
  if (!semver.satisfies(installed, expected, { includePrerelease: true })) {
    problems.push(`${name}: installed ${installed}, Expo SDK expects ${expected}`);
  }
}

if (problems.length) {
  console.error("Native module versions don't match this Expo SDK:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nFix with:  npx expo install <package>   (or pin the expected version)\n");
  process.exit(1);
}

console.log("Native module versions match the Expo SDK.");
