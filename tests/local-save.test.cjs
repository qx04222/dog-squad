const test = require('node:test');
const assert = require('node:assert/strict');
const Progress = require('../src/progress.js');
const levels = [{ id: 'daybreak-01' }];
function storage() { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k,v) => m.set(k,v), m }; }
test('a corrupt local primary recovers the previous achieved result without clearing it', () => {
  const db = storage(), save = Progress.normalize(null, levels);
  save.stars[0] = 2; save.best[0] = 12000;
  Progress.writeLocal(db, save, levels); save.musicVolume = .2; Progress.writeLocal(db, save, levels);
  db.setItem('dog-squad-v4', '{broken');
  const result = Progress.readLocal(db, levels);
  assert.equal(result.recovered, true); assert.equal(result.save.stars[0], 2); assert.equal(result.save.best[0], 12000);
  Progress.writeLocal(db, result.save, levels);
  assert.equal(Progress.readLocal(db, levels).save.best[0], 12000);
});
test('invalid shape falls back and a valid primary takes precedence over older preferences', () => {
  const db=storage(); db.setItem('dog-squad-v4', JSON.stringify({version:4,records:[]}));
  db.setItem('dog-squad-v4-previous', JSON.stringify({version:4,records:{},hero:1}));
  const r=Progress.readLocal(db,levels); assert.equal(r.recovered,true);assert.equal(r.save.hero,1);
  const newer=Progress.normalize({version:4,records:{},hero:0,combatText:false,effectsQuality:'high'},levels);
  Progress.writeLocal(db,newer,levels);
  const next=Progress.readLocal(db,levels); assert.equal(next.recovered,false);assert.equal(next.save.hero,0);assert.equal(next.save.combatText,false);assert.equal(next.save.effectsQuality,'high');
});
test('backup quota failure does not suppress a primary save and primary errors remain visible', () => {
  const db=storage(), save=Progress.normalize(null,levels), original=db.setItem;
  db.setItem=(key,v)=>{if(key.endsWith('-previous'))throw Error('quota');original(key,v);};
  Progress.writeLocal(db,save,levels);assert.ok(db.getItem('dog-squad-v4'));
  db.setItem=()=>{throw Error('blocked');};assert.throws(()=>Progress.writeLocal(db,save,levels),/blocked/);
});
