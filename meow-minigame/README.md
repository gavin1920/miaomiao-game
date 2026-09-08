# 喵都幸存者 · 微信小游戏版（meow-minigame）

H5 本体（仓库内 `miaomiao-deploy/`）的微信小游戏移植版：**引擎层零改动复用**，
通过一层 wx→浏览器适配 + 纯 Canvas UI 层跑在小游戏环境里。

## 架构

```
meow-minigame/
├── game.js               # 小游戏入口（require bundle + 分享能力）
├── game.json             # 小游戏配置（横屏）
├── project.config.json   # 开发者工具工程配置（appid 占位 touristappid）
├── bundle.js             # 打包产物：adapter + 引擎 + UI + main 按浏览器 script 语义拼接
├── src/
│   ├── adapter.js        # wx→DOM/BOM 适配层（window/document/canvas/localStorage/WebAudio/触摸桥）
│   ├── ui.js             # 纯 Canvas UI 层（主菜单/三选一/宝箱/暂停/结算/帮助/更新日志/HUD 按钮）
│   └── main.js           # 游戏主程序（由 tools_transform.py 从 miaomiao-deploy/js/main.js 自动生成）
├── tools_transform.py    # fork 生成器：网页版 main.js → 去 DOM 化的小游戏版（改网页版后重跑）
├── game-js/              # 同步来的引擎文件（util/audio/art/maps/game_config/data/result/changelog）
├── assets/meow/          # 猫叫采样（适配层用 FileSystemManager 读取）
└── test/                 # 浏览器冒烟测试（wx 桩 + 手动泵帧，不进小游戏包）
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
   （`project.config.json` 里是 `touristappid` 占位，正式发布前换成自己的小游戏 AppID）。
2. 编译即可玩：横屏、虚拟摇杆、HUD 右上角 ⏸ 暂停 / 🔍 缩放（4X=旧版大画面）/
   ⏩ 加速（1~3X）/ 🔊 静音，菜单选地图、玩法说明、游戏内更新日志齐备。
3. 本机没装开发者工具时的替代验证：浏览器打开 `test/index.html`（源文件版）
   或 `test/bundle.html`（打包产物版），wx 桩 + 触摸全链路都可冒烟。

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

## 尚未做（上线前需要）

- 真机测试（本机无微信开发者工具；已用浏览器桩全流程冒烟：菜单/开局/升级/宝箱/
  结算/帮助/日志/缩放/加速/保存战报，全链路零报错）。
- 正式 AppID、注册小游戏账号、代码上传与提审（见 `miaomiao-deploy/docs/小程序化方案.md` 的
  合规与提审章节）。
- 开放数据域好友排行榜、包体优化与子集化字体（P2 阶段）。

## 维护提醒

网页版 `js/main.js` 改动后只需重跑 `sync-minigame.sh`；**网页版若改了 UI 交互结构**
（如新增面板），需要同步修改 `src/ui.js` 与 `tools_transform.py` 的对应转换规则。
引擎数值/玩法逻辑在 `game-js/` 里永远是网页版原文件，不维护两份。
