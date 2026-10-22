const test=require('node:test'),assert=require('node:assert/strict');
const {validatePack,compareVersions}=require('../src/content.js');
const source=require('../content/builtin.json');
test('complete campaign has 48 stable IDs, six populated acts, story and bounded star targets',()=>{
  const p=validatePack(source);assert.equal(p.levels.length,48);assert.equal(p.acts.length,6);
  for(const a of p.acts)assert.equal(p.levels.filter(l=>l.act===a.id).length,8);
  assert.equal(new Set(p.levels.map(l=>l.id)).size,48);
  assert.ok(p.levels.every(l=>l.star3<=300&&l.difficulty<=7&&l.dialogue.length>=3&&l.transmissions.length>=3&&l.archive.text.length>40));
  assert.deepEqual(p.levels.slice(0,8).map(l=>l.difficulty),[0,1,2,3,4,5,6,7]);
});
test('pack schema rejects script injection, unknown fields, foreign IDs, duplicate IDs and impossible gameplay numbers',()=>{
  const invalid=[p=>p.script='evil()',p=>p.levels[0].name='<img src=x>',p=>p.levels[1].id=p.levels[0].id,p=>p.levels[0].id='other-01',p=>p.levels[0].duration=NaN,p=>p.levels[0].difficulty=99,p=>p.levels[0].star3=301,p=>p.levels[0].transmissions[1].at=.1,p=>p.levels[0].mechanic='eval',p=>p.minAppVersion='7.0.0',p=>p.levels[0].sea='url(https://bad.test)'];
  for(const mutate of invalid){const p=structuredClone(source);mutate(p);assert.throws(()=>validatePack(p));}
});
test('versions compare numerically and reject ambiguities',()=>{assert.equal(compareVersions('4.10.0','4.9.9'),1);assert.equal(compareVersions('4.0.0','4.0.0'),0);for(const s of ['04.0.0','4.0','4.0.0-beta','-1.0.0'])assert.throws(()=>compareVersions(s,'4.0.0'));});

test('content authoring and runtime agree with the shipped app version',()=>{assert.equal(require('../src/content.js').APP_VERSION,require('../package.json').version);const p=structuredClone(source);p.minAppVersion='6.0.0';assert.equal(validatePack(p).minAppVersion,'6.0.0');assert.throws(()=>validatePack(p,{appVersion:'5.0.0'}));});
