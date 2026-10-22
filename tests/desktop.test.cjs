'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { verifyEnvelope, secureURL, verifyCatalog, fetchBounded, versionCompare } = require('../desktop/security.cjs');
const { ContentStore } = require('../desktop/content-store.cjs');
const { ApplicationUpdater } = require('../desktop/updater.cjs');
const { LocalContentInbox } = require('../desktop/local-content-inbox.cjs');
const { SaveBackupStore, MAX_BACKUP_FILE_BYTES } = require('../desktop/save-backup.cjs');
const { sign } = require('../scripts/pack-sign.cjs');
const { validatePack } = require('../src/content.js');
const pair = crypto.generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const keys = { 'test-publisher': publicPem };
function pack(version = '1.0.0') {
  const l = { id: 'new-frontier-first', act: 'frontier', name: '天际信号', en: 'SKY SIGNAL', subtitle: '追踪失散信号', boss: '巡空机甲', tag: '再出发', intro: '新的呼救', brief: 'Ramen 与 Bing Bong 前往空港', objective: '重启信标', radio: '收到信号', outro: '信标点亮', debrief: '行动成功', mechanicLabel: '常规行动', mechanicHint: '保持机动', difficulty: 1, duration: 70, speed: 120, bossHp: 6000, star2: 90, star3: 180, comboGoal: 20, damageGoal: 40, killGoal: 70, color: '#99ffee', sea: '#113344', road: '#234455', bossKind: 'guardian', mechanic: 'standard', dialogue: [{ speaker: 'Ramen', text: '准备出发。' }, { speaker: 'Bing Bong', text: '我会保护你。' }], transmissions: [{ at: .5, speaker: '指挥部', text: '信号已恢复。' }], archive: { title: '信标记录', text: '第一条来自空港的信号。' } };
  return { schema: 1, id: 'new-frontier', version, minAppVersion: '4.0.0', title: '新边疆', description: '签名关卡测试', acts: [{ id: 'frontier', title: '空港', subtitle: '新的呼救', synopsis: '追踪远方的呼救。' }], levels: [l] };
}
const signed = data => Buffer.from(JSON.stringify(sign(data, 'test-publisher', privatePem)));
const appRelease = (releaseEpoch = 2, version = '1.1.0') => ({ schema: 1, type: 'app-release', releaseEpoch, version, platform: 'darwin', arch: 'arm64', bundleId: 'com.dogsquad.game', url: `https://github.com/qx04222/dog-squad/releases/download/v${version}/Dog-Squad-${version}-arm64.zip`, size: 2048, sha256: 'a'.repeat(64), notes: 'signed update' });
async function fixture(t, options = {}) { const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-store-')); t.after(() => fs.rm(directory, { recursive: true, force: true })); const store = new ContentStore({ directory, keys, appVersion: '4.0.0', validatePack, ...options }); await store.load(); return store; }
test('valid signed data-only pack is accepted; tamper, wrong key, malformed signature rejected', () => {
  const original = signed(pack()); assert.equal(verifyEnvelope(original, keys).data.id, 'new-frontier');
  const altered = JSON.parse(original); altered.payload = Buffer.from(JSON.stringify(pack('2.0.0'))).toString('base64');
  assert.throws(() => verifyEnvelope(altered, keys), /校验失败/);
  assert.throws(() => verifyEnvelope(original, {}), /不受信任/);
  const bad = JSON.parse(original); bad.signature = Buffer.alloc(64).toString('base64'); assert.throws(() => verifyEnvelope(bad, keys), /签名验证失败/);
});
test('unknown/executable fields and future engine requirements are rejected despite valid signatures', async t => {
  const store = await fixture(t); const executable = pack(); executable.levels[0].script = 'process.exit()';
  await assert.rejects(store.install(signed(executable)), /未知字段/);
  const future = pack(); future.minAppVersion = '5.0.0'; await assert.rejects(store.install(signed(future)), /先将游戏更新/);
  assert.equal(store.getPacks().length, 0);
});
test('atomic install, persisted reload, explicit rollback, and replay prevention', async t => {
  const store = await fixture(t); await store.install(signed(pack('1.0.0'))); await store.install(signed(pack('1.1.0')));
  assert.equal(store.summaries()[0].canRollback, true);
  const reloaded = new ContentStore({ directory: store.directory, keys, appVersion: '4.0.0', validatePack }); await reloaded.load();
  assert.equal(reloaded.getPacks()[0].version, '1.1.0');
  await reloaded.rollback('new-frontier'); assert.equal(reloaded.getPacks()[0].version, '1.0.0');
  await assert.rejects(reloaded.install(signed(pack('1.1.0'))), /降级/);
  await reloaded.install(signed(pack('1.2.0'))); assert.equal(reloaded.getPacks()[0].version, '1.2.0');
});
test('damaged installed pack is quarantined and previous version restored with high watermark', async t => {
  const store = await fixture(t); await store.install(signed(pack())); await store.install(signed(pack('1.1.0')));
  await fs.writeFile(store.file('new-frontier'), '{corrupt');
  const recovered = new ContentStore({ directory: store.directory, keys, appVersion: '4.0.0', validatePack }); await recovered.load();
  assert.equal(recovered.getPacks()[0].version, '1.0.0'); assert.match(recovered.warning, /恢复/);
  assert.equal((await fs.readdir(path.join(store.directory, 'quarantine'))).length, 1);
  await assert.rejects(recovered.install(signed(pack('1.1.0'))), /降级/);
});
test('signed catalog installation checks exact artifact hash and rejects catalog downgrade', async t => {
  const bytes = signed(pack()), entry = { id: 'new-frontier', version: '1.0.0', url: 'https://updates.dogsquad.invalid/content/frontier.dogpack', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  let catalogVersion = 2;
  const store = await fixture(t, { feedURL: 'https://updates.dogsquad.invalid/content/catalog.dogpack', fetcher: async url => url.endsWith('catalog.dogpack') ? signed({ schema: 1, type: 'catalog', version: catalogVersion, packs: [entry] }) : bytes });
  assert.equal((await store.checkUpdates()).installed, 1); catalogVersion = 1;
  await assert.rejects(store.checkUpdates(), /目录版本回退/);
});
test('content check cannot install if combat begins after downloading', async t => {
  const bytes = signed(pack()), entry = { id: 'new-frontier', version: '1.0.0', url: 'https://updates.dogsquad.invalid/frontier.dogpack', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const store = await fixture(t, { feedURL: 'https://updates.dogsquad.invalid/catalog.dogpack', fetcher: async url => url.endsWith('catalog.dogpack') ? signed({ schema: 1, type: 'catalog', version: 1, packs: [entry] }) : bytes });
  await assert.rejects(store.checkUpdates(() => false), /战斗中/); assert.equal(store.getPacks().length, 0);
});
test('content mutation gate covers queued install transactions until durable completion', async t => {
  const store = await fixture(t); let release;
  store.queue = new Promise(resolve => { release = resolve; });
  const running = store.install(signed(pack())); assert.equal(store.isMutating(), true);
  release(); await running; assert.equal(store.isMutating(), false);
});
test('update URLs enforce HTTPS, same origin, no credentials and safe version comparisons', () => {
  for (const url of ['http://updates.example.org/', 'file:///etc/passwd', 'https://name:password@updates.example.org/', 'https://localhost/path']) assert.throws(() => secureURL(url));
  assert.throws(() => secureURL('https://evil.example.org/a', 'https://updates.example.org'));
  assert.equal(versionCompare('1.10.0', '1.9.9'), 1);
  assert.throws(() => verifyCatalog({ schema: 1, type: 'catalog', version: 1, packs: [{ id: 'new-frontier', version: '1.0.0', url: 'https://other.example.org/f', sha256: 'a'.repeat(64) }] }, 'https://updates.example.org'));
});
function fakeRequest(status, chunks, headers = {}) { return (_url, _options, callback) => { const req = new EventEmitter(); req.destroy = () => {}; queueMicrotask(() => { const res = new PassThrough(); res.statusCode = status; res.headers = headers; callback(res); for (const chunk of chunks) res.write(chunk); res.end(); }); return req; }; }
test('network layer rejects redirects and over-size responses, returns bounded 200 bytes', async () => {
  const url = 'https://updates.example.org/a';
  await assert.rejects(fetchBounded(url, { request: fakeRequest(302, [], { location: 'https://evil.example.org' }) }), /重定向/);
  await assert.rejects(fetchBounded(url, { maxBytes: 8, request: fakeRequest(200, [Buffer.alloc(9)]) }), /大小限制/);
  assert.equal((await fetchBounded(url, { request: fakeRequest(200, [Buffer.from('ok')]) })).toString(), 'ok');
});
test('unconfigured or unpackaged app updater never uses network', async () => {
  let checks = 0;
  const u = new ApplicationUpdater({ version: '1.0.0', config: { appUpdateURL: 'https://qx04222.github.io/dog-squad/updates/app.json' }, isPackaged: true, manifestFetcher: async () => { checks++; }, isBattleActive: () => false });
  await u.check({ manual: true }); assert.equal(checks, 0); assert.equal(u.state.enabled, false); await assert.rejects(u.install(), /没有已验证/);
});
test('verified native restart is refused during combat; automatic preference suppresses checks', async () => {
  let installs = 0, checks = 0, downloads = 0, active = true;
  const config = { releaseEpoch: 1, appUpdateURL: 'https://qx04222.github.io/dog-squad/updates/app.json', appPublicKeys: keys };
  const plan = { container: '/Applications/.dog-squad-update-0011223344556677' };
  const u = new ApplicationUpdater({ version: '1.0.0', config, isPackaged: true, isBattleActive: () => active, userData: '/tmp/dog', executable: '/Applications/Dog Squad.app/Contents/MacOS/Dog Squad',
    manifestFetcher: async () => { checks++; return signed(appRelease()); }, artifactDownloader: async () => { downloads++; }, prepare: async () => plan, launch: async () => { installs++; } });
  u.setPreferences({ automaticUpdates: false }); await u.check(); assert.equal(checks, 0);
  await u.check({ manual: true }); assert.equal(checks, 1); assert.equal(downloads, 1); assert.equal(u.state.phase, 'ready');
  await assert.rejects(u.install(), /当前战斗/); assert.equal(installs, 0);
  active = false; await u.install(); assert.equal(installs, 1); assert.equal(u.state.phase, 'installing');
});
test('private PEM cannot be used as a public trust key or pass release preflight', async t => {
  assert.throws(() => verifyEnvelope(signed(pack()), { 'test-publisher': privatePem }), /禁止私钥/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-preflight-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'release-config.json');
  await fs.writeFile(configPath, JSON.stringify({ production: false, contentPublicKeys: { 'test-publisher': privatePem } }));
  const result = require('../scripts/release-preflight.cjs').preflight({ root, configPath });
  assert.equal(result.ok, false); assert.ok(result.errors.some(e => e.includes('公钥无效')));
});
test('rejected redirect destroys the response and request without consuming its body', async () => {
  let requestDestroyed = false, responseDestroyed = false;
  const request = (_url, _options, callback) => {
    const req = new EventEmitter(); req.destroy = () => { requestDestroyed = true; };
    queueMicrotask(() => callback({ statusCode: 302, headers: {}, destroy: () => { responseDestroyed = true; }, resume: () => assert.fail('must not drain a redirect body') }));
    return req;
  };
  await assert.rejects(fetchBounded('https://updates.example.org/a', { request }), /重定向/);
  assert.equal(requestDestroyed, true); assert.equal(responseDestroyed, true);
});
test('bounded file reader rejects a real file growing between stat and read', async t => {
  const { readBoundedFile } = require('../desktop/bounded-file.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-file-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'test.dogpack'); await fs.writeFile(file, 'ok');
  assert.equal((await readBoundedFile(file, 8)).toString(), 'ok');
  await assert.rejects(readBoundedFile(file, 8, async (...args) => {
    const handle = await fs.open(...args);
    return { stat: async () => { const original = await handle.stat(); await fs.appendFile(file, '0123456789'); return original; }, read: (...values) => handle.read(...values), close: () => handle.close() };
  }), /读取时超过/);
});
test('private key path cannot enter project through an outside symlink', async t => {
  const { outsideProject } = require('../scripts/pack-sign.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-key-path-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const alias = path.join(dir, 'project'); await fs.symlink(path.resolve(__dirname, '..'), alias);
  assert.throws(() => outsideProject(path.join(alias, 'new-keys', 'private.pem')), /工程之外/);
});
test('cross-pack ID collisions are rejected atomically and cannot break a valid installed pack',async t=>{
  const store=await fixture(t),a=pack(),b=pack();a.levels[0].id='new-frontier-north-first';b.id='new-frontier-north';b.levels[0].id=a.levels[0].id;
  await store.install(signed(a));await assert.rejects(store.install(signed(b)),/冲突/);assert.equal(store.getPacks().length,1);
});
test('manifest failures can retry, and installing is a terminal guard until restart',async()=>{
  let checks=0, launches=0; const config={releaseEpoch:1,appUpdateURL:'https://qx04222.github.io/dog-squad/updates/app.json',appPublicKeys:keys};
  const u=new ApplicationUpdater({version:'1.0.0',config,isPackaged:true,isBattleActive:()=>false,userData:'/tmp/dog',executable:'/Applications/Dog Squad.app/Contents/MacOS/Dog Squad',manifestFetcher:async()=>{checks++;if(checks===1)throw Error('sync');return signed(appRelease());},artifactDownloader:async()=>{},prepare:async()=>({container:'/Applications/.dog-squad-update-0011223344556677'}),launch:async()=>{launches++;}});
  await u.check({manual:true});assert.equal(u.state.phase,'error');await u.check({manual:true});assert.equal(checks,2);assert.equal(u.state.phase,'ready');
  await u.install();assert.equal(u.state.phase,'installing');await u.check({manual:true});assert.equal(checks,2);await assert.rejects(u.install(),/没有已验证/);assert.equal(launches,1);
});
test('a higher epoch cannot authorize a same-version or lower-version app reinstall',async()=>{
  const config={releaseEpoch:1,appUpdateURL:'https://qx04222.github.io/dog-squad/updates/app.json',appPublicKeys:keys};let downloads=0;
  for(const version of ['1.0.0','0.9.9']){const u=new ApplicationUpdater({version:'1.0.0',config,isPackaged:true,isBattleActive:()=>false,manifestFetcher:async()=>signed(appRelease(2,version)),artifactDownloader:async()=>{downloads++;}});await u.check({manual:true});assert.equal(u.state.phase,'error');assert.match(u.state.reason,/版本未递增/);}
  assert.equal(downloads,0);
});

function inertWatcher() { return { on() {}, close() {} }; }
async function inboxFixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-inbox-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await fixture(t); let clock = Date.parse('2026-10-21T12:00:00.000Z');
  const inbox = new LocalContentInbox({ directory: path.join(root, 'update-inbox'), store, now: () => clock,
    stableAgeMs: 100, initialDelayMs: 60000, intervalMs: 60000, watcher: inertWatcher, ...options });
  t.after(() => inbox.stop()); await inbox.prepare(); return { root, store, inbox, advance: value => { clock += value; } };
}

test('local update inbox waits for a stable signed pack, installs atomically, and archives it', async t => {
  const f = await inboxFixture(t), file = path.join(f.inbox.directory, 'new-frontier.dogpack');
  await fs.writeFile(file, signed(pack()));
  assert.equal((await f.inbox.scan()).pending, 1); assert.equal(f.store.getPacks().length, 0);
  f.advance(101); const status = await f.inbox.scan();
  assert.equal(status.installed, 1); assert.equal(status.readyToReload, true); assert.equal(f.store.getPacks()[0].version, '1.0.0');
  assert.equal((await fs.readdir(path.join(f.inbox.directory, 'processed'))).filter(name => name.endsWith('.dogpack')).length, 1);
  await assert.rejects(fs.access(file));
});

test('real filesystem watcher notices a newly copied pack and installs it without a manual scan', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-inbox-watch-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await fixture(t), inbox = new LocalContentInbox({ directory: path.join(root, 'update-inbox'), store,
    stableAgeMs: 30, initialDelayMs: 5000, intervalMs: 5000 });
  t.after(() => inbox.stop()); await inbox.start();
  await fs.writeFile(path.join(inbox.directory, 'watched.dogpack'), signed(pack()));
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline && !store.getPacks().length) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(store.getPacks()[0]?.version, '1.0.0'); assert.equal(inbox.snapshot().readyToReload, true);
});

test('local update inbox never consumes a partially written pack and defers installation in battle', async t => {
  let battle = false; const f = await inboxFixture(t, { isBattleActive: () => battle });
  const file = path.join(f.inbox.directory, 'new-frontier.dogpack'), bytes = signed(pack()), middle = Math.floor(bytes.length / 2);
  await fs.writeFile(file, bytes.subarray(0, middle)); await f.inbox.scan(); f.advance(101);
  await fs.appendFile(file, bytes.subarray(middle)); assert.equal((await f.inbox.scan()).pending, 1);
  f.advance(101); battle = true; assert.equal((await f.inbox.scan()).phase, 'deferred'); assert.equal(f.store.getPacks().length, 0);
  battle = false; assert.equal((await f.inbox.scan()).installed, 1); assert.equal(f.store.getPacks().length, 1);
});

test('automatic update preference is honored, while an explicit manual scan can install', async t => {
  const f = await inboxFixture(t, { isEnabled: () => false }), file = path.join(f.inbox.directory, 'new-frontier.dogpack');
  await fs.writeFile(file, signed(pack())); assert.equal((await f.inbox.scan()).phase, 'disabled');
  assert.equal((await f.inbox.scan({ manual: true })).pending, 1); f.advance(101);
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline && !f.store.getPacks().length) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.store.getPacks()[0]?.version, '1.0.0'); assert.equal(f.inbox.snapshot().installed, 1);
});

test('invalid inbox content is quarantined with a bounded reason and cannot change installed packs', async t => {
  const f = await inboxFixture(t), file = path.join(f.inbox.directory, 'untrusted.dogpack');
  await fs.writeFile(file, Buffer.from('{"not":"signed"}')); await f.inbox.scan(); f.advance(101);
  const status = await f.inbox.scan(), rejected = await fs.readdir(path.join(f.inbox.directory, 'rejected'));
  assert.equal(status.rejected, 1); assert.equal(f.store.getPacks().length, 0);
  assert.equal(rejected.filter(name => name.endsWith('.dogpack')).length, 1); assert.equal(rejected.filter(name => name.endsWith('.reason.json')).length, 1);
});

test('transient inbox failures use bounded backoff and stop after the configured attempt limit', async t => {
  let attempts = 0; const store = { install: async () => { attempts++; const error = new Error('disk temporarily full'); error.code = 'ENOSPC'; throw error; } };
  const f = await inboxFixture(t, { store, maxAttempts: 3 }); const file = path.join(f.inbox.directory, 'retry.dogpack');
  await fs.writeFile(file, Buffer.from('bounded')); await f.inbox.scan(); f.advance(101);
  assert.equal((await f.inbox.scan()).retrying, 1); assert.equal(attempts, 1);
  await f.inbox.scan(); assert.equal(attempts, 1);
  f.advance(1100); await f.inbox.scan(); assert.equal(attempts, 2);
  f.advance(2100); const status = await f.inbox.scan(); assert.equal(attempts, 3); assert.equal(status.rejected, 1);
  await assert.rejects(fs.access(file));
});

test('archive failure after durable install retries archive only and never re-enters replay protection', async t => {
  const f = await inboxFixture(t), file = path.join(f.inbox.directory, 'archive-retry.dogpack');
  let installs = 0, archiveAttempts = 0; const originalInstall = f.store.install.bind(f.store), originalArchive = f.inbox.archive.bind(f.inbox);
  f.store.install = (...args) => { installs++; return originalInstall(...args); };
  f.inbox.archive = (...args) => { archiveAttempts++; if (archiveAttempts === 1) { const error = new Error('busy'); error.code = 'EBUSY'; throw error; } return originalArchive(...args); };
  await fs.writeFile(file, signed(pack())); await f.inbox.scan(); f.advance(101);
  const installed = await f.inbox.scan(); assert.equal(installs, 1); assert.equal(installed.readyToReload, true); assert.equal(installed.installed, 1);
  assert.equal(f.store.getPacks()[0].version, '1.0.0'); await fs.access(file);
  f.advance(1100); await f.inbox.scan(); assert.equal(installs, 1); await assert.rejects(fs.access(file));
  assert.equal((await fs.readdir(path.join(f.inbox.directory, 'processed'))).filter(name => name.endsWith('.dogpack')).length, 1);
});

test('concurrent manual and inbox installation of the exact same signed pack archives successfully', async t => {
  const f = await inboxFixture(t), bytes = signed(pack()), file = path.join(f.inbox.directory, 'same-pack.dogpack');
  await fs.writeFile(file, bytes); await f.inbox.scan(); f.advance(101);
  let release, queued; const gate = new Promise(resolve => { release = resolve; });
  const inboxQueued = new Promise(resolve => { queued = resolve; });
  f.store.serialized(() => gate);
  const manual = f.store.install(bytes), install = f.store.install.bind(f.store);
  f.store.install = (...args) => { const pending = install(...args); queued(); return pending; };
  const scanning = f.inbox.scan(); await inboxQueued; release();
  await manual; const status = await scanning;
  assert.equal(f.store.getPacks()[0].version, '1.0.0');
  assert.equal(status.rejected, 0); assert.equal(status.readyToReload, true);
  assert.equal((await fs.readdir(path.join(f.inbox.directory, 'processed'))).filter(name => name.endsWith('.dogpack')).length, 1);
  assert.deepEqual(await fs.readdir(path.join(f.inbox.directory, 'rejected')), []);
  await assert.rejects(f.store.install(bytes), /重复安装或降级/);
});

test('inbox exposes an installation mutex for the battle-start IPC until atomic install finishes', async t => {
  let releaseInstall, markStarted; const started = new Promise(resolve => { markStarted = resolve; });
  const store = { install: () => { markStarted(); return new Promise(resolve => { releaseInstall = resolve; }); } };
  const f = await inboxFixture(t, { store }), file = path.join(f.inbox.directory, 'mutex.dogpack');
  await fs.writeFile(file, Buffer.from('signed-by-fixture-store')); await f.inbox.scan(); f.advance(101);
  const running = f.inbox.scan(); await started; assert.equal(f.inbox.isInstalling(), true);
  const mainSource = await fs.readFile(path.resolve(__dirname, '../desktop/main.cjs'), 'utf8');
  assert.match(mainSource, /store\?\.isMutating\(\)/); assert.match(mainSource, /inbox\?\.isInstalling\(\)/);
  releaseInstall(); await running; assert.equal(f.inbox.isInstalling(), false);
});

function progress(score = 0) {
  return { version: 4, records: { 'daybreak-01': { normal: { stars: score ? 2 : 0, best: score, medals: score ? 1 : 0 }, assist: { stars: 0, best: 0, medals: 0 } } }, lastLevelId: 'daybreak-01', hero: 0, loadout: 0, easy: false, sound: true, musicVolume: .7, effectsVolume: .7, reducedMotion: false };
}

test('native save backup writes fixed atomic current/previous/daily files and deduplicates', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-save-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-21T12:00:00.000Z'); const backup = new SaveBackupStore({ directory, now: () => clock });
  assert.equal((await backup.save(JSON.stringify(progress(100)))).saved, true);
  assert.equal((await backup.save(JSON.stringify(progress(100)))).deduplicated, true);
  clock += 1000; await backup.save(JSON.stringify(progress(250)));
  assert.equal((await backup.load()).source, 'current');
  assert.equal(JSON.parse((await backup.load()).json).records['daybreak-01'].normal.best, 250);
  assert.equal(JSON.parse(JSON.parse(await fs.readFile(path.join(directory, 'previous.json'), 'utf8')).data.records['daybreak-01'].normal.best), 100);
  assert.deepEqual(await fs.readdir(path.join(directory, 'daily')), ['2026-10-21.json']);
});

test('native save load chooses the freshest daily backup after current corruption and heals current', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-save-recover-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-21T12:00:00.000Z'); const backup = new SaveBackupStore({ directory, now: () => clock });
  assert.throws(() => backup.save('{bad'), /JSON/); assert.throws(() => backup.save(JSON.stringify({ version: 3, records: {} })), /第 4 版/);
  await backup.save(JSON.stringify(progress(100))); clock += 1000; await backup.save(JSON.stringify(progress(300)));
  await fs.writeFile(path.join(directory, 'current.json'), '{corrupt');
  const recovered = await backup.load(); assert.equal(recovered.source, 'daily:2026-10-21');
  assert.equal(JSON.parse(recovered.json).records['daybreak-01'].normal.best, 300);
  assert.equal((await backup.save(recovered.json)).saved, true);
  assert.equal((await backup.load()).source, 'current');
});

test('serialized native saves merge scores so a late stale request cannot erase newer progress', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-save-order-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-21T12:00:00.000Z'); const backup = new SaveBackupStore({ directory, now: () => clock });
  const newer = progress(900), older = progress(100); newer.effectsQuality = 'high'; older.effectsQuality = 'balanced';
  const first = backup.save(JSON.stringify(newer)), second = backup.save(JSON.stringify(older)); await Promise.all([first, second]);
  const loaded = JSON.parse((await backup.load()).json);
  assert.equal(loaded.records['daybreak-01'].normal.best, 900);
  assert.equal(loaded.effectsQuality, 'balanced');
  const daily = JSON.parse(await fs.readFile(path.join(directory, 'daily', '2026-10-21.json'), 'utf8'));
  assert.equal(daily.data.records['daybreak-01'].normal.best, 900);
});

test('native backup recovery bounds corrupt file reads before selecting a valid daily copy', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-save-bounded-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-21T12:00:00.000Z'); const backup = new SaveBackupStore({ directory, now: () => clock });
  await backup.save(JSON.stringify(progress(100))); clock += 1000; await backup.save(JSON.stringify(progress(500)));
  await fs.writeFile(path.join(directory, 'current.json'), Buffer.alloc(MAX_BACKUP_FILE_BYTES + 1, 65));
  const recovered = await backup.load(); assert.equal(recovered.source, 'daily:2026-10-21');
  assert.equal(JSON.parse(recovered.json).records['daybreak-01'].normal.best, 500);
});

test('same-timestamp native backups merge their best records while keeping current preferences', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dog-save-same-time-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const backup = new SaveBackupStore({ directory, now: () => Date.parse('2026-10-21T12:00:00.000Z') });
  const base = progress(100); base.effectsQuality = 'high'; await backup.save(JSON.stringify(base));
  const dailyPath = path.join(directory, 'daily', '2026-10-21.json'), daily = JSON.parse(await fs.readFile(dailyPath, 'utf8'));
  daily.data.records['daybreak-01'].normal.best = 900; daily.data.effectsQuality = 'balanced'; await fs.writeFile(dailyPath, JSON.stringify(daily));
  const recovered = JSON.parse((await backup.load()).json);
  assert.equal(recovered.records['daybreak-01'].normal.best, 900); assert.equal(recovered.effectsQuality, 'high');
});
