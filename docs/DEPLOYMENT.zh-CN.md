# 部署与使用（Server / Client）

本文按模块说明如何把 Demo 跑起来、如何本地开发、如何扩展。

---

## 0. 你会部署/运行哪些模块？

- **Server**：`server/firebase/functions`（Firebase Functions v2 + Tool‑RAG）
- **Client**：`client/flutter`（Flutter Client SDK + Demo UI 组件）

推荐顺序：

1) 先用 **Functions Emulator + Mock Router** 把端到端跑通（无需任何外部模型 Key）  
2) 再接入真实 LLM（设置 Secret）并部署到线上  
3) 最后把 Client 连接到线上 Functions

---

## 1. 前置环境

### Server 侧

- Node.js：建议 **Node 20**（Functions runtime 为 Node 20）
- Firebase CLI：`npm i -g firebase-tools`
- 一个 Firebase 项目（建议使用 Blaze 计费计划以部署 Cloud Functions v2；不部署只跑 Emulator 则不需要）

### Client 侧

- Flutter（本 Demo 用 Flutter stable）
- FlutterFire CLI（推荐）：`dart pub global activate flutterfire_cli`

---

## 2. Server：本地跑通（强烈推荐先走这条）

目标：不配置任何外部 Key，也能让 Client 跑通 `toolPlan/toolCall` 的执行链路。

### 2.1 安装依赖 & 构建工具向量

在仓库根目录执行：

```bash
cd server/firebase
npm --prefix functions install
npm --prefix functions run build:tool-vectors
npm --prefix functions run build
```

说明：

- `registry.json` → `tool_vectors.json` 是 build‑time 产物  
- 默认 `build:tool-vectors` 使用 toy embedding（完全离线、方便 Demo）

### 2.2 启动 Functions Emulator（Mock Router）

在 `server/firebase/functions` 目录创建本地环境变量文件（不会提交到 git）：

`server/firebase/functions/.env`（推荐）或 `server/firebase/functions/.env.local`

```env
# 不调用外部 LLM，直接用本地路由器返回 toolCall/toolPlan（Demo 专用）
A2ACTION_MOCK_MODE=router

# 让 selectTools 使用离线 toy embedding（可选，默认就是 toy）
A2ACTION_EMBEDDINGS_PROVIDER=toy
```

然后启动 Emulator：

```bash
cd server/firebase
firebase emulators:start --only functions
```

如果你的 Firebase CLI 没有自动加载 `.env`，也可以用这种方式临时注入：

```bash
cd server/firebase
A2ACTION_MOCK_MODE=router firebase emulators:start --only functions
```

此时 Server 端已经可以响应 callable（走本地 router），不依赖任何 API Key。

---

## 3. Server：接入真实 LLM（线上/本地都可）

### 3.1 设置 Secret（推荐做法）

```bash
cd server/firebase
firebase functions:secrets:set A2ACTION_API_KEY
```

然后把 `server/firebase/functions/.env`（或 `.env.local`）里的 `A2ACTION_MOCK_MODE` 注释掉（或删掉），让 Server 真正调用模型。

### 3.2 选择 LLM Provider（OpenAI‑compatible）

`a2actionOrchestrator` 通过 OpenAI‑compatible 协议调用任意模型服务。

在 `server/firebase/functions/.env`（本地）或部署环境里设置：

```env
# 你自己的 OpenAI‑compatible Base URL（不要在仓库里写死任何真实域名）
A2ACTION_CHAT_BASE_URL=<OPENAI_COMPATIBLE_BASE_URL>

# 你自己的模型名
A2ACTION_CHAT_MODEL=<MODEL_NAME>
A2ACTION_CHAT_TIMEOUT_MS=45000
A2ACTION_CHAT_TEMPERATURE=0.7
```

说明：

- **Key 永远只在 Server**（Secret / env），Client 不保存任何 provider key

---

## 4. Server：部署到线上

### 4.1 配置 Firebase 项目

```bash
cd server/firebase
cp .firebaserc.example .firebaserc
```

把 `<YOUR_FIREBASE_PROJECT_ID>` 替换成你的 Firebase Project ID。

### 4.2 部署

```bash
cd server/firebase
npm --prefix functions install
npm --prefix functions run build:tool-vectors
npm --prefix functions run build
firebase deploy --only functions
```

---

## 5. Client：配置 Firebase 并运行

### 5.1 配置 Firebase（推荐 flutterfire）

说明：本仓库的 `client/flutter` 目录是一个 Flutter package（只包含 Dart 代码），不包含平台工程文件（避免写死包名/域名等敏感信息）。

推荐做法：新建一个 Flutter App，并用 `path` 依赖引入该 package：

```bash
flutter create a2action_demo_app
cd a2action_demo_app
```

在新 App 的 `pubspec.yaml` 里添加（示例）：

```yaml
dependencies:
  a2action_client_demo:
    path: <PATH_TO>/A2Action/client/flutter
```

然后在新 App 内配置 Firebase（推荐）：

```bash
flutterfire configure
```

生成结果（示例）：

- `android/app/google-services.json`
- `ios/Runner/GoogleService-Info.plist`
- `lib/firebase_options.dart`（会覆盖本仓库自带的 stub）

> 说明：本仓库自带了一个 `lib/firebase_options.dart` stub，目的是让 Demo “不配置 Firebase 也能编译”；但要实际跑 Web / 最佳实践仍然是生成真实 options。

### 5.2 运行

```bash
flutter run
```

打开后可以直接输入：

- `scan storage`
- `open <URL>`
- `play <M3U_URL>`

### 5.3 连接本地 Emulator（可选）

如果你想让 Flutter 调用本地 Functions Emulator，需要在客户端调用：

```dart
FirebaseFunctions.instance.useFunctionsEmulator(host, 5001);
```

建议的 host：

- Android Emulator：`10.0.2.2`
- iOS Simulator / macOS / Web：`localhost`

你可以把这段加在 `client/flutter/lib/a2action/orchestrator_client.dart` 初始化处，或在 `main.dart` 里做 debug‑only 设置。

---

## 6. 如何“使用”这套框架（同事接入指南）

你只需要理解 3 个接口点：

1) **Client 注册动作**（ActionRegistry）  
`client/flutter/lib/a2action/registry.dart`

2) **Client 发起请求**（callable 协议）  
`client/flutter/lib/a2action/orchestrator_client.dart`  
请求里必须带：
- `messages`（历史）
- `context.capabilities` + `context.clientCapabilityIds`
- `context.lastActiveToolId`（建议）

3) **Client 执行 toolPlan/toolCall**  
`client/flutter/lib/ui/chat_page.dart`

---

## 7. 新增一个 Action（端到端最小步骤）

### 7.1 Client：新增并注册

1. 新建一个 Action（参考 `client/flutter/lib/actions/demo_actions.dart`）
2. 注册到 `ChatPage.initState()` 里的 `A2ActionRegistry`

### 7.2 Server：把同名 actionId 加进 registry

编辑：

`server/firebase/functions/src/tools/registry.json`

至少写：

- `embedding_text`：描述该 Action 的语义（建议英文 + 常见多语言表达）
- `guidance`：告诉模型什么时候用、参数怎么填
- `signals`（可选）：例如 `image` / `url_m3u`

然后重新生成 vectors 并部署：

```bash
npm --prefix server/firebase/functions run build:tool-vectors
npm --prefix server/firebase/functions run build
cd server/firebase && firebase deploy --only functions
```

---

## 8. 常见问题（排障）

### 8.1 Client 显示 “Firebase is not configured”

- 先跑：`flutterfire configure`
- Web 需要 `lib/firebase_options.dart` 的真实配置（stub 会抛错）

### 8.2 Server 报错 “A2ACTION_API_KEY is not configured”

- 先用 Demo 跑通：在 `.env.local` 里设置 `A2ACTION_MOCK_MODE=router`
- 要用真实 LLM：`firebase functions:secrets:set A2ACTION_API_KEY`

### 8.3 Functions deploy 要求开通计费

Cloud Functions v2 通常需要 Blaze；如果你只是想同事理解框架，优先用 Emulator + Mock Router 即可。
