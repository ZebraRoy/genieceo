import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  dts: false,
  clean: true,
  minify: false,
  splitting: false,
  shims: false,
  outDir: "dist",
});

