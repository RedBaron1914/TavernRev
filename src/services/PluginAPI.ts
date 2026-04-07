import { invoke } from "@tauri-apps/api/core";

export type PluginCallback = (...args: any[]) => any | Promise<any>;

class TavernPluginAPI {
    private listeners: Record<string, PluginCallback[]> = {};
    private _activeChatId: number | null = null;
    private _activeCharacterId: number | null = null;

    /**
     * Listen to an event (e.g., 'before_send_message', 'on_message_received', 'on_chat_changed')
     */
    on(event: string, callback: PluginCallback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        console.log(`[PluginAPI] Registered listener for '${event}'`);
    }

    /**
     * Stop listening to an event
     */
    off(event: string, callback: PluginCallback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Internal: Emit a synchronous or void-returning event
     */
    emit(event: string, ...args: any[]) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => {
            try {
                cb(...args);
            } catch (e) {
                console.error(`[PluginAPI] Error in plugin executing '${event}':`, e);
            }
        });
    }

    /**
     * Internal: Emit an asynchronous event that can modify the payload.
     * Plugins must return the (modified) payload back.
     */
    async emitAsync(event: string, payload: any): Promise<any> {
        if (!this.listeners[event]) return payload;
        let currentPayload = payload;
        
        for (const cb of this.listeners[event]) {
            try {
                const result = await cb(currentPayload);
                if (result !== undefined) {
                    currentPayload = result;
                }
            } catch (e) {
                console.error(`[PluginAPI] Error in plugin executing async '${event}':`, e);
            }
        }
        return currentPayload;
    }

    // --- CONTEXT HELPERS ---
    
    get activeChatId() { return this._activeChatId; }
    get activeCharacterId() { return this._activeCharacterId; }

    /** Internal: Used by App.tsx to keep context in sync */
    _updateContext(chatId: number | null, charId: number | null) {
        if (this._activeChatId !== chatId || this._activeCharacterId !== charId) {
            this._activeChatId = chatId;
            this._activeCharacterId = charId;
            this.emit('on_chat_changed', { chatId, charId });
        }
    }

    // --- SYSTEM API ---

    /**
     * Invoke a backend Rust command natively from a plugin.
     */
    async backend(command: string, args?: Record<string, any>): Promise<any> {
        return invoke(command, args);
    }

    /**
     * Print a toast message to the UI
     */
    toast(message: string, type: "info" | "success" | "error" | "warning" = "info") {
        window.dispatchEvent(new CustomEvent("tavern_plugin_toast", { detail: { message, type } }));
    }
}

export const TavernAPI = new TavernPluginAPI();

// Bind to window for global access by external JS files
if (typeof window !== "undefined") {
    (window as any).TavernAPI = TavernAPI;
}
