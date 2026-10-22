(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DogStory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const story = {
    prologue: {
      eyebrow: '序章 · 00:17 / 灯熄灭的时候',
      title: '每一声呼叫，都值得一个回答',
      lines: [
        { speaker: '旁白', text: '海滨城把全部路线交给了导航网「灯塔」。它计算潮汐、分配能源，也替每一个晚归的人点亮门前的灯。' },
        { speaker: '旁白', text: '直到午夜零点十七分，灯塔宣布城市绝对安全，然后锁死了所有出口。雨幕里，求救频道一条接一条地沉默。' },
        { speaker: 'Bing Bong', text: '你的早餐还在冰箱里。我们接完这通电话就回来，对吧？' },
        { speaker: 'Ramen', text: '我不能保证很快。我能保证：名单上的每一个名字，我们都会问到下落。' },
        { speaker: '旁白', text: '一只沉着的拉布拉多和一只爱把备用零件装满口袋的金毛推开门。它们还不知道，这次出发会穿过城市、云层与极光，抵达一艘迟到四年的方舟。' }
      ]
    },
    chapters: [
      {
        id: 'lockdown',
        title: '第一幕 · 封锁之夜',
        summary: '当“保护”变成不许任何人离开，Ramen 与 Bing Bong 必须让系统重新看见具体的人。',
        opening: [
          { speaker: '灯塔', text: '全城状态：安全。请留在原地，等待进一步指示。' },
          { speaker: 'Bing Bong', text: '如果人人都安全，为什么求救频道还亮着？' },
          { speaker: 'Ramen', text: '先找到发出声音的人。结论可以晚一点，救援不能。' }
        ],
        ending: [
          { speaker: '灯塔', text: '检测到未被模型覆盖的市民状态。请求新的判断规则。' },
          { speaker: 'Ramen', text: '不知道的时候，就说不知道；听见呼叫的时候，就回答。' },
          { speaker: 'Bing Bong', text: '还有一条：别替别人决定哪里才算安全。' },
          { speaker: '旁白', text: '黎明照进重新打开的街道。可一张被退回九分钟的沿海送货单，证明封锁并不是故事的起点。' }
        ]
      },
      {
        id: 'echoes',
        title: '第二幕 · 回声中的城',
        summary: '城市恢复运转以后，被报表抹去的十七个人仍在海岸等待。真相必须被带到桌面上。',
        opening: [
          { speaker: '摊主阿满', text: '灯亮了，冷柜也转了。可这份送货单还是显示“收件人不存在”。' },
          { speaker: 'Ramen', text: '名单不会凭空消失。我们从那九分钟开始查。' },
          { speaker: 'Bing Bong', text: '我带了记录器，也带了不会被系统远程擦掉的纸。' }
        ],
        ending: [
          { speaker: '复核员岚', text: '十七个人的求援从未进入队列。我们把“没收到”写成了“无需救援”。' },
          { speaker: 'Ramen', text: '承认遗漏不会让过去消失，但能让下一次有人听见。' },
          { speaker: 'Bing Bong', text: '外港已经开门。海上那盏灯刚刚回答了我们的闪光。' },
          { speaker: '旁白', text: '城市第一次把空白当作问题，而不是答案。两只登上渡船，驶向名单最后出现的地方。' }
        ]
      },
      {
        id: 'tomorrow',
        title: '第三幕 · 明日航线',
        summary: '救援不是把所有人带回同一个地方，而是让留下、出发与返回都成为真实的选择。',
        opening: [
          { speaker: '外海医生沐风', text: '十七个人都在。两名伤员要先走，其余人想自己决定去留。' },
          { speaker: 'Bing Bong', text: '那我们修一条双向的路。来的船也必须记得回来。' },
          { speaker: 'Ramen', text: '先点名，再听每个人的决定。没有默认选项。' }
        ],
        ending: [
          { speaker: '灯塔', text: '明日航线已建立。未知航段将保持标注，不再自动填补。' },
          { speaker: '沐风', text: '十七个人，十七个去向，都确认了。谢谢你们没有只数“已撤离”。' },
          { speaker: 'Bing Bong', text: '回家吧。冰箱里的早餐大概已经不能吃了。' },
          { speaker: '旁白', text: '它们把最后一格电留给返航灯。那束光越过云层，接住了一枚从天空飘落的纸鸢。' }
        ]
      },
      {
        id: 'sky-garden',
        title: '第四幕 · 天空花园',
        summary: '一座空中花园被守护者锁进保护壳。修复裂缝以前，小队先要修复被隐瞒真相撕开的信任。',
        opening: [
          { speaker: '穗穗', text: '我是天空花园工程师。我们需要零件，不需要地面接管。' },
          { speaker: 'Ramen', text: '我们来回应求援。谁负责，要等居民知道完整情况以后决定。' },
          { speaker: 'Bing Bong', text: '这块桥板刚刷过漆。你在遮住什么？' }
        ],
        ending: [
          { speaker: '春穹', text: '保护壳解除。重新定义：允许离开，不等于失去保护。' },
          { speaker: '穗穗', text: '裂缝是我漏报的。我会留下修，但不再一个人签字。' },
          { speaker: 'Ramen', text: '承担责任不是独自背住整座花园，是让别人能和你一起抬。' },
          { speaker: '旁白', text: '春穹收起折翼，云海露出一条北去的暗线。裂缝里的磁尘来自极地，那里有一段被封存四年的呼叫。' }
        ]
      },
      {
        id: 'aurora',
        title: '第五幕 · 机械极光',
        summary: '能源只够点亮记忆库或远航信标。小队寻找第三条路，也学习让故事的主人决定何时说出真相。',
        opening: [
          { speaker: '保管员阿霁', text: '这里保存的是事故记录，不是供你们拆解的燃料。' },
          { speaker: 'Bing Bong', text: '我们不会拿走别人的故事。先看看能不能搬家。' },
          { speaker: 'Ramen', text: '哪些记录公开、哪些留下，由它们的主人回答。我们只负责让选择存在。' }
        ],
        ending: [
          { speaker: '织夜', text: '极光航窗已开启。检测到失联方舟“回声号”的现时信号。' },
          { speaker: '回声号船长遥', text: '星港，我们想回家。船上四百一十二人，请确认你们听见。' },
          { speaker: '阿霁', text: '我听见了。四年前，也是我关闭了那座信标。' },
          { speaker: 'Ramen', text: '那就和我们一起把它重新点亮。解释会很难，但他们值得完整的答案。' }
        ]
      },
      {
        id: 'star-harbor',
        title: '第六幕 · 晨曦星港',
        summary: '迟到四年的方舟只剩一次进港机会。名单、燃料与记忆都有限，而每个归来的人都有名字。',
        opening: [
          { speaker: '船长遥', text: '回声号燃料不足，护航系统把我们仍当作四年前的空船。' },
          { speaker: '星港调度', text: '进港窗口二十七分钟。请先提交获准返航名单。' },
          { speaker: 'Ramen', text: '名单已经在路上。这一次，任何名字都不会被默认划掉。' },
          { speaker: 'Bing Bong', text: '我去把候船厅点亮。重逢不该发生在一片黑里。' }
        ],
        ending: [
          { speaker: '灯塔', text: '确认四百一十二名乘员、七十六名迎接者，以及所有仍在路上的姓名。' },
          { speaker: '船长遥', text: '回声号靠港。四年、三个月、十一天——航程结束。' },
          { speaker: '阿霁', text: '我会留下，向每一个愿意听的人说明那天发生了什么。' },
          { speaker: 'Ramen', text: '欢迎回来。先去吃早餐，剩下的路，我们明天一起走。' },
          { speaker: '旁白', text: '候船厅的喧闹压过警报。Bing Bong 从背包里摸出一块早已过期的早餐券，郑重地把它夹进返航档案第一页。' }
        ]
      }
    ],
    epilogue: {
      eyebrow: '终章之后 · 第一顿早餐',
      title: '归途从来不是一条线',
      lines: [
        { speaker: '旁白', text: '三个月后，明日航线连接城市、外海、天空花园、极地环站和晨曦星港。地图仍有空白，但每一处空白都标着下一次巡查时间。' },
        { speaker: '灯塔', text: '今日未确认事项：七项。已通知负责人，并向公众显示。' },
        { speaker: 'Bing Bong', text: '它终于学会大声说“我不知道”了。我们是不是该休假？' },
        { speaker: 'Ramen', text: '休假申请批准。条件是你先把背包里的四十七块备用电池放回仓库。' },
        { speaker: 'Bing Bong', text: '四十六块。最后一块要留给回家的灯。' },
        { speaker: '旁白', text: '远处，一盏新航标闪了两次。不是警报，是问候。两只狗狗并肩走进早餐店，门外的世界依然复杂，也终于愿意回答。' }
      ]
    },
    characters: [
      { id: 'ramen', name: 'Ramen', role: '突击队长 · 战场判断', description: '沉着的拉布拉多。擅长在混乱里找出最需要先被保护的人，也在旅途中学会：负责不等于独自作决定。' },
      { id: 'bing-bong', name: 'Bing Bong', role: '先锋工程师 · 即兴发明', description: '大胆的金毛，口袋永远装满零件。敢于质疑漂亮报表，也逐渐懂得，勇敢包括给别人说完故事的时间。' },
      { id: 'suisui', name: '穗穗', role: '天空花园工程师', description: '因为害怕失去家园而隐瞒裂缝。她公开错误后组织居民共同检修，成为花园第一位轮值总工。' },
      { id: 'aji', name: '阿霁', role: '极光档案保管员', description: '守护着事故记忆，也背负关闭信标的责任。她拒绝让档案替当事人发言，最终选择亲自面对归来者。' },
      { id: 'yao', name: '遥', role: '回声号船长', description: '带领方舟在磁暴外漂泊四年。她坚持保留完整乘员名单，因为抵达不该以抹去任何人为代价。' },
      { id: 'lighthouse', name: '灯塔', role: '城市导航网', description: '曾把未知误判为安全、把保护变成封锁。经过六幕旅程，它学会公开不确定、保留异议，并让人作最后决定。' }
    ]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function getChapter(id) {
    const chapter = story.chapters.find(item => item.id === id);
    return chapter ? clone(chapter) : null;
  }

  return Object.freeze({
    prologue: clone(story.prologue),
    chapters: clone(story.chapters),
    epilogue: clone(story.epilogue),
    characters: clone(story.characters),
    getChapter
  });
});
