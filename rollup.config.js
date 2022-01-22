import { terser } from "rollup-plugin-terser"

const minify = {
  compress: {
    pure_funcs: ['console.debug']
  }
}

export default {
  input: 'server.mjs',
  external: ['fs', 'http', 'crypto', 'ws', 'net'],
  output: {
    file: 'server.min.js',
    format: 'cjs',
    sourcemap: true,
    plugins: [terser(minify)]
  }
}