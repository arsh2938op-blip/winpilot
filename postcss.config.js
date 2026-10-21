// CommonJS on purpose: package.json has no "type": "module", so the Electron
// main/preload bundles are CJS too. Using `export default` here makes Node
// reparse this file as ESM on every build and print a MODULE_TYPELESS_PACKAGE_JSON warning.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
