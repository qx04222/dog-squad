const test=require('node:test');
const assert=require('node:assert/strict');
const {createGame,LEVELS,MAX_TEAM,PLAYER_Y,DIFFICULTY_MODES,normalizeDifficultyMode}=require('../src/core.js');
const {pilot}=require('./pilot.cjs');
const modes=['relaxed','standard','expert'];
function advance(g,seconds,fps=60,input={}){for(let i=0;i<Math.round(seconds*fps);i++)g.step(1/fps,input);}
function bossFixture(mode,clock=0){const g=createGame({difficultyMode:mode,level:7});g.state.team=600;g.state.bossSpawned=true;g.state.boss={x:300,y:145,hp:1e8,maxHp:1e8,stage:1,clock,shot:1000,beam:1000,summon:1000,volleys:0,hit:0};return g;}
function injectedHit(mode,source){const g=createGame({difficultyMode:mode,level:7});g.state.team=200;g.state.bullets=[{x:g.state.x,y:655,vy:240,vx:0,damage:40,ratio:0,r:10,friendly:false,source}];g.step(1/60);return g.state.damageTaken;}
function gate(g,value,op){g.state.entities=[{id:1,type:'gate',group:1,x:g.state.x,y:PLAYER_Y-25,width:186,value,op,charge:0,hit:0,used:false}];g.step(1/60);}

test('three frozen difficulty descriptors expose distinct record buckets and reject unknown modes',()=>{
 assert.deepEqual(DIFFICULTY_MODES.map(m=>m.id),modes);
 assert.deepEqual(DIFFICULTY_MODES.map(m=>m.recordKey),['assist','normal','expert']);
 assert.ok(Object.isFrozen(DIFFICULTY_MODES));
 for(const m of DIFFICULTY_MODES){assert.ok(m.name&&m.description);assert.ok(Object.isFrozen(m));}
 for(const bad of [undefined,null,'hard','',{},NaN])assert.equal(normalizeDifficultyMode(bad), 'standard');
 assert.equal(normalizeDifficultyMode(undefined,true),'relaxed');
 assert.equal(normalizeDifficultyMode('expert',true),'expert');
 assert.equal(normalizeDifficultyMode('standard',true),'standard');
});
test('legacy easy uses exactly the relaxed simulation while explicit difficulty overrides easy',()=>{
 const a=createGame({level:7,easy:true,seed:100}),b=createGame({level:7,difficultyMode:'relaxed',seed:100});
 for(let i=0;i<500;i++){a.step(1/60);b.step(1/60);}
 assert.deepEqual(a.state,b.state);assert.deepEqual(a.snapshot(),b.snapshot());
 for(const mode of modes){const g=createGame({level:7,difficultyMode:mode,easy:true});assert.equal(g.state.difficultyMode,mode);assert.equal(g.snapshot().difficultyMode,mode);assert.equal(g.state.difficulty,LEVELS[7].difficulty);assert.equal(g.state.easy,mode==='relaxed');}
});
test('multiplication and repair can exceed 300 but stop at 600 in every mode',()=>{
 assert.equal(MAX_TEAM,600);
 for(const mode of modes){const g=createGame({difficultyMode:mode});g.state.team=150;gate(g,3,'multiply');assert.equal(g.state.team,450);gate(g,2,'multiply');assert.equal(g.state.team,600);assert.equal(g.state.peakTeam,600);g.state.team=590;g.state.pickups=[{id:9,kind:'repair',x:g.state.x,y:PLAYER_Y-35,r:18,life:14}];g.step(1/60);assert.equal(g.state.team,600);assert.equal(g.state.phase,'playing');}
});
test('600 teammates increase shot strength without increasing projectile columns',()=>{
 for(const mode of modes){const a=createGame({difficultyMode:mode}),b=createGame({difficultyMode:mode});a.state.team=300;b.state.team=600;advance(a,.1);advance(b,.1);assert.equal(a.state.bullets.length,11);assert.equal(b.state.bullets.length,11);assert.ok(b.state.bullets[0].damage>a.state.bullets[0].damage);}
});
test('difficulty adjusts enemy HP and protection without changing deterministic spawn locations',()=>{
 const games=modes.map(difficultyMode=>createGame({level:7,difficultyMode,seed:42}));
 for(const g of games)advance(g,4.6);
 const enemySets=games.map(g=>g.state.entities.filter(e=>e.type==='enemy'));
 assert.equal(enemySets[0].length,enemySets[1].length);assert.equal(enemySets[1].length,enemySets[2].length);
 for(let i=0;i<enemySets[0].length;i++){const [a,b,c]=enemySets.map(s=>s[i]);assert.ok(a.maxHp<b.maxHp&&b.maxHp<c.maxHp);assert.equal(a.wobble,b.wobble);assert.equal(b.wobble,c.wobble);assert.equal(a.baseX,c.baseX);}
 const damage=modes.map(mode=>injectedHit(mode,'enemy'));assert.deepEqual(damage,[14,40,46]);
 assert.deepEqual(modes.map(mode=>injectedHit(mode,'boss')),[14,36,46]);
});
test('boss spawn HP, attack speed and telegraphs honor the chosen mode',()=>{
 const hp=[],speeds=[],delays=[];
 for(const mode of modes){const g=createGame({level:7,difficultyMode:mode});g.state.time=LEVELS[7].duration;g.state.invulnerable=5;g.step(1/60);hp.push(g.state.boss.maxHp);g.state.entities=[];g.state.bullets=[];g.state.boss.shot=0;g.state.boss.beam=0;g.step(1/60);speeds.push(g.state.bullets.find(b=>!b.friendly).vy);delays.push(g.state.hazards[0].delay);assert.ok(g.state.hazards.every(h=>h.delay>=.98));}
 assert.deepEqual(hp,[.64,.88,1.12].map(scale=>LEVELS[7].bossHp*scale));
 assert.ok(speeds[0]<speeds[1]&&speeds[1]<speeds[2]);assert.ok(delays[0]>delays[1]&&delays[1]>delays[2]);
});
test('pause freezes difficulty buffs, boss overtime, skills and energy in every mode',()=>{
 for(const mode of modes){const g=bossFixture(mode,81.5);g.state.buffs={rapid:4,pierce:4,magnet:4};g.state.energy=100;g.state.ultimateCharge=100;g.pause();const before=JSON.stringify(g.state);advance(g,20,60,{skill:true,tactical:true,support:true,ultimate:true,dash:true});assert.equal(g.skill(),false);assert.equal(g.tactical(),false);assert.equal(g.support(),false);assert.equal(g.ultimate(),false);assert.equal(g.dash(1),false);assert.equal(JSON.stringify(g.state),before);}
});
test('boss overtime is two warned pulses in four seconds at 20, 30, 60 and 120 fps',()=>{
 for(const mode of modes){const samples=[20,30,60,120].map(fps=>{const g=bossFixture(mode,80);let warnings=0;for(let i=0;i<fps*4;i++){g.step(1/fps);g.state.entities=[];g.state.bullets=[];warnings+=g.drainSignals().filter(s=>s.type==='bossOvertime').length;}assert.equal(warnings,1);return g.state.damageTaken;});assert.equal(new Set(samples).size,1,`${mode}: ${samples}`);assert.equal(samples[0],2*Math.round(41*(mode==='relaxed'?.34:mode==='expert'?1.15:.9)));}
});
for(const mode of modes)for(const level of [0,7,23,47])test(`natural pilot wins level ${level+1} on ${mode} without changing game state`,()=>{
 const g=createGame({level,difficultyMode:mode});let input={};let peakBullets=0,peakParticles=0;
 for(let frame=0;frame<220*60&&g.state.phase==='playing';frame++){if(frame%6===0)input=pilot(g.state);g.step(1/60,input);g.drainSignals();peakBullets=Math.max(peakBullets,g.state.bullets.length);peakParticles=Math.max(peakParticles,g.state.particles.length);}
 assert.equal(g.state.phase,'won',JSON.stringify({mode,level,team:g.state.team,bossHp:g.state.boss?.hp,time:g.state.time}));assert.ok(g.state.team>0&&g.state.team<=600);assert.ok(peakBullets<220,`${peakBullets} bullets`);assert.ok(peakParticles<=480);
});
