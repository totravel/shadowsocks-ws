
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

export default {
  input: 'server.mjs',
  output: {
    file: 'server.min.mjs',
    format: 'es',
    sourcemap: true,
    plugins: [ terser() ]
  },
  plugins: [ nodeResolve({ preferBuiltins: true }), commonjs(), json() ]
}
