const test=require('node:test'),assert=require('node:assert/strict');
const {createGame,PLAYER_Y}=require('../src/core.js');
const {projectileStyle,enemyScale}=require('../src/battle-vfx.js');
test('real pickup buffs select distinct projectile visuals without overriding tactical burst',()=>{
 for(const kind of ['rapid','pierce']){
  const g=createGame();g.state.pickups=[{id:100,kind,x:g.state.x,y:PLAYER_Y-35,r:18,life:4}];
  for(let i=0;i<10;i++)g.step(1/60);
  const b=g.state.bullets.find(b=>b.friendly);assert.ok(b);assert.equal(projectileStyle(b).kind,kind);
 }
 const g=createGame({hero:1});g.tactical();assert.equal(projectileStyle(g.state.bullets[0]).kind,'burst');
 assert.equal(projectileStyle({kind:'overdrive',friendly:true,charged:true}).kind,'plasma');
 assert.equal(projectileStyle({kind:'hostile',friendly:false,charged:true}).kind,'enemy');
});
test('max health visual scale stays fixed during damage and actual impact values are finite',()=>{
 const g=createGame();const enemy={id:100,type:'enemy',kind:'tank',baseX:170,x:170,y:320,hp:100,maxHp:100,r:32,hit:0,wobble:0,visualScale:1.14};g.state.entities=[enemy];
 const before=enemyScale(enemy);g.state.bullets=[{x:170,y:325,vy:-650,damage:4,r:5,friendly:true}];g.step(1/60);
 assert.equal(enemyScale(enemy),before);assert.equal(g.state.impacts[0].damage,4);assert.ok(Number.isFinite(g.state.impacts[0].damage));
});
