const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'site');
const output = path.join(root, 'dist', 'site');
const game = path.join(root, 'index.html');

if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Missing site/index.html');
if (!fs.existsSync(game)) throw new Error('Missing built game index.html. Run npm run build first.');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
fs.mkdirSync(path.join(output, 'play'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets', 'icon.png'), path.join(output, 'assets', 'icon.png'));
const promotionalArt = [
  ['key-art.webp', 'key-art.webp'],
  ['key-art-1.0.webp', 'key-art.webp'],
  ['world-panorama.webp', 'world-panorama.webp'],
  ['world-panorama-1.0.webp', 'world-panorama.webp']
];
const copied = new Set();
for (const [sourceName, outputName] of promotionalArt) {
  const art = path.join(root, 'assets', sourceName);
  if (fs.existsSync(art) && !copied.has(outputName)) {
    fs.copyFileSync(art, path.join(output, 'assets', outputName));
    copied.add(outputName);
  }
}
fs.copyFileSync(game, path.join(output, 'play', 'index.html'));

const required = [
  'index.html', 'styles.css', 'site.js', 'assets/icon.png', 'play/index.html'
];
for (const file of required) {
  if (!fs.existsSync(path.join(output, file))) throw new Error(`Site build missing ${file}`);
}
console.log(`Built Dog Squad showcase at ${output} (${required.length} required files verified).`);
