// 喵都幸存者 · 安卓壳：全屏横屏 WebView 加载打包进 assets/www 的网页版本体。
// 游戏逻辑/渲染全在 H5（仓库 miaomiao-deploy），本文件只负责容器与系统适配。
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 意见8：横板游玩——锁定左右横屏，任何机型/分辨率都由网页层自适应
  await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  // 沉浸式全屏：隐藏状态栏/导航栏，下滑可临时呼出
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const MeowApp());
}

class MeowApp extends StatelessWidget {
  const MeowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '喵都幸存者',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF141430)),
      ),
      home: const GamePage(),
    );
  }
}

class GamePage extends StatefulWidget {
  const GamePage({super.key});

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      // 网页版是单页 Canvas 游戏：JS 全开、背景压成夜色，避免加载瞬间白屏
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF141430))
      ..setNavigationDelegate(NavigationDelegate(
        onWebResourceError: (WebResourceError e) {
          // 字体等在线资源离线加载失败属预期（网页层自动回退系统字体），只记录不中断
          debugPrint('[meow] web resource error: ${e.description}');
        },
      ))
      ..loadFlutterAsset('assets/www/index.html');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // resizeToAvoidBottomInset=false：软键盘永不顶起游戏画面
      resizeToAvoidBottomInset: false,
      body: WebViewWidget(controller: _controller),
    );
  }
}
