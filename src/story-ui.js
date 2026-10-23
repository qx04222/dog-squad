(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogStoryUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const $ = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
  const FALLBACK = Object.freeze({
    prologue:{title:'一起把灯点亮吧！',subtitle:'港口正在等我们。',lines:[{speaker:'Ramen',text:'沿着星光出发。'},{speaker:'Bing Bong',text:'好！这次也一起回家。'}]},
    epilogue:{title:'所有灯都亮起来了！',subtitle:'下一次冒险，也要一起。',lines:[]},characters:[]
  });
  let config={},source=null,initialized=false;
  function text(value,fallback=''){return typeof value==='string'&&value.trim()?value.trim():fallback;}
  function array(value){return Array.isArray(value)?value:[];}
  function make(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=String(value);return node;}
  function chapters(){return array(source?.chapters).length?source.chapters:array(source?.acts);}
  function chapterFor(id){return chapters().find((chapter,index)=>String(chapter.id)===String(id)||String(index)===String(id))||chapters()[0];}
  function renderPicker(request){
    const select=$('story-chapter-select');if(!select)return;
    const options=[{label:'最初的呼叫',request:{type:'prologue'}}];
    for(const chapter of chapters())for(const phase of ['opening','ending'])options.push({label:`${text(chapter.title)} · ${phase==='opening'?'启程':'回忆'}`,request:{type:'chapter',actId:chapter.id,phase}});
    options.push({label:'回家的灯',request:{type:'epilogue'}},{label:'小队伙伴',request:{type:'characters'}});
    const key=r=>[r.type,r.actId||'',r.phase||'opening'].join(':');
    select.replaceChildren(...options.map((entry,index)=>{const option=make('option','',entry.label);option.value=String(index);option.disabled=config.canRead?.(entry.request)===false;option.selected=key(entry.request)===key(request);return option;}));
    select.onchange=()=>{const selected=options[Number(select.value)];if(!selected||config.canRead?.(selected.request)===false)return;render(selected.request);$('story-details').open=true;$('story-chapter-select').focus({preventScroll:true});};
  }
  function sceneFor(request){
    if(typeof source?.getScene==='function'){const scene=source.getScene(request);if(scene)return scene;}
    if(request.type==='characters')return{title:'认识狗狗突击队',subtitle:'最棒的能力，是彼此相信。',characters:array(source?.characters)};
    if(request.type==='prologue'||request.type==='epilogue')return source?.[request.type]||FALLBACK[request.type];
    const chapter=chapterFor(request.actId),phase=request.phase==='ending'?'ending':'opening',part=chapter?.[phase]||chapter?.scenes?.[phase];
    return Array.isArray(part)?{title:chapter?.title,subtitle:chapter?.summary,lines:part}:{title:chapter?.title,subtitle:chapter?.summary,...(part||{})};
  }
  function renderDetails(scene,request){
    const body=$('story-body'),dialogue=$('story-dialogue'),quote=$('story-quote');if(!body||!dialogue||!quote)return;
    const paragraphs=array(scene.paragraphs).length?scene.paragraphs:array(scene.body).length?scene.body:text(scene.text)?[scene.text]:[];
    body.replaceChildren(...paragraphs.slice(0,4).map(line=>make('p','',line)));
    let lines=array(scene.lines).length?scene.lines:array(scene.beats).length?scene.beats:array(scene.dialogue);
    if(request.type==='characters')lines=array(scene.characters).map(character=>({speaker:text(character.name,'小队成员'),text:`${text(character.role)}${character.role&&character.description?' · ':''}${text(character.description||character.bio)}`}));
    dialogue.replaceChildren(...lines.slice(0,8).map(line=>{const row=make('div','story-dialogue-line');row.append(make('b','',text(line.speaker,'小队')),make('p','',text(line.text||line.line)));return row;}));
    quote.hidden=!text(scene.quote);quote.textContent=text(scene.quote);
    const details=$('story-details');if(details){details.hidden=!(paragraphs.length||lines.length||text(scene.quote));details.open=false;}
  }
  function render(request){
    const scene=sceneFor(request),guided=!!request.guided,dialog=$('story-dialog');dialog?.classList.toggle('guided-story',guided);
    $('story-title').textContent=text(scene.title,request.type==='chapter'?'新的冒险':FALLBACK.prologue.title);
    $('story-subtitle').textContent=text(scene.subtitle,request.type==='epilogue'?'下一次冒险，也要一起。':'准备好，就出发！');
    $('story-eyebrow').textContent=request.type==='epilogue'?'故事完成':request.type==='chapter'?'新的岛屿':request.type==='characters'?'小队伙伴':'第一次出发';
    const postcard=$('story-postcard');if(postcard)postcard.src=root.DOG_STORY_POSTCARD||'';
    renderDetails(scene,request);renderPicker(request);const details=$('story-details');if(details&&guided)details.hidden=true;
    const next=$('story-next');if(next){next.replaceChildren(document.createTextNode(guided?'出发！':'好啦'));const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-arrow');arrow.append(use);next.append(arrow);next.onclick=close;}
  }
  function open(input){
    if(!initialized)return false;const dialog=$('story-dialog');if(!dialog)return false;
    const request=typeof input==='string'?{type:input}:{type:'prologue',...(input||{})};if(config.canRead?.(request)===false)return false;render(request);
    if(!dialog.open)dialog.showModal();document.body.classList.add('story-open');$('story-next')?.focus({preventScroll:true});config.onAction?.({action:'open',request});return true;
  }
  function close(){const dialog=$('story-dialog');if(dialog?.open)dialog.close();}
  function bind(){
    $('story-btn')?.addEventListener('click',()=>open({type:'prologue'}));$('close-story')?.addEventListener('click',close);
    document.addEventListener('click',event=>{const trigger=event.target.closest?.('[data-open-story],[data-story-kind],[data-story-type]');if(!trigger)return;open({type:trigger.dataset.storyKind||trigger.dataset.storyType||trigger.dataset.openStory||'prologue',actId:trigger.dataset.storyAct,phase:trigger.dataset.storyPhase||'opening'});});
    const dialog=$('story-dialog');dialog?.addEventListener('click',event=>{if(event.target===dialog)close();});dialog?.addEventListener('close',()=>{document.body.classList.remove('story-open');config.onClose?.();});
  }
  function init(options){config={...config,...(options||{})};source=config.story||root.DogStory||FALLBACK;if(!initialized&&typeof document!=='undefined'){bind();initialized=true;}return api;}
  function isOpen(){return!!$('story-dialog')?.open;}
  const api=Object.freeze({init,open,close,isOpen});
  return api;
});
