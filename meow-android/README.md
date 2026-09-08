# 喵都幸存者 · 安卓壳工程（meow-android）

游戏本体是纯 H5，位于仓库内 `miaomiao-deploy/`；本工程只是一个 **Flutter WebView 壳**：
把网页版整体打进 `assets/www/`，用全屏横屏 WebView 加载运行。游戏逻辑不在本工程里。

## 目录关系

```
Games/
├── miaomiao-deploy/          # 游戏本体（网页版，GitHub Pages 部署的就是它）
│   └── tools/sync-apk.sh     # 同步脚本：网页版 → 本工程 assets/www/
└── meow-android/             # 本工程（安卓壳，不参与 Pages 部署）
    └── assets/www/           # 打包进去的网页版（构建时由 sync-apk.sh 生成，别手改）
```

## 打包步骤（本机已验证）

```bash
# 1. 同步最新网页版资源（每次改完游戏都要跑）
bash /c/Users/gavin/Desktop/Games/miaomiao-deploy/tools/sync-apk.sh

# 2. 打 release APK（首次约 3~5 分钟，之后有 Gradle 缓存会快很多）
source /c/dev/env.sh     # JDK17 + Android SDK + 代理（127.0.0.1:7890 需在运行）
cd /c/Users/gavin/Desktop/Games/meow-android
flutter build apk --release
# 产物：build/app/outputs/flutter-apk/app-release.apk（通用包，约 42MB）
```

- 只要更小的包可按 CPU 分包：`flutter build apk --release --split-per-abi`
  （产物在同目录 `app-arm64-v8a-release.apk` 等，现代手机装 arm64 那个，约 18MB）
- 装机：`adb install -r app-release.apk` 或直接把 apk 传到手机安装。
- 仓库根的 `喵都幸存者-v1.0.0.apk` 是当前构建的拷贝（不入库，见下方 .gitignore）。

## 壳层做了什么（对应「安卓适配」要求）

| 事项 | 实现 |
| --- | --- |
| 横板锁定 | `AndroidManifest.xml` activity `android:screenOrientation="sensorLandscape"`（随重力翻转左右横屏） |
| 刘海/状态栏 | `main.dart` `SystemUiMode.immersiveSticky` 沉浸式全屏，下滑临时呼出 |
| 多分辨率/DPI | WebView 页面沿用游戏自身适配：canvas 按 `devicePixelRatio`（≤2）缩放 + 视口自愈，任意分辨率/DPI 自动铺满 |
| 触摸操作 | 游戏自带虚拟摇杆（canvas 触摸事件），WebView 直接透传 |
| 音频 | WebAudio 在 Android WebView 可用；无外部音频文件（音乐音效全合成，猫叫采样若缺失自动回退合成喵叫） |
| 离线运行 | 全部资源在本地 assets，完全离线可玩；在线时额外加载 Google Fonts 字体（离线自动回退系统字体） |
| 存档 | `localStorage`（WebView DOM Storage 已开启），最佳纪录等正常保存 |

## 改应用名 / 图标 / 版本号

- 应用名：`android/app/src/main/AndroidManifest.xml` 的 `android:label`（现为「喵都幸存者」）
- 版本号：`pubspec.yaml` 的 `version: 1.0.0+1`
- 图标：默认还是 Flutter 图标，换图标可跑 `flutter_launcher_icons` 包或直接替换
  `android/app/src/main/res/mipmap-*/ic_launcher.png`
