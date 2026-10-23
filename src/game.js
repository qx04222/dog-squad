(async function () {
  'use strict';
  const contentPacks = [window.DogBuiltin], startupWarnings = [];
  if (window.dogDesktop) {
    try { for (const p of await window.dogDesktop.getPacks()) { try { window.Mochi.registerPack(p); contentPacks.push(p); } catch(error){startupWarnings.push('章节 '+(p.title||p.id)+' 未载入：'+error.message);} } }
    catch (error) { startupWarnings.push('扩展章节未载入，内置故事仍可游玩。' + error.message); }
  }
  const { W, H, PLAYER_Y, LEVELS, HEROES, LOADOUTS, ENEMIES, PICKUPS, missionResults, createGame, sanitizeSave, clamp } = window.Mochi;
  const $ = id => document.getElementById(id);
  const VFX = window.DogVFX, Motion = window.DogMotion, Growth = window.DogProgression, Expedition = window.DogExpeditionUI, Story = window.DogStoryUI;
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let reducedMotion = systemReducedMotion;
  const SAVE_KEY = 'dog-squad-v4';
  let save, storageWorks = true, nativeSaveWorks = false, diskSaveTimer = null;
  let loaded;
  try { loaded = window.DogProgress.readLocal(localStorage, LEVELS); }
  catch { loaded = {save:window.DogProgress.normalize(null,LEVELS),storageWorks:false}; }
  save = loaded.save; storageWorks = loaded.storageWorks;
  if (loaded.recovered) startupWarnings.push('已从上一份本地存档恢复行动记录。');
  if (window.dogDesktop?.loadProgress) {
    try {
      const disk = await window.dogDesktop.loadProgress();
      if (disk.found && disk.json) {
        const raw = JSON.parse(disk.json), data = raw.format === 'dog-squad-save' ? raw.data : raw;
        if (!loaded.source) save = window.DogProgress.normalize(data, LEVELS);
        else {
          const preferences = Object.fromEntries(['hero','loadout','easy','sound','musicVolume','effectsVolume','reducedMotion','combatText','effectsQuality','lastLevelId','captainBuilds'].map(key=>[key,save[key]]));
          save = window.DogProgress.importSave(JSON.stringify({format:'dog-squad-save',schema:1,data}), save, LEVELS);
          Object.assign(save,preferences);
        }
        nativeSaveWorks = true;
        if (!loaded.source || disk.source !== 'current') startupWarnings.push('已核对本机文件备份，行动记录已恢复。');
      }
    } catch { startupWarnings.push('本机备份暂不可读，现有本地成绩仍保留。'); }
  }
  reducedMotion = systemReducedMotion || save.reducedMotion;
  document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const acts = contentPacks.flatMap(pack => pack.acts.map(a => ({...a, packId:pack.id, key:pack.id+':'+a.id})));
  const levelActs = new Map(contentPacks.flatMap(p=>p.levels.map(l=>[l.id,p.id+':'+l.act])));
  const actFor = l => acts.find(a => a.key===levelActs.get(l.id));
  let activeAct = actFor(LEVELS.find(l=>l.id===save.lastLevelId)||LEVELS[0]).key;
  $('act-tabs').innerHTML = acts.map((a,i)=>`<button class="act-tab" data-act="${a.key}" aria-pressed="false"><span>${String(i+1).padStart(2,'0')}</span><b>${escapeHTML(a.title)}</b><small></small></button>`).join('');
  $('loadout-list').innerHTML=LOADOUTS.map((k,i)=>`<button class="loadout-btn" data-loadout="${i}" aria-pressed="false"><b>${k.name}</b><small>${k.detail}</small></button>`).join('');
  $('level-list').innerHTML = LEVELS.map((l, i) => `<button class="level-card" data-level="${i}" aria-pressed="false"><span class="level-number">${String(i+1).padStart(2, '0')}</span><span class="level-copy"><strong>${escapeHTML(l.name)}</strong><small>${escapeHTML(l.en)} · ${escapeHTML(l.tag)}</small><span class="level-stars">☆☆☆</span></span><span class="level-mark">↗</span></button>`).join('');
  let level = Math.max(0, LEVELS.findIndex(l=>l.id===save.lastLevelId)), hero = save.hero, game = null, lastFrame = 0, ambient = 0, lastHud = 0;
  let radioIndex=0, resultRecorded=false, victoryStarted=null, pointsBefore=0, shotMotion=0, moveMotion=0, bossEntrance=1, bossStageSeen=0, bossTransition=1, terminalFlush=Promise.resolve(), nativeResultPending=false, navigationEpoch=0, startRequest=null, nativeBattleQueue=Promise.resolve(), stableFrameKey=null;
  let skillPulse = 0, toastTimer = 0, helpPaused = false, resultShown = false;
  let pointerX = null;
  const keys = new Set();
  const sprite = new Image();
  const portraitImage = new Image();let portraitReady=false;
  const pointerInput = window.MochiInput.createPointerInput();
  let spriteCache = [[], []];
  let artLoaded = false, enemyReady=false, bossReady=false, renderScale=1, updateHealthSent=false;
  const bossImage=new Image();let bossCache=[];
  const enemyImage=new Image();let enemyCache=[];let enemyHelpPaused=false;
  function saveNotice() {
    $('save-note').textContent = nativeSaveWorks ? '已自动保存 · 本机双份备份' : storageWorks ? '进度自动保存在这台设备上' : '保存暂不可用，请在设置中导出存档';
  }
  function persist({immediate=false}={}) {
    let json;
    try { json = window.DogProgress.writeLocal(localStorage,save,LEVELS);storageWorks = true; }
    catch { storageWorks = false;json = JSON.stringify(window.DogProgress.capture(save,LEVELS)); }
    saveNotice();
    if (window.dogDesktop?.saveProgress) {
      clearTimeout(diskSaveTimer);
      const flush=()=>window.dogDesktop.saveProgress(json).then(()=>{nativeSaveWorks=true;saveNotice();return true;}).catch(()=>{nativeSaveWorks=false;saveNotice();if(!storageWorks)toast('自动存档暂不可用，请在设置中导出本次成绩。',10000);return false;});
      if(immediate)return flush();diskSaveTimer=setTimeout(flush,150);
    }
  }
  function p(x, y) { const s = .47 + .53 * clamp(y / 800, 0, 1.2); return { x: 300 + (x - 300) * s, y: 70 + y * .89, s }; }
  function rounded(c, x, y, w, h, r, fill, stroke, sw = 1) {
    c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = sw; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, rotation = 0) { c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rotation, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function line(c, points, color, width = 1) { c.beginPath(); points.forEach((v, i) => i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1])); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function star(c, x, y, r, color, angle = 0, stroke = null) {
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = angle - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .48 : r; const xx = x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr; if (!i) c.moveTo(xx, yy); else c.lineTo(xx, yy); }
    c.closePath(); c.fillStyle = color; c.fill(); if (stroke) { c.lineWidth = 1.5; c.strokeStyle = stroke; c.stroke(); }
  }
  function text(c, value, x, y, size, color, weight = 700) { c.font = `${weight} ${size}px "Avenir Next", "PingFang SC", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y); }
  function shadow(x, y, rx, ry, opacity = .12) { ellipse(ctx, x, y, rx, ry, `rgba(62, 82, 60, ${opacity})`); }
  function prepareSprites() {
    const cw=Math.floor(sprite.naturalWidth/2),ch=Math.floor(sprite.naturalHeight/2);
    spriteCache=[0,1].map(row=>HEROES.map((_,col)=>{
      const tile=document.createElement('canvas');tile.width=cw;tile.height=ch;
      const tc=tile.getContext('2d',{willReadFrequently:true});tc.drawImage(sprite,col*cw,row*ch,cw,ch,0,0,cw,ch);
      const data=tc.getImageData(0,0,cw,ch).data;let left=cw,top=ch,right=0,bottom=0;
      for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(data[(y*cw+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right<=left||bottom<=top)throw Error('Empty pet sprite cell');
      const width=right-left+1,height=bottom-top+1,ratio=width/height;
      const scaled=size=>{const c=document.createElement('canvas');c.width=Math.ceil(size*ratio);c.height=size;const cc=c.getContext('2d');cc.imageSmoothingQuality='high';cc.drawImage(tile,left,top,width,height,0,0,c.width,c.height);return c;};
      return {ratio,small:scaled(256),large:scaled(768)};
    }));
  }
  function prepareEnemies(){
    // Individual source rectangles follow the generated atlas silhouettes, not assumed cell gutters.
    const rects=[[80,12,400,455],[545,8,450,485],[1040,8,480,467],[0,470,534,545],[530,520,528,490],[1075,472,455,530]];
    enemyCache=rects.map(([sx,sy,sw,sh])=>{const t=document.createElement('canvas');t.width=sw;t.height=sh;const c=t.getContext('2d',{willReadFrequently:true});c.drawImage(enemyImage,sx,sy,sw,sh,0,0,sw,sh);const d=c.getImageData(0,0,sw,sh).data;let l=sw,r=0,top=sh,b=0;for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)if(d[(y*sw+x)*4+3]>24){l=Math.min(l,x);r=Math.max(r,x);top=Math.min(top,y);b=Math.max(b,y);}if(r<=l||b<=top)throw Error('Empty robot sprite');const ratio=(r-l+1)/(b-top+1);const make=h=>{const out=document.createElement('canvas');out.width=Math.ceil(h*ratio);out.height=h;out.getContext('2d').drawImage(t,l,top,r-l+1,b-top+1,0,0,out.width,h);return out;};return {ratio,small:make(256),large:make(640)};});
    document.querySelectorAll('[data-enemy]').forEach(c=>{const n=Number(c.dataset.enemy),cc=c.getContext('2d');cc.clearRect(0,0,c.width,c.height);const tile=enemyCache[n],h=c.height*.9,w=h*tile.ratio;cc.drawImage(tile.large,(c.width-w)/2,c.height*.05,w,h);});
  }
  function robot(c,kind,x,y,h,rotation=0){const index=ENEMIES.findIndex(e=>e.kind===kind),a=enemyCache[index];if(!a)return;c.save();c.translate(x,y);c.rotate(rotation);const w=h*a.ratio;c.drawImage(h>100?a.large:a.small,-w/2,-h,w,h);c.restore();}
  function drawSprite(c, kind, back, x, y, h, rotation = 0) {
    if (!artLoaded) return;
    const tile=spriteCache[back?1:0][kind];if(!tile)return;
    const dw=h*tile.ratio;
    c.save();c.translate(x,y);c.rotate(rotation);c.drawImage(h<=100?tile.small:tile.large,-dw/2,-h,dw,h);c.restore();
  }
  function prepareBosses() {
    const rects=[[61,124,431,316],[549,57,452,417],[1067,113,421,354],[77,550,394,407],[557,579,421,351],[1046,551,440,415]];
    bossCache=rects.map(([x,y,w,h])=>({x,y,w,h,ratio:w/h}));
  }
  function bossSprite(c,pose) {
    if(!bossReady)return robot(c,pose.kind,pose.x,pose.y,pose.h,pose.rotation);
    const a=bossCache[clamp((pose.chapter||1)-1,0,5)],w=pose.h*a.ratio;
    c.save();c.translate(pose.x,pose.y);c.rotate(pose.rotation||0);c.drawImage(bossImage,a.x,a.y,a.w,a.h,-w/2,-pose.h,w,pose.h);c.restore();
  }
  function petSprite(c,pose){drawSprite(c,pose.hero,pose.back,pose.x,pose.y,pose.h,pose.rotation);}
  function chapterNumber(){return Math.max(1,Math.min(6,acts.findIndex(a=>a.key===actFor(LEVELS[level]).key)+1));}
  function captainProfile(){return Growth.getProfile(save.records,hero,save.captainBuilds[Growth.HERO_KEYS[hero]]);}
  function tree(x, y, size, seed, theme) {
    const pale = theme === 1 ? '#efbbaa' : theme === 2 ? '#b0c7be' : '#b5cba0';
    const dark = theme === 1 ? '#cf9c83' : theme === 2 ? '#7faaa0' : '#7fae8a';
    shadow(x + 3, y + 5, size * .72, size * .25, .11);
    rounded(ctx, x - size * .1, y - size * .7, size * .2, size * .8, 4, '#b79c77');
    const g = ctx.createLinearGradient(x - size, y - size * 2, x + size, y); g.addColorStop(0, pale); g.addColorStop(1, dark);
    ellipse(ctx, x, y - size * 1.2, size * .77, size, g, seed % 2 ? .2 : -.2);
    ellipse(ctx, x - size * .29, y - size * 1.4, size * .37, size * .55, '#fff5db27', -.4);
    if (theme === 1) { ellipse(ctx, x + size * .3, y - size * .9, size * .15, size * .15, '#ffe8cc'); ellipse(ctx, x - size * .2, y - size * 1.7, size * .12, size * .12, '#ffe8cc'); }
    if (theme === 2) star(ctx, x, y - size * 1.6, size * .21, '#fff0af', .2);
  }
  function bush(x, y, r, theme) {
    shadow(x, y + r * .25, r, r * .3, .09);
    const fill = theme === 1 ? '#d9b79e' : '#9ebc90';
    ellipse(ctx, x - r * .45, y - r * .15, r * .6, r * .65, fill);
    ellipse(ctx, x + r * .4, y - r * .15, r * .65, r * .65, fill);
    ellipse(ctx, x, y - r * .45, r * .65, r * .75, theme === 1 ? '#e6c9a9' : '#b8cba2');
    ellipse(ctx, x - r * .1, y - r * .62, r * .28, r * .22, '#fff7d142');
  }
  function background(t,distance,theme){
    const cfg=LEVELS[theme], accent=cfg.color;
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#2e5367');sky.addColorStop(.55,cfg.sea);sky.addColorStop(1,'#3a6373');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Skyline: fixed geometry keeps the horizon readable during fast movement.
    for(let i=0;i<18;i++){const x=i*37-20,h=38+(i*41%97);rounded(ctx,x,126-h,29,h,1,i%2?'#375d70':'#477080');for(let y=135-h;y<112;y+=13)for(let j=0;j<2;j++)rounded(ctx,x+7+j*11,y,3,5,0,(i+j)%3===0?accent+'88':'#7b999a33');}
    const tl=p(65,-80),tr=p(535,-80),bl=p(65,850),br=p(535,850);
    ctx.beginPath();ctx.moveTo(tl.x,tl.y);ctx.lineTo(tr.x,tr.y);ctx.lineTo(br.x,br.y);ctx.lineTo(bl.x,bl.y);ctx.closePath();const road=ctx.createLinearGradient(0,0,0,H);road.addColorStop(0,'#476c7e');road.addColorStop(1,cfg.road);ctx.fillStyle=road;ctx.fill();
    for(const side of [65,535]){const a=p(side,-80),b=p(side,850);line(ctx,[[a.x,a.y],[b.x,b.y]],'#315768',12);line(ctx,[[a.x,a.y],[b.x,b.y]],accent+'80',2);}
    for(let i=0;i<16;i++){const y=(i*66+distance)%1056-100,l=p(68,y),r=p(532,y);line(ctx,[[l.x,l.y],[r.x,r.y]],'#9db6bd14',1);for(const x of [235,365]){const a=p(x,y),b=p(x,y+24);line(ctx,[[a.x,a.y],[b.x,b.y]],'#bfd8c52b',2*a.s);}for(const x of [74,526]){const a=p(x,y),b=p(x,y+22);line(ctx,[[a.x,a.y],[b.x,b.y]],accent+'ac',4*a.s);}}
    for(let i=0;i<12;i++){const y=(i*109+distance*.9)%1200-140,side=i%2?574:26,q=p(side,y),w=24*q.s,h=(40+i%3*15)*q.s;rounded(ctx,q.x-w/2,q.y-h,w,h,2,'#365d70','#9bbcc388',q.s);rounded(ctx,q.x-w/2+4*q.s,q.y-h+7*q.s,w-8*q.s,3*q.s,1,accent+'aa');line(ctx,[[q.x,q.y-h],[q.x,q.y-h-16*q.s]],'#b0cfd2',1.5*q.s);ellipse(ctx,q.x,q.y-h-16*q.s,2*q.s,2*q.s,accent);}
    // Rain and signal fragments are subdued; projectiles carry the bright contrast.
    if(theme===3||theme===5)for(let i=0;i<35;i++){const x=(i*127)%600,y=(i*73+t*(theme===3?220:45))%820;line(ctx,[[x,y],[x-3,y+12]],'#b7e0eb2a',1);}
    const fog=ctx.createLinearGradient(0,0,0,170);fog.addColorStop(0,cfg.sea+'de');fog.addColorStop(1,cfg.sea+'00');ctx.fillStyle=fog;ctx.fillRect(0,0,W,170);
    ctx.save();ctx.globalAlpha=.12;ctx.fillStyle=accent;ctx.font='800 62px monospace';ctx.textAlign='center';ctx.fillText(String(theme+1).padStart(2,'0'),300,198);ctx.restore();
  }
  function gate(e) {
    const q = p(e.x, e.y), ww = e.width * q.s, hh = 79 * q.s, xx = q.x - ww / 2, yy = q.y - hh;
    const positive = e.value >= 0, blue = e.op === 'multiply';
    const c = blue ? '#72a6c8' : positive ? '#6aa994' : '#d28c83';
    const ink = blue ? '#3f7598' : positive ? '#397e69' : '#ae615b';
    ctx.save(); ctx.globalAlpha = e.used ? .22 : 1;
    shadow(q.x + 3, q.y + 6, ww * .52, 8 * q.s, .1);
    const fill = ctx.createLinearGradient(xx, yy, xx, q.y); fill.addColorStop(0, blue ? '#d7edf4ee' : positive ? '#cef0dbe8' : '#fbd4c8e8'); fill.addColorStop(1, '#fff8df55');
    rounded(ctx, xx + 3, yy, ww - 6, hh, 9 * q.s, fill, c, 2 * q.s);
    for (const side of [-1, 1]) { rounded(ctx, q.x + side * (ww / 2) - 4 * q.s, yy + 3, 8 * q.s, hh + 9 * q.s, 4 * q.s, c); ellipse(ctx, q.x + side * (ww / 2), yy + 5, 5 * q.s, 4 * q.s, '#fff9df'); }
    text(ctx, (blue ? '×' : e.value >= 0 ? '+' : '−') + Math.abs(e.value), q.x, yy + hh * .47, 38 * q.s, ink, 800);
    text(ctx, blue ? '小队翻倍' : positive ? '伙伴加入' : '射击可变正数', q.x, yy + hh * .79, 9 * q.s, ink, 500);
    const threshold = blue ? 40 : 4; rounded(ctx, xx + 13 * q.s, q.y - 4 * q.s, ww - 26 * q.s, 3 * q.s, 2, '#fffbed99');
    if (e.charge) rounded(ctx, xx + 13 * q.s, q.y - 4 * q.s, (ww - 26 * q.s) * e.charge / threshold, 3 * q.s, 2, c);
    if (e.hit) { ctx.globalAlpha *= .3; rounded(ctx, xx + 3, yy, ww - 6, hh, 9, '#fff'); }
    ctx.restore();
  }
  function jelly(e,t){
    const q=p(e.x,e.y),vs=VFX.enemyScale(e),r=e.r*q.s,meta=ENEMIES.find(a=>a.kind===e.kind),accent=meta?.color||'#f5ca69';
    const h=(e.kind==='tank'?83:e.kind==='guardian'?73:e.kind==='runner'?79:e.kind==='repair'?76:67)*q.s*vs,bob=Math.sin(t*(e.kind==='runner'?10:4)+e.wobble)*(e.kind==='shooter'||e.kind==='repair'?4:1.5)*q.s;
    shadow(q.x,q.y+5,r*.9,r*.3,.22);
    if(e.healing){const a=p(e.healing.x,e.healing.y);ctx.save();ctx.globalAlpha=e.healing.life/.35;line(ctx,[[q.x,q.y-h/2],[a.x,a.y-22]],'#78f7c8',3*q.s);ellipse(ctx,a.x,a.y-22,10*q.s,10*q.s,'#a0ffe777');ctx.restore();}
    ctx.save();if(e.hit)ctx.globalAlpha=.65;
    if(enemyReady)robot(ctx,e.kind,q.x,q.y+8*q.s+bob,h,e.kind==='runner'&&!reducedMotion?Math.sin(t*8)*.035:0);else ellipse(ctx,q.x,q.y-r,r,r,accent);
    ctx.restore();
    VFX.drawEnemyDetails(ctx,e,{x:q.x,y:q.y+8*q.s+bob,s:q.s,time:t,reducedMotion,height:h,radius:r});
    if(e.guardHp>0){ctx.save();ctx.strokeStyle='#98f5de';ctx.lineWidth=2*q.s;ctx.fillStyle='#7eeedb10';ctx.beginPath();for(let i=0;i<6;i++){const angle=i*Math.PI/3,xx=q.x+Math.cos(angle)*r*1.2,yy=q.y-h*.4+Math.sin(angle)*r*1.2;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    if(e.hp<e.maxHp||e.guardHp>0||e.eliteVariant){const yy=q.y-h-6*q.s;rounded(ctx,q.x-r*.7,yy,r*1.4,3*q.s,1,'#2d4957');rounded(ctx,q.x-r*.7,yy,r*1.4*Math.max(0,e.hp/e.maxHp),3*q.s,1,accent);if(e.guardHp>0)rounded(ctx,q.x-r*.7,yy-4*q.s,r*1.4,2*q.s,1,'#a6f8e4');}
  }
  function crate(e, t) {
    const q = p(e.x, e.y), s = q.s, r = 31 * s, bob = Math.sin(t * 3) * 2 * s;
    shadow(q.x + 3, q.y + 8, 34 * s, 10 * s, .13);
    ctx.save(); ctx.translate(q.x, q.y + bob);
    rounded(ctx, -r, -r * 1.25, r * 2, r * 1.65, 7 * s, '#c0a065', '#ae8a50', 1.5 * s);
    rounded(ctx, -r, -r * 1.5, r * 2, r * 1.65, 7 * s, '#eacb88', '#c4a361', 1.5 * s);
    rounded(ctx, -r - 2 * s, -r * 1.47, r * 2 + 4 * s, 16 * s, 5 * s, '#f6d997');
    rounded(ctx, -5 * s, -r * 1.45, 10 * s, r * 1.65, 3 * s, '#f9e7ad');
    star(ctx, 0, -r * .5, 16 * s, '#fff2bd', .1, '#c6a44f');
    if (e.hit) { ctx.globalAlpha = .5; rounded(ctx, -r, -r * 1.5, r * 2, r * 1.65, 7 * s, '#fff'); }
    ctx.restore();
    text(ctx, 'Lv. UP', q.x, q.y - 64 * s, 11 * s, '#a58b4c');
    rounded(ctx, q.x - 23 * s, q.y + 20 * s, 46 * s, 5 * s, 2, '#bda56d44');
    rounded(ctx, q.x - 23 * s, q.y + 20 * s, 46 * s * Math.max(0, e.hp / e.maxHp), 5 * s, 2, '#c0a258');
    if (Math.sin(t * 5) > .6) star(ctx, q.x + 42 * s, q.y - 38 * s, 5 * s, '#fff9c6', t);
  }
  function rock(e, t) {
    const q = p(e.x, e.y), s = q.s;
    shadow(q.x, q.y + 6, 35 * s, 12 * s, .15);
    const g = ctx.createLinearGradient(q.x, q.y - 45 * s, q.x + 20 * s, q.y); g.addColorStop(0, '#d0d0b8'); g.addColorStop(1, '#9eab99');
    ctx.beginPath(); ctx.moveTo(q.x - 33 * s, q.y); ctx.lineTo(q.x - 28 * s, q.y - 26 * s); ctx.lineTo(q.x - 10 * s, q.y - 44 * s); ctx.lineTo(q.x + 18 * s, q.y - 39 * s); ctx.lineTo(q.x + 33 * s, q.y - 17 * s); ctx.lineTo(q.x + 27 * s, q.y + 3 * s); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    line(ctx, [[q.x - 10 * s, q.y - 37 * s], [q.x + 13 * s, q.y - 32 * s], [q.x + 22 * s, q.y - 15 * s]], '#ebead07a', 3 * s);
    ellipse(ctx, q.x - 8 * s, q.y - 44 * s, 8 * s, 4 * s, '#7fa986', -.5);
    ellipse(ctx, q.x + 4 * s, q.y - 47 * s, 9 * s, 4 * s, '#9cbb8c', .4);
    text(ctx, '!', q.x, q.y - 17 * s, 21 * s, '#7a8877', 800);
  }
  function bossArt(b,t){
    const q=p(b.x,b.y),scale=q.s*(b.stage===2?1.18:1.08),h=185*scale;
    shadow(q.x,q.y+50*scale,92*scale,25*scale,.23);
    Motion.drawBoss(ctx,{x:q.x,y:q.y+68*scale,h,time:t,kind:LEVELS[level].bossKind,chapter:chapterNumber(),hpRatio:b.hp/b.maxHp,stage:b.stage,entrance:bossEntrance,phaseTransition:bossTransition,hit:b.hit||0,shot:Math.max(0,1-(b.shot||0)),reducedMotion},bossSprite);
    VFX.drawBossDetails(ctx,b,{x:q.x,y:q.y,s:scale,time:t,reducedMotion,radius:108*scale,height:h});
  }
  function squad(s, t) {
    const visible = Math.min(54, s.team), columns = Math.min(9, Math.max(2, Math.ceil(Math.sqrt(visible * 1.5))));
    const members = [];
    for (let i = 1; i < visible; i++) {
      const row = Math.floor((i - 1) / columns), col = (i - 1) % columns;
      members.push({ x: s.x + (col - (Math.min(columns, visible - 1 - row * columns) - 1) / 2) * 22, y: PLAYER_Y + 8 + row * 16, kind: (hero + i) % HEROES.length, phase: i * 1.73 });
    }
    members.push({ x: s.x, y: PLAYER_Y - 38, kind: hero, phase: 0, captain:true });
    members.sort((a, b) => a.y - b.y);
    if (s.invulnerable > 0) { const q = p(s.x, PLAYER_Y + 12); ellipse(ctx, q.x, q.y, 56 + Math.min(s.team, 25) * 1.4, 35, '#fff9d929'); ctx.save(); ctx.strokeStyle = '#fcf4b9aa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(q.x, q.y, 56 + Math.min(s.team, 25) * 1.4, 35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if(s.shield>0){const q=p(s.x,PLAYER_Y);ctx.save();ctx.strokeStyle='#75e8dc';ctx.lineWidth=3;ctx.fillStyle='#6edfd820';ctx.beginPath();ctx.ellipse(q.x,q.y-30,83,72,0,0,Math.PI*2);ctx.fill();ctx.stroke();text(ctx,'SHIELD '+Math.ceil(s.shield),q.x,q.y-110,10,'#a3fff1');ctx.restore();}
    if(s.focus>0){const q=p(s.x,PLAYER_Y-40);ctx.save();ctx.globalAlpha=.6;line(ctx,[[q.x-50,q.y],[q.x-50,q.y-80]],'#ffd684',3);line(ctx,[[q.x+50,q.y],[q.x+50,q.y-80]],'#ffd684',3);ctx.restore();}
    if(s.dashTime>0){const a=p(s.dashFrom,PLAYER_Y),b=p(s.x,PLAYER_Y);ctx.save();ctx.globalAlpha=s.dashTime/.22;for(let i=0;i<4;i++)line(ctx,[[a.x,a.y-16-i*8],[b.x,b.y-16-i*8]],'#9df5e8',2+i);ctx.restore();}
    for (const m of members) {
      const q = p(m.x, m.y), run = Math.sin(t * 14 + m.phase);
      shadow(q.x + 3, q.y + 1, 18 * q.s, 6 * q.s, .15);
      ctx.save(); if (s.flash > 0 && !reducedMotion) ctx.globalAlpha = .5;
      const pose={x:q.x,y:q.y,h:(m.captain?78:57)*q.s,hero:m.kind,index:m.phase,time:t,move:moveMotion,shoot:shotMotion,dash:s.dashTime>0?1:0,tactical:s.tacticalTime>0?1:0,ultimate:s.ultimateTime>0?1:0,won:s.phase==='won',reducedMotion};
      if(m.captain)Motion.drawCaptain(ctx,pose,petSprite);else Motion.drawFollower(ctx,pose,petSprite);ctx.restore();
    }
    const lead = p(s.x, PLAYER_Y - 145);
    rounded(ctx, lead.x - 28, lead.y - 13, 56, 25, 13, '#fff9e7ed', '#b8c7a8', 1);
    text(ctx, s.team, lead.x, lead.y, 20, '#3c765d', 800);
    if (s.team > 54) text(ctx, '军团 ' + s.team, p(s.x, PLAYER_Y + 108).x, p(s.x, PLAYER_Y + 108).y, 10, '#6e826a');
  }
  function bullets(s, t, hostileOnly=false) {
    let dense=false,ordinal=0;if(!hostileOnly&&save.effectsQuality!=='high'){let count=0;for(const bullet of s.bullets)if(bullet.friendly&&++count>72){dense=true;break;}}
    for (const b of s.bullets) {
      if (hostileOnly === b.friendly) continue;
      const q=p(b.x,b.y);
      VFX.drawBullet(ctx,b,{x:q.x,y:q.y,s:q.s,time:t,reducedMotion,compact:dense&&(ordinal++%2===1)});
    }
  }
  function lobbyScene(t) {
    background(t, t * 4, level);
    
    
    const positions = [{ kind: (hero + 1) % HEROES.length, x: 182, y: 582, h: 230, phase: 1 }, { kind: hero, x: 397, y: 610, h: 262, phase: 0 }];
    for (const a of positions) { shadow(a.x + 5, a.y - 6, a.h * .28, a.h * .075, .16); drawSprite(ctx, a.kind, false, a.x, a.y + (reducedMotion ? 0 : Math.sin(t * 2 + a.phase) * 4), a.h, reducedMotion ? 0 : Math.sin(t + a.phase) * .014); }
    const tint = ctx.createLinearGradient(0, 610, 0, 800); tint.addColorStop(0, '#32526000'); tint.addColorStop(.55, '#325260e6'); tint.addColorStop(1, '#325260'); ctx.fillStyle = tint; ctx.fillRect(0, 610, W, 190);
    for (let i = 0; i < 7; i++) { const x = 100 + (i * 79 % 420), y = 310 + Math.sin(t * .6 + i) * 16 + i % 3 * 85; star(ctx, x, y, 3 + i % 3, '#fffce09c', t * .2 + i); }
  }
  function battleAtmosphere(s) {
    if (level >= 3) {
      for(let i=0;i<18;i++){const yy=(s.distance*(.4+i%3*.15)+i*61)%850;const xx=30+(i*139)%540;star(ctx,xx,yy,1.5+i%3,level===4?'#ffd28d80':'#b8eaff80',s.time*.3+i);}
    }
    if (s.overdrive > 0) {
      const glow=ctx.createRadialGradient(300,500,160,300,500,470);glow.addColorStop(0,'#d66bfb00');glow.addColorStop(1,'#c858c842');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      if(!reducedMotion)for(let i=0;i<12;i++){const x=i%2?W-12-i%3*9:12+i%3*9,y=(s.time*850+i*113)%H;line(ctx,[[x,y],[x,y+70]],'#fff6ce8a',2);}
    }
  }
  function drawHazards(s) {
    for(const h of s.hazards){const topL=p(h.x-h.width/2,80),topR=p(h.x+h.width/2,80),botL=p(h.x-h.width/2,800),botR=p(h.x+h.width/2,800);ctx.save();ctx.beginPath();ctx.moveTo(topL.x,topL.y);ctx.lineTo(topR.x,topR.y);ctx.lineTo(botR.x,botR.y);ctx.lineTo(botL.x,botL.y);ctx.closePath();ctx.fillStyle=h.delay>0?'#d3326e28':'#ff83bd9c';ctx.fill();ctx.strokeStyle=h.delay>0?'#c6466c':'#fff2cb';ctx.lineWidth=h.delay>0?2:4;ctx.setLineDash(h.delay>0?[9,7]:[]);ctx.stroke();ctx.setLineDash([]);const a=p(h.x,PLAYER_Y-25);text(ctx,h.delay>0?'!  快躲开':'BEAM',a.x,a.y,16,h.delay>0?'#ae2354':'#fff9dc',900);if(h.delay<=0){const top=p(h.x,100),bot=p(h.x,800);line(ctx,[[top.x,top.y],[bot.x,bot.y]],'#fff4db',reducedMotion?8:16);}ctx.restore();}
  }
  function draw(t) {
    ctx.setTransform(renderScale,0,0,renderScale,0,0);ctx.imageSmoothingQuality='high';
    ctx.clearRect(0, 0, W, H);
    if (!game) { lobbyScene(t); return; }
    const s = game.state;
    ctx.save(); if (s.shake > 0 && !reducedMotion) ctx.translate(Math.sin(t * 88) * s.shake * 17, Math.cos(t * 65) * s.shake * 11);
    background(s.time, s.distance, level);
    battleAtmosphere(s);
    const items = s.entities.map(e => ({ y: e.y, e }));
    if (s.boss) items.push({ y: s.boss.y, boss: s.boss });
    items.sort((a, b) => a.y - b.y);
    for (const item of items) {
      if (item.boss) bossArt(item.boss, s.time);
      else if (item.e.type === 'gate') gate(item.e);
      else if (item.e.type === 'enemy') jelly(item.e, s.time);
      else if (item.e.type === 'crate') crate(item.e, s.time);
      else if (item.e.type === 'rock') rock(item.e, s.time);
    }
    for(const pickup of s.pickups||[]){const q=p(pickup.x,pickup.y);VFX.drawPickup(ctx,pickup,{...q,time:s.time,reducedMotion});}
    bullets(s, s.time); squad(s, s.time);
    const aura=p(s.x,PLAYER_Y-28);VFX.drawAura(ctx,s,{...aura,time:s.time,reducedMotion});
    for(const effect of s.skillEffects||[]){const q=p(effect.x,effect.y);VFX.drawSkillEffect(ctx,effect,{...q,time:s.time,reducedMotion});}
    if (skillPulse > 0) {
      const q = p(s.x, PLAYER_Y), radius = (1.5 - skillPulse) * 560;
      ctx.save(); ctx.globalAlpha = skillPulse / 1.5; ctx.strokeStyle = '#fff3ad'; ctx.lineWidth = 14 * skillPulse; ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, radius), Math.max(1, radius * .8), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    for (const a of s.explosions) { const q=p(a.x,a.y);VFX.drawExplosion(ctx,a,{...q,time:s.time,reducedMotion}); }
    const particleStride=save.effectsQuality==='high'?1:2;
    if(!reducedMotion)for (let i=0;i<s.particles.length;i+=particleStride) { const a=s.particles[i],q=p(a.x,a.y);ctx.save();ctx.globalAlpha=Math.min(1,a.life*1.6);if(a.r>4)star(ctx,q.x,q.y,a.r*q.s,a.color,a.life*4);else ellipse(ctx,q.x,q.y,a.r*q.s,a.r*q.s,a.color);ctx.restore(); }
    const impactStride=save.effectsQuality==='high'?1:2;
    for(let i=0;i<(s.impacts||[]).length;i+=impactStride){const a=s.impacts[i],q=p(a.x,a.y);VFX.drawImpact(ctx,a,{...q,time:s.time,reducedMotion});if(save.combatText&&i%3===0)VFX.drawDamageNumber(ctx,a,{...q,time:s.time,reducedMotion});}
    // Threats remain in front of decorative explosions and player beams.
    drawHazards(s);bullets(s,s.time,true);
    for (const a of s.texts) { if(!save.combatText&&/^[−+\d]/.test(a.text))continue;const q=p(a.x,a.y);ctx.save();ctx.globalAlpha=Math.min(1,a.life*2);ctx.font='800 17px "Avenir Next", "PingFang SC", sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#123643ee';ctx.strokeText(a.text,q.x,q.y);ctx.fillStyle=a.color;ctx.fillText(a.text,q.x,q.y);ctx.restore(); }
    if(s.phase==='won'&&victoryStarted!==null)Motion.drawVictory(ctx,{width:W,height:H,time:ambient-victoryStarted,presentation:'archive',hero,chapter:chapterNumber(),stars:s.stars,rank:s.rank,reducedMotion},petSprite);
    ctx.restore();
  }
  const audio = window.DogAudio.create({getPreferences:()=>save});
  function updatePortraits() {
    function portrait(ctx,index,w,h,avatar=false){
      ctx.clearRect(0,0,w,h);
      if(!portraitReady){drawSprite(ctx,index,false,w/2,avatar?h*1.38:h*.95,avatar?h*1.36:h*.94);return;}
      const sw=portraitImage.naturalWidth/2,sh=portraitImage.naturalHeight;
      if(avatar){const crop=sw*.88;ctx.drawImage(portraitImage,index*sw+sw*.06,sh*.07,crop,crop,0,0,w,h);}
      else {const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(portraitImage,index*sw,0,sw,sh,(w-dw)/2,(h-dh)/2,dw,dh);}
    }
    const c=$('hero-portrait'),dpr=Math.min(3,window.devicePixelRatio||1),pc=c.getContext('2d');
    c.width=Math.round(480*dpr);c.height=Math.round(540*dpr);pc.setTransform(dpr,0,0,dpr,0,0);pc.imageSmoothingQuality='high';portrait(pc,hero,480,540);
    c.setAttribute('aria-label',`${HEROES[hero].name}，${HEROES[hero].kind}行动队长`);
    document.querySelectorAll('[data-avatar]').forEach(a=>{const ac=a.getContext('2d'),n=Number(a.dataset.avatar),w=Number(a.dataset.logicalWidth||a.width),h=Number(a.dataset.logicalHeight||a.height);a.dataset.logicalWidth=w;a.dataset.logicalHeight=h;a.width=Math.round(w*dpr);a.height=Math.round(h*dpr);ac.setTransform(dpr,0,0,dpr,0,0);ac.imageSmoothingQuality='high';portrait(ac,n,w,h,true);});
  }
  function updateMenu() {
    const starsForMode=save.easy?save.easyStars:save.stars, bestForMode=save.easy?save.easyBest:save.best;
    document.querySelectorAll('[data-level]').forEach(b => { const i = Number(b.dataset.level); b.hidden = actFor(LEVELS[i]).key !== activeAct; b.classList.toggle('selected', i === level); b.setAttribute('aria-pressed', String(i === level)); const stars = b.querySelector('.level-stars'); stars.textContent = '★'.repeat(starsForMode[i]) + '☆'.repeat(3 - starsForMode[i])+(starsForMode[i]?' / '+['C','B','A','S'][(save.easy?save.easyMedals:save.medals)[i]]:''); stars.classList.toggle('earned', starsForMode[i] > 0); stars.setAttribute('aria-label', `${starsForMode[i]} 星`); });
    document.querySelectorAll('[data-hero]').forEach(b => { const selected = Number(b.dataset.hero) === hero; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
    $('hero-name').replaceChildren(document.createTextNode(HEROES[hero].name)); const sm = document.createElement('small'); sm.textContent = HEROES[hero].kind; $('hero-name').append(sm);
    $('hero-trait').textContent = HEROES[hero].trait;
    $('hero-role').textContent=HEROES[hero].role;$('support-detail-name').textContent=HEROES[hero].support;$('support-detail').textContent=HEROES[hero].supportDetail;
    $('support-name').textContent=HEROES[hero].support;
    const profile=captainProfile(),tactical=profile.tacticals.find(t=>t.selected)||profile.tacticals[0];
    $('tactical-name').textContent=tactical.name;$('ultimate-name').textContent=HEROES[hero].ultimate;
    $('captain-summary').textContent=`${HEROES[hero].name} · ${profile.spent} 已训练 / ${profile.available} 可分配`;
    $('equipment-summary').textContent=LOADOUTS[save.loadout].name+' · '+tactical.name;
    const skillList=[['SPACE','电磁脉冲','破盾清弹 · 紧急脱险'],['Q',tactical.name,tactical.detail],['E',HEROES[hero].support,HEROES[hero].supportDetail],['R',HEROES[hero].ultimate,HEROES[hero].ultimateDetail]];
    $('arsenal-list').innerHTML=skillList.map(([key,name,detail])=>`<details><summary><kbd>${key}</kbd><span>${escapeHTML(name)}</span></summary><p>${escapeHTML(detail)}</p></details>`).join('');
    $('brief-arsenal').innerHTML=skillList.map(([key,name,detail])=>`<span title="${escapeHTML(detail)}"><kbd>${key}</kbd>${escapeHTML(name)}</span>`).join('');
    document.querySelectorAll('[data-loadout]').forEach(b=>{const selected=Number(b.dataset.loadout)===save.loadout;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    if(!game){$('radio-text').textContent=LEVELS[level].intro;updateObjectives();}
    $('island-tag').textContent = `OPERATION ${String(level + 1).padStart(2, '0')} · ${LEVELS[level].name}`;
    $('island-subtitle').textContent = LEVELS[level].subtitle;
    $('campaign-note').textContent = `${save.easy ? '辅助' : '标准'}行动 · ${LEVELS[level].tag} · ${(save.easy?14:8)+LEVELS[level].difficulty*4} 初始兵力`;
    $('star-target').textContent = `2 / 3 星撤离： ${LEVELS[level].star2} / ${LEVELS[level].star3} 兵力`; 
    $('personal-best').textContent = bestForMode[level] ? `BEST ${bestForMode[level].toLocaleString()}` : 'BEST —';
    $('easy-mode').checked = save.easy;
    const act=acts.find(a=>a.key===activeAct), actLevels=LEVELS.filter(l=>actFor(l).key===activeAct);
    const completed=l=>(save.records[l.id]?.normal.stars||save.records[l.id]?.assist.stars||0)>0;
    $('act-subtitle').textContent=act.subtitle; $('act-synopsis').textContent=act.synopsis;
    $('act-progress').textContent=`${actLevels.filter(completed).length} / ${actLevels.length} 行动完成`;
    $('campaign-progress').textContent=`${LEVELS.filter(completed).length} / ${LEVELS.length}`;
    document.querySelectorAll('[data-act]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.act===activeAct));const ls=LEVELS.filter(l=>actFor(l).key===b.dataset.act);b.querySelector('small').textContent=`${ls.filter(completed).length}/${ls.length}`;});
    $('start-btn').firstChild.textContent=completed(LEVELS[level])?'再玩一次':LEVELS.some(completed)?'继续冒险':'出发！';
    $('current-chapter-name').textContent=actFor(LEVELS[level]).title;
    $('current-operation-name').textContent=`${String(level+1).padStart(2,'0')} · ${LEVELS[level].name}`;
    $('current-operation-meta').textContent=`${actLevels.filter(completed).length} / ${actLevels.length} 行动完成 · ${save.easy?'辅助':'标准'}模式`;
    $('resume-note').textContent=`${actFor(LEVELS[level]).title} · ${LEVELS[level].name}`;
    updatePortraits();
  }
  function disableSelection(disabled) { document.querySelectorAll('[data-level], [data-act], [data-hero], [data-loadout], #easy-mode, #campaign-btn, #current-mission-btn, #captain-btn, #equipment-btn, #story-btn').forEach(b => { b.disabled = disabled; }); }
  function toast(message, ms = 3600) { clearTimeout(toastTimer); $('scene-toast').textContent = message; $('scene-toast').classList.add('visible'); toastTimer = setTimeout(() => $('scene-toast').classList.remove('visible'), ms); }
  function hideToast() { clearTimeout(toastTimer); $('scene-toast').classList.remove('visible'); }
  function updateObjectives(){
    const s=game?.state||{level,maxCombo:0,damageTaken:0,kills:0};
    $('mission-list').innerHTML=missionResults(s).map((m,i)=>`<div class="mission-row ${game&&m.met?'met':''}"><span>${m.label}</span><b>${game?m.value+' / ':''}${i===1?'≤':'≥'}${m.target}</b></div>`).join('');
  }
  const VISUAL_INTRO_KEY = 'visual-intro-v1';
  function brief() {
    if (save.storySeen.includes(VISUAL_INTRO_KEY)) { start(); return; }
    $('brief-kicker').textContent = 'Ramen + Bing Bong';
    $('brief-title').textContent = '一起，把大家带回家';
    $('brief-dialog').showModal();
  }
  function setNativeBattle(active) {
    const request=nativeBattleQueue.then(()=>window.dogDesktop?.setBattleActive(active));
    nativeBattleQueue=request.catch(()=>{});
    return request;
  }
  async function start() {
    if(startRequest!==null)return;const ticket=++navigationEpoch;startRequest=ticket;
    try {await terminalFlush;if(ticket!==navigationEpoch)return;await setNativeBattle(true);if(ticket!==navigationEpoch)return;}
    catch(error){toast(error.message,6000);return;}finally{if(startRequest===ticket)startRequest=null;}
    radioIndex=0;resultRecorded=false;victoryStarted=null;pointsBefore=captainProfile().points;shotMotion=0;moveMotion=0;bossEntrance=0;bossStageSeen=0;bossTransition=1;$('skip-celebration').hidden=true;save.lastLevelId=LEVELS[level].id;persist();game = createGame({ level, hero, easy: save.easy, loadout:save.loadout, captainBuild:captainProfile().build, records:save.records, seed:crypto.getRandomValues(new Uint32Array(1))[0] }); resultShown = false; pointerX = null; pointerInput.clear(); keys.clear(); skillPulse = 0; lastFrame = performance.now();
    $('combo-hud').hidden = false; $('lobby').hidden = true; $('game-hud').hidden = false; $('play-bottom').hidden = false; $('pause-overlay').hidden = true; $('result-overlay').hidden = true; $('boss-hud').hidden = true;
    document.body.classList.add('battle-active');$('game-frame').classList.add('playing');document.querySelector('.app-shell').classList.add('in-battle'); $('stage-name').textContent = LEVELS[level].name; disableSelection(true);$('radio-text').textContent=LEVELS[level].intro; updateHud(); audio.init(); toast(LEVELS[level].intro, 5000); canvas.focus({ preventScroll: true });if(innerWidth<=620)requestAnimationFrame(()=>scrollTo({top:0,behavior:'instant'}));
  }
  function home() {
    navigationEpoch++;startRequest=null;
    terminalFlush=Promise.resolve(terminalFlush).then(()=>setNativeBattle(false)).catch(()=>{});victoryStarted=null;resultRecorded=false;$('skip-celebration').hidden=true;document.body.classList.remove('battle-active');game=null;activeAct=actFor(LEVELS[level]).key;keys.clear(); pointerX = null; pointerInput.clear(); hideToast();
    $('combo-hud').hidden = true; $('lobby').hidden = false; $('game-hud').hidden = true; $('play-bottom').hidden = true; $('boss-hud').hidden = true; $('pause-overlay').hidden = true; $('result-overlay').hidden = true; $('game-frame').classList.remove('playing'); document.querySelector('.app-shell').classList.remove('in-battle');disableSelection(false); updateMenu();
  }
  function homeToMap() { home(); $('campaign-btn').click(); }
  function pause(reason = '') {
    if (!game || !game.pause()) return;
    audio.suspend();keys.clear(); pointerX = null; pointerInput.clear(); hideToast(); $('pause-overlay').hidden = false; $('pause-reason').textContent = reason || '战场状态已冻结，随时可以继续。'; $('resume-btn').focus({ preventScroll: true });
  }
  function resume() {
    if (!game || !game.resume()) return;
    $('pause-overlay').hidden = true; keys.clear(); pointerX = null; lastFrame = performance.now(); audio.init(); canvas.focus({ preventScroll: true });
  }
  function recordResult() {
    if(resultRecorded||!game)return;resultRecorded=true;const s=game.state;
    keys.clear();pointerX=null;pointerInput.clear();hideToast();
    if(s.phase==='won'){
      const stars=s.easy?save.easyStars:save.stars,best=s.easy?save.easyBest:save.best,medals=s.easy?save.easyMedals:save.medals;
      stars[level]=Math.max(stars[level],s.stars);best[level]=Math.max(best[level],s.score);medals[level]=Math.max(medals[level],s.medals);
      save.lastLevelId=LEVELS[Math.min(level+1,LEVELS.length-1)].id;nativeResultPending=!!window.dogDesktop;terminalFlush=Promise.resolve(persist({immediate:true})).then(()=>setNativeBattle(false)).catch(()=>{}).finally(()=>{nativeResultPending=false;});
      victoryStarted=ambient;$('game-hud').hidden=true;$('combo-hud').hidden=true;$('play-bottom').hidden=true;$('boss-hud').hidden=true;$('skip-celebration').hidden=false;$('skip-celebration').focus({preventScroll:true});
    }else {terminalFlush=Promise.resolve(setNativeBattle(false)).catch(()=>{});showResult();}
  }
  function showResult(instant=false) {
    if (resultShown || !game) return; resultShown = true;$('skip-celebration').hidden=true;
    const s = game.state;if(s.phase==='won'&&(instant||reducedMotion))victoryStarted=ambient-Motion.ARCHIVE_SETTLE_TIME;hideToast(); $('play-bottom').hidden = true; $('result-overlay').hidden = false; $('boss-hud').hidden = true; $('game-frame').classList.remove('playing');
    const won = s.phase === 'won';
    $('result-kicker').textContent = won ? '抵达！' : '再挑战';
    $('result-title').textContent = won ? (LEVELS[level].id==='daybreak-48' ? '我们到家啦！' : '好样的，搭档！') : '再来一次吧';
    $('result-description').textContent=won?`${'★'.repeat(s.stars)}${'☆'.repeat(3-s.stars)} · 完成 ${s.medals} / 3 项战术挑战`:'优先躲开锁定预警，保留一次冲刺；尝试防卫装甲或搭档支援。';
    $('result-stars').textContent=won?s.rank:'×';
    $('result-objectives').innerHTML=missionResults(s).map((m,i)=>`<div class="mission-row ${won&&m.met?'met':''}"><span>${won&&m.met?'✓':'—'} ${m.label}</span><b>${m.value} / ${i===1?'≤':'≥'}${m.target}</b></div>`).join('');
    $('result-story').textContent='';$('result-story').hidden=true;
    $('result-team').textContent = s.team; $('result-kills').textContent = s.kills; $('result-score').textContent = s.score.toLocaleString();
    $('result-next').firstChild.textContent = won ? (level < LEVELS.length-1 ? '下一站' : '回到地图') : '再来一次';
    $('result-retry').hidden = !won;

    $('result-growth').hidden=true;$('result-growth').textContent='';
    Expedition.renderDebrief({won,stars:s.stars,rank:s.rank,instant:instant||reducedMotion});
    updateMenu();document.querySelector('#result-overlay .result-card').focus({preventScroll:true});
  }
  function updateHud() {
    if (!game) return; const s = game.state;
    $('team-count').textContent = s.team;
    $('combo-hud').classList.toggle('overdrive',s.overdrive>0);
    $('combo-count').textContent=s.overdrive>0?'火力过载':s.combo>1?`${s.combo} 连击`:'火力全开';
    $('combo-meter').style.width=`${s.overdrive>0?s.overdrive/4*100:(s.combo%12)/12*100}%`;
    $('combo-detail').textContent=s.overdrive>0?`${s.overdrive.toFixed(1)}s · 射速 / 伤害提升`:'12 连击触发过载'; $('progress-bar').style.width = `${Math.min(100, s.time / LEVELS[level].duration * 100)}%`;
    $('weapon-label').textContent = ['脉冲发射器', '双联速射', '穿甲阵列', '电弧增幅', '聚能速射', '离子风暴', '轨道脉冲', '黎明火控'][s.weapon - 1] + ` · Lv.${s.weapon}`;
    $('skill-btn').disabled = s.cooldown > .22 || s.phase !== 'playing'; $('skill-label').textContent = s.cooldown > .22 ? `${Math.ceil(s.cooldown)}s 冷却` : s.cooldown > .01 ? '即将就绪 · 可提前按下' : 'SPACE / 就绪';
    $('energy-label').textContent=`支援能量 ${Math.floor(s.energy)} / 100`;$('energy-bar').style.width=s.energy+'%';
    $('support-btn').disabled=s.energy<60||s.supportCooldown>.18||s.phase!=='playing';
    $('support-label').textContent=s.supportCooldown>0?`${Math.ceil(s.supportCooldown)}s 冷却`:s.energy<60?`E / 还需 ${Math.ceil(60-s.energy)} 能量`:'E / 60 能量';
    $('effect-label').textContent=s.shield>0?`护盾 ${Math.ceil(s.shield)} · ${s.shieldTime.toFixed(1)}s`:s.focus>0?`强化齐射 ${s.focus.toFixed(1)}s`:'SHIFT 冲刺 · E 支援';
    $('dash-label').textContent=s.dashCharges<2?`${s.dashCharges}/2 · ${Math.ceil(s.dashRecharge)}s`:'2 / 2';
    for(const id of ['dash-left','dash-right'])$(id).disabled=s.dashCharges===0||s.phase!=='playing';
    $('tactical-btn').disabled=s.tacticalCooldown>.18||s.phase!=='playing';$('tactical-label').textContent=s.tacticalCooldown>0?`${s.tacticalCooldown.toFixed(1)}s`:'Q / 就绪';
    $('tactical-btn').style.setProperty('--cooldown',`${s.tacticalCooldown/(s.tacticalDuration||HEROES[hero].tacticalCooldown)*100}%`);
    $('ultimate-btn').disabled=s.ultimateCharge<98||s.ultimateTime>0||s.phase!=='playing';$('ultimate-label').textContent=s.ultimateTime>0?'超载释放中':s.ultimateCharge>=100?'R / 释放终极':`R / ${Math.floor(s.ultimateCharge)}%`;
    $('ultimate-btn').classList.toggle('ready-ultimate',s.ultimateCharge>=100&&s.phase==='playing');$('ultimate-bar').style.width=s.ultimateCharge+'%';$('ultimate-btn').style.setProperty('--cooldown',`${100-s.ultimateCharge}%`);
    const activeBuffs=Object.entries(s.buffs||{}).filter(([,time])=>time>0).map(([key,time])=>`${PICKUPS[key]?.name||key} ${time.toFixed(1)}s`);
    $('pickup-status').textContent=activeBuffs.length?activeBuffs.join(' · '):s.tacticalTime>0?`${s.tacticalName||HEROES[hero].tactical} ${s.tacticalTime.toFixed(1)}s`:'拾取战场芯片，组合你的火力';
    $('skill-btn').style.setProperty('--cooldown',`${s.cooldown/HEROES[hero].cooldown*100}%`);
    updateObjectives();
    const activeBoss = !!s.boss && s.phase !== 'won' && s.phase !== 'lost'; $('boss-hud').hidden = !activeBoss;
    if (activeBoss) { $('boss-name').textContent = LEVELS[level].boss + (s.boss.stage===2?' · 狂暴':''); $('boss-hud').classList.toggle('enraged',s.boss.stage===2); const percent = Math.max(0, s.boss.hp / s.boss.maxHp * 100); $('boss-percent').textContent = Math.ceil(percent) + '%'; $('boss-bar').style.width = percent + '%'; }
    if ((s.phase === 'won' || s.phase === 'lost') && !resultRecorded) recordResult();
  }
  function frame(now) {
    const dt = Math.min(.05, (now - (lastFrame || now)) / 1000); lastFrame = now; ambient += dt;
    if (game && game.state.phase === 'playing') {
      const axis = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0);
      const beforeX=game.state.x;game.step(dt, { axis, x: axis ? undefined : pointerX });
      moveMotion=clamp((game.state.x-beforeX)/Math.max(.001,dt*420),-1,1);shotMotion=Math.max(0,shotMotion-dt*7);if(game.state.boss){bossEntrance=Math.min(1,bossEntrance+dt/.9);if(game.state.boss.stage!==bossStageSeen){bossStageSeen=game.state.boss.stage;bossTransition=0;}bossTransition=Math.min(1,bossTransition+dt/.65);}
      skillPulse = Math.max(0, skillPulse - dt);
      for (const e of game.drainSignals()) { audio.effect(e.type,e);if(e.type==='shoot')shotMotion=1;if(e.type==='perfectDodge'){audio.effect('pickup');toast('完美闪避 / 护盾 +12 · 终极能量 +8%',1500);}if(e.type==='pickup')toast('强化接入 / '+(e.name||PICKUPS[e.kind]?.name||'战场芯片'),1800);if(e.type==='tactical')toast(game.state.tacticalName||HEROES[hero].tactical,1300);if(e.type==='ultimate')toast('终极释放 / '+HEROES[hero].ultimate,2200); if (e.type === 'skill') skillPulse = 1.5; if (e.type === 'boss') toast(`${LEVELS[level].boss}已锁定 / 躲开红色预警。`, 2800); if(e.type==='rage')toast('第二阶段 · BOSS 狂暴！',1800);if(e.type==='overdrive')toast('12 连击 / 火力过载',1400);if(e.type==='reinforce')toast('敌方增援抵达！',1400); }
      const messages=LEVELS[level].transmissions;
      if(radioIndex<messages.length&&game.state.time>LEVELS[level].duration*messages[radioIndex].at){const m=messages[radioIndex++], message=m.speaker+'：'+m.text;$('radio-text').textContent=message;toast(message,5000);}

    }
    audio.update({phase:game?.state.phase||'menu',bossStage:game?.state.boss?.stage||0,chapter:chapterNumber(),pressure:game?clamp(1-game.state.team/80,0,1):0,time:game?.state.time||0});
    if(game?.state.phase==='won'&&victoryStarted!==null&&!resultShown&&ambient-victoryStarted>=(reducedMotion ? 0 : Motion.ARCHIVE_REVEAL_TIME))showResult();
    if (now - lastHud > 80) { updateHud(); lastHud = now; }
    const settled=game&&(game.state.phase==='paused'||game.state.phase==='lost'||(game.state.phase==='won'&&victoryStarted!==null&&(reducedMotion||ambient-victoryStarted>=Motion.ARCHIVE_SETTLE_TIME)));
    const key=settled?`${game.state.phase}:${canvas.width}:${canvas.height}:${reducedMotion}:${save.effectsQuality}:${save.combatText}`:null;
    if(!settled||key!==stableFrameKey)draw(ambient);stableFrameKey=key;
    if(!updateHealthSent&&artLoaded&&enemyReady&&bossReady&&window.dogDesktop?.markUpdateHealthy){updateHealthSent=true;window.dogDesktop.markUpdateHealthy().catch(()=>{updateHealthSent=false;});}
    requestAnimationFrame(frame);
  }
  function pointerEvent(e) {
    return {id:e.pointerId,type:e.pointerType||'mouse',clientX:e.clientX,bounds:canvas.getBoundingClientRect(),x:game?.state.x??170};
  }
  function setPointer(value){if(value!==null)pointerX=value;}
  canvas.addEventListener('pointerdown',e=>{
    if(game?.state.phase==='won'&&!resultShown){e.preventDefault();recordResult();showResult(true);return;}
    if(!game||game.state.phase!=='playing'||(e.pointerType==='mouse'&&e.button!==0))return;
    const value=pointerInput.begin(pointerEvent(e));if(value===null)return;
    e.preventDefault();setPointer(value);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',e=>{
    if(!game||game.state.phase!=='playing')return;
    const events=e.getCoalescedEvents?.();const latest=events?.length?events[events.length-1]:e;
    setPointer(pointerInput.move(pointerEvent(latest)));
  });
  function releasePointer(e){
    if(!pointerInput.owns(e.pointerId))return;
    setPointer(pointerInput.end(e.pointerId,game?.state.x??170));
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',releasePointer);
  canvas.addEventListener('lostpointercapture',releasePointer);
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!pointerInput.dragging()&&game)pointerX=game.state.x;});
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if(game?.state.phase==='won'&&!resultShown&&['Escape','Enter'].includes(e.key)){e.preventDefault();recordResult();showResult(true);return;}
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { if (game?.state.phase === 'playing') { e.preventDefault(); pause(); } else if (game?.state.phase === 'paused') { e.preventDefault(); resume(); } return; }
    if (!game || game.state.phase !== 'playing') return;
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) { e.preventDefault(); keys.add(e.key); pointerX = null; }
    if(e.key.toLowerCase()==='q'){e.preventDefault();if(!e.repeat)game.requestTactical();}
    if(e.key.toLowerCase()==='r'){e.preventDefault();if(!e.repeat)game.requestUltimate();}
    if(e.key.toLowerCase()==='e'){e.preventDefault();if(!e.repeat)game.requestSupport();}
    if(e.key==='Shift'){e.preventDefault();if(!e.repeat)doDash();}
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) game.requestSkill(); }
  });
  document.addEventListener('keyup', e => { keys.delete(e.key); if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key))pointerX=null; });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause('切换窗口时已自动暂停，回来后继续就好。');audio.suspend();}});
  window.addEventListener('blur',()=>{pause('窗口离开时已自动暂停，战场状态已冻结。');audio.suspend();});
  function doDash(direction){
    if(!game)return;const axis=(keys.has('ArrowRight')||keys.has('d')||keys.has('D')?1:0)-(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')?1:0);
    if(game.dash(direction||axis)){pointerX=game.state.x;pointerInput.reanchor(game.state.x);}
  }
  $('lobby-map-link').addEventListener('click',()=> $('campaign-btn').click());
  $('start-btn').addEventListener('click', brief);
  $('close-brief').addEventListener('click',()=>$('brief-dialog').close());
  $('deploy-btn').addEventListener('click',()=>{if(!save.storySeen.includes(VISUAL_INTRO_KEY)){save.storySeen.push(VISUAL_INTRO_KEY);persist();}$('brief-dialog').close();start();});
  $('support-btn').addEventListener('click',()=>game?.requestSupport());$('dash-left').addEventListener('click',()=>doDash(-1));$('dash-right').addEventListener('click',()=>doDash(1));
  document.querySelectorAll('.more-menu button').forEach(button=>button.addEventListener('click',()=>button.closest('details').open=false));
  document.querySelectorAll('[data-loadout]').forEach(b=>b.addEventListener('click',()=>{if(game)return;save.loadout=Number(b.dataset.loadout);persist();updateMenu();})); $('pause-btn').addEventListener('click', () => pause()); $('resume-btn').addEventListener('click', resume);
  $('pause-restart').addEventListener('click', start); $('pause-home').addEventListener('click', homeToMap); $('result-home').addEventListener('click', homeToMap); $('result-retry').addEventListener('click', start);
  $('result-next').addEventListener('click', () => {
    if (!game?.state.won) { start(); return; }
    if (level + 1 < LEVELS.length) { level++; home(); start(); }
    else homeToMap();
  });
  $('skill-btn').addEventListener('click', () => game?.requestSkill());
  $('tactical-btn').addEventListener('click',()=>game?.requestTactical());$('ultimate-btn').addEventListener('click',()=>game?.requestUltimate());
  document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { if (game) return; level = Number(b.dataset.level);save.lastLevelId=LEVELS[level].id;persist(); updateMenu(); audio.init(); audio.tone(523, .1, .025); }));
  document.querySelectorAll('[data-hero]').forEach(b => b.addEventListener('click', () => { if (game) return; hero = Number(b.dataset.hero); save.hero = hero; persist(); updateMenu(); audio.init(); audio.tone(659, .1, .025); }));
  $('easy-mode').addEventListener('change', () => { save.easy = $('easy-mode').checked; persist(); updateMenu(); });
  function updateSoundButton() { $('sound-btn').setAttribute('aria-pressed', String(save.sound)); $('sound-btn').setAttribute('aria-label', save.sound ? '关闭声音' : '开启声音'); $('sound-btn').querySelector('use').setAttribute('href', save.sound ? '#i-volume' : '#i-mute'); }
  $('sound-btn').addEventListener('click', () => { save.sound = !save.sound; persist(); updateSoundButton(); if (save.sound) { audio.init(); audio.tone(659, .12, .025); } else audio.suspend(); });
  $('fullscreen-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.querySelector('.app-shell').requestFullscreen) await document.querySelector('.app-shell').requestFullscreen(); else toast('可以使用浏览器菜单进入全屏模式。'); } catch { toast('当前浏览器未开启全屏，可使用浏览器菜单。'); } });
  $('brand-home').addEventListener('click', e => { e.preventDefault(); if(game?.state.phase==='playing')pause('请从暂停面板返回行动地图，避免误触丢失当前行动。');else if(!game||['won','lost'].includes(game.state.phase))home(); });
  $('help-btn').addEventListener('click', () => { helpPaused = game?.state.phase === 'playing'; if (helpPaused) pause(); $('help-dialog').showModal(); });
  function closeHelp() { $('help-dialog').close(); }
  $('close-help').addEventListener('click', closeHelp); $('help-ok').addEventListener('click', closeHelp);
  $('help-dialog').addEventListener('close', () => { if (helpPaused) { helpPaused = false; resume(); } });
  $('help-dialog').addEventListener('click', e => { if (e.target === $('help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeHelp(); } });
  function resize(){stableFrameKey=null;const displayed=canvas.getBoundingClientRect().width||W,dpr=Math.min(3,window.devicePixelRatio||1);renderScale=Math.max(1.5,Math.min(3,displayed/W*dpr));canvas.width=Math.round(W*renderScale);canvas.height=Math.round(H*renderScale);renderScale=canvas.width/W;ctx.setTransform(renderScale,0,0,renderScale,0,0);ctx.imageSmoothingQuality='high';}
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize); resize();
  sprite.onload = () => { try { prepareSprites(); artLoaded = true; updatePortraits(); } catch { toast('角色图集读取失败，请重新打开完整游戏。',10000); } };
  sprite.onerror = () => { toast('角色图片加载失败，请重新打开完整的游戏文件。', 10000); };
  enemyImage.onload=()=>{try{prepareEnemies();enemyReady=true;}catch{toast('机体图集读取失败，请重新打开完整游戏。',10000);}};
  bossImage.onload=()=>{prepareBosses();bossReady=true;};bossImage.onerror=()=>toast('首领图集加载失败，请使用完整安装包。',8000);bossImage.src=window.DOG_BOSSES;
  enemyImage.onerror=()=>toast('机体图集加载失败。',10000);enemyImage.src=window.DOG_ENEMIES;
  $('enemy-list').innerHTML=ENEMIES.map((e,i)=>`<article class="enemy-entry"><canvas width="220" height="180" data-enemy="${i}" aria-label="${e.name}"></canvas><span class="micro">${e.role}</span><h3>${e.name}</h3><p>${e.detail}</p></article>`).join('');
  $('enemy-guide-btn').addEventListener('click',()=>{enemyHelpPaused=game?.state.phase==='playing';if(enemyHelpPaused)pause();$('enemy-dialog').showModal();});
  $('close-enemy').addEventListener('click',()=>$('enemy-dialog').close());$('enemy-dialog').addEventListener('close',()=>{if(enemyHelpPaused){enemyHelpPaused=false;resume();}});
  document.querySelectorAll('[data-act]').forEach(button=>button.addEventListener('click',()=>{
    if(game)return;activeAct=button.dataset.act;level=LEVELS.findIndex(l=>actFor(l).key===activeAct);save.lastLevelId=LEVELS[level].id;persist();updateMenu();
  }));
  function panel(id, onOpen) {
    let wasPlaying=false;
    $(id.replace('-dialog','-btn')).addEventListener('click',()=>{wasPlaying=game?.state.phase==='playing';if(wasPlaying)pause();onOpen();$(id).showModal();if(id==='campaign-dialog')requestAnimationFrame(()=>Expedition.focusCurrentCampaign());});
    $('close-'+id.replace('-dialog','')).addEventListener('click',()=>$(id).close());
    $(id).addEventListener('close',()=>{if(wasPlaying){wasPlaying=false;resume();}});
  }
  function isActiveBattle(){return game&&['playing','paused'].includes(game.state.phase);}
  function renderJournal(){
    const unlocked=l=>(save.records[l.id]?.normal.stars||save.records[l.id]?.assist.stars||0)>0;
    $('journal-summary').textContent=`已归档 ${LEVELS.filter(unlocked).length} / ${LEVELS.length} 份记录。完成行动后解锁，辅助模式也可以收集。`;
    $('journal-list').innerHTML=LEVELS.map((l,i)=>`<button data-journal="${i}" ${unlocked(l)?'':'disabled'}><small>${String(i+1).padStart(2,'0')} / ${escapeHTML(actFor(l).title)}</small><b>${unlocked(l)?escapeHTML(l.archive.title):'未归档 · '+escapeHTML(l.name)}</b></button>`).join('');
    const show=index=>{const l=LEVELS[index];$('journal-detail').innerHTML=`<span class="eyebrow">${escapeHTML(l.en)}</span><h3>${escapeHTML(l.archive.title)}</h3><p>${escapeHTML(l.archive.text)}</p><h4>行动之后</h4><p>${escapeHTML(l.outro)}</p><p>${escapeHTML(l.debrief)}</p><h4>通讯回放</h4>${l.transmissions.map(d=>`<p class="journal-radio"><b>${escapeHTML(d.speaker)}</b>${escapeHTML(d.text)}</p>`).join('')}`;document.querySelectorAll('[data-journal]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.journal)===index)));};
    $('journal-list').querySelectorAll('button:not(:disabled)').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.journal))));
    const first=unlocked(LEVELS[level])?level:LEVELS.findIndex(unlocked);
    if(first>=0)show(first);else $('journal-detail').innerHTML='<span class="eyebrow">THE STORY STARTS WITH YOU</span><h3>第一份记录，等你带回来。</h3><p>从失联港口出发。通关后，现场通讯、城市的秘密和两位搭档的小事都会保存在这里。</p>';
  }
  function syncSettings(){
    for(const [id,key] of [['music','musicVolume'],['effects','effectsVolume']]){$(id+'-volume').value=Math.round(save[key]*100);$(id+'-value').textContent=Math.round(save[key]*100)+'%';}
    $('combat-text-toggle').checked=save.combatText;$('effects-select').value=save.effectsQuality;
    $('reduce-motion').checked=reducedMotion;$('reduce-motion').disabled=systemReducedMotion;
    $('import-save').disabled=!!isActiveBattle();$('save-status').textContent=isActiveBattle()?'返回行动地图后即可导入存档。':'';
  }
  function renderCaptain(){
    const profile=captainProfile();Expedition.renderCaptain(profile,{
      onNode:(id,selected)=>{if(isActiveBattle())return;const key=Growth.HERO_KEYS[hero];save.captainBuilds[key]=Growth.setNode(save.records,hero,save.captainBuilds[key],id,selected);persist();renderCaptain();updateMenu();},
      onTactical:id=>{if(isActiveBattle())return;const key=Growth.HERO_KEYS[hero];save.captainBuilds[key]=Growth.selectTactical(save.records,hero,save.captainBuilds[key],id);persist();renderCaptain();updateMenu();},
      onReset:()=>{if(isActiveBattle())return;save.captainBuilds[Growth.HERO_KEYS[hero]]=Growth.resetBuild();persist();renderCaptain();updateMenu();}
    });
    if(isActiveBattle())$('captain-content').querySelectorAll('button').forEach(b=>b.disabled=true);
  }
  function renderEquipment(){Expedition.renderEquipment(LOADOUTS,save.loadout,index=>{if(isActiveBattle())return;save.loadout=index;persist();updateMenu();renderEquipment();});if(isActiveBattle())$('equipment-grid').querySelectorAll('button').forEach(b=>b.disabled=true);}
  function renderCampaign(){Expedition.renderCampaign({acts,levels:LEVELS,records:save.records,currentLevel:level,onSelect:index=>{if(isActiveBattle())return;level=index;activeAct=actFor(LEVELS[level]).key;save.lastLevelId=LEVELS[level].id;persist();$('campaign-dialog').close();home();updateMenu();}});if(isActiveBattle())$('campaign-map').querySelectorAll('button').forEach(b=>b.disabled=true);}
  panel('campaign-dialog',renderCampaign);panel('captain-dialog',renderCaptain);panel('equipment-dialog',renderEquipment);
  $('skip-celebration').addEventListener('click',()=>{recordResult();showResult(true);});
  $('current-mission-btn').addEventListener('click',()=>{$('campaign-btn').click();});
  panel('journal-dialog',renderJournal);panel('settings-dialog',syncSettings);
  for(const [id,key] of [['combat-text-toggle','combatText'],['effects-select','effectsQuality']])$(id).addEventListener('change',()=>{save[key]=key==='combatText'?$(id).checked:$(id).value;persist();});
  const icons={repair:'+',shield:'◇',rapid:'ϟ',pierce:'↑',battery:'E',magnet:'∩',nova:'✹'};
  $('loot-list').innerHTML=Object.entries(PICKUPS||{}).map(([key,item])=>`<article><span class="loot-orb ${key}" style="background:${escapeHTML(item.color)}">${icons[key]||'•'}</span><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.detail)}</small></article>`).join('');
  for(const [button,dialog,close]of[['loot-guide-btn','loot-dialog','close-loot'],['version-guide-btn','version-dialog','close-version']]){let wasPlaying=false;$(button).addEventListener('click',()=>{wasPlaying=game?.state.phase==='playing';if(wasPlaying)pause();$(dialog).showModal();});$(close).addEventListener('click',()=>$(dialog).close());$(dialog).addEventListener('close',()=>{if(wasPlaying){wasPlaying=false;resume();}});}

  for(const [id,key] of [['music','musicVolume'],['effects','effectsVolume']])$(id+'-volume').addEventListener('input',()=>{save[key]=Number($(id+'-volume').value)/100;$(id+'-value').textContent=Math.round(save[key]*100)+'%';persist();audio.init();});
  $('reduce-motion').addEventListener('change',()=>{save.reducedMotion=$('reduce-motion').checked;reducedMotion=systemReducedMotion||save.reducedMotion;document.documentElement.classList.toggle('reduce-motion',reducedMotion);persist();});
  $('export-save').addEventListener('click',async()=>{
    if(window.dogDesktop){try{const result=await window.dogDesktop.exportSave(JSON.stringify(window.DogProgress.exportSave(save,LEVELS)));$('save-status').textContent=result.saved?'存档已保存，可在另一版本导入。':'已取消导出。';}catch(error){$('save-status').textContent='导出未完成：'+error.message;}return;}
    const blob=new Blob([JSON.stringify(window.DogProgress.exportSave(save,LEVELS),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Dog-Squad-save-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('save-status').textContent='存档导出已交给系统下载。请保存文件，再到另一版本导入。';
  });
  $('import-save').addEventListener('click',()=>{if(!isActiveBattle())$('save-file').click();});
  $('save-file').addEventListener('change',async()=>{
    const file=$('save-file').files[0];$('save-file').value='';if(!file||isActiveBattle())return;
    try{if(file.size>1024*1024)throw Error('存档超过 1 MB 限制');const merged=window.DogProgress.importSave(await file.text(),save,LEVELS);localStorage.setItem(SAVE_KEY,JSON.stringify(window.DogProgress.capture(merged,LEVELS)));save=merged;hero=save.hero;level=Math.max(0,LEVELS.findIndex(l=>l.id===save.lastLevelId));activeAct=actFor(LEVELS[level]).key;reducedMotion=systemReducedMotion||save.reducedMotion;document.documentElement.classList.toggle('reduce-motion',reducedMotion);persist();home();updateSoundButton();updateMenu();syncSettings();$('save-status').textContent='导入完成，已合并两种模式的更好成绩。';}catch(error){$('save-status').textContent='未导入：'+error.message;}
  });
  let desktopState=null;
  const phases={disabled:'尚未连接发行频道',idle:'准备就绪',checking:'正在检查更新',available:'发现新版本',downloading:'正在下载',ready:'新版本已准备好，选择时间重启即可',installing:'正在准备重启安装',current:'当前已是最新版本','not-available':'当前已是最新版本',error:'检查未完成，现有内容仍可游玩'};
  function renderLibrary(){
    const installed=desktopState?.content?.packs||contentPacks.slice(1).map(p=>({id:p.id,title:p.title,version:p.version,levelCount:p.levels.length}));
    $('installed-packs').innerHTML=`<article class="pack-card"><span class="micro">BASE GAME / 本体</span><h3>星海远征</h3><p>${window.DogBuiltin.acts.map(a=>escapeHTML(a.title)).join(' → ')}</p><strong>${window.DogBuiltin.levels.length} 关 · ${window.DogBuiltin.acts.length} 章完整故事</strong><small>v${window.Mochi.APP_VERSION} · 已安装 · 离线可用</small></article>`+installed.map(p=>`<article class="pack-card"><span class="micro">CHAPTER PACK / 扩展章节</span><h3>${escapeHTML(p.title||p.id)}</h3><p>${p.levelCount||p.levels?.length||'新增'} 个行动</p><small>v${escapeHTML(p.version)} · 已安装 · 离线可用</small></article>`).join('');
    if(!window.dogDesktop){$('app-update-status').textContent='网页版 v1.1.0 · 在线版刷新更新；离线版下载新版 HTML';$('content-update-status').textContent='Mac 版支持独立章节下载与关卡包导入。网页版包含全部 48 关本体。';for(const id of ['auto-update','check-updates','import-pack','open-update-inbox'])$(id).disabled=true;return;}
    const a=desktopState?.app,c=desktopState?.content;
    $('app-update-status').textContent=a?`v${a.version||'1.1.0'} · ${phases[a.phase]||a.phase||'准备就绪'}${a.availableVersion?' / 新版本 '+a.availableVersion:''}${a.reason?'。'+a.reason:''}${a.phase==='downloading'&&Number.isFinite(a.progress)?' '+Math.round(a.progress)+'%':''}`:'正在读取应用状态…';
    $('content-update-status').textContent=c?`${c.error||c.localInbox?.message||c.reason||'已安装章节可离线游玩'}${c.lastCheck?' · 上次检查 '+new Date(c.lastCheck).toLocaleString():''}`:'正在读取关卡库…';
    $('auto-update').checked=desktopState?.preferences?.automaticUpdates!==false;
    $('auto-update').disabled=false;$('open-update-inbox').disabled=false;$('check-updates').disabled=false;$('import-pack').disabled=!!isActiveBattle()||!c?.enabled;
    const changed=installed.map(p=>p.id+'@'+p.version).sort().join()!==contentPacks.slice(1).map(p=>p.id+'@'+p.version).sort().join();
    $('reload-content').hidden=!changed;$('reload-content').disabled=!!isActiveBattle();
    const rollback=installed.find(p=>p.canRollback||p.hasPrevious);$('rollback-pack').hidden=!rollback;$('rollback-pack').dataset.packId=rollback?.id||'';$('rollback-pack').disabled=!!isActiveBattle();
    $('install-update').hidden=a?.phase!=='ready';$('install-update').disabled=!!isActiveBattle();$('update-dot').hidden=!changed&&a?.phase!=='ready';$('start-btn').disabled=a?.phase==='installing';$('deploy-btn').disabled=a?.phase==='installing';
  }
  async function desktopTask(fn,success){$('library-status').textContent='正在处理…';try{await fn();desktopState=await window.dogDesktop.getState();renderLibrary();$('library-status').textContent=success;}catch(error){$('library-status').textContent=error.message;}}
  panel('library-dialog',()=>{renderLibrary();if(window.dogDesktop)window.dogDesktop.getState().then(s=>{desktopState=s;renderLibrary();}).catch(e=>$('library-status').textContent=e.message);});
  $('check-updates').addEventListener('click',()=>desktopTask(()=>window.dogDesktop.checkUpdates(),'检查完成，状态已更新。'));
  $('open-update-inbox').addEventListener('click',()=>desktopTask(()=>window.dogDesktop.openUpdateInbox(),'已打开本机自动更新目录。放入官方签名关卡包后，会在安全时自动接收。'));
  $('import-pack').addEventListener('click',()=>{if(!isActiveBattle())desktopTask(()=>window.dogDesktop.importPack(),'关卡库已刷新。安装成功的新章节可点击「载入新章节」进入。');});
  $('rollback-pack').addEventListener('click',()=>{if(!isActiveBattle())desktopTask(()=>window.dogDesktop.rollbackPack($('rollback-pack').dataset.packId),'已回退，点击「载入新章节」切换内容。行动记录保留。');});
  $('reload-content').addEventListener('click',()=>{if(!isActiveBattle()){persist();window.dogDesktop.reloadContent().catch(error=>toast(error.message));}});
  $('install-update').addEventListener('click',()=>{if(!isActiveBattle())desktopTask(()=>window.dogDesktop.installAppUpdate(),'正在准备重启…');});
  $('auto-update').addEventListener('change',()=>desktopTask(()=>window.dogDesktop.setPreferences({automaticUpdates:$('auto-update').checked}),'更新偏好已保存。'));
  if(window.dogDesktop){window.dogDesktop.onState(s=>{desktopState=s;renderLibrary();});window.dogDesktop.getState().then(s=>{desktopState=s;renderLibrary();}).catch(()=>{});}
  sprite.src = window.MOCHI_SPRITES;
  portraitImage.onload=()=>{portraitReady=true;updatePortraits();};portraitImage.src=window.DOG_HERO_PORTRAITS;
  updateSoundButton(); updateMenu();persist();
  Story?.init({canRead:request=>{if(request.type==='epilogue')return save.storySeen.includes('epilogue')||['normal','assist'].some(mode=>save.records['daybreak-48']?.[mode]?.stars>0);if(request.type==='chapter'&&request.phase==='ending'){const key='chapter:'+request.actId+':ending',last=window.DogBuiltin.levels.filter(l=>l.act===request.actId).at(-1);return save.storySeen.includes(key)||!!last&&['normal','assist'].some(mode=>save.records[last.id]?.[mode]?.stars>0);}return true;},onClose:()=>{}});
  if(startupWarnings.length)toast(startupWarnings.join(' '),10000);
  if (!storageWorks) $('save-note').textContent = '浏览器未允许保存，仍可正常游玩';
  if (matchMedia('(pointer: coarse)').matches) { $('move-hint').textContent = '按住相对拖动 · 点箭头冲刺 · 点按支援'; document.querySelector('.lobby-bottom p').textContent = '相对拖动移动 · 按钮释放技能'; }
  // Read-only diagnostics are useful for reproducible browser verification.
  Object.defineProperty(window, 'mochiDebug', { value: Object.freeze({ snapshot: () => game ? game.snapshot() : { phase: 'lobby', level, levelId:LEVELS[level].id, levelCount:LEVELS.length, hero, easy: save.easy }, assetsReady: () => artLoaded&&enemyReady&&bossReady, audio:()=>audio.diagnostics(), rendering:()=>({width:canvas.width,height:canvas.height,scale:renderScale,dpr:devicePixelRatio,celebrating:victoryStarted!==null&&!resultShown,recorded:resultRecorded,nativeResultPending}), savedProgress: () => JSON.parse(JSON.stringify(save)) }) });
  requestAnimationFrame(frame);
})().catch(error=>{console.error(error);const message=document.createElement('p');message.className='startup-error';message.textContent='游戏未能载入，请重新打开完整安装版本。'+error.message;document.body.prepend(message);});
