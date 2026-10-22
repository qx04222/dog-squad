(() => {
  const chapters = [
    {roman:'I',range:'01—08 / 城市封锁',name:'封锁之夜',text:'城市导航网封锁所有出口。循着求援，两只救出失联队伍，发现保护指令中的盲点，并让黎明重新抵达街道。',keys:'封锁 · 未知 · 公开依据'},
    {roman:'II',range:'09—16 / 沿海求援',name:'回声中的城',text:'恢复生活时，一条被忽略的沿海求援浮出水面。两只追查旧记录与现实的裂缝，带着居民的选择打开通往外海的门。',keys:'名单 · 回应 · 打开外海'},
    {roman:'III',range:'17—24 / 外海网络',name:'明日航线',text:'救援抵达外海。两只与居民、灯塔共同建立会回话的网络，在真正的风暴中验证新的约定，最终带着完整的名单回家。',keys:'双向 · 可撤回 · 持续回应'},
    {roman:'IV',range:'25—32 / 云上裂缝',name:'天空花园',text:'工程师穗穗隐瞒了一道裂缝，守园机却把居民区封进保护壳。两只在追责、修复与撤离之间理清顺序，让承诺既容得下真相，也承受得住重量。',keys:'真相 · 分担 · 修复顺序'},
    {roman:'V',range:'33—40 / 极地磁场',name:'机械极光',text:'花园的裂缝指向极地磁场失衡。修复能源只够保住记忆或航标中的一个，小队沿着极光寻找第三条路，也尊重别人尚未准备好交出的故事。',keys:'有限资源 · 记忆 · 授权'},
    {roman:'VI',range:'41—48 / 方舟返航',name:'晨曦星港',text:'一艘迟到多年的方舟终于接近星港。救援窗口即将关闭，新旧伙伴把各自承担的代价接成航线，让四百一十二个名字完整靠港。',keys:'返航 · 共同承担 · 重逢'}
  ];
  const captains = {
    ramen:{index:'R / 01',role:'控制 · 救援 · 连锁',title:'把混乱变成机会。',copy:'以凝时标记场切开敌阵，用链闪脉冲串联目标，再用救援信标把队员带回火线。适合观察局势、精确调度的队长。',skills:['凝时标记场','救援信标','星轨总动员']},
    bing:{index:'B / 02',role:'突进 · 破甲 · 爆发',title:'向最危险的方向冲锋。',copy:'用破阵穿甲齐射撕开装甲，疾风弹幕压制整条火线，再以堡垒震波护住全队。适合大胆走位、持续进攻的队长。',skills:['破阵穿甲齐射','堡垒震波','疾风全弹幕']}
  };
  const q = (s, root=document) => root.querySelector(s);
  const qa = (s, root=document) => [...root.querySelectorAll(s)];
  qa('[data-chapter]').forEach((button) => button.addEventListener('click', () => {
    qa('[data-chapter]').forEach((item) => item.setAttribute('aria-selected', String(item === button)));
    const item = chapters[Number(button.dataset.chapter)];
    const panel = q('#chapter-panel');
    q('.chapter-glyph b', panel).textContent = item.roman;
    q('.chapter-copy small', panel).textContent = item.range;
    q('.chapter-copy h3', panel).textContent = item.name;
    q('.chapter-copy p', panel).textContent = item.text;
    q('.chapter-copy strong', panel).textContent = `关键词：${item.keys}`;
  }));
  qa('[data-captain]').forEach((card) => q('button', card).addEventListener('click', () => {
    qa('[data-captain]').forEach((item) => { item.classList.toggle('active', item === card); q('button', item).setAttribute('aria-pressed', String(item === card)); });
    const item = captains[card.dataset.captain];
    q('.detail-index').textContent = item.index; q('.detail-role').textContent = item.role;
    q('.detail-title').textContent = item.title; q('.detail-copy').textContent = item.copy;
    qa('.skill-list span').forEach((node, index) => { node.textContent = item.skills[index]; });
  }));
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((entry) => { if(entry.isIntersecting){ entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), {threshold:.12}) : null;
  qa('.reveal').forEach((el) => observer ? observer.observe(el) : el.classList.add('visible'));
  q('#year').textContent = new Date().getFullYear();
})();
