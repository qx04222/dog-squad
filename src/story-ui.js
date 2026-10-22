(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogStoryUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const $ = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
  const FALLBACK = Object.freeze({
    prologue: {
      eyebrow: 'PROLOGUE / 序章', location: '黎明城外海 · 信号静默后的第七天',
      title: '在所有灯熄灭之后', subtitle: '一封没有署名的求救信，把 Ramen 和 Bing Bong 带向远方。',
      paragraphs: ['最先消失的是港口的钟声。随后，海岸、浮岛与极光工坊一座接一座沉默。城市还亮着备用灯，可熟悉的回应已经不在电波里。', 'Ramen 在旧接收器里找到一段微弱的求救信号。Bing Bong 把最后一箱能量核心搬上飞行艇。他们没有等到命令——因为真正的小队，从不会把朋友留在黑暗里。'],
      quote: '“航线也许断了，但我们记得回家的方向。”',
      beats: [{speaker:'Ramen',text:'先去港口。每点亮一座航标，就离答案更近一步。'},{speaker:'Bing Bong',text:'带上备用零食。救援计划里，这是关键装备。'}]
    },
    epilogue: {
      eyebrow: 'EPILOGUE / 尾声', location: '晨曦星港 · 第一班返航船启程',
      title: '让所有灯继续亮着', subtitle: '归途不是故事的终点，而是下一次出发前的约定。',
      paragraphs: ['当最后一座航标重新点亮，城市之间失散的声音沿着星海回来了。旧港口敲响晨钟，天空花园把新种子送往远方，极光工坊开始修复每一台曾经失控的机体。', 'Ramen 把行动地图折进档案袋。Bing Bong 在封面画了两枚歪歪扭扭的爪印。他们知道，世界不会永远平静；但只要仍有人回应，小队就会再次出发。'],
      quote: '今天被带回家的光，会成为明天为别人照路的星。'
    },
    characters: [
      {name:'Ramen', role:'侦察队长', tag:'THE COMPASS', text:'冷静、敏锐，总能在混乱里找到下一步。把每一次救援都当作不会放弃的承诺。'},
      {name:'Bing Bong', role:'火力守卫', tag:'THE HEART', text:'开朗、勇敢，擅长把最危险的时刻变成小队的反击机会。相信好点子和好零食同样重要。'},
      {name:'你', role:'行动指挥', tag:'THE SIGNAL', text:'选择航线、训练队长、决定技能出手时机。每一颗点亮的星，都记录着你的判断。'}
    ]
  });

  let config = {};
  let source = null;
  let sequence = [];
  let cursor = 0;
  let initialized = false;

  function text(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback || '';
  }
  function array(value) { return Array.isArray(value) ? value : []; }
  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function storySource(explicit) {
    return explicit || root.DogStory || FALLBACK;
  }
  function chapters() {
    const rows = array(source?.chapters).length ? source.chapters : array(source?.acts);
    return rows.map((chapter, index) => ({
      ...chapter,
      id: chapter.id || `chapter-${index + 1}`,
      title: text(chapter.title, `第 ${index + 1} 章`),
      index
    }));
  }
  function sceneFromRequest(request) {
    if (typeof source?.getScene === 'function') {
      const scene = source.getScene(request);
      if (scene) return scene;
    }
    const kind = request.type || 'prologue';
    if (kind === 'prologue' || kind === 'epilogue') return source?.[kind] || source?.scenes?.[kind] || FALLBACK[kind];
    if (kind === 'characters') return {type:'characters'};
    const chapter = chapters().find(row => String(row.id) === String(request.actId)) || chapters()[Number(request.actId)] || chapters()[0];
    if (!chapter) return FALLBACK.prologue;
    const phase = request.phase === 'ending' ? 'ending' : 'opening';
    const direct = chapter[phase] || chapter.scenes?.[phase] || source?.scenes?.[`${chapter.id}:${phase}`];
    const scene = Array.isArray(direct) ? {beats:direct} : {...(direct || {})};
    return {...scene, type:'chapter', phase, actId:chapter.id, chapterTitle:chapter.title, chapterIndex:chapter.index, subtitle:text(scene.subtitle,chapter.summary)};
  }
  function rebuildSequence() {
    sequence = [{type:'prologue'}];
    chapters().forEach(chapter => {
      sequence.push({type:'chapter',actId:chapter.id,phase:'opening'});
      sequence.push({type:'chapter',actId:chapter.id,phase:'ending'});
    });
    sequence.push({type:'epilogue'});
    sequence=sequence.filter(request=>config.canRead?.(request)!==false);
  }
  function requestIndex(request) {
    return sequence.findIndex(row => row.type === request.type && String(row.actId || '') === String(request.actId || '') && String(row.phase || '') === String(request.phase || ''));
  }
  function labelFor(request) {
    if (request.type === 'prologue') return ['00','序章 · 静默的航线'];
    if (request.type === 'epilogue') return ['✦','尾声 · 灯火归来'];
    const chapter = chapters().find(row => String(row.id) === String(request.actId));
    const number = String((chapter?.index ?? 0) + 1).padStart(2,'0');
    return [number, `${chapter?.title || '新的章节'} · ${request.phase === 'ending' ? '终章' : '启程'}`];
  }
  function renderNavigation(activeRequest) {
    const nav = $('story-navigation');
    if (!nav) return;
    const frag = document.createDocumentFragment();
    const items = [{type:'prologue'}, ...chapters().map(chapter => ({type:'chapter',actId:chapter.id,phase:'opening'})), {type:'epilogue'}];
    items.forEach(request => {
      const [number,label] = labelFor(request);
      const button = make('button','story-nav-item');
      button.type = 'button';button.disabled=config.canRead?.(request)===false;if(button.disabled)button.title='完成最后一次行动后解锁';
      const active = request.type === activeRequest.type && (request.type !== 'chapter' || String(request.actId) === String(activeRequest.actId));
      button.classList.toggle('active',active);
      button.setAttribute('aria-current',active ? 'page' : 'false');
      button.append(make('span','story-nav-number',number),make('span','story-nav-label',label.replace(/ · (启程|终章)$/,'')));
      button.addEventListener('click',()=>open(request));
      frag.append(button);
    });
    nav.replaceChildren(frag);
  }
  function renderCharacters() {
    const story = $('story-scroll'), copy = story?.querySelector('.story-copy'), visual = $('story-visual'), cast = $('story-cast');
    if (!story || !cast) return;
    if (copy) copy.hidden = true;
    if (visual) visual.hidden = true;
    cast.hidden = false;
    const heading = make('header','story-cast-heading');
    heading.append(make('span','eyebrow','FIELD UNIT 02 / 人物志'),make('h2','', '那些并肩出发的人'),make('p','', '有人负责找到方向，有人负责守住伙伴。还有一个位置，永远留给行动指挥。'));
    const grid = make('div','story-cast-grid');
    const rows = array(source?.characters).length ? source.characters : FALLBACK.characters;
    rows.forEach((character,index) => {
      const card = make('article','story-cast-card');
      card.dataset.character = String(index);
      const portrait = make('div','story-cast-portrait');
      portrait.append(make('span','cast-orbit'));
      const heroIndex=character.id==='ramen'?0:character.id==='bing-bong'?1:-1;
      if(heroIndex>=0&&window.MOCHI_SPRITES){
        const canvas=make('canvas','cast-pet');canvas.width=240;canvas.height=240;canvas.setAttribute('aria-label',character.name);portrait.append(canvas);
        const art=new Image();art.onload=()=>{const w=art.naturalWidth/2,h=art.naturalHeight/2;canvas.getContext('2d').drawImage(art,heroIndex*w,0,w,h,0,0,240,240);};art.src=window.MOCHI_SPRITES;
      }else portrait.append(make('b','',text(character.initial,character.name?.slice(0,1) || '✦')));
      card.append(portrait,make('small','',text(character.tag,`SQUAD / ${String(index+1).padStart(2,'0')}`)),make('h3','',text(character.name,'小队成员')),make('strong','',text(character.role,'远征伙伴')),make('p','',text(character.text || character.bio || character.description,'仍有故事等待记录。')));
      grid.append(card);
    });
    cast.replaceChildren(heading,grid);
    $('story-eyebrow').textContent = 'CAST / 小队人物志';
    $('story-location').textContent = '每一次远征，都由彼此的选择组成';
    $('story-progress').textContent = `CAST / ${String(rows.length).padStart(2,'0')} MEMBERS`;
    $('story-previous').disabled = true;
    $('story-next').textContent = '返回序章';
    $('story-next').onclick = () => open({type:'prologue'});
    renderNavigation({type:'characters'});
  }
  function renderScene(request, scene) {
    const story = $('story-scroll'), copy = story?.querySelector('.story-copy'), visual = $('story-visual'), cast = $('story-cast');
    if (!story || !copy || !visual || !cast) return;
    copy.hidden = false; visual.hidden = false; cast.hidden = true;
    const chapterIndex = Number.isFinite(scene.chapterIndex) ? scene.chapterIndex : chapters().findIndex(row => String(row.id) === String(request.actId));
    const fallbackLabel = labelFor(request);
    $('story-eyebrow').textContent = text(scene.eyebrow, request.type === 'chapter' ? `CHAPTER ${String(chapterIndex + 1).padStart(2,'0')} / ${request.phase === 'ending' ? '终章' : '启程'}` : request.type === 'epilogue' ? 'EPILOGUE / 尾声' : 'PROLOGUE / 序章');
    $('story-location').textContent = text(scene.location, request.type === 'chapter' ? text(scene.chapterTitle,fallbackLabel[1]) : '星海航线 · 小队行动记录');
    $('story-chapter-mark').textContent = request.type === 'epilogue' ? '✦' : fallbackLabel[0];
    $('story-title').textContent = text(scene.title, text(scene.chapterTitle,fallbackLabel[1]));
    $('story-subtitle').textContent = text(scene.subtitle, request.phase === 'ending' ? '航标已经点亮，但这一章留下的问题仍在等待回答。' : '向下一座航标出发，也向一个新的答案靠近。');
    const body = $('story-body');
    const paragraphs = array(scene.paragraphs).length ? scene.paragraphs : array(scene.body).length ? scene.body : [text(scene.text, '这段旅程仍在书写。沿着故事地图继续行动，新的记录会在这里展开。')];
    body.replaceChildren(...paragraphs.map(value => make('p','',value)));
    body.hidden = !array(scene.paragraphs).length && !array(scene.body).length && !scene.text;
    const quote = $('story-quote');
    quote.hidden = !text(scene.quote); quote.textContent = text(scene.quote);
    const dialogue = $('story-dialogue');
    const beats = array(scene.beats).length ? scene.beats : array(scene.dialogue).length ? scene.dialogue : array(scene.lines);
    dialogue.replaceChildren(...beats.map(beat => {
      const row = make('div','story-dialogue-line');
      row.dataset.tone = text(beat.tone,'steady');
      row.append(make('b','',text(beat.speaker,'小队频道')),make('p','',text(beat.text || beat.line,'')));
      return row;
    }));
    visual.dataset.chapter = String(Math.max(0,chapterIndex));
    visual.dataset.phase = request.phase || request.type;
    const art=scene.art||(request.type==='prologue'||request.type==='epilogue'?window.DOG_KEY_ART:window.DOG_WORLD_MAP);
    if(art)visual.style.setProperty('--story-art',`url("${String(art).replace(/["\\]/g,'')}")`);else visual.style.removeProperty('--story-art');
    cursor = Math.max(0,requestIndex(request));
    const progressTotal = sequence.length;
    $('story-progress').textContent = `STORY ${String(cursor + 1).padStart(2,'0')} / ${String(progressTotal).padStart(2,'0')}`;
    const previous = $('story-previous'), next = $('story-next');
    previous.disabled = cursor <= 0;
    previous.onclick = () => cursor > 0 && open(sequence[cursor - 1]);
    const atEnd = cursor >= progressTotal - 1;
    next.replaceChildren(document.createTextNode(atEnd ? '回到故事地图' : text(scene.nextLabel,'继续阅读')));
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href','#i-arrow'); arrow.append(use); next.append(arrow);
    next.onclick = () => atEnd ? close() : open(sequence[cursor + 1]);
    if(request.guided){previous.disabled=true;next.textContent=request.type==='epilogue'?'回到故事地图':'继续行动';next.onclick=close;}
    renderNavigation(request);
    story.scrollTop = 0;
  }
  function open(request) {
    if (!initialized) init();
    const dialog = $('story-dialog');
    if (!dialog) return false;
    const normalized = typeof request === 'string' ? {type:request} : {...(request || {type:'prologue'})};
    if(config.canRead?.(normalized)===false)return false;
    rebuildSequence();
    dialog.classList.toggle('guided-story',normalized.guided===true);
    if (normalized.type === 'characters') renderCharacters();
    else renderScene(normalized,sceneFromRequest(normalized));
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('story-open');
    $('close-story')?.focus({preventScroll:true});
    config.onAction?.({action:'open',request:normalized});
    return true;
  }
  function close() {
    const dialog = $('story-dialog');
    if (dialog?.open) dialog.close();
  }
  function bind() {
    $('story-btn')?.addEventListener('click',()=>open({type:'prologue'}));
    $('close-story')?.addEventListener('click',close);
    document.addEventListener('click',event => {
      const trigger = event.target.closest?.('[data-open-story],[data-story-kind],[data-story-type]');
      if (!trigger) return;
      if (trigger.dataset.storyKind) open({type:trigger.dataset.storyKind});
      else if (trigger.dataset.storyType) open({type:trigger.dataset.storyType,actId:trigger.dataset.storyAct,phase:trigger.dataset.storyPhase || 'opening'});
      else open({type:trigger.dataset.openStory || 'prologue'});
    });
    const dialog = $('story-dialog');
    dialog?.addEventListener('click',event => { if (event.target === dialog) close(); });
    dialog?.addEventListener('close',()=>{ document.body.classList.remove('story-open'); config.onClose?.(); });
  }
  function init(options) {
    config = {...config,...(options || {})};
    source = storySource(config.story);
    rebuildSequence();
    if (!initialized && typeof document !== 'undefined') { bind(); initialized = true; }
    return api;
  }
  function isOpen() { return !!$('story-dialog')?.open; }
  const api = Object.freeze({init,open,close,isOpen});
  // The game host initializes after native content and saves load, so spoiler
  // permissions are installed before any story controls are bound.
  return api;
});
