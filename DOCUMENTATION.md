# TavernRev — Complete Project Documentation

**Version:** 1.2.3  
**Repository:** Internal (Rust + Tauri Desktop Application)  
**License:** AGPL-3.0-only  
**Tech Stack:** Rust (Backend), Tauri 2, React 19 + TypeScript + TailwindCSS (Frontend)

---

## 1. Overview

**TavernRev** is a lightweight, privacy-first, fully offline-capable AI role-playing chat client. It is a modern, high-performance re-implementation of the SillyTavern experience, built from the ground up with Rust and Tauri for maximum performance, security, and cross-platform compatibility (Windows, macOS, Linux, Android).

### Core Philosophy

- **Maximum Prompt Control**: Precise, modular prompt engineering with fine-grained injection control.
- **Advanced Memory Systems**: Built-in local RAG (vector memory) using ONNX/FastEmbed + traditional lorebook keyword matching.
- **Group Chat Excellence**: Full support for multi-character conversations with intelligent routing.
- **Scriptability**: Powerful STScript macro system + full JavaScript Plugin API.
- **Zero Telemetry & Full Privacy**: Everything runs locally. SQLite + file-based storage.
- **Seamless Multi-Device Sync**: Native Dropbox + Google Drive synchronization with conflict resolution via UUIDs.
- **Modern UI/UX**: Beautiful React interface with markdown + KaTeX support, image handling, swipe system, branching, and more.

---

## 2. High-Level Architecture


graph TD
    A[Frontend: React 19 + Tailwind] -->|Tauri IPC| B[Rust Backend]
    A -.->|TavernAPI| J[JS Plugin System]
    B --> C[SQLite Database]
    B --> D[Prompt Engine]
    B --> E[STScript Evaluator]
    B --> F[Vector Memory (FastEmbed)]
    B --> G[API Client (OpenAI, Claude, Gemini, Grok, Horde, Local)]
    B --> H[Cloud Sync (Dropbox + Google Drive)]
    B --> I[Routing Engine (Groups)]
    B --> K[Regex Scripts & Post-Processing]

### Key Rust Modules

| Module                        | Purpose |
|------------------------------|---------|
| `database.rs`                | SQLite schema, CRUD, migrations, triggers |
| `prompt_engine.rs`           | Dynamic prompt assembly, lore injection, token budgeting |
| `script_engine/`             | Parser, AST, Evaluator for STScript macros |
| `api_client.rs`              | Streaming generation, formatters, tool calling |
| `vector_memory.rs`           | FastEmbed RAG, embeddings, cosine similarity |
| `routing.rs`                 | Group chat speaker selection logic |
| `sync_manager.rs`            | Dropbox OAuth2 + file sync |
| `google_drive_manager.rs`    | Google Drive OAuth2 + sync |
| `importer.rs`                | Character card (PNG/JSON) import |
| `transformers.rs`            | Message role enforcement & merging |

---

## 3. Database (SQLite)

**File:** `tavern.db` (stored in app data directory)

### Core Tables

- **`characters`** — Full Tavern V2 cards + UUID, timestamps, tags
- **`user_personas`** — Multiple user profiles (name, avatar, description)
- **`groups`** & **`group_members`** — Group metadata and membership
- **`chats`** — Chat metadata, linked persona/group, auto-summary memory
- **`messages`** — Full swipe history (JSON), images (base64), exclude flags, sender info
- **`memory_vectors`** — Chat history embeddings for RAG
- **`lore_vectors`** — Lorebook entry embeddings
- **`lorebooks`** & **`lore_entries`** — World Info / Lore system
- **`regex_scripts`** — Post-processing rules (user/ai/both)
- **`quick_replies`** — Custom action buttons
- **`chat_variables`** / **`global_vars`** — STScript variable storage
- **`connection_profiles`** — API settings & keys

**UUID Strategy**: Every major entity has a UUID for robust cloud synchronization and conflict resolution.

---

## 4. Group Chats & Routing

TavernRev has first-class support for group chats.

**Routing Strategies** (configurable per group):

1. **Natural** — Mention detection + talkativeness-based probability
2. **Round Robin (List)** — Sequential cycling through members
3. **Manual** — User selects next speaker via UI prompt

**Additional Features**:
- Mute specific characters
- Allow/Disallow self-responses
- Dynamic speaker indicators in UI
- Group avatars and custom scenarios

---

## 5. Memory & Context Management

### 5.1 Long-Term Memory (RAG)

Powered by `fastembed` (ONNX Runtime):

- **Models supported**: MultilingualE5Small, AllMiniLML6V2, NomicEmbedText, custom ONNX models
- Automatic chat history chunking + embedding
- Semantic retrieval with configurable `top_k`, `threshold`, injection depth
- Lorebook RAG — semantic triggering of entries even without exact keywords
- API fallback support for remote embedding models

### 5.2 Traditional Lorebooks / World Info

- Keyword, regex, and case-sensitive matching
- Recursive scanning
- Priority, probability, position (before/after character, depth-based)
- Token budgeting to prevent context overflow

### 5.3 Context Overflow Protection

Automatic exclusion of oldest messages when approaching token limit (`auto_exclude_context_overflow`).

### 5.4 Auto-Summarization

Built-in summarization prompt that populates `chats.memory` field.

---

## 6. STScript (Macro & Command System)

**Syntax**: `{{macro::arg1::arg2}}` or `/command args`

### Supported Features

- **Variables**: `setvar`, `getvar`, `incvar`, `decvar`, global variants
- **Math**: `add`, `sub`, `mul`, `div`, `roll:1d20+5`
- **Logic**: `gt`, `lt`, `gte`, `lte`, `and`, `or`, `not`
- **Control Flow**: `/if ... /else ... /endif`
- **Time/Date**: `{{time}}`, `{{date}}`
- **Character/User**: `{{char}}`, `{{user}}`
- **UI Commands**: `/toast`, `/popup`, `/bg`, `/bubbles`, etc.
- **Wait**: `{{wait:0.5}}` (asynchronous delays)
- **Nested Macros**: Full recursive evaluation

**Regex Scripts**: Post-generation text transformation with macro evaluation support.

---

## 7. Prompt Engineering

The prompt engine is highly modular:

- **PromptModules** with injection_order, depth, and position control
- System / User / Assistant role handling with strict alternation enforcement
- Dynamic transformers: `merge_consecutive_roles`, `enforce_alternating_roles`
- Lore + RAG injection at precise positions
- Token-aware budgeting
- Support for vision (image) context

---

## 8. Generation Pipeline

1. Input processing + macro expansion
2. Speaker determination (for groups)
3. Context gathering (messages, lore, RAG, variables)
4. Prompt assembly
5. API call (streaming)
6. Post-processing (regex scripts, error detection)
7. Auto-retry logic (configurable triggers: 429, 503, "overloaded", etc.)
8. Message saving + cloud auto-sync

**Supported Backends**: OpenAI, Anthropic, Google Gemini, Grok, Horde, Kobold, Ooba, local servers, etc.

**Tool Calling** support during generation.

---

## 9. Cloud Synchronization

**Supported Providers**:
- **Dropbox** (OAuth2 + PKCE, refresh tokens)
- **Google Drive**

**Features**:
- Auto-sync after messages/edits (debounced)
- Delta detection using timestamps + SHA
- Full sync of characters, personas, groups, chats (JSONL), avatars
- Conflict resolution via UUIDs

---

## 10. UI/UX Features

- **Two Chat Styles**: Bubbles (modern) and Document (novel)
- **Swipe System** with left/right navigation
- **Branching** from any message
- **Message Editing**, deletion, exclusion
- **Image Support**: Paste, upload, base64, remote URLs (auto-render)
- **Markdown + KaTeX** full support
- **Content Scaling** and accessibility options
- **Character Editor** with AI Studio Assistant (diff viewer)
- **Stats Modal**, Memory Viewer
- **Quick Replies**
- **Mobile Optimized** (Android support)
- **Toast notifications**, modals, sidebars

**Theme**: Dark-first with excellent contrast and readability.

---

## 11. Plugin System (JavaScript)

Extensions placed in `extensions/` folder are loaded at startup.

**TavernAPI** global object provides:

- Event system (`on`, `emit`, `emitAsync`)
- Backend command invocation
- UI manipulation (toast, popup, etc.)
- Prompt interception (`before_send_message`, etc.)
- Full access to app state and actions

---

## 12. File System Layout

```
tavern_data/
├── tavern.db
├── avatars/
├── characters/
├── groups/
├── chats/
├── presets/
├── connections/
├── extensions/
├── lorebooks/
├── backups/
└── vector_cache/ (optional)
```

---

## 13. Configuration & Settings

- Multiple connection profiles
- Generation presets
- RAG settings (model, top_k, threshold, etc.)
- Retry logic (triggers, delay)
- UI preferences (scale, style, background)
- Auto-sync toggles

All settings are persisted locally.

---

## 14. Development & Building

**Frontend**: Vite + React 19 + TailwindCSS 4  
**Backend**: Rust + Tauri 2  
**Build**: `pnpm build` then `tauri build`

**Dependencies**:
- `fastembed` + ONNX Runtime (dynamic loading)
- `rusqlite` (bundled)
- `reqwest`, `tokio`, `handlebars`, etc.

---

## 15. Troubleshooting

**Common Issues**:
- Missing `onnxruntime.dll` / `.so` / `.dylib` → Place next to executable or in resources
- Embedding model download failures → Check internet + cache permissions
- Android-specific path issues → Handled automatically
- Sync authentication → Re-authorize in Settings

**Logs**: Available in-app debug console + backend logging.

---

**TavernRev** — Built with love for the AI RP community.  
Fully open source. Contribute, extend, and enjoy maximum freedom in your roleplay.
