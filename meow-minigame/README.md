# 喵都幸存者 · 微信小游戏版（meow-minigame）

H5 本体（仓库内 `miaomiao-deploy/`）的微信小游戏移植版：**引擎层零改动复用**，
通过一层 wx→浏览器适配 + 纯 Canvas UI 层跑在小游戏环境里。

## 架构

```
meow-minigame/
├── game.js               # 小游戏入口（require bundle + 分享能力）
├── game.json             # 小游戏配置（横屏）
├── project.config.json   # 开发者工具工程配置（appid：测试号 wxfef91db419d837bc，正式提审也用它）
│                         # 含 cloudfunctionRoot: cloudfunctions/（🏆排行榜云函数）
├── cloudfunctions/       # 🏆 云端排行榜云函数（lb_top / lb_submit / cloudbase_auth，
│                         #   右键「上传并部署：云端安装依赖」；方案见 miaomiao-deploy/docs/排行榜云开发方案.md）
├── bundle.js             # 打包产物：adapter + 引擎 + LB + UI + main 按浏览器 script 语义拼接
├── src/
│   ├── adapter.js        # wx→DOM/BOM 适配层（window/document/canvas/localStorage/WebAudio/触摸桥）
│   ├── ui.js             # 纯 Canvas UI 层（主菜单/三选一/宝箱/暂停/结算/帮助/更新日志/🏆排行榜/HUD 按钮）
│   └── main.js           # 游戏主程序（由 tools_transform.py 从 miaomiao-deploy/js/main.js 自动生成）
├── tools_transform.py    # fork 生成器：网页版 main.js → 去 DOM 化的小游戏版（改网页版后重跑）
├── game-js/              # 同步来的引擎文件（util/audio/art/maps/game_config/data/result/changelog/leaderboard）
├── assets/meow/          # 猫叫采样（适配层用 FileSystemManager 读取）
└── test/                 # 浏览器冒烟测试（wx 桩 + 手动泵帧，不进小游戏包）
                          # 另有无头测试：node test/headless-bundle-test.js（IN_WX 真实分支，不依赖开发者工具）
```

引擎文件（game-js/）与 bundle.js 由同步脚本生成，**不要手改**：

```bash
bash /c/Users/gavin/Desktop/Games/miaomiao-deploy/tools/sync-minigame.sh
```

脚本做三件事：① 跑 `tools_transform.py` 重新生成 `src/main.js`（网页版 main.js 有改动时必需）；
② 拷贝引擎文件与喵叫采样；③ 按「浏览器 script 标签」语义拼出 `bundle.js`
（小游戏是 CommonJS，顶层 const 不跨文件可见，所以整体拼进单文件）。

## 在微信开发者工具里运行

1. 打开「微信开发者工具」→ 导入项目 → 目录选 `meow-minigame/`，AppID 用测试号
   （`project.config.json` 的 appid 当前是测试号 `wxfef91db419d837bc`，可预览/上传体验版；
   正式提审继续用同一 AppID，无需更换——除非你注册了新的小游戏账号）。
2. 编译即可玩：横屏、虚拟摇杆、HUD 右上角 ⏸ 暂停 / 🔍 缩放（4X=旧版大画面）/
   ⏩ 加速（1~3X）/ 🔊 静音，菜单选地图、玩法说明、游戏内更新日志齐备。
3. 本机没装开发者工具时的替代验证：浏览器打开 `test/index.html`（源文件版）
   或 `test/bundle.html`（打包产物版），wx 桩 + 触摸全链路都可冒烟；
   加 `?wx=1` 可强制走「真实小游戏分支」的适配层路径（仿真模拟器环境，回归必测）。

## 适配要点（对应 docs/小程序化方案.md 的 P0）

| 事项 | 做法 |
| --- | --- |
| 无 DOM/BOM | adapter 造 `window/document` 桩；`document.createElement('canvas')` → `wx.createCanvas()`（首调即屏幕画布） |
| WebAudio | `window.AudioContext` → `wx.createWebAudioContext`（缺 API 的旧基础库自动整体静音兜底） |
| 猫叫采样 | `fetch` → `FileSystemManager.readFile` 读包内 `assets/meow`，读不到自动回退合成喵叫 |
| localStorage | `wx.set/getStorageSync` |
| 触摸 | `wx.onTouchStart/Move/End` 桥接成画布 touch 事件，游戏摇杆与 Canvas UI 全部复用 |
| 生命周期 | `wx.onHide` → 自动暂停 |
| 字体 | ZCOOL KuaiLe 在线字体不可用，自动回退系统字体（后续可内置子集化字体） |
| 生命周期外的 UI | H5 的 HTML 覆盖层全部在 Canvas 上重建（MUI），命中测试即点即用 |
| 战报分享 | 结算「保存战报」→ `canvasToTempFilePath` + `saveImageToPhotosAlbum`（授权失败有 toast） |
| 全局挂载 | 开发者工具小游戏模式的 window/document 是锁死全局，defGlobal 赋值+defineProperty 双保险（20260909 真机模拟器实测踩雷修复） |
| 视口来源 | window 桩装不上时，把真实 window 的 innerWidth/innerHeight/devicePixelRatio 重定义为 wx 手机视口，避免读到页面级尺寸导致画布被 1:1 裁切 |
| 离屏画布取整 | wx 包装画布的 width/height 不做 WebIDL 整数化，小数尺寸会被 drawImage 拒绝；transform ㉙ 对 vignette 等统一 Math.round |

## 尚未做（上线前需要）

- 真机测试（模拟器已实测：主菜单/战斗/升级三选一/暂停/结算全链路通过；
  浏览器桩 ?wx=1 真实分支冒烟零报错。建议 iOS + 安卓真机各回归一轮）。
- 小程序后台配置：用户隐私保护指引（含"相册（仅写入）"，供保存战报用）、
  游戏资质（软著/电子版权认证或承诺制通道）、体验成员名单。
- 🏆 云端排行榜已实现（云开发双端互通，代码在 `js/leaderboard.js` + `cloudfunctions/`），
  **上线前需按 docs/排行榜云开发方案.md 开通云开发并填 ENV_ID**（测试号不能开云开发）；
  未配置时自动降级为「暂未开启」+ 本地最佳纪录，不影响上线。
- 开放数据域好友排行榜（P2 备选：好友榜免费但无法与网页端互通，可作现有云端榜的补充）。

## 已知问题（体验版观察项）

- **启动期控制台可能有一条 `getSystemInfo fail: jsbridge not ready` 报错**：开发者工具/真机在
  jsbridge 就绪前调用系统信息接口时运行时自行打印的噪音，适配层有 500ms 重试兜底，
  视口最终正确，不影响游玩（已在模拟器与体验版验证）。
- 像素风三要素已完整移植：pixel-assets 像素精灵（art_pixel.js + window.PIXEL_MANIFEST 内联）、
  地形 1/4 烘焙放大（imageSmoothing 全局关闭）、Fusion Pixel 字体子集（tools_font.py 生成，
  wx.loadFont 注册，家族名已改写为 "Fusion Pixel" 命中全部字体栈）。真机上若发现某个
  界面仍是平滑矢量风，多半是 imageSmoothingEnabled 在该机型不生效——反馈截图即可。
- v3 虚拟视口：游戏恒按 720p 设计基准作画，适配层等比贴到物理屏（解决开发者工具
  window 锁死导致的 2x 裁切）。折叠屏/分屏改变纵横比后需重启小游戏（暂无 onWindowResize 桥）。
- 重力感应：倾斜手机控制角色移动（与触摸摇杆共存，不触摸时生效）。轴映射在 adapter.js
  `wx.onAccelerometerChange` 回调中定义，真机测试后可能需微调符号/死区。

## 发布素材（store/）

- `icon-512.png` / `icon-144.png`：小游戏头像（icon.html 可再生成）。
- `raw-menu / raw-combat / raw-levelup / raw-pause / raw-result / raw-help .png`：
  1280×720 横屏实机截图（?nodev=1 模式下截取，无 dev 面板、触屏文案）。
- `发布指南.md`：注册 → 备案/资质 → 导入工具 → 上传 → 提审 → 发布全流程 + 文案速贴。

## 维护提醒

网页版 `js/main.js` 改动后只需重跑 `sync-minigame.sh`；**网页版若改了 UI 交互结构**
（如新增面板），需要同步修改 `src/ui.js` 与 `tools_transform.py` 的对应转换规则。
引擎数值/玩法逻辑在 `game-js/` 里永远是网页版原文件，不维护两份。
🏆 排行榜的云配置（ENV_ID/RESOURCE_APPID）在网页版 `js/leaderboard.js` 顶部改，
改完重跑 sync 两端同步生效。

⚠️ `project.config.json` 的 `setting.es6` 必须保持 **true**：关闭后预览/上传的编译管线
会因 bundle 里的 `??` 等新语法直接报 SyntaxError（模拟器用的是本地 Chromium，不会暴露此问题）。
IDE 导入工程时会重写该文件，重写后记得复查。appid 已换为正式测试账号
`wxfef91db419d837bc`（可预览/上传体验版；正式提审继续用它，无需再换）。
