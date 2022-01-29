
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { terser } from "rollup-plugin-terser"

const minify = {
  compress: {
    pure_funcs: ['debug']
  }
}

export default {
  input: 'server.mjs',
  output: {
    file: 'server.min.js',
    format: 'cjs',
    sourcemap: true,
    plugins: [terser(minify)]
  },
  plugins: [nodeResolve(), commonjs()]
}
