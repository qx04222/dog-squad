'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Progress = require('../src/progress.js');
const levels = require('../content/builtin.json').levels;

test('public 1.0 preserves legacy 6.0 scores, builds and stable save format', () => {
  const original = {version:4,lastLevelId:'daybreak-25',hero:1,loadout:7,records:{'daybreak-24':{normal:{stars:3,best:12800,medals:2},assist:{stars:1,best:500,medals:0}}}};
  const save = Progress.normalize(original, levels);
  assert.equal(save.version, 4);
  assert.equal(save.lastLevelId, 'daybreak-25');
  assert.equal(save.stars[23], 3);
  assert.equal(save.best[23], 12800);
  assert.equal(save.loadout, 7);
  assert.deepEqual(save.storySeen, []);
  assert.deepEqual(Progress.normalize(Progress.capture(save, levels), levels).records['daybreak-24'], original.records['daybreak-24']);
});

test('story reading survives local save and merge without deleting existing chapters', () => {
  const save = Progress.normalize({version:4,records:{},storySeen:['prologue','chapter:harbor:opening']},levels);
  const incoming = {format:'dog-squad-save',schema:1,data:{version:4,records:{},storySeen:['epilogue','prologue']}};
  const merged = Progress.importSave(JSON.stringify(incoming), save, levels);
  assert.deepEqual(merged.storySeen, ['prologue','chapter:harbor:opening','epilogue']);
  const values = new Map(), storage = {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  Progress.writeLocal(storage,merged,levels);
  assert.deepEqual(Progress.readLocal(storage,levels).save.storySeen, merged.storySeen);
  assert.ok(values.has('dog-squad-v4'));
});

test('story flags are bounded data and cannot retain markup or arbitrary objects', () => {
  const save=Progress.normalize({version:4,records:{},storySeen:['prologue','prologue','<script>',null,{},...Array.from({length:200},(_,i)=>`chapter:act-${i}:opening`)]},levels);
  assert.equal(save.storySeen.length,128);
  assert.equal(save.storySeen.at(-1),'chapter:act-199:opening');
  assert.ok(save.storySeen.every(value=>typeof value==='string'&&!value.includes('<')));
});

test('new story completion survives a full 128-entry imported history', () => {
  const save=Progress.normalize({version:4,records:{},storySeen:Array.from({length:128},(_,i)=>`chapter:old-${i}:opening`)},levels);
  save.storySeen.push('prologue');
  const captured=Progress.capture(save,levels);
  assert.equal(captured.storySeen.length,128);
  assert.equal(captured.storySeen.at(-1),'prologue');
  assert.ok(Progress.normalize(captured,levels).storySeen.includes('prologue'));
});
