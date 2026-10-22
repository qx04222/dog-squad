'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const story = require('../src/story-content.js');
const campaign = require('../content/builtin.json');

test('story reader data covers the six campaign chapters in order', () => {
  assert.deepEqual(story.chapters.map(chapter => chapter.id), campaign.acts.map(act => act.id));
  assert.equal(story.prologue.lines.length, 5);
  assert.ok(story.epilogue.lines.length >= 5);
  for (const chapter of story.chapters) {
    assert.ok(chapter.summary.length >= 35, `${chapter.id} summary`);
    assert.ok(chapter.opening.length >= 3, `${chapter.id} opening`);
    assert.ok(chapter.ending.length >= 4, `${chapter.id} ending`);
    for (const line of [...chapter.opening, ...chapter.ending]) {
      assert.equal(typeof line.speaker, 'string');
      assert.equal(typeof line.text, 'string');
      assert.ok(line.speaker && line.text);
    }
  }
});

test('getChapter returns an isolated copy and unknown IDs return null', () => {
  const chapter = story.getChapter('aurora');
  assert.equal(chapter.id, 'aurora');
  chapter.opening[0].text = 'changed';
  assert.notEqual(story.getChapter('aurora').opening[0].text, 'changed');
  assert.equal(story.getChapter('not-a-chapter'), null);
});

test('character codex establishes the two leads and finale ensemble', () => {
  const ids = new Set(story.characters.map(character => character.id));
  for (const id of ['ramen', 'bing-bong', 'suisui', 'aji', 'yao', 'lighthouse']) assert.ok(ids.has(id), id);
  assert.match(story.characters.find(character => character.id === 'ramen').description, /负责/);
  assert.match(story.characters.find(character => character.id === 'bing-bong').description, /零件/);
});
