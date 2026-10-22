const test=require('node:test');
const assert=require('node:assert/strict');
const {createGame,HEROES,PICKUPS,APP_VERSION}=require('../src/core.js');
const {pilot}=require('./pilot.cjs');
function advance(g,seconds,input={}){for(let i=0;i<Math.ceil(seconds*60)&&g.state.phase==='playing';i++)g.step(1/60,typeof input==='function'?input(g.state):input);}
function enemy(overrides={}){return {id:91,type:'enemy',kind:'normal',x:170,baseX:170,y:300,hp:500,maxHp:500,r:23,guardHp:0,maxGuardHp:0,hit:0,wobble:0,shot:4,...overrides};}
function bullet(overrides={}){return {x:170,y:311,vx:0,vy:-650,damage:10,r:5,friendly:true,kind:'pulse',charged:false,pierce:0,hitIds:[],...overrides};}

test('v6 preserves complete hero ability and seven-pickup contracts',()=>{
  assert.equal(APP_VERSION,require('../package.json').version);assert.equal(Object.keys(PICKUPS).length,7);
  assert.deepEqual(Object.keys(PICKUPS).sort(),['battery','magnet','nova','pierce','rapid','repair','shield']);
  for(const meta of Object.values(PICKUPS))for(const key of ['name','color','detail'])assert.ok(meta[key]);
  for(const hero of HEROES){for(const key of ['tactical','tacticalDetail','ultimate','ultimateDetail'])assert.ok(hero[key]);assert.equal(hero.tacticalCooldown,14);}
});

test('Ramen time field slows enemies and hostile shots and applies vulnerability',()=>{
  const slowed=createGame({hero:0,seed:7}),plain=createGame({hero:0,seed:7});
  slowed.state.entities=[enemy()];plain.state.entities=[enemy()];
  slowed.state.bullets=[{x:300,y:100,vx:30,vy:200,damage:1,r:5,friendly:false,kind:'hostile'}];
  plain.state.bullets=[{x:300,y:100,vx:30,vy:200,damage:1,r:5,friendly:false,kind:'hostile'}];
  assert.equal(slowed.tactical(),true);slowed.step(.05);plain.step(.05);
  assert.ok(slowed.state.entities[0].y<plain.state.entities[0].y);
  assert.ok(slowed.state.bullets.find(b=>!b.friendly).y<plain.state.bullets.find(b=>!b.friendly).y);
  slowed.state.entities[0].y=300;plain.state.entities[0].y=300;
  slowed.state.bullets=[bullet()];plain.state.bullets=[bullet()];slowed.step(1/60);plain.step(1/60);
  assert.ok(slowed.state.entities[0].hp<plain.state.entities[0].hp);
  assert.equal(slowed.tactical(),false);assert.equal(slowed.state.tacticalUses,1);
});

test('Bing Bong tactical volley is charged, explosive and explicitly piercing',()=>{
  const g=createGame({hero:1});assert.equal(g.tactical(),true);
  const volley=g.state.bullets.filter(b=>b.kind==='armorBurst');assert.equal(volley.length,9);
  assert.ok(volley.every(b=>b.charged&&b.pierce===3&&b.damage>20));
  const snap=g.snapshot();assert.equal(snap.friendlyProjectiles.filter(b=>b.kind==='armorBurst').length,9);
  assert.equal(snap.tacticalUses,1);assert.ok(snap.skillEffects.some(e=>e.kind==='armorVolley'));
});

test('ultimate begins empty, charges only while playing, spends once, and differs by hero',()=>{
  for(const hero of [0,1]){
    const g=createGame({hero});assert.equal(g.state.ultimateCharge,0);assert.equal(g.ultimate(),false);
    g.state.ultimateCharge=100;assert.equal(g.ultimate(),true);assert.equal(g.state.ultimateCharge,0);assert.equal(g.ultimate(),false);
    assert.equal(g.state.ultimateUses,1);assert.ok(g.state.skillEffects.some(e=>e.kind===(hero===0?'orbitalBeam':'bombardment')));
    g.pause();g.state.ultimateCharge=100;const before=JSON.stringify(g.state);assert.equal(g.ultimate(),false);advance(g,2);assert.equal(JSON.stringify(g.state),before);
  }
  const terminal=createGame();terminal.state.phase='won';terminal.state.ultimateCharge=100;assert.equal(terminal.ultimate(),false);assert.equal(terminal.state.ultimateCharge,100);
});

test('real projectile hits and kills charge the ultimate without exceeding 100',()=>{
  const g=createGame();g.state.entities=[enemy({hp:12,maxHp:12})];g.state.bullets=[bullet({damage:20})];g.step(1/60);
  assert.equal(g.state.kills,1);assert.ok(g.state.ultimateCharge>2&&g.state.ultimateCharge<5);
  g.state.ultimateCharge=99.9;g.state.entities=[enemy({id:92,hp:100,maxHp:100})];g.state.bullets=[bullet({damage:20})];g.step(1/60);assert.equal(g.state.ultimateCharge,100);
});

test('all pickups collect separately from bullets and publish named signals',()=>{
  for(const kind of Object.keys(PICKUPS)){
    const g=createGame();g.state.team=50;g.state.energy=0;g.state.ultimateCharge=0;
    const target=enemy({hp:300,maxHp:300});g.state.entities=[target];g.state.pickups=[{id:500,x:g.state.x,y:628,r:18,kind,...PICKUPS[kind],life:10}];
    g.step(1/60);assert.equal(g.state.pickups.length,0,kind);
    const signal=g.drainSignals().find(s=>s.type==='pickup');assert.equal(signal.kind,kind);assert.equal(signal.name,PICKUPS[kind].name);
    if(kind==='repair')assert.equal(g.state.team,68);
    if(kind==='shield')assert.equal(g.state.shield,35);
    if(['rapid','pierce','magnet'].includes(kind))assert.ok(g.state.buffs[kind]>7);
    if(kind==='battery'){assert.ok(g.state.energy>=35&&g.state.energy<35.1);assert.equal(g.state.ultimateCharge,15);}
    if(kind==='nova')assert.ok(target.hp<300);
  }
  const g=createGame();g.state.pickups=[{id:1,x:300,y:300,r:18,kind:'repair',...PICKUPS.repair,life:10}];g.state.bullets=[bullet({x:300,y:311})];g.step(1/60);assert.equal(g.state.pickups.length,1);assert.equal(g.state.bullets.length,1,'bullet passes through the independent pickup layer');
});

test('campaign guarantees an early deterministic pickup and loot seed is replayable',()=>{
  const a=createGame({seed:123}),b=createGame({seed:123});advance(a,10.1);advance(b,10.1);
  assert.deepEqual(a.snapshot().pickups,b.snapshot().pickups);assert.ok(a.state.pickups.some(p=>p.kind==='battery'));
  assert.notDeepEqual(createGame({seed:124}).state.lootSeed,a.state.lootSeed);
});

test('max HP sets stable body scale while damage only changes the visual ratio',()=>{
  const g=createGame({level:5});advance(g,4.6);const enemies=g.snapshot().entities.filter(e=>e.type==='enemy');
  assert.ok(enemies.some(e=>e.sizeTier==='compact'));assert.ok(enemies.some(e=>e.sizeTier==='heavy'||e.sizeTier==='titan'));
  const elite=enemies.find(e=>e.eliteVariant);assert.ok(elite);assert.ok(elite.maxHp>0);assert.ok(elite.maxGuardHp>=0);
  const raw=g.state.entities.find(e=>e.id===elite.id),scale=raw.visualScale,r=raw.r;raw.hp*=.1;
  const damaged=g.snapshot().entities.find(e=>e.id===elite.id);assert.equal(damaged.visualScale,scale);assert.equal(damaged.r,r);assert.ok(damaged.damageRatio>.89);
});

test('pure effects use a separate random stream from later enemy spawning',()=>{
  const noisy=createGame({seed:812}),quiet=createGame({seed:812});
  noisy.state.entities=Array.from({length:4},(_,i)=>enemy({id:100+i,x:120+i*80,baseX:120+i*80,hp:1,maxHp:1}));noisy.skill();
  noisy.state.entities=[];quiet.state.entities=[];advance(noisy,4.6);advance(quiet,4.6);
  const shape=g=>g.state.entities.filter(e=>e.type==='enemy').map(e=>[e.kind,e.wobble,e.shot]);
  assert.deepEqual(shape(noisy),shape(quiet));
});

test('new render queues and pickups stay bounded in a full high-level battle',()=>{
  const g=createGame({level:23,seed:5});let peaks={pickups:0,impacts:0,skillEffects:0};let input={};
  for(let frame=0;frame<190*60&&g.state.phase==='playing';frame++){
    if(frame%6===0)input=pilot(g.state);g.step(1/60,input);g.drainSignals();for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],g.state[key].length);
  }
  assert.equal(g.state.phase,'won');assert.ok(peaks.pickups<=12,JSON.stringify(peaks));assert.ok(peaks.impacts<=32,JSON.stringify(peaks));assert.ok(peaks.skillEffects<=24,JSON.stringify(peaks));
});
