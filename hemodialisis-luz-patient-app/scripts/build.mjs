import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const output = 'dist';
const assets = ['index.html', 'family.html', 'manifest.webmanifest', 'sw.js', 'icons'];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const asset of assets) {
  cpSync(asset, `${output}/${asset}`, { recursive: true });
}

const apiUrl = (process.env.LUZ_API_URL ?? '').replace(/\/$/, '');
writeFileSync(
  `${output}/config.js`,
  `window.LUZ_PATIENT_APP_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)} };\n`,
);

console.log(`PWA generated in ${output} (API: ${apiUrl || 'same origin'})`);
