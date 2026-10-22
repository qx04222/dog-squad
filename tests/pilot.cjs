// Verification pilot: reads public battle information and supplies movement/skill input only.
function pilot(s) {
  let aim = s.boss ? s.boss.x : 170;
  const gates = s.entities.filter(e => e.type === 'gate' && !e.used && e.y > 40).sort((a,b) => b.y-a.y);
  const crate = s.entities.filter(e => e.type === 'crate' && e.y > 30).sort((a,b) => b.y-a.y)[0];
  const pickup = (s.pickups||[]).filter(p=>p.y>80).sort((a,b)=>b.y-a.y)[0];
  const enemies = s.entities.filter(e => e.type === 'enemy' && e.y > 40).sort((a,b) => b.y-a.y);
  if (!s.boss) {
    if (enemies[0]) aim = enemies[0].x;
    if (crate) aim = crate.x;
    if(pickup&&pickup.y>300)aim=pickup.x;
    if (gates.length && (!crate || gates[0].y > crate.y || gates[0].y > 490)) {
      const row = gates.filter(e => e.group === gates[0].group);
      row.sort((a,b) => (b.op === 'multiply' ? s.team*(b.value-1) : b.value) - (a.op === 'multiply' ? s.team*(a.value-1) : a.value));
      aim = row[0].x;
    }
  }
  const projectiles = s.projectiles || s.bullets.filter(b => !b.friendly);
  const hazards = s.hazards || [];
  let bestX = aim, bestScore = -Infinity;
  for (let x = 104; x <= 496; x += 7) {
    let score = -Math.abs(x - aim) * .5 - Math.abs(x-s.x) * .06;
    for (const b of projectiles) {
      const time = (663-b.y)/(b.vy || 250), hitX = b.x+(b.vx||0)*time;
      if (time > -.1 && time < .85) score -= Math.max(0, 53-Math.abs(x-hitX)) * 9 * (1-time*.65);
    }
    for (const h of hazards) if (h.delay < .85) score -= Math.max(0,h.width/2+36-Math.abs(x-h.x))*13;
    for (const e of s.entities) if ((e.type === 'rock' || e.type === 'enemy') && e.y > 535 && e.y < 705) score -= Math.max(0,70-Math.abs(x-e.x)) * (e.type === 'rock' ? 12 : 4);
    if (score > bestScore) { bestScore=score;bestX=x; }
  }
  const danger = hazards.some(h => h.delay < .3 && Math.abs(s.x-h.x)<h.width/2+30);
  const projectileThreat=projectiles.some(b=>{const time=(663-b.y)/(b.vy||250),hitX=b.x+(b.vx||0)*time;return time>0&&time<.28&&Math.abs(s.x-hitX)<42;});
  return { x: bestX, dash:s.dashCharges>0&&(danger||projectileThreat)&&Math.abs(bestX-s.x)>45, support:s.energy>=60&&s.supportCooldown<=0&&(Boolean(s.boss)||enemies.filter(e=>e.y>220).length>=5), skill: s.cooldown < .01 && (Boolean(s.boss) || danger || enemies.filter(e=>e.y>230 && e.y<600).length>=5), tactical:s.tacticalCooldown<=0&&(Boolean(s.boss)||enemies.filter(e=>e.y>180).length>=6),ultimate:s.ultimateCharge>=100&&(Boolean(s.boss)||enemies.length>=8) };
}
function greedy(s) {
  if (s.boss) return { x:s.boss.x,skill:s.cooldown<.01 };
  const gates=s.entities.filter(e=>e.type==='gate'&&!e.used&&e.y>80).sort((a,b)=>b.y-a.y);
  if(gates.length){const row=gates.filter(e=>e.group===gates[0].group);row.sort((a,b)=>(b.op==='multiply'?s.team*(b.value-1):b.value)-(a.op==='multiply'?s.team*(a.value-1):a.value));return{x:row[0].x};}
  const crate=s.entities.filter(e=>e.type==='crate'&&e.y>70).sort((a,b)=>b.y-a.y)[0];if(crate)return{x:crate.x};
  const enemies=s.entities.filter(e=>e.type==='enemy'&&e.y>50).sort((a,b)=>b.y-a.y);
  return{x:enemies[0]?.x||170,skill:s.cooldown<.01&&enemies.filter(e=>e.y>350).length>=3};
}
module.exports={pilot,greedy};
