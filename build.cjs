const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const pack = require('./src/content.js').validatePack(JSON.parse(fs.readFileSync(path.join(root, 'content/builtin.json'), 'utf8')));
fs.writeFileSync(path.join(root, 'content/builtin.js'), 'window.DogBuiltin = ' + JSON.stringify(pack).replace(/</g, '\\u003c') + ';\n');
const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const sceneAssets = [
  ['INLINE_HERO_CUTE', 'hero-cute.jpg', 'DOG_HERO_CUTE'],
  ['INLINE_STORY_POSTCARD', 'story-postcard.jpg', 'DOG_STORY_POSTCARD'],
  ['INLINE_VICTORY_POSTCARD', 'victory-postcard.jpg', 'DOG_VICTORY_POSTCARD'],
  ['INLINE_WORLD_CUTE', 'world-cute.jpg', 'DOG_WORLD_CUTE'],
  ['INLINE_HERO_PORTRAITS', 'hero-portraits.webp', 'DOG_HERO_PORTRAITS']
];
const scripts = [['INLINE_BUILTIN', 'content/builtin.js'], ['INLINE_CONTENT', 'src/content.js'], ['INLINE_PROGRESSION', 'src/progression.js'], ['INLINE_PROGRESS', 'src/progress.js'], ['INLINE_CORE', 'src/core.js'], ['INLINE_INPUT', 'src/input.js'], ['INLINE_VFX', 'src/battle-vfx.js'], ['INLINE_AUDIO', 'src/soundscape.js'], ['INLINE_MOTION', 'src/character-motion.js'], ['INLINE_STORY_CONTENT', 'src/story-content.js'], ['INLINE_STORY_UI', 'src/story-ui.js'], ['INLINE_EXPEDITION', 'src/expedition-ui.js'], ['INLINE_GAME', 'src/game.js']];
let desktop = template.replace('<style>/* INLINE_STYLE */</style>', '<link rel="stylesheet" href="../src/style.css">');
for (const [marker, file] of scripts) desktop = desktop.replace(`<script>/* ${marker} */</script>`, `<script src="../${file}"></script>`);
desktop = desktop.replace(/<script>window.MOCHI_SPRITES[^<]+<\/script>/, '<script src="./assets.js"></script>');
desktop = desktop.replaceAll('INLINE_KEY_ART', '../assets/key-art.jpg').replaceAll('INLINE_WORLD_MAP', '../assets/world-map.jpg');
for (const [marker, file] of sceneAssets) desktop = desktop.replaceAll(marker, '../assets/' + file);
fs.writeFileSync(path.join(root, 'desktop/assets.js'), "window.MOCHI_SPRITES = '../assets/pet-squad.png'; window.DOG_ENEMIES = '../assets/enemy-robots.png'; window.DOG_BOSSES = '../assets/boss-atlas-v6.png'; window.DOG_WORLD_MAP = '../assets/world-map.jpg'; window.DOG_KEY_ART = '../assets/key-art.jpg';\n");
fs.appendFileSync(path.join(root, 'desktop/assets.js'), sceneAssets.map(([, file, name]) => `window.${name} = ${JSON.stringify('../assets/' + file)};`).join('\n') + '\n');
fs.writeFileSync(path.join(root, 'desktop/app.html'), desktop);
let html = template.replace('/* INLINE_STYLE */', () => fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'));
for (const [marker, file] of scripts) html = html.replace(`/* ${marker} */`, () => fs.readFileSync(path.join(root, file), 'utf8'));
html = html.replace('INLINE_SPRITES', 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/pet-squad.png')).toString('base64'));
html = html.replace('INLINE_ENEMIES', 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/enemy-robots.png')).toString('base64'));
html = html.replace('INLINE_BOSSES', 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/boss-atlas-v6.png')).toString('base64'));
html = html.replaceAll('INLINE_KEY_ART', 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'assets/key-art.jpg')).toString('base64'));
html = html.replaceAll('INLINE_WORLD_MAP', 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'assets/world-map.jpg')).toString('base64'));
for (const [marker, file, name] of sceneAssets) {
  const uri = 'data:image/' + (file.endsWith('.webp') ? 'webp' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(root, 'assets', file)).toString('base64');
  // One encoded copy per illustration; DOM images reuse the shared resource.
  html = html.replaceAll(`src="${marker}"`, `data-scene-asset="${name}"`);
  html = html.replaceAll(marker, uri);
}
html = html.replace(/(<script>window\.MOCHI_SPRITES[^<]+)(<\/script>)/, (_, prefix, close) => prefix + "document.querySelectorAll('[data-scene-asset]').forEach(image => { image.src = window[image.dataset.sceneAsset]; });" + close);
if (/INLINE_[A-Z_]+/.test(html)) throw new Error('Unresolved build placeholder');
fs.writeFileSync(path.join(root, '狗狗突击队.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Built ${pack.levels.length} operations: standalone web ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB + sandboxed desktop assets.`);
