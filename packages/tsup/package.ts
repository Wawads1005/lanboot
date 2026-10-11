import { type Options } from "tsup";
import baseOptions from "./base.ts";

const packageOptions: Options = {
  ...baseOptions,

  platform: "neutral",
  format: ["esm", "cjs"],
  target: "esnext",
  dts: true,
};

export default packageOptions;
