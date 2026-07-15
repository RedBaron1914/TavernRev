# <img src="design/icon.svg" width="32" height="32"> TavernRev

> **⚠️ BETA RELEASE WARNING**
> This software is in early development (v1.5.4). Bugs are expected.
> **Always backup your chats** (Export function) before updating or clearing data.

A next-generation, high-performance character chat client designed for speed and compatibility. 
Built natively for **Android** and **Windows**, TavernRev brings the power of advanced AI roleplay to your pocket without the web-browser lag.

*(Currently in Beta v1.5.4)*

---

## 📥 Download & Install

### 📱 Android
1. Download the latest `.apk` from the **Releases** tab.
2. Install it on your device (Android 10+ recommended).
3. Enjoy full offline-capable UI with online AI backends.

### 💻 Windows
1. Download the latest `.msi` from the **Releases** tab
2. Install it on your device (Windows 10 (1809+) or Windows 11 recommended. Windows 7/8.1 supported via WebView2 Runtime installation.)
3. Enjoy full offline-capable UI with online AI backends.

---

## 🔥 Why TavernRev?

### 👥 Advanced Group Chats
- **Multi-Character Support**: Create rooms with multiple characters.
- **Smart Routing**: Natural (mention-based), Round Robin (List), or Manual speaker selection.
- **Group Scenarios**: Define global contexts that all characters in the group respect.
- **Mute & Talkativeness**: Fine-tune group dynamics by silencing bots or adjusting their chance to speak.

### ☁️ Multi-Cloud Synchronization
- **Dropbox & Google Drive**: Keep your characters, personas, and chats in sync across all your devices.
- **Delta Sync**: Only uploads what changed. Synchronize hundreds of chats in milliseconds.
- **Deep Sync**: Extracts embedded World Info from character cards automatically during sync.

### 🚀 Speed & Native Feel
Unlike web-wrappers, TavernRev is built on Rust. It handles chats with thousands of messages instantly, supports 120Hz scrolling, and respects your phone's safe areas and gestures.

### 🧠 Smart AI Support
- **Google Gemini 2.5 & 3.0**: Native support for the latest models with **Thinking Level** control (Low/High/Budget).
- **OpenAI (o1/o3)**: Full support for reasoning models via `Reasoning Effort` settings.
- **AI Horde**: Free access to community models with automatic worker listings.
- **Custom Backends**: Connect to Oobabooga, KoboldCPP, or any OpenAI-compatible API.

### ⚡ Power User Features
- **Built-in System Console**: Debug errors and view logs directly inside the app (Settings -> Advanced).
- **Branching Storylines**: Fork your chat at any point to explore "What if?" scenarios.
- **Swipes & Rerolls**: Don't like an answer? Swipe for a new one. The app remembers all variations.
- **Rich Text**: Full support for Markdown, KaTeX, and HTML styling for immersive RP.
- **Async Scripting (STScript)**: Advanced macros, variables, and logic (`/if`, `/wait`, `/delay`) executed in real-time.

### ♻️ Compatibility
- **SillyTavern Ready**: Import and Export your chats (`.jsonl`) and presets seamlessy. Move your stories between PC and Mobile.
- **V2 Character Cards**: Full support for the modern character card standard (PNG/JSON).
- **Lorebooks!** Tried my best to implement them. They are not truly fully done, but they are supported now with nice GUI editor.

### Long-Term Memory (RAG)
- **Local Vector Database**: Seamlessly remember past conversations spanning thousands of messages using a lightning-fast, purely local SQLite + ONNX embedding engine.
- **Multilingual Support**: Choose between specialized English models (`All-MiniLM`, `Nomic`) or comprehensive 100+ language brains (`Multilingual E5`).
- **Complete Privacy**: All embeddings and math are computed locally on your CPU. No external python servers required.

### Extension system
- **JavaScripting**: Allows to add custom made extensions 
---

*TavernRev is an independent project compatible with the TavernAI ecosystem.*

See [**documentation**](./DOCUMENTATION.md) for more information.
