
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { terser } from "rollup-plugin-terser"

export default {
  input: 'server.mjs',
  output: {
    file: 'server.min.js',
    format: 'cjs',
    sourcemap: true,
    plugins: [terser()]
  },
  plugins: [nodeResolve(), commonjs()]
}
