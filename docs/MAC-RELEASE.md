# 狗狗突击队 · Mac 安装与持续内容发行

本工程支持两条互相独立的更新线路：应用更新分发新的引擎与界面；内容更新分发纯 JSON 章节、关卡、台词与数值。关卡包不能执行脚本、加载外部图片或改变应用权限。内置战役始终随安装包提供，断网也能完整游玩。

## 本机构建

固定依赖：Electron 45.0.0、electron-builder 26.15.3；构建 Node.js 至少 22.12.0。当前目标为 Apple Silicon、macOS 13 及以上。

```sh
npm ci
npm run build
node scripts/native-build.cjs
```

输出位于 `dist/mac/`：拖入 Applications 的 `.dmg`、更新所需的 `.zip`。应用先在非同步的系统临时目录签名和打包，其位置记录在 `dist/mac/build-artifacts.json`；安装时从 DMG 复制。这样避免桌面 FileProvider 添加 Finder 元数据破坏签名。脚本始终 `publish: never`，不上传、不发布。`--dir` 可只构建应用，用于本机测试。构建配置只包含游戏、启动壳及运行依赖，不包含测试、报告、源照片、签名私钥、旧安装包。

公开社区版采用 ad-hoc 代码签名，并使用内置 Ed25519 公钥独立校验应用更新清单及 ZIP 完整性。它不是经过 Apple 公证的发行包；不能把本机启动成功等同于另一台 Mac 的 Gatekeeper 验收。Developer ID 与公证仍是以后减少首次启动阻力的推荐发行层。完整的版本号、签署、上传、回滚和密钥轮换流程见 `docs/RELEASING.md`。

## 给发行者建立内容签名身份

私钥放在工程之外，限本人读写；只有公钥加入发行配置。工具拒绝覆盖现有私钥，拒绝使用工程内私钥，拒绝读取宽权限私钥。请另行安全备份，遗失私钥后不能给已安装版本签署新内容；更换信任公钥需要先发行一个应用升级。

```sh
node scripts/pack-sign.cjs --generate-key --out-dir "$HOME/Library/Application Support/Dog Squad Publisher/keys"
```

读取 `publisher-public.pem` 后，将完整 PEM 公钥放入配置 `contentPublicKeys` 的固定 key ID（如 `publisher-2026`）。不要把 `publisher-private.pem` 放进工程、Git、安装包或更新服务器。密钥不会被工具打印。

正式配置以 `release-config.example.json` 为模板，保存到工程外；替换全部示例域名、公钥、Team ID。不能把演示或测试密钥作为正式信任根。通过 `DOG_SQUAD_RELEASE_CONFIG` 指定该文件；构建脚本临时注入并在结束后恢复工程的本机配置。

## 制作与导入关卡包

内容格式由 `src/content.js` 统一验证，应用主进程和渲染进程使用同一份 schema。每包含 `schema/id/version/minAppVersion/title/description/acts/levels`，版本必须为 `x.y.z`；外部包 ID 不能为 `daybreak`。关卡 ID 必须以 `包ID-` 开头，因此更新章节可以保留成绩，而新增内容不会覆盖原战役。每包最多 64 关、12 章；最多安装 32 个扩展包；签名文件最大 4 MiB。

```sh
node scripts/pack-sign.cjs \
  --input content/my-expansion.json \
  --output dist/my-expansion-1.0.0.dogpack \
  --key "$HOME/Library/Application Support/Dog Squad Publisher/keys/publisher-private.pem" \
  --key-id publisher-2026
```

`.dogpack` 是包含 base64 JSON、SHA-256 和 Ed25519 签名的封包。玩家在「关卡库」中导入，系统文件选择框不向页面暴露文件路径；通过发行公钥、完整性、schema、最低应用版本、防降级校验后才安装。

安装采用同目录临时文件、文件同步与原子重命名；上一版留作恢复。损坏包启动时隔离到 `userData/content-packs/quarantine/`，优先恢复上一可用版本。显式回滚仅回到已验证的上一版，仍保留最高安装版本，防止将旧文件伪装成升级再次安装。更新或回滚不删除关卡成绩。外部包不能覆盖内置战役。

## 上线章节更新

1. 先准备并签署每个 `.dogpack`，上传到固定的 HTTPS 内容源。
2. 计算**最终封包文件全部字节**的 SHA-256，写入下列目录条目（不是封包内部 payload 的 SHA-256）。
3. 目录 `version` 为递增正整数。将完整目录同样签署为 `catalog.dogpack`；签署目录时额外传 `--origin https://updates.yourdomain.com`。
4. 所有包文件上传并验证后，最后发布目录。客户端只接受目录 origin 下的 HTTPS URL，不跟随重定向。

```json
{
  "schema": 1,
  "type": "catalog",
  "version": 1,
  "packs": [{
    "id": "new-frontier",
    "version": "1.0.0",
    "url": "https://updates.yourdomain.com/dog-squad/content/new-frontier-1.0.0.dogpack",
    "sha256": "填写最终dogpack文件的64位小写SHA256"
  }]
}
```

配置 `contentFeedURL` 指向已签署的目录文件。客户端启动约 5 秒后、此后每 6 小时检查；可关闭自动检查及下载，也可主动检查。战斗中不应用内容变更。服务器需直接返回 JSON，不能重定向或压缩；目录最多 256 KiB，每请求 15 秒超时。失败保留现有可玩内容，不清除存档。内容源无登录、无遥测、无购买验证；未来收费 DLC 的授权系统是独立工作，本交付不假装具备付款能力。

## Mac 应用更新

应用清单由工程外的独立 Ed25519 私钥签署。客户端固定读取 GitHub Pages 的清单，只接受 `qx04222/dog-squad` 的精确 Release ZIP，并只允许跳转到 GitHub 的 release-assets 主机。清单用递增 `releaseEpoch` 排序，因此公开产品版本回到 1.0 不会影响后续升级顺序。

后台下载后会验证清单签名、ZIP 大小和 SHA-256，再检查单一应用根目录、路径穿越、解压上限、符号链接、bundle ID、版本、arm64 和代码签名。玩家在非战斗状态选择重启后，独立 helper 才交换应用。新进程必须在成功绘制且三套图集就绪后报告健康，并继续存活三秒；否则恢复并重启旧应用。整个过程不触碰用户存档。

Apple Developer ID Application 签名与 Apple 公证必须使用发行者真实账户。若采用这一发行层，需要匹配的 Team ID；公证凭据通过环境变量注入，不能写在工程中：

- Apple ID 方式：`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。
- App Store Connect API 方式：`APPLE_API_KEY`（密钥文件路径）、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。

```sh
DOG_SQUAD_RELEASE_CONFIG=/absolute/private/release-config.json node scripts/native-build.cjs --production
```

正式发行顺序：版本号与 releaseEpoch 上调 → 本地测试与原生 UI 测试 → 打包 → 在干净 Mac 安装验证 → 上传 ZIP/DMG → 验证公开资产 → 最后发布签名 `updates/app.json` → 用已安装旧版本走完整更新。每步保留实际证据，不用模拟单测代替真实升级。当前构建脚本只准备产物，不执行上传。

原生更新默认可以自动检查和下载；**不会自动退出游戏安装**。下载完成后等待玩家在「关卡库」点击重启安装；主进程再次检查战斗状态，防止页面误调用打断战斗。旧版本、预发行版本自动降级被禁用。

## 安全边界与验证

- 渲染器采用 contextIsolation、sandbox、nodeIntegration=false、webSecurity；仅加载固定 `app://dog-squad/desktop/app.html`。
- 静态资源路径白名单；禁止新窗口、网页导航、webview、权限请求、页面下载。
- CSP 外部脚本仅 self；页面网络连接为 none；对象、frame、base、表单关闭。内联样式只用于既有动态布局，不允许内联脚本。
- preload 仅提供窄操作接口；主进程校验主窗口、顶层 frame、精确 app URL，不提供任意文件、命令、URL 或 Node 接口。
- `node --test tests/desktop.test.cjs` 验证签名篡改、非法字段、最低引擎版本、安装持久化、回滚防重放、损坏恢复、目录下载、网络上限、自动更新偏好与战斗中重启限制。
- 开发态可用 `DOG_SQUAD_USER_DATA=/tmp/dog-squad-qa-...` 隔离测试存档；正式发行忽略该变量。

官方依据（2026-10-21 查询）：[Electron 安全清单](https://www.electronjs.org/docs/latest/tutorial/security/)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[electron-builder v26 自动更新](https://www.electron.build/v26/docs/features/auto-update/)、[Apple 公证说明](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。签名和真实更新验收以实际发行环境为准。
