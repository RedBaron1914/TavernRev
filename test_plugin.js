// TavernRev Test Extension
// This script runs on startup and hooks into the chat lifecycle.

console.log("🧩 [Test Plugin] Initializing...");

if (window.TavernAPI) {
    // Show a toast when the plugin is fully loaded
    TavernAPI.on("on_app_ready", (data) => {
        TavernAPI.toast(`Test Plugin loaded successfully! Total plugins: ${data.totalPlugins}`, "success");
    });

    // Intercept and modify messages before they are sent
    TavernAPI.on("before_send_message", async (text) => {
        console.log("🧩 [Test Plugin] Intercepted user message:", text);
        
        // 1. Command substitution
        if (text.trim().toLowerCase() === "/ping") {
            TavernAPI.toast("Plugin intercepted '/ping', changing to 'pong!'", "info");
            return "pong! (This was swapped by Test Plugin)";
        }
        
        // 2. Suffix injection
        if (!text.includes("✨") && !text.startsWith("/")) {
            return text + " ✨";
        }
        
        return text;
    });

    console.log("🧩 [Test Plugin] Successfully registered hooks.");
} else {
    console.error("🧩 [Test Plugin] TavernAPI not found. Is the extension loader working?");
}
