import { type Options } from "tsup";
import baseOptions from "./base.ts";

const nodeOptions: Options = {
  ...baseOptions,

  platform: "node",
  format: "esm",
  target: "node24",

  noExternal: process.env.NODE_ENV === "production" ? [/^@lanboot\//] : [],
};

export default nodeOptions;
