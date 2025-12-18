# A2Action Flutter Client SDK (Demo)

This directory is a Flutter **package** (Dart‑only). It demonstrates:

- registering Actions on the client (capability catalog)
- calling the Firebase callable `a2actionOrchestrator`
- executing `toolPlan` / `toolCall` returned by the server

Entry points:

- `lib/ui/chat_page.dart` (reference UI + execution loop)
- `lib/a2action/*` (protocol + registry + callable client)

Recommended setup:

1) run or deploy the server (see repo root `README.en.md`)
2) create a new Flutter app and add this package via `path` dependency (see `docs/DEPLOYMENT.en.md`)

中文版本：`README.md`
