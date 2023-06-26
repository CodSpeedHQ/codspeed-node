import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import dts from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";

/**
 * @typedef {import('rollup-plugin-dts').Options} DtsOptions
 */

/**
 * @param {DtsOptions} options
 */
export const declarationsPlugin = (options) => [dts(options)];

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
