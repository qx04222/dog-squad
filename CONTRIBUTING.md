# Contributing

谢谢你帮助 Ramen 与 Bing Bong 把这段旅程变得更好。

1. 先说明玩家遇到的问题，附版本、平台和复现步骤。性能问题请说明关卡、技能、显示器分辨率和是否开启高特效。
2. 一个 PR 聚焦一个变化；保留关卡 ID 和存档兼容，不把开发密钥、玩家存档、私人照片或本地绝对路径提交到仓库。
3. 安装 Node.js 22+，运行 `npm ci`、`npm run check`、`npm test`、`npm run build:site`。
4. UI 变化请附实际运行截图，检查键盘操作、窄屏和减少动态效果。游戏规则变化应提供有意义的回归测试。
5. 新素材必须附来源与许可；明确标注 AI 辅助生成。请勿直接复制其他游戏的美术、音乐或角色。

剧情内容位于 `content/builtin.json` 和 `src/story-content.js`。修改文本不需要改关卡 ID。新章节优先作为独立内容包加入，见 `content/expansions/README.md`。

代码贡献沿用 MIT；艺术与故事内容沿用 `LICENSE-ASSETS.md` 所述授权。贡献不要求填写额外 CLA。请勿在公开 issue 中粘贴密钥或完整本机存档。
