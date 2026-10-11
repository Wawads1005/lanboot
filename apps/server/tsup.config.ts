import { defineConfig } from "tsup";
import nodeOptions from "@lanboot/tsup/node";

const config = defineConfig({
  ...nodeOptions,
  entry: ["./index.ts"],
  outDir: "./build/",
  esbuildOptions: (options) => {
    options.alias = {
      "@": "./",
    };
  },
});

export default config;
