const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, sanitizeSave, MAX_TEAM, MAX_WEAPON, LEVELS, HEROES, PLAYER_Y } = require('../src/core.js');

function advance(game, seconds, input = {}, fps = 60) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    game.step(1 / fps, typeof input === 'function' ? input(game) : input);
    game.drainSignals();
  }
}
const {pilot: inputPilot, greedy} = require('./pilot.cjs');
// Sample decisions at 10 Hz, matching browser UAT and a plausible input cadence.
// Simulation still advances at 60 Hz; this avoids a controller oscillating every render frame.
const pilotMemory=new WeakMap();
const pilot = game => {let m=pilotMemory.get(game);if(!m){m={frame:0,input:{}};pilotMemory.set(game,m);}if(m.frame++%6===0)m.input=inputPilot(game.state);return m.input;};

test('keyboard movement has the same speed at 30, 60, and 120 fps', () => {
  const positions = [30, 60, 120].map(fps => { const g = createGame(); advance(g, .5, { axis: 1 }, fps); return g.state.x; });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1, JSON.stringify(positions));
  assert.ok(Math.abs(positions[0] - 410) < 1, 'half a second should move 240 world units');
});
test('pointer movement converges without escaping the road', () => {
  const g = createGame(); advance(g, 1, { x: 9000 }); assert.ok(g.state.x <= 497 && g.state.x > 490);
  advance(g, 1, { x: -999 }); assert.ok(g.state.x >= 103 && g.state.x < 110);
});
test('paused simulation freezes the entire battle and rejects the skill', () => {
  const g = createGame(); advance(g, 5); assert.equal(g.pause(), true);
  const before = JSON.stringify(g.state); advance(g, 20, { x: 430, skill: true });
  assert.equal(JSON.stringify(g.state), before); assert.equal(g.skill(), false);
  assert.equal(g.resume(), true); advance(g, .5); assert.ok(g.state.time > 5.4);
});
test('a gate row grants exactly one reward, even when moving across both gates', () => {
  const g = createGame();
  g.state.entities = [170, 430].map((x, i) => ({ id: i + 1, type: 'gate', group: 9, x, y: PLAYER_Y - 25, width: 186, value: 7, op: 'add', charge: 0, hit: 0, used: false }));
  g.step(1 / 60); assert.equal(g.state.team, 15);
  advance(g, .4, { x: 430 }); assert.equal(g.state.team, 15); assert.ok(g.state.entities.every(e => e.used));
});
test('shooting four times turns a negative gate upward by one', () => {
  const g = createGame();
  g.state.entities = [{ id: 1, type: 'gate', group: 1, x: 170, y: 300, width: 186, value: -1, op: 'add', charge: 0, hit: 0, used: false }];
  g.state.bullets = Array.from({ length: 4 }, () => ({ x: 170, y: 310, vy: -650, damage: 1, r: 5, friendly: true }));
  g.step(1 / 60); assert.equal(g.state.entities[0].value, 0);
});
test('multiplication gates cap the team and cannot kill it with an overflow', () => {
  const g = createGame(); g.state.team = 150;
  g.state.entities = [{ id: 1, type: 'gate', group: 1, x: 170, y: PLAYER_Y - 25, width: 186, value: 3, op: 'multiply', charge: 0, hit: 0, used: false }];
  g.step(1 / 60); assert.equal(g.state.team, MAX_TEAM); assert.equal(g.state.peakTeam, MAX_TEAM);
});
test('a lethal negative gate produces a frozen, retryable loss', () => {
  const g = createGame();
  g.state.entities = [{ id: 1, type: 'gate', group: 1, x: 170, y: PLAYER_Y - 25, width: 186, value: -10, op: 'add', charge: 0, hit: 0, used: false }];
  g.step(1 / 60); assert.equal(g.state.phase, 'lost'); assert.equal(g.state.team, 0);
  const before = g.state.time; advance(g, 5); assert.equal(g.state.time, before);
  assert.equal(createGame().state.team, 8);
});
test('one projectile is consumed by the nearest object and cannot penetrate two targets', () => {
  const g = createGame();
  g.state.entities = [300, 320].map((y, i) => ({ id: i + 1, type: 'enemy', baseX: 170, x: 170, y, hp: 10, maxHp: 10, r: 30, wobble: 0, hit: 0 }));
  g.state.bullets = [{ x: 170, y: 325, vy: -650, damage: 4, r: 5, friendly: true }];
  g.step(1 / 60); assert.equal(g.state.entities[0].hp, 10); assert.equal(g.state.entities[1].hp, 6);
});
test('skill cannot be spammed, removes hostile bullets, and recharges', () => {
  const g = createGame(); g.state.bullets = [{ x: 200, y: 100, vy: 150, r: 14, friendly: false }];
  assert.equal(g.skill(), true); assert.equal(g.skill(), false); assert.equal(g.state.bullets.length, 0);
  assert.equal(g.state.skillUses, 1); advance(g, 9.1); assert.equal(g.skill(), true);
});
test('malformed local save values are bounded and non-finite values are rejected', () => {
  const s = sanitizeSave({ version: 2, stars: [8, -4, Infinity], best: [NaN, 1e20, '12'], hero: 100, sound: false });
  assert.deepEqual(s.stars, [3, ...Array(LEVELS.length - 1).fill(0)]); assert.deepEqual(s.best, [0, 9999999, ...Array(LEVELS.length - 2).fill(0)]); assert.equal(s.hero, 1); assert.equal(s.sound, false);
  assert.deepEqual(sanitizeSave(null).stars, Array(LEVELS.length).fill(0));
});
for (let level = 0; level < LEVELS.length; level++) {
  for (let hero = 0; hero < HEROES.length; hero++) {
    test(`natural full battle: chapter ${level + 1}, captain ${hero + 1} can win without state injection`, () => {
      const g = createGame({ level, hero });
      advance(g, 200, pilot);
      assert.equal(g.state.phase, 'won'); assert.ok(g.state.team > 0 && g.state.team <= MAX_TEAM);
      assert.ok(g.state.bossSpawned); assert.ok(g.state.boss.hp <= 0); assert.ok(g.state.weapon >= 2); assert.ok(g.state.kills > 10);
      assert.ok(g.state.time < 175); assert.ok(g.state.stars >= 1);
    });
  }
  test(`chapter ${level + 1}: staying in the center without skills can lose naturally`, () => {
    const g = createGame({ level }); advance(g, 210, { x: 300 });
    assert.equal(g.state.phase, 'lost'); assert.equal(g.state.team, 0);
  });
}

test('legacy achievements stay separate while captain and sound preferences survive', () => {
  const s = sanitizeSave({version:1,stars:[3,3,3],best:[6000,6000,6000],hero:2,sound:false,easy:true});
  assert.deepEqual(s.stars,Array(LEVELS.length).fill(0));assert.deepEqual(s.best,Array(LEVELS.length).fill(0));assert.equal(s.hero,1);assert.equal(s.sound,false);assert.equal(s.easy,false);
});
test('forty-eight operations have complete routes and generous caps',()=>{
  assert.equal(LEVELS.length,48);assert.equal(MAX_TEAM,300);assert.equal(MAX_WEAPON,8);
  assert.ok(LEVELS.every(l=>l.duration>=65));assert.equal(LEVELS[7].duration,93);
});
test('mode scores are sanitized independently',()=>{
  const s=sanitizeSave({version:2,stars:[1],easyStars:[3],best:[100],easyBest:[200]});
  assert.equal(s.stars[0],1);assert.equal(s.easyStars[0],3);assert.equal(s.best[0],100);assert.equal(s.easyBest[0],200);
});
test('new gate limits are +99 and ×5',()=>{
  for(const [op,value,shots] of [['add',98,8],['multiply',4,80]]){
    const g=createGame();g.state.entities=[{id:1,type:'gate',group:99,x:170,y:300,width:186,value,op,charge:0,hit:0,used:false}];
    g.state.bullets=Array.from({length:shots},()=>({x:170,y:310,vy:-650,damage:1,r:5,friendly:true}));g.step(1/60);assert.equal(g.state.entities[0].value,op==='add'?99:5);
  }
});
test('twelve kills trigger overdrive; one target cannot count twice',()=>{
  const g=createGame();g.state.entities=Array.from({length:12},(_,i)=>({id:i+1,type:'enemy',x:170,baseX:170,y:300,hp:1,maxHp:1,r:23,hit:0,wobble:0}));
  assert.equal(g.skill(),true);assert.equal(g.state.kills,12);assert.equal(g.state.maxCombo,12);assert.equal(g.state.overdrive,4);
  g.step(1/60);assert.equal(g.state.kills,12);assert.equal(g.state.overdrives,1);
});
test('boss phase transition schedules telegraphed beams; skill clears threats',()=>{
  const g=createGame({level:7});g.state.team=300;g.state.bossSpawned=true;
  g.state.boss={x:300,y:145,hp:4000,maxHp:10000,stage:1,clock:0,shot:2,beam:4,summon:8,volleys:0,hit:0};
  g.step(1/60);assert.equal(g.state.boss.stage,2);advance(g,.85,{x:170});assert.equal(g.state.hazards.length,2);assert.ok(g.state.hazards.every(h=>h.delay>0));
  g.skill();assert.equal(g.state.hazards.length,0);assert.equal(g.state.bullets.filter(b=>!b.friendly).length,0);
});
test('beam warns before damage, hits once, and cannot act during pause',()=>{
  const g=createGame();g.state.team=100;g.state.hazards=[{x:170,width:68,delay:.3,life:.48,hit:false}];
  advance(g,.2);assert.equal(g.state.team,100);g.pause();advance(g,2);assert.equal(g.state.team,100);g.resume();advance(g,.25);assert.equal(g.state.team,82);advance(g,.3);assert.equal(g.state.team,82);
});
test('weapon upgrades stop at level eight',()=>{
  const g=createGame();g.state.weapon=8;g.state.entities=[{id:1,type:'crate',x:170,y:300,hp:1,maxHp:1,r:35,hit:0}];g.state.bullets=[{x:170,y:310,vy:-650,damage:9,r:5,friendly:true}];g.step(1/60);assert.equal(g.state.weapon,8);
});
test('tactical movement and support outperform reckless chasing on the final chapter',()=>{
  const careful=createGame({level:7}), reckless=createGame({level:7});advance(careful,210,pilot);advance(reckless,210,g=>greedy(g.state));
  assert.equal(careful.state.phase,'won');assert.equal(reckless.state.phase,'lost');assert.ok(careful.state.team>0);
});
test('long final battle keeps transient render objects bounded',()=>{
  const g=createGame({level:7});let peaks={particles:0,bullets:0,entities:0,explosions:0};
  for(let i=0;i<200*60&&g.state.phase==='playing';i++){g.step(1/60,inputPilot(g.state));g.drainSignals();for(const k of Object.keys(peaks))peaks[k]=Math.max(peaks[k],g.state[k].length);}
  assert.ok(peaks.particles<=480);assert.ok(peaks.explosions<=24);assert.ok(peaks.bullets<220,JSON.stringify(peaks));assert.ok(peaks.entities<70,JSON.stringify(peaks));
});

test('pointer response reaches a distant target within 100 ms without overshoot', () => {
  for(const fps of [30,60,120]){
    const g=createGame();advance(g,.1,{x:430},fps);
    assert.ok(g.state.x>420 && g.state.x<=430,`${fps} fps: x=${g.state.x}, expected within 10 units of pointer`);
  }
});
