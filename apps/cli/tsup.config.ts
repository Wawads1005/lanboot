import { defineConfig } from "tsup";
import nodeOptions from "@lanboot/tsup/node";

const config = defineConfig({
  ...nodeOptions,
  entry: {
    lanboot: "./index.ts",
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
  outDir: "./build/",
  esbuildOptions: (options) => {
    options.alias = {
      "@": "./",
    };
  },
});

export default config;
