import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import commonjs from "@rollup/plugin-commonjs";
import esbuild from "rollup-plugin-esbuild";
import dts from "rollup-plugin-dts";

export const declarationsPlugin = [dts()];

export const jsPlugins = (version) => [
  json(),
  esbuild({
    define: {
      __VERSION__: '"' + version + '"',
    },
  }),
  commonjs(),
  resolve(),
];
