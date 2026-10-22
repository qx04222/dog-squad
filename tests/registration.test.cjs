const test = require('node:test');
const assert = require('node:assert/strict');
const Builtin = require('../content/builtin.json');
const { LEVELS, registerPack, createGame } = require('../src/core.js');
function pack(id, version = '1.0.0', count = 1) {
  const act = `${id}-act`;
  return { ...structuredClone(Builtin), id, version, acts: [{ ...Builtin.acts[0], id: act }], levels: Array.from({ length: count }, (_, index) => ({ ...structuredClone(Builtin.levels[0]), id: `${id}-${index + 1}`, act })) };
}

test('validated packs extend the existing catalog reference, update in place, and never duplicate same versions', () => {
  const ref = LEVELS, initial = LEVELS.length;
  const first = pack('test-signal');
  assert.equal(registerPack(first), 1);
  assert.strictEqual(LEVELS, ref);
  assert.equal(LEVELS.length, initial + 1);
  assert.equal(LEVELS[initial].id, 'test-signal-1');
  assert.equal(LEVELS[initial].packId, 'test-signal');
  assert.equal(registerPack(first), 0);
  assert.equal(LEVELS.length, initial + 1);
  registerPack(pack('test-orbit'));
  const changed = pack('test-signal', '1.1.0', 2); changed.levels[0].name = '更新后的关卡';
  assert.equal(registerPack(changed), 1);
  assert.equal(LEVELS.length, initial + 3);
  assert.equal(LEVELS[initial].name, '更新后的关卡');
  assert.equal(LEVELS[initial + 1].id, 'test-signal-2');
  assert.equal(LEVELS[initial + 2].id, 'test-orbit-1');
  assert.equal(createGame({ level: initial }).snapshot().levelId, 'test-signal-1');
  changed.levels[0].name = '调用方后续改动';
  assert.equal(LEVELS[initial].name, '更新后的关卡');
  assert.equal(registerPack(pack('test-signal', '1.2.0', 1)), 0);
  assert.equal(LEVELS.length, initial + 2);
  assert.equal(LEVELS[initial + 1].id, 'test-orbit-1');
});

test('downgrades, built-in replacements, invalid content, and conflicting level IDs fail without mutations', () => {
  const snapshot = JSON.stringify(LEVELS);
  assert.throws(() => registerPack(pack('test-signal', '1.0.0')), /旧版本/);
  assert.throws(() => registerPack(Builtin), /内置战役/);
  const invalid = pack('test-invalid'); invalid.levels[0].difficulty = 999;
  assert.throws(() => registerPack(invalid), /超出范围/);
  const collision = pack('test-collision'); collision.levels[0].id = Builtin.levels[0].id;
  assert.throws(() => registerPack(collision), /归属|冲突/);
  assert.equal(JSON.stringify(LEVELS), snapshot);
});
