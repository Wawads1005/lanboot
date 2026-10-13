import { type Options } from "tsup";

const baseOptions: Options = {
  bundle: true,
  clean: true,
  silent: true,
  replaceNodeEnv: true,
};

export default baseOptions;
