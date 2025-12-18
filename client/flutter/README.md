# A2Action Flutter Client Demo

这个目录是一个 Flutter package（只包含 Dart 代码）。它演示：

- 在客户端注册 Actions（能力目录 / capability catalog）
- 调用 Firebase Callable `a2actionOrchestrator`
- 处理服务端返回的 `toolPlan` / `toolCall` 并执行本地 Actions

入口：
- `lib/main.dart`
- `lib/ui/chat_page.dart`

运行前提（推荐流程）：

1. 先把服务端跑起来（本地 emulator 或线上 functions）：见仓库根目录 `README.md`
2. 按 `docs/DEPLOYMENT.zh-CN.md`（或 `docs/DEPLOYMENT.en.md`）新建一个 Flutter App，并通过 `path` 依赖引入本 package
3. 在新 App 中配置 Firebase（推荐 `flutterfire configure`）

English: `README.en.md`
