const path = require("path");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      [
        "module-resolver",
        {
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
          alias: {
            // Shared, platform-pure logic: the web app's src/ at the repo root is
            // the single source of truth for money, calc, reports, recurrence,
            // streak, format, sanitize, types, currencies and config. Those files
            // import each other as "@/…", so this alias serves them too.
            "@": path.resolve(__dirname, "../src"),
            // This app's own code (screens, native components, platform adapters).
            "~": path.resolve(__dirname, "src"),
          },
        },
      ],
    ],
  };
};
