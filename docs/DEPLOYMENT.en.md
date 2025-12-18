# Deployment & Usage (Server / Client)

This document explains how to run the demo end‑to‑end, develop locally, and extend it.

---

## 0) What you will run

- **Server**: `server/firebase/functions` (Firebase Functions v2 + Tool‑RAG)
- **Client**: `client/flutter` (Flutter client SDK + demo UI widget)

Recommended order:

1) Run end‑to‑end with **Functions Emulator + Mock Router** (no external model key needed)  
2) Connect a real LLM (set secret + env)  
3) Point the client to the deployed Functions

---

## 1) Prerequisites

### Server side

- Node.js: recommended **Node 20** (Functions runtime is Node 20)
- Firebase CLI: `npm i -g firebase-tools`
- A Firebase project (for deploying Functions; Emulator‑only does not require deployment)

### Client side

- Flutter (stable)
- FlutterFire CLI (recommended): `dart pub global activate flutterfire_cli`

---

## 2) Server: local end‑to‑end (recommended first)

Goal: run the full `toolPlan/toolCall` loop without any external LLM key.

### 2.1 Install and build tool vectors

From the repo root:

```bash
cd server/firebase
npm --prefix functions install
npm --prefix functions run build:tool-vectors
npm --prefix functions run build
```

Notes:

- `registry.json` → `tool_vectors.json` is a build‑time artifact
- default `build:tool-vectors` uses offline toy embeddings (perfect for demos)

### 2.2 Start Functions Emulator (Mock Router)

Create a local env file under `server/firebase/functions/` (do not commit):

`server/firebase/functions/.env` (recommended) or `server/firebase/functions/.env.local`

```env
# Demo-only: do not call any external LLM, return toolCall/toolPlan from a local router
A2ACTION_MOCK_MODE=router

# Optional; default is toy anyway
A2ACTION_EMBEDDINGS_PROVIDER=toy
```

Start Emulator:

```bash
cd server/firebase
firebase emulators:start --only functions
```

If your CLI does not load `.env` automatically, you can inject it like:

```bash
cd server/firebase
A2ACTION_MOCK_MODE=router firebase emulators:start --only functions
```

---

## 3) Server: connect a real LLM (local or deployed)

### 3.1 Set secret (recommended)

```bash
cd server/firebase
firebase functions:secrets:set A2ACTION_API_KEY
```

Then remove `A2ACTION_MOCK_MODE` from your env file so the server calls the model.

### 3.2 Configure an OpenAI‑compatible provider

Set these in `server/firebase/functions/.env` (local) or as deployed environment variables:

```env
# Your OpenAI‑compatible base URL (do not hardcode any real domain in this repo)
A2ACTION_CHAT_BASE_URL=<OPENAI_COMPATIBLE_BASE_URL>

# Your model name
A2ACTION_CHAT_MODEL=<MODEL_NAME>

A2ACTION_CHAT_TIMEOUT_MS=45000
A2ACTION_CHAT_TEMPERATURE=0.7
```

Important:

- provider keys must stay **server‑side only** (secrets/env). Never ship them to the client.

---

## 4) Server: deploy

### 4.1 Configure Firebase project

```bash
cd server/firebase
cp .firebaserc.example .firebaserc
```

Replace `<YOUR_FIREBASE_PROJECT_ID>` with your Firebase project id.

### 4.2 Deploy

```bash
cd server/firebase
npm --prefix functions install
npm --prefix functions run build:tool-vectors
npm --prefix functions run build
firebase deploy --only functions
```

---

## 5) Client: create an app and use the SDK

This repo’s `client/flutter` is a **Flutter package** (Dart‑only). It does not ship platform project files.

### 5.1 Create a Flutter app and add path dependency

```bash
flutter create a2action_demo_app
cd a2action_demo_app
```

In your new app’s `pubspec.yaml`:

```yaml
dependencies:
  a2action_client_demo:
    path: <PATH_TO>/A2Action/client/flutter
```

### 5.2 Configure Firebase in the app (recommended)

```bash
flutterfire configure
```

It will generate platform config files and a real `lib/firebase_options.dart` in your app project.

### 5.3 Run

```bash
flutter run
```

Try:

- `scan storage`
- `open <URL>`
- `play <M3U_URL>`

### 5.4 Point to local Functions Emulator (optional)

Add this in your app (debug‑only is recommended):

```dart
FirebaseFunctions.instance.useFunctionsEmulator(host, 5001);
```

Host suggestions:

- Android Emulator: `10.0.2.2`
- iOS Simulator / desktop / web: `localhost`

---

## 6) How teammates integrate this framework

Only three touchpoints:

1) **Register actions** (capability catalog)  
`client/flutter/lib/a2action/registry.dart`

2) **Call the orchestrator** (request protocol)  
`client/flutter/lib/a2action/orchestrator_client.dart`  
Request should include:
- `messages`
- `context.capabilities` + `context.clientCapabilityIds`
- `context.lastActiveToolId` (recommended)

3) **Execute toolPlan/toolCall**  
Reference implementation: `client/flutter/lib/ui/chat_page.dart`

---

## 7) Add a new action (end‑to‑end minimum)

### 7.1 Client

1) Implement a new `A2Action` (see `client/flutter/lib/actions/demo_actions.dart`)
2) Register it in the registry

### 7.2 Server

Edit `server/firebase/functions/src/tools/registry.json`:

- `embedding_text`: describe the action semantics (include multilingual variations if needed)
- `guidance`: when to call + how to fill arguments
- `signals` (optional): e.g. `image`, `url_m3u`

Rebuild vectors and deploy:

```bash
npm --prefix server/firebase/functions run build:tool-vectors
npm --prefix server/firebase/functions run build
cd server/firebase && firebase deploy --only functions
```

---

## 8) Troubleshooting

### 8.1 Client shows “Firebase is not configured”

- run `flutterfire configure` in your app project

### 8.2 Server error “A2ACTION_API_KEY is not configured”

- for demo: set `A2ACTION_MOCK_MODE=router`
- for real LLM: set secret `A2ACTION_API_KEY` and configure `A2ACTION_CHAT_BASE_URL`
