const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/progress.js');
const { levels } = require('../content/builtin.json');
test('v3 achievements migrate all eight standard and assisted records plus preferences', () => {
  const old = { version:2, stars:[3,2,1,2,3,1,2,3], best:[1,2,3,4,5,6,7,8], medals:[3,2,1,2,3,1,2,3], easyStars:[1,1,1,2,2,2,3,3], easyBest:[9,8,7,6,5,4,3,2], easyMedals:[3,3,3,2,2,2,1,1], hero:1,loadout:2,easy:true,sound:false };
  const s = P.normalize(old, levels);
  for(const k of ['stars','best','medals','easyStars','easyBest','easyMedals']) { assert.deepEqual(s[k].slice(0,8),old[k]); assert.equal(s[k].length,48);assert.ok(s[k].slice(8).every(v=>v===0)); }
  assert.equal(s.hero,1);assert.equal(s.loadout,2);assert.equal(s.easy,true);assert.equal(s.sound,false);
  assert.equal(old.version,2);
});
test('new chapter grades persist by stable ID through reordering, removal, and reinstall',()=>{
  const s=P.normalize(null,levels);s.stars[23]=3;s.medals[23]=3;s.easyBest[18]=30000;
  const disk=JSON.parse(JSON.stringify(P.capture(s,levels))), reversed=[...levels].reverse();
  const moved=P.normalize(disk,reversed);const old24=reversed.findIndex(l=>l.id===levels[23].id),old19=reversed.findIndex(l=>l.id===levels[18].id);assert.equal(moved.stars[old24],3);assert.equal(moved.medals[old24],3);assert.equal(moved.easyBest[old19],30000);
  const absent=P.normalize(disk,levels.slice(0,8));const restored=P.normalize(P.capture(absent,levels.slice(0,8)),levels);assert.equal(restored.medals[23],3);
});
test('save export import roundtrip merges scores without lowering existing records',()=>{
  const a=P.normalize(null,levels),b=P.normalize(null,levels);a.stars[0]=3;a.best[0]=10000;b.stars[0]=1;b.best[0]=12000;b.easyMedals[23]=3;
  const imported=P.importSave(JSON.stringify(P.exportSave(b,levels)),a,levels);assert.equal(imported.stars[0],3);assert.equal(imported.best[0],12000);assert.equal(imported.easyMedals[23],3);
  assert.equal(P.normalize(P.capture(imported,levels),levels).easyMedals[23],3);
});
test('invalid imports reject before altering current progress; hostile keys cannot pollute prototypes',()=>{
  const current=P.normalize(null,levels),before=JSON.stringify(current);
  for(const str of ['{','{}',JSON.stringify({format:'dog-squad-save',schema:1,data:{version:4}}),' '.repeat(1024*1024+1)]) assert.throws(()=>P.importSave(str,current,levels));
  assert.equal(JSON.stringify(current),before);
  const s=P.normalize(JSON.parse('{"version":4,"records":{"__proto__":{"normal":{"stars":3}},"constructor":{"normal":{"stars":3}}}}'),levels);
  assert.equal({}.stars,undefined);assert.equal(Object.getPrototypeOf(s.records),null);
});
test('all supported 2072 active level records and removed-pack history survive reload',()=>{
  const ls=Array.from({length:2200},(_,i)=>({id:'history-'+i})),s=P.normalize(null,ls);s.stars[2199]=3;s.medals[2071]=3;s.easyBest[1200]=98765;
  const r=P.normalize(JSON.parse(JSON.stringify(P.capture(s,ls))),ls);assert.equal(r.stars[2199],3);assert.equal(r.medals[2071],3);assert.equal(r.easyBest[1200],98765);
});
