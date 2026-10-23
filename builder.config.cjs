'use strict';
const fs = require('node:fs');
const path = require('node:path');
const release = require('./desktop/release-config.json');
module.exports = {
  appId: 'com.dogsquad.game',
  productName: '狗狗突击队',
  executableName: 'Dog Squad',
  copyright: 'Copyright © 2026 Dog Squad',
  asar: true,
  afterPack: async context => {
    // Finder adds package metadata on Desktop; remove only signing-incompatible
    // metadata from newly generated artifacts. Preserve provenance/quarantine.
    const {spawnSync}=require('node:child_process');
    for(const name of fs.readdirSync(context.appOutDir).filter(n=>n.endsWith('.app'))){
      for(const attr of ['com.apple.FinderInfo','com.apple.ResourceFork']){
        const r=spawnSync('/usr/bin/xattr',['-dr',attr,path.join(context.appOutDir,name)],{encoding:'utf8'});
        if(r.status!==0 && !/No such xattr/.test(r.stderr))throw Error('无法整理打包元数据：'+r.stderr);
      }
    }
  },
  directories: { output: 'dist/mac', buildResources: 'assets' },
  files: ['desktop/*.cjs', 'desktop/app.html', 'desktop/assets.js', 'desktop/release-config.json', 'src/*.js', 'src/style.css', 'content/builtin.js', 'assets/pet-squad.png', 'assets/enemy-robots.png', 'assets/boss-atlas-v6.png', 'assets/icon.png', 'assets/key-art.jpg', 'assets/world-map.jpg', 'assets/hero-cute.jpg', 'assets/story-postcard.jpg', 'assets/victory-postcard.jpg', 'assets/world-cute.jpg', 'LICENSE', 'LICENSE-ASSETS.md', 'assets/PROVENANCE.md', 'assets/ART-PROVENANCE-1.0.md', 'assets/ART-PROVENANCE-1.1.md', 'assets/ART-MANIFEST-1.1.json', 'assets/hero-portraits.webp', 'assets/HERO-PORTRAITS-PROVENANCE-1.1.md', 'THIRD_PARTY_NOTICES.md', 'package.json'],
  artifactName: 'Dog-Squad-${version}-${arch}.${ext}',
  forceCodeSigning: release.production === true,
  mac: {
    category: 'public.app-category.action-games',
    ...(fs.existsSync(path.join(__dirname, 'assets/icon.icns')) ? { icon: 'assets/icon.icns' } : {}),
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    identity: release.production ? undefined : '-',
    hardenedRuntime: true,
    notarize: release.production === true,
    minimumSystemVersion: '13.0.0',
    extendInfo: { NSHumanReadableCopyright: 'Copyright © 2026 Dog Squad', LSApplicationCategoryType: 'public.app-category.action-games', NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } }
  },
  dmg: { title: '狗狗突击队', window: { width: 600, height: 400 }, iconSize: 104, contents: [{ x: 150, y: 190, type: 'file' }, { x: 450, y: 190, type: 'link', path: '/Applications' }] },
  publish: release.production && release.appUpdateURL ? [{ provider: 'generic', url: release.appUpdateURL, channel: 'latest' }] : null
};
