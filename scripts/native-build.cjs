'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const production = process.argv.includes('--production');
const configFile = path.join(root, 'desktop/release-config.json');
const supplied = process.env.DOG_SQUAD_RELEASE_CONFIG;
const original = fs.readFileSync(configFile);
(async () => {
  try {
    if (supplied) fs.writeFileSync(configFile, fs.readFileSync(path.resolve(supplied)));
    execFileSync(process.execPath, ['build.cjs'], { cwd: root, stdio: 'inherit' });
    const { preflight } = require('./release-preflight.cjs');
    const result = preflight({ root, production }); console.log(JSON.stringify(result, null, 2));
    if (!result.ok) throw new Error('发行预检未通过，未开始打包');
    const { build, Platform, Arch } = require('electron-builder');
    const config = require('../builder.config.cjs');
    const staging=fs.mkdtempSync(path.join(os.tmpdir(),'dog-squad-mac-'));
    config.directories={...config.directories,output:staging};
    const targets = Platform.MAC.createTarget(process.argv.includes('--dir') ? ['dir'] : ['dmg', 'zip'], Arch.arm64);
    const artifacts = await build({ projectDir: root, targets, config, publish: 'never' });
    const appPath=path.join(staging,'mac-arm64','Dog Squad.app');
    execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',appPath],{stdio:'inherit'});
    if(production)execFileSync('/usr/bin/xcrun',['stapler','validate',appPath],{stdio:'inherit'});
    const destination=path.join(root,'dist/mac');fs.mkdirSync(destination,{recursive:true});
    const delivered=[];
    for(const file of artifacts){if(!fs.existsSync(file))throw Error('缺少构建产物 '+file);const target=path.join(destination,path.basename(file));fs.copyFileSync(file,target);delivered.push(target);}
    if(!process.argv.includes('--dir')&&!delivered.some(f=>f.endsWith('.dmg')))throw Error('未生成DMG');
    fs.writeFileSync(path.join(destination,'build-artifacts.json'),JSON.stringify({version:require('../package.json').version,appPath,artifacts:delivered,signature:production?'developer-id':'ad-hoc',notarized:production,production},null,2));
    console.log('Build completed (nothing published):\n' + delivered.join('\n')+'\nApp for local QA: '+appPath);
  } finally { if (supplied) fs.writeFileSync(configFile, original); }
})().catch(error => { console.error(error.message); process.exit(1); });
