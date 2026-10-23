(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogExpeditionUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const THEMES = [
    { key:'harbor', sky:'#c9efed', accent:'#267c82', land:'#69b8a8', rock:'#377f83', label:'灯火初醒 / 港口与旧城', emblem:'灯塔' },
    { key:'echo', sky:'#f7d7c7', accent:'#a85e66', land:'#e4ac94', rock:'#a16879', label:'信号回响 / 城市与海岸', emblem:'回声' },
    { key:'sea', sky:'#c9e2fa', accent:'#447baf', land:'#82b4d3', rock:'#447d9f', label:'循光远航 / 灯塔与外海', emblem:'航线' },
    { key:'garden', sky:'#d8f5d4', accent:'#41836c', land:'#93d6a2', rock:'#52958a', label:'云端萌芽 / 浮岛与花园', emblem:'生长' },
    { key:'aurora', sky:'#d2f0f7', accent:'#6e6aa5', land:'#a9c5e3', rock:'#7479a9', label:'极光脉冲 / 冰原与工坊', emblem:'极光' },
    { key:'starport', sky:'#fce4c8', accent:'#ae7354', land:'#ecbc89', rock:'#b48282', label:'相约晨曦 / 星港与归途', emblem:'归途' }
  ];
  const ROMAN = ['I','II','III','IV','V','VI'];
  const KIT_GLYPHS = ['◉','ϟ','⬡','✦','◎','⌁','✹','✧'];
  const KIT_COLORS = ['#8ee2cf','#ffb18d','#a9c5ff','#e4b2f4','#a8e1a4','#f0d68f','#81d9ee','#f6b9cf'];
  const WORLD_POINTS = [[17,26],[50,26],[83,26],[17,74],[50,74],[83,74]];
  const NODE_OFFSETS = [[-8,4],[-2.7,4],[2.7,4],[8,4],[8,11],[2.7,11],[-2.7,11],[-8,11]];
  const nextFrame = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : callback();
  const $ = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function button(className, label, callback) {
    const node = el('button', className, label);
    node.type = 'button';
    if (typeof callback === 'function') node.addEventListener('click', callback);
    return node;
  }
  function focusKey(target) {
    const active=document.activeElement;if(!target.contains(active))return null;
    for(const attr of ['data-training-node','data-tactical-id','data-equipment-index'])if(active.hasAttribute(attr))return {attr,value:active.getAttribute(attr)};
    return active.id?{id:active.id}:null;
  }
  function restoreFocus(target,key) {
    if(!key)return;
    const controls=Array.from(target.querySelectorAll('button'));
    const match=controls.find(node=>key.id?node.id===key.id:node.getAttribute(key.attr)===key.value);
    const next=match&&!match.disabled?match:controls.find(node=>!node.disabled);
    next?.focus({preventScroll:true});
  }
  function num(value) { return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }
  function recordFor(records, id) {
    const row = records && typeof records === 'object' ? records[id] : null;
    const normal = row?.normal || {}, assist = row?.assist || {};
    return { complete:num(normal.stars) > 0 || num(assist.stars) > 0, stars:Math.min(3,Math.max(num(normal.stars),num(assist.stars))), medals:Math.min(3,Math.max(num(normal.medals),num(assist.medals))), assistOnly:!num(normal.stars)&&!!num(assist.stars) };
  }
  function belongs(level, act) {
    if (!level || !act || level.act !== act.id) return false;
    return !level.packId || !act.packId || level.packId === act.packId;
  }
  function titleFor(act) { return String(act.title || '新的旅程').replace(/^第[一二三四五六七八九十\d]+[幕章]\s*[·・：:]?\s*/, ''); }
  function svgNode(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key,value] of Object.entries(attrs || {})) n.setAttribute(key, String(value));
    return n;
  }
  function addSvg(parent, tag, attrs) { const n=svgNode(tag,attrs);parent.append(n);return n; }
  function scene(theme, index) {
    const svg=svgNode('svg',{viewBox:'0 0 360 154',class:'chapter-scene','aria-hidden':'true',focusable:'false'});
    addSvg(svg,'rect',{width:360,height:154,fill:theme.sky});
    addSvg(svg,'circle',{cx:292,cy:38,r:24,fill:'#fff7d6'});
    const clouds=addSvg(svg,'g',{fill:'#ffffff',opacity:'.7'});
    [[45,34,30,6],[118,59,22,5],[250,84,36,6],[328,104,26,5]].forEach(([cx,cy,rx,ry])=>addSvg(clouds,'ellipse',{cx,cy,rx,ry}));
    addSvg(svg,'path',{d:'M0 138 Q70 118 124 137 T240 131 T360 128 V154 H0Z',fill:theme.accent,opacity:'.08'});
    addSvg(svg,'ellipse',{cx:180,cy:143,rx:96,ry:7,fill:theme.rock,opacity:'.15'});
    addSvg(svg,'path',{d:'M81 103 L112 126 L148 136 L172 128 L193 144 L232 126 L277 103 Z',fill:theme.rock});
    addSvg(svg,'path',{d:'M119 113 L147 133 L154 114 M193 119 L193 139 L217 114',stroke:'#ffffff',opacity:'.2','stroke-width':3,fill:'none'});
    addSvg(svg,'ellipse',{cx:180,cy:101,rx:99,ry:23,fill:theme.land});
    addSvg(svg,'ellipse',{cx:180,cy:97,rx:87,ry:17,fill:'#fff8df',opacity:'.55'});
    addSvg(svg,'path',{d:'M121 103 Q149 91 174 101 T242 99',fill:'none',stroke:'#fffbe8','stroke-width':7,'stroke-linecap':'round'});
    // Each chapter uses an original miniature landmark rather than borrowed character art.
    if(index%6===0){
      addSvg(svg,'path',{d:'M168 99 L174 43 H192 L199 99Z',fill:'#fff9e5',stroke:theme.rock,'stroke-width':2});
      addSvg(svg,'path',{d:'M174 62 H194 M172 79 H196',stroke:'#faab8d','stroke-width':8});
      addSvg(svg,'rect',{x:170,y:35,width:27,height:17,rx:3,fill:theme.rock});
      addSvg(svg,'rect',{x:176,y:39,width:15,height:9,rx:2,fill:'#ffe6a0'});
      addSvg(svg,'path',{d:'M167 35 L184 24 L201 35Z',fill:'#ed9d7c'});
      addSvg(svg,'path',{d:'M177 44 L113 29 L117 55Z M191 44 L249 30 L246 57Z',fill:'#fff5bc',opacity:'.66'});
      addSvg(svg,'path',{d:'M118 106 H151 L145 114 H124Z',fill:'#46677a'});
      addSvg(svg,'path',{d:'M135 104 V77 L151 98Z',fill:'#fffaf0'});
    } else if(index%6===1){
      [[125,63,28,38],[162,46,35,55],[207,68,25,34]].forEach(([x,y,w,h],n)=>{
        addSvg(svg,'rect',{x,y,width:w,height:h,rx:5,fill:n===1?'#f7f2dc':'#d48e88',stroke:theme.rock,'stroke-width':2});
        for(let row=0;row<2;row++)for(let col=0;col<2;col++)addSvg(svg,'rect',{x:x+6+col*12,y:y+9+row*14,width:6,height:7,rx:1,fill:n===1?'#98cfc7':'#ffe1a8'});
      });
      addSvg(svg,'path',{d:'M179 46 V30 M172 33 Q179 25 186 33 M166 27 Q179 14 192 27',fill:'none',stroke:theme.rock,'stroke-width':3,'stroke-linecap':'round'});
      addSvg(svg,'circle',{cx:245,cy:87,r:8,fill:'#a2d8c9'});
      addSvg(svg,'path',{d:'M245 94 V108',stroke:theme.rock,'stroke-width':3});
    } else if(index%6===2){
      addSvg(svg,'path',{d:'M126 99 L152 113 H217 L240 98Z',fill:'#eff4df',stroke:theme.rock,'stroke-width':2});
      addSvg(svg,'rect',{x:164,y:78,width:41,height:21,rx:3,fill:'#f4c47f'});
      addSvg(svg,'path',{d:'M181 78 V34 L217 74 H181Z',fill:'#fff9e9',stroke:theme.rock,'stroke-width':2});
      addSvg(svg,'path',{d:'M176 47 L148 78 H176Z',fill:'#8dd5d4'});
      addSvg(svg,'circle',{cx:158,cy:103,r:3,fill:theme.rock});addSvg(svg,'circle',{cx:219,cy:103,r:3,fill:theme.rock});
      addSvg(svg,'path',{d:'M110 119 Q125 113 140 119 T170 119 M217 122 Q232 116 247 122',stroke:'#fffdf0','stroke-width':3,fill:'none'});
    } else if(index%6===3){
      addSvg(svg,'path',{d:'M135 100 V75 Q135 42 180 42 Q225 42 225 75 V100Z',fill:'#f4ffec',stroke:theme.rock,'stroke-width':2,opacity:'.9'});
      addSvg(svg,'path',{d:'M180 42 V101 M135 73 H225 M157 49 Q148 73 154 100 M203 49 Q212 73 206 100',fill:'none',stroke:'#a5d1b3','stroke-width':3});
      [[149,93],[182,94],[214,92]].forEach(([x,y])=>{addSvg(svg,'path',{d:`M${x} ${y} V${y-20}`,stroke:'#66a479','stroke-width':3});addSvg(svg,'ellipse',{cx:x-6,cy:y-14,rx:8,ry:4,fill:'#8dc69a',transform:`rotate(28 ${x-6} ${y-14})`});addSvg(svg,'circle',{cx:x,cy:y-23,r:7,fill:'#f6bc9c'});addSvg(svg,'circle',{cx:x,cy:y-23,r:3,fill:'#fff5bc'});});
      addSvg(svg,'ellipse',{cx:252,cy:76,rx:17,ry:7,fill:'#aeddb1'});addSvg(svg,'path',{d:'M235 76 L249 87 L262 79',fill:theme.rock});
    } else if(index%6===4){
      addSvg(svg,'path',{d:'M39 34 Q123 1 182 43 T329 30 M52 51 Q128 16 186 56 T338 43',fill:'none',stroke:'#c49ed6','stroke-width':8,opacity:'.42'});
      [[127,104,25,63],[169,106,31,78],[216,104,23,52]].forEach(([x,y,w,h],n)=>{addSvg(svg,'path',{d:`M${x} ${y} V${y-h+15} L${x+w/2} ${y-h} L${x+w} ${y-h+15} V${y}Z`,fill:n===1?'#f1faf5':'#bbdbe4',stroke:theme.rock,'stroke-width':2});addSvg(svg,'path',{d:`M${x+w/2} ${y-h} V${y}`,stroke:'#ffffff','stroke-width':3,opacity:'.8'});});
      addSvg(svg,'circle',{cx:185,cy:79,r:11,fill:'#d0a5d8',stroke:'#fff2db','stroke-width':4});
      addSvg(svg,'circle',{cx:185,cy:79,r:4,fill:'#fff7da'});
    } else {
      addSvg(svg,'ellipse',{cx:180,cy:104,rx:58,ry:10,fill:'#e8b590',stroke:theme.rock,'stroke-width':2});
      addSvg(svg,'path',{d:'M142 99 V65 Q180 22 218 65 V99',fill:'none',stroke:'#fff1d9','stroke-width':13});
      addSvg(svg,'path',{d:'M143 98 V65 Q180 24 217 65 V98',fill:'none',stroke:theme.rock,'stroke-width':2});
      addSvg(svg,'path',{d:'M180 49 L187 65 L205 68 L191 80 L194 97 L180 89 L165 97 L168 80 L154 68 L173 65Z',fill:'#fff8dc',stroke:'#e4a874','stroke-width':2});
      addSvg(svg,'path',{d:'M112 99 V76 L127 84 L112 91 M247 99 V76 L263 84 L247 91',fill:'#8fcfd8',stroke:theme.rock,'stroke-width':2});
    }
    [[98,92],[256,101],[227,117]].forEach(([cx,cy],n)=>{addSvg(svg,'circle',{cx,cy,r:4,fill:n%2?'#ffe3a5':'#eef9de'});addSvg(svg,'circle',{cx:cx+1,cy:cy-1,r:1,fill:'#fff'});});
    return svg;
  }
  function renderCampaign(options) {
    const target=$('campaign-map');if(!target)return;
    const {acts=[],levels=[],records={},currentLevel=0,onSelect}=options||{};
    const current=typeof currentLevel==='string'?levels.findIndex(l=>l.id===currentLevel):num(currentLevel);
    const complete=levels.filter(l=>recordFor(records,l.id).complete).length;
    const summary=$('campaign-summary');if(summary)summary.textContent=`${complete} / ${levels.length} 已点亮`;
    const islands=[];
    for(const act of acts){
      const entries=levels.map((level,index)=>({level,index})).filter(row=>belongs(row.level,act));
      for(let offset=0;offset<entries.length;offset+=8)islands.push({act,entries:entries.slice(offset,offset+8),offset,total:entries.length});
    }
    const pageCount=Math.max(1,Math.ceil(islands.length/6));
    const activeIsland=Math.max(0,islands.findIndex(island=>island.entries.some(row=>row.index===current)));
    let activePage=Math.min(pageCount-1,Math.floor(activeIsland/6));
    const shell=el('div','picture-map-shell');
    const pageTabs=el('nav','map-page-tabs');pageTabs.setAttribute('aria-label','选择地图页');
    const toolbar=el('div','map-toolbar'),zoomTools=el('div','map-zoom-tools');let zoom=1;
    const zoomLabel=el('span','map-zoom-label','100%');
    const centerCurrent=()=>{const node=viewport.querySelector('.picture-level.current');node?.scrollIntoView({block:'center',inline:'center',behavior:'instant'});};
    const applyZoom=()=>{const canvas=viewport.querySelector('.picture-map-canvas');if(!canvas)return;canvas.style.width=`${zoom*100}%`;canvas.style.minWidth=`${zoom*960}px`;zoomLabel.textContent=`${Math.round(zoom*100)}%`;nextFrame(centerCurrent);};
    const zoomOut=button('map-zoom-button','−',()=>{zoom=Math.max(1,zoom-.25);applyZoom();});zoomOut.setAttribute('aria-label','缩小地图');
    const zoomIn=button('map-zoom-button','＋',()=>{zoom=Math.min(1.75,zoom+.25);applyZoom();});zoomIn.setAttribute('aria-label','放大地图');
    zoomTools.append(zoomOut,zoomLabel,zoomIn);toolbar.append(pageTabs,zoomTools);
    const viewport=el('div','picture-map-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','关卡地图，可横向和纵向滚动');
    const renderPage=page=>{
      activePage=page;
      const pageIslands=islands.slice(page*6,page*6+6),canvas=el('section','picture-map-canvas');
      canvas.dataset.page=String(page);canvas.setAttribute('aria-label',`第 ${page+1} 张冒险地图`);
      const image=el('img','picture-map-art');image.src=window.DOG_WORLD_CUTE||'';image.alt='六座可爱岛屿组成的狗狗突击队冒险地图';canvas.append(image);
      const layer=el('div','picture-map-layer');
      pageIslands.forEach(({act,entries,offset:missionOffset,total},slot)=>{
        const [cx,cy]=WORLD_POINTS[slot];
        const count=entries.filter(row=>recordFor(records,row.level.id).complete).length;
        const island=el('section','map-island');island.style.setProperty('--island-x',`${cx}%`);island.style.setProperty('--island-y',`${cy}%`);island.dataset.actKey=act.key||`${act.packId||'builtin'}:${act.id}`;
        const label=el('div','map-island-label');label.append(el('b','',titleFor(act)+(total>8?` · ${Math.floor(missionOffset/8)+1}`:'')),el('span','',`${count}/${entries.length}`));island.append(label);
        entries.forEach(({level,index:levelIndex},position)=>{
          const record=recordFor(records,level.id),offset=NODE_OFFSETS[position%NODE_OFFSETS.length];
          const node=button('map-level picture-level',undefined,()=>onSelect?.(levelIndex));
          node.style.setProperty('--node-x',`${cx+offset[0]}%`);node.style.setProperty('--node-y',`${cy+offset[1]}%`);
          node.dataset.mapLevel=String(levelIndex);node.dataset.levelIndex=String(levelIndex);node.dataset.levelKey=`${level.packId||act.packId||'builtin'}:${level.key||level.id}`;
          const finale=missionOffset+position===total-1;
          node.classList.toggle('complete',record.complete);node.classList.toggle('current',levelIndex===current);node.classList.toggle('assist-only',record.assistOnly);node.classList.toggle('chapter-finale',finale);
          node.setAttribute('aria-pressed',String(levelIndex===current));node.setAttribute('aria-label',`${level.name}，${levelIndex===current?'当前关卡，':''}${record.complete?record.stars+' 星完成'+(record.assistOnly?'，辅助模式':'，标准模式'):'待挑战'}`);
          node.append(el('span','picture-level-token',finale?'★':String(missionOffset+position+1)),el('span','picture-level-stars',record.complete?'★'.repeat(record.stars):''),el('span','picture-level-tooltip',level.name));
          layer.append(node);
        });
        layer.append(island);
      });
      canvas.append(layer,el('span','map-drag-hint','↔ 拖动看地图'));
      viewport.replaceChildren(canvas);applyZoom();
      pageTabs.querySelectorAll('button').forEach((tab,index)=>{tab.classList.toggle('active',index===page);tab.setAttribute('aria-pressed',String(index===page));});
      nextFrame(()=>{centerCurrent();viewport.querySelector('.picture-level.current')?.focus({preventScroll:true});});
    };
    for(let page=0;page<pageCount;page++){
      const tab=button('map-page-tab',pageCount===1?'六岛地图':`地图 ${page+1}`,()=>renderPage(page));tab.setAttribute('aria-pressed',String(page===activePage));tab.classList.toggle('active',page===activePage);pageTabs.append(tab);
    }
    shell.append(toolbar,viewport);target.replaceChildren(shell);renderPage(activePage);
  }
  function renderCaptain(profile,callbacks) {
    const target=$('captain-content');if(!target)return;
    const savedFocus=focusKey(target),p=profile||{},cb=callbacks||{},fragment=document.createDocumentFragment();
    const banner=el('div','training-banner');const identity=el('div');identity.append(el('span','eyebrow','CURRENT CAPTAIN'),el('h3','',p.heroKey==='bing'?'Bing Bong · 火力守卫':'Ramen · 侦察先锋'));banner.append(identity);
    const points=el('div','training-points');points.append(el('b','',num(p.available)),el('span','','可用训练点'));banner.append(points);fragment.append(banner);
    const status=el('p','training-status',`累计 ${num(p.points)} 点 · 已分配 ${num(p.spent)} 点 · 完成 ${num(p.completed)} 次行动 · ${num(p.medals)} 枚挑战勋章`);status.setAttribute('role','status');fragment.append(status);
    const routes=el('div','training-routes');
    (p.routes||[]).forEach((route,index)=>{
      const section=el('section','training-route');section.style.setProperty('--route-color',KIT_COLORS[index%KIT_COLORS.length]);
      const heading=el('div','route-heading');heading.append(el('span','route-icon',KIT_GLYPHS[(index+3)%KIT_GLYPHS.length]),el('h3','',route.name));section.append(heading,el('p','route-detail',route.detail));
      (route.nodes||[]).forEach((node,n)=>{
        const control=button('training-node',undefined,()=>cb.onNode?.(node.id));control.dataset.trainingNode=node.id;control.disabled=!!node.selected||!node.available;control.classList.toggle('selected',!!node.selected);control.setAttribute('aria-pressed',String(!!node.selected));
        const head=el('span','training-node-heading');head.append(el('span','node-order',String(n+1).padStart(2,'0')),el('b','',node.name),el('span','node-cost',node.selected?'✓ 已学习':`${num(node.cost)||1} 点`));control.append(head,el('span','training-node-detail',node.detail));
        if(!node.selected&&!node.available)control.append(el('small','node-requirement',node.parent?'先完成前序训练，并保留足够训练点':'需要更多训练点'));
        section.append(control);
      });routes.append(section);
    });fragment.append(routes);
    const modules=el('section','tactical-workshop'),heading=el('div','tactical-heading');heading.append(el('h3','','本次行动的 Q 战术'),el('span','','只选择一项 · 随时更换'));modules.append(heading);
    const cards=el('div','tactical-grid');
    (p.tacticals||[]).forEach((tactical,index)=>{
      const card=button('tactical-module',undefined,()=>cb.onTactical?.(tactical.id));card.dataset.tacticalId=tactical.id;card.disabled=!tactical.unlocked;card.classList.toggle('selected',!!tactical.selected);card.setAttribute('aria-pressed',String(!!tactical.selected));card.append(el('span','module-key','Q'),el('span','module-state',tactical.selected?'已装备':tactical.unlocked?'可装备':'训练后解锁'),el('h4','',tactical.name),el('p','',tactical.detail),el('small','',Number.isFinite(tactical.cooldown)?`冷却 ${tactical.cooldown} 秒`:'队长专属战术'));cards.append(card);
    });modules.append(cards);fragment.append(modules);
    const footer=el('div','training-footer');footer.append(el('p','','训练点与行动记录保存在本机。重置只返还已分配的训练点，不会清除成绩。'));const reset=button('secondary-btn','重新分配训练点',()=>cb.onReset?.());reset.id='reset-captain-build';reset.disabled=!num(p.spent);footer.append(reset);fragment.append(footer);target.replaceChildren(fragment);restoreFocus(target,savedFocus);
  }
  function renderEquipment(loadouts,current,onSelect) {
    const target=$('equipment-grid');if(!target)return;
    const savedFocus=focusKey(target),list=Array.isArray(loadouts)?loadouts:[],selected=Number.isFinite(current)?Math.floor(current):0;
    const label=$('equipment-current');if(label)label.textContent=list[selected]?`当前配置：${list[selected].name} · 出战前可自由更换`:'请选择一套出战装备';
    const fragment=document.createDocumentFragment();
    list.forEach((kit,index)=>{
      const card=button('equipment-card',undefined,()=>onSelect?.(index));card.dataset.equipmentIndex=String(index);card.classList.toggle('selected',index===selected);card.setAttribute('aria-pressed',String(index===selected));card.style.setProperty('--kit-color',KIT_COLORS[index%KIT_COLORS.length]);
      const art=el('div','equipment-art');art.append(el('span','kit-orbit'),el('span','kit-core',KIT_GLYPHS[index%KIT_GLYPHS.length]),el('span','kit-number',`KIT ${String(index+1).padStart(2,'0')}`),el('span','kit-state',index===selected?'✓ 已装备':'选择装备'));card.append(art);
      const body=el('div','equipment-copy');body.append(el('h3','',kit.name),el('p','',kit.detail));
      if(kit.role)body.append(el('span','equipment-role',kit.role));
      card.append(body);fragment.append(card);
    });target.replaceChildren(fragment);restoreFocus(target,savedFocus);
  }
  function focusCurrentCampaign() {
    const node=$('campaign-map')?.querySelector('.map-level.current');if(!node)return false;
    node.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    node.focus({preventScroll:true});return true;
  }
  // Display-only debrief. Game owns the outcome, persisted record and transition timing.
  // No timers: restarting or skipping a reveal cannot leave a stale callback behind.
  function renderDebrief(options) {
    const {won=false,stars=0,rank='—',instant=false}=options||{};
    const overlay=$('result-overlay'),card=overlay?.querySelector('.result-card'),reveal=$('result-star-reveal');
    if(!card||!reveal)return;
    const earned=won?Math.min(3,num(stars)):0;
    card.classList.remove('revealing','settled');card.classList.toggle('result-defeat',!won);
    card.dataset.stars=String(earned);card.dataset.outcome=won?'won':'lost';
    reveal.hidden=!won;reveal.setAttribute('aria-label',`${earned} / 3 星，${3-earned} 颗未获得`);
    reveal.querySelectorAll('[data-result-star]').forEach((node,index)=>{node.classList.toggle('earned',index<earned);node.style.setProperty('--star-delay',`${index*.16}s`);});
    if($('result-stars'))$('result-stars').textContent=won?String(rank):'—';
    const stamp=card.querySelector('.result-rank-stamp');if(stamp)stamp.hidden=!won;
    const picture=$('result-postcard');if(picture)picture.hidden=!won;
    if($('result-kicker'))$('result-kicker').textContent=won?'行动完成':'再试一次';
    if($('result-title'))$('result-title').textContent=won?'好耶，过关啦！':'差一点就成功！';
    if($('result-description'))$('result-description').textContent=won?'新的小星星已经收好。':'换套装备，再来一次吧。';
    for(const id of ['result-archive','result-story','result-growth'])if($(id))$(id).hidden=true;
    const content=card.querySelector('.result-content');if(content)content.scrollTop=0;
    const details=card.querySelector('.result-statistics');if(details)details.open=false;
    card.classList.add(instant||!won?'settled':'revealing');
  }
  return Object.freeze({renderCampaign,renderCaptain,renderEquipment,renderDebrief,focusCurrentCampaign});
});
