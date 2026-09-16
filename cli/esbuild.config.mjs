import { build, context } from "esbuild";

process.loadEnvFile();

const isProduction = process.env.NODE_ENV === "production";

async function main() {
  const ctx = await context({
    entryPoints: ["./index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: "./build/lanboot",
    banner: {
      js: "#!/usr/bin/env node",
    },
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: "info",
    alias: {
      "@/*": "./*",
    },
  });

  if (!isProduction) {
    await ctx.watch();
    console.log("Development watch mode active...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("Production build complete!");
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`${error.name}: ${error.message}`);
  }

  process.exit(1);
});
