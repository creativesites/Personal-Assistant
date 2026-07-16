import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  // Keep react, react-dom, and @react-pdf/renderer as runtime externals so
  // there is exactly one React instance in the process — the renderer shares
  // it with the template components. Without this, tsup inlines two copies of
  // React (one inside the bundle, one that @react-pdf/renderer loads) and the
  // layout engine never sees any children, producing a blank PDF.
  external: ['react', 'react-dom', '@react-pdf/renderer'],
})
