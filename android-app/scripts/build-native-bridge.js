const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['scripts/native-app-bridge.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'www/vendor/capacitor-app-bridge.js'
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
