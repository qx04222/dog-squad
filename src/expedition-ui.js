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
  const WORLD_POINTS = [[16,76],[30,43],[52,66],[50,23],[78,51],[86,19]];
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
    const summary=$('campaign-summary');if(summary)summary.textContent=`${acts.length} 个章节 · ${complete} / ${levels.length} 次行动完成。选择一站，继续我们的故事。`;
    const recommend=levels.findIndex(l=>!recordFor(records,l.id).complete);
    const frag=document.createDocumentFragment();
    if(recommend>=0){
      const next=button('campaign-next',undefined,()=>onSelect?.(recommend));
      next.append(el('span','next-compass','✦'),el('span','next-label','推荐下一站'));
      const copy=el('span','next-copy');copy.append(el('b','',levels[recommend].name),el('small','',levels[recommend].subtitle||levels[recommend].objective||''));next.append(copy,el('span','next-arrow','开始准备 ↗'));frag.append(next);
    }else{
      const done=el('div','campaign-complete');done.append(el('b','','所有航标都已点亮。'),el('p','','故事留在这里。换一位队长、尝试新的配置，再去看看熟悉的伙伴。'));frag.append(done);
    }
    const overview=el('section','atlas-overview');overview.setAttribute('aria-label','六座故事岛屿总览');
    const panorama=el('img','atlas-panorama');panorama.src=window.DOG_WORLD_MAP||'../assets/world-map.jpg';panorama.alt='六座星海岛屿与远征航线全景地图';overview.append(panorama);
    const route=el('div','atlas-route');
    const chapterKey=act=>act.key||`${act.packId||''}:${act.id}`;
    const focusChapter=act=>{const chapter=Array.from(target.querySelectorAll('.chapter-card')).find(card=>card.dataset.actKey===chapterKey(act));chapter?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});chapter?.querySelector('.map-level.current,.map-level')?.focus({preventScroll:true});};
    acts.slice(0,WORLD_POINTS.length).forEach((act,index)=>{
      const entries=levels.map((level,i)=>({level,index:i})).filter(row=>belongs(row.level,act));
      const count=entries.filter(row=>recordFor(records,row.level.id).complete).length;
      const point=button('atlas-point',undefined,()=>focusChapter(act));
      point.style.setProperty('--map-x',`${WORLD_POINTS[index%WORLD_POINTS.length][0]}%`);point.style.setProperty('--map-y',`${WORLD_POINTS[index%WORLD_POINTS.length][1]}%`);
      point.classList.toggle('active',entries.some(row=>row.index===current));point.classList.toggle('complete',count===entries.length&&entries.length>0);
      point.setAttribute('aria-label',`${titleFor(act)}，${count} / ${entries.length} 次行动完成`);
      point.append(el('span','atlas-point-pulse'),el('b','',String(index+1).padStart(2,'0')),el('small','',titleFor(act)));route.append(point);
    });
    overview.append(route,el('span','atlas-caption','THE HOMEWARD ROUTE / 点击航标查看章节'));frag.append(overview);
    if(acts.length>WORLD_POINTS.length){const extensions=el('nav','atlas-expansions');extensions.setAttribute('aria-label','扩展章节航线');extensions.append(el('b','','扩展航线'));for(const act of acts.slice(WORLD_POINTS.length))extensions.append(button('chapter-story-link',titleFor(act),()=>focusChapter(act)));frag.append(extensions);}
    const grid=el('div','chapter-grid');
    acts.forEach((act,index)=>{
      const entries=levels.map((level,i)=>({level,index:i})).filter(row=>belongs(row.level,act));
      const count=entries.filter(row=>recordFor(records,row.level.id).complete).length;
      const theme=THEMES[index%THEMES.length], card=el('article',`chapter-card chapter-${theme.key}`);card.dataset.actId=act.id;card.dataset.actKey=chapterKey(act);
      card.style.setProperty('--chapter-accent',theme.accent);card.style.setProperty('--chapter-sky',theme.sky);
      const isCurrent=entries.some(row=>row.index===current);if(isCurrent)card.classList.add('current-chapter');
      const art=el('div','chapter-art');art.append(scene(theme,index));
      if(isCurrent)art.append(el('span','chapter-current-flag','你在这里 · 当前章节'));
      art.append(el('span','chapter-number',`CHAPTER ${ROMAN[index]||String(index+1).padStart(2,'0')}`),el('span','chapter-emblem',theme.emblem));card.append(art);
      const body=el('div','chapter-body'),heading=el('div','chapter-heading');
      heading.append(el('h3','',titleFor(act)),el('span','chapter-count',`${count} / ${entries.length}`));body.append(heading);
      body.append(el('p','chapter-landmark',theme.label),el('p','chapter-story',act.synopsis||'沿着新的航线出发，发现下一段故事。'));
      const storyActions=el('div','chapter-story-actions');
      const opening=button('chapter-story-link','阅读启程');opening.dataset.storyType='chapter';opening.dataset.storyAct=act.id;opening.dataset.storyPhase='opening';
      const ending=button('chapter-story-link chapter-ending-link','阅读终章');ending.dataset.storyType='chapter';ending.dataset.storyAct=act.id;ending.dataset.storyPhase='ending';
      const storyChapter=(!act.packId||act.packId==='daybreak')&&window.DogStory?.getChapter(act.id);
      if(storyChapter){const finale=entries.at(-1);ending.disabled=!finale||!recordFor(records,finale.level.id).complete;ending.textContent=ending.disabled?'终章 · 完成本章后解锁':'阅读终章';storyActions.append(opening,ending);body.append(storyActions);}
      const meter=el('div','chapter-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',`${titleFor(act)}完成进度`);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(entries.length));meter.setAttribute('aria-valuenow',String(count));const fill=el('i');fill.style.width=`${entries.length?count/entries.length*100:0}%`;meter.append(fill);body.append(meter);
      const nodes=el('div','chapter-nodes');nodes.setAttribute('aria-label',`${titleFor(act)}行动列表`);
      entries.forEach(({level,index:levelIndex},position)=>{
        const record=recordFor(records,level.id),node=button('map-level',undefined,()=>onSelect?.(levelIndex));
        node.dataset.mapLevel=String(levelIndex);node.classList.toggle('complete',record.complete);node.classList.toggle('current',levelIndex===current);node.classList.toggle('chapter-finale',position===entries.length-1);
        node.setAttribute('aria-pressed',String(levelIndex===current));node.setAttribute('aria-label',`${String(levelIndex+1).padStart(2,'0')} ${level.name}，${record.complete?(record.assistOnly?'辅助模式完成，':'已完成，')+record.stars+' 星':'未完成'}${position===entries.length-1?'，章节终战':''}`);
        const token=el('span','node-token',position===entries.length-1?'✦':String(position+1).padStart(2,'0'));node.append(token,el('b','node-name',level.name),el('small','node-stars',levelIndex===current?'当前行动':record.complete?'★'.repeat(record.stars)+'☆'.repeat(3-record.stars):position===entries.length-1?'章节终战':'待出发'));nodes.append(node);
      });
      body.append(nodes);card.append(body);grid.append(card);
    });
    frag.append(grid);target.replaceChildren(frag);
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
    (node.closest('.chapter-card')||node).scrollIntoView({block:'start',behavior:'instant'});
    node.focus({preventScroll:true});return true;
  }
  // Display-only debrief. Game owns the outcome, persisted record and transition timing.
  // No timers: restarting or skipping a reveal cannot leave a stale callback behind.
  function renderDebrief(options) {
    const {won=false,stars=0,rank='—',archiveTitle='',archiveText='',instant=false}=options||{};
    const overlay=$('result-overlay'),card=overlay?.querySelector('.result-card'),reveal=$('result-star-reveal');
    if(!card||!reveal)return;
    const earned=won?Math.min(3,num(stars)):0;
    card.classList.remove('revealing','settled');card.classList.toggle('result-defeat',!won);
    card.dataset.stars=String(earned);card.dataset.outcome=won?'won':'lost';
    reveal.hidden=!won;reveal.setAttribute('aria-label',`${earned} / 3 星，${3-earned} 颗未获得`);
    reveal.querySelectorAll('[data-result-star]').forEach((node,index)=>{node.classList.toggle('earned',index<earned);node.style.setProperty('--star-delay',`${index*.16}s`);});
    if($('result-stars'))$('result-stars').textContent=won?String(rank):'—';
    if($('result-archive'))$('result-archive').hidden=!won;
    if($('result-archive-title'))$('result-archive-title').textContent=archiveTitle||'这一站的回忆';
    if($('result-archive-text'))$('result-archive-text').textContent=archiveText;
    const content=card.querySelector('.result-content');if(content)content.scrollTop=0;
    const details=card.querySelector('.result-statistics');if(details)details.open=false;
    card.classList.add(instant||!won?'settled':'revealing');
  }
  return Object.freeze({renderCampaign,renderCaptain,renderEquipment,renderDebrief,focusCurrentCampaign});
});
