const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = ['build.cjs', 'builder.config.cjs'];
for (const dir of ['src', 'desktop', 'scripts']) for (const f of fs.readdirSync(path.join(root, dir))) if (/\.(?:c?js)$/.test(f)) files.push(dir + '/' + f);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const pack = require('../src/content.js').validatePack(require('../content/builtin.json'));
console.log(`Syntax OK: ${files.length} files. Content schema OK: ${pack.levels.length} levels.`);
