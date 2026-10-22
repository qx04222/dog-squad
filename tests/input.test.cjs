const test=require('node:test'),assert=require('node:assert/strict');
const {createPointerInput}=require('../src/input.js');
const {createGame}=require('../src/core.js');
const bounds={left:50,width:600};
const event=(id,type,clientX,x=170,b=bounds)=>({id,type,clientX,x,bounds:b});
test('touch-down anchors to the squad instead of snapping to the finger',()=>{
  const p=createPointerInput();assert.equal(p.begin(event(2,'touch',540)),170);
  assert.equal(p.move(event(2,'touch',540)),170);
  assert.ok(Math.abs(p.move(event(2,'touch',590))-225)<1);
});
test('dragging has equivalent world movement at mobile and desktop canvas sizes',()=>{
  const results=[300,600,900].map(width=>{const p=createPointerInput();p.begin(event(2,'touch',100,170,{left:0,width}));return p.move(event(2,'touch',100+width*.1,170,{left:0,width}));});
  assert.ok(Math.max(...results)-Math.min(...results)<.00001);
});
test('secondary pointers cannot steal movement or cancel the first finger',()=>{
  const p=createPointerInput();p.begin(event(2,'touch',200));assert.equal(p.begin(event(3,'touch',500)),null);assert.equal(p.move(event(3,'touch',600)),null);assert.equal(p.end(3,250),null);assert.equal(p.owns(2),true);assert.ok(p.move(event(2,'touch',230))>170);
});
test('reversing a drag at a road edge responds immediately without overshoot debt',()=>{
  const p=createPointerInput();p.begin(event(2,'touch',100));assert.equal(p.move(event(2,'touch',1000)),497);assert.ok(p.move(event(2,'touch',990))<490);
});
test('release and cancel freeze at the current squad position and reject stale moves',()=>{
  const p=createPointerInput();p.begin(event(2,'touch',200));p.move(event(2,'touch',400));assert.equal(p.end(2,240),240);assert.equal(p.dragging(),false);assert.equal(p.move(event(2,'touch',600)),null);assert.equal(p.begin(event(3,'touch',500,240)),240);p.clear();assert.equal(p.move(event(3,'touch',600)),null);
});
test('mouse hover keeps absolute steering with road bounds',()=>{
  const p=createPointerInput();assert.equal(p.move(event(1,'mouse',350)),300);assert.equal(p.move(event(1,'mouse',10000)),497);assert.equal(p.move(event(1,'mouse',-10000)),103);
});
test('invalid pointer geometry does not contaminate movement',()=>{
  const p=createPointerInput();assert.equal(p.begin(event(2,'touch',NaN)),null);assert.equal(p.move(event(1,'mouse',250,170,{left:0,width:0})),null);
});
test('skill accepts an early press near readiness, fires once, and clears on pause',()=>{
  const g=createGame();g.state.cooldown=.18;assert.equal(g.requestSkill(),true);assert.equal(g.state.skillUses,0);
  for(let n=0;n<20;n++)g.step(1/60);assert.equal(g.state.skillUses,1);assert.equal(g.requestSkill(),false);
  g.state.cooldown=.15;g.requestSkill();g.pause();assert.equal(g.state.skillBuffer,0);g.resume();for(let n=0;n<20;n++)g.step(1/60);assert.equal(g.state.skillUses,1);
});
test('pause cancels residual pointer chasing',()=>{
  const g=createGame();g.step(1/120,{x:497});g.pause();const x=g.state.x;g.resume();g.step(1/60);assert.equal(g.state.x,x);
});
