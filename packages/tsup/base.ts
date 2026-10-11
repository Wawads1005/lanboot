import { type Options } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

const baseOptions: Options = {
  bundle: true,
  clean: true,

  sourcemap: !isProduction,
  watch: !isProduction,
  minify: isProduction,

  silent: true,
};

export default baseOptions;
