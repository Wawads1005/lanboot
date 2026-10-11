import { defineConfig } from "tsup";
import packageOptions from "@lanboot/tsup/package";

const config = defineConfig({
  ...packageOptions,
  entry: ["./index.ts"],
  outDir: "./build/",
  esbuildOptions: (options) => {
    options.alias = {
      "@": "./",
    };
  },
});

export default config;
