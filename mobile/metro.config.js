const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "..", "src");

const config = getDefaultConfig(projectRoot);

// The shared logic lives outside this project, so Metro has to watch it too or
// edits there won't trigger a reload (and cold builds can't read the files).
config.watchFolders = [sharedRoot];

// Prefer this app's node_modules, so a bare import never picks up the web app's
// copy of React from the repo root — two Reacts in one bundle breaks hooks in
// ways that are painful to debug.
//
// Hierarchical lookup stays ON: some dependencies resolve nested packages
// (reanimated reaches for semver/functions/satisfies) and turning it off breaks
// them. That is safe here because every shared file under ../src is pure
// TypeScript that imports only its siblings — none of them pulls in a package.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

// A build without Flow Family (EXPO_PUBLIC_FLOW_FAMILY unset) leaves its
// screens out of the bundle entirely, rather than shipping them unreachable:
// App Review asks for no dormant features (Guideline 2.3.1). The routes are
// guarded at runtime too (app/family/_layout redirects to Home).
if (process.env.EXPO_PUBLIC_FLOW_FAMILY !== "1") {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const familyRoutes = new RegExp(`^${escape(path.join(projectRoot, "src", "app", "family"))}[\\/].*`);
  const existing = config.resolver.blockList;
  config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), familyRoutes];
}

module.exports = withNativeWind(config, { input: "./src/global.css" });
