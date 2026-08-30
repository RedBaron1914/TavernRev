use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, Manager};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JanitorAuthPayload {
    pub session_token: String,
    pub user_id: String,
}

#[tauri::command]
pub async fn open_janitor_login_window(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_opener::OpenerExt;
        app_handle.opener().open_url("https://janitorai.com/login", None::<String>)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(target_os = "android"))]
    {
        // If window already exists, show and focus it
        if let Some(window) = app_handle.get_webview_window("janitor-login") {
            let _ = window.show();
            let _ = window.set_focus();
            return Ok(());
        }

        let login_url = "https://janitorai.com/login".parse().map_err(|e| format!("{:?}", e))?;

        // Interceptor script injected into Janitor webview window on desktop:
        let init_script = r###"
            (function() {
                function saveAuth(token, uid) {
                    if (token && uid) {
                        try {
                            let payload = JSON.stringify({
                                session_token: token,
                                user_id: uid
                            });
                            let b64 = btoa(unescape(encodeURIComponent(payload)));
                            window.location.hash = "#TAVERN_AUTH_" + b64;
                        } catch(e) {}
                    }
                }

                // 1. Monkeypatch fetch
                const origFetch = window.fetch;
                window.fetch = async function(...args) {
                    try {
                        const url = String(args[0] || "");
                        const opts = args[1] || {};

                        // Check if Authorization header or cookies are used
                        if (opts && opts.headers) {
                            let authHeader = "";
                            if (opts.headers instanceof Headers) {
                                authHeader = opts.headers.get("Authorization") || opts.headers.get("authorization") || "";
                            } else if (typeof opts.headers === "object") {
                                authHeader = opts.headers["Authorization"] || opts.headers["authorization"] || "";
                            }
                            if (authHeader && authHeader.startsWith("Bearer ")) {
                                let token = authHeader.substring(7);
                                let uid = "";
                                for (let i = 0; i < localStorage.length; i++) {
                                    let k = localStorage.key(i);
                                    if (k) {
                                        let v = localStorage.getItem(k);
                                        if (v && (v.includes("access_token") || v.includes("sb-auth"))) {
                                            try {
                                                let p = JSON.parse(v);
                                                if (p.user && p.user.id) uid = p.user.id;
                                                else if (p.id && typeof p.id === 'string' && p.id.length === 36) uid = p.id;
                                            } catch(e) {}
                                        }
                                    }
                                }
                                if (uid) saveAuth(token, uid);
                            }
                        }

                        // If generateAlpha or chat request was made
                        if (url.includes("generateAlpha") || url.includes("generate") || url.includes("/chat")) {
                            let token = "";
                            let uid = "";
                            for (let i = 0; i < localStorage.length; i++) {
                                let k = localStorage.key(i);
                                if (k) {
                                    let v = localStorage.getItem(k);
                                    if (v && (v.includes("access_token") || v.includes("sb-auth"))) {
                                        try {
                                            let p = JSON.parse(v);
                                            if (p.access_token) token = p.access_token;
                                            if (p.user && p.user.id) uid = p.user.id;
                                            else if (p.id && typeof p.id === 'string' && p.id.length === 36) uid = p.id;
                                        } catch(e) {}
                                    }
                                }
                            }
                            if (!token) token = document.cookie || "";
                            if (!uid) {
                                let cookies = document.cookie || "";
                                let m = cookies.match(/(?:user_id%22%3A%22|\"user_id\":\"|\"id\":\"|id%22%3A%22)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                                if (m) uid = m[1];
                            }
                            if (token && uid) saveAuth(token, uid);
                        }
                    } catch(e) {}
                    return origFetch.apply(this, args);
                };

                // 2. Periodically scan localStorage & cookies for Supabase token
                setInterval(function() {
                    try {
                        let token = "";
                        let uid = "";
                        for (let i = 0; i < localStorage.length; i++) {
                            let k = localStorage.key(i);
                            if (k) {
                                let v = localStorage.getItem(k);
                                if (v && (v.includes("access_token") || v.includes("sb-auth") || v.includes("supabase"))) {
                                    try {
                                        let p = JSON.parse(v);
                                        if (p.access_token) token = p.access_token;
                                        if (p.user && p.user.id) uid = p.user.id;
                                        else if (p.id && typeof p.id === 'string' && p.id.length === 36) uid = p.id;
                                    } catch(e) {}
                                }
                            }
                        }
                        if (!uid) {
                            let cookies = document.cookie || "";
                            let m = cookies.match(/(?:user_id%22%3A%22|\"user_id\":\"|\"id\":\"|id%22%3A%22)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                            if (m) uid = m[1];
                        }
                        if (!token) {
                            token = document.cookie || "";
                        }
                        if (token && uid) {
                            saveAuth(token, uid);
                        }
                    } catch(e) {}
                }, 1000);

                // 3. Shadow Proxy Request Handler
                window.__TAVERN_RUN_SHADOW = async function(requestId, payload) {
                    try {
                        let authHeader = "";
                        for (let i = 0; i < localStorage.length; i++) {
                            let k = localStorage.key(i);
                            if (k) {
                                let v = localStorage.getItem(k);
                                if (v && (v.includes("access_token") || v.includes("sb-auth"))) {
                                    try {
                                        let p = JSON.parse(v);
                                        if (p.access_token) {
                                            authHeader = "Bearer " + p.access_token;
                                            break;
                                        }
                                    } catch(e) {}
                                }
                            }
                        }

                        if (!authHeader) {
                            try {
                                let cookies = document.cookie || "";
                                let chunk0 = "", chunk1 = "";
                                cookies.split(";").forEach(c => {
                                    let parts = c.trim().split("=");
                                    if (parts[0].includes("auth-token.0")) chunk0 = parts.slice(1).join("=");
                                    if (parts[0].includes("auth-token.1")) chunk1 = parts.slice(1).join("=");
                                });
                                let combined = chunk0 + chunk1;
                                if (combined) {
                                    let clean = decodeURIComponent(combined);
                                    if (clean.startsWith("base64-")) clean = clean.substring(7);
                                    let jsonStr = atob(clean);
                                    let p = JSON.parse(jsonStr);
                                    if (p.access_token) authHeader = "Bearer " + p.access_token;
                                }
                            } catch(e) {}
                        }

                        let headers = {
                            "Content-Type": "application/json",
                            "Accept": "text/event-stream, application/json, */*",
                            "x-app-version": "10.0.0.9"
                        };
                        if (payload && payload.chat && payload.chat.user_id) {
                            headers["x-request-id"] = payload.chat.user_id;
                        }
                        if (authHeader) {
                            headers["Authorization"] = authHeader;
                        }

                        let res = await origFetch("https://janitorai.com/generateAlpha", {
                            method: "POST",
                            credentials: "include",
                            headers: headers,
                            body: JSON.stringify(payload)
                        });

                        if (res.ok) {
                            let data = await res.json();
                            let b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
                            window.location.hash = "#TAVERN_SHADOW_RES_" + requestId + "_" + b64;
                        } else {
                            let errText = await res.text();
                            let errStr = res.status + " " + errText;
                            let b64 = btoa(unescape(encodeURIComponent(errStr)));
                            window.location.hash = "#TAVERN_SHADOW_ERR_" + requestId + "_" + b64;
                        }
                    } catch(e) {
                        let b64 = btoa(unescape(encodeURIComponent(e.toString())));
                        window.location.hash = "#TAVERN_SHADOW_ERR_" + requestId + "_" + b64;
                    }
                };

                // 4. Floating Return Button for Desktop Window
                function injectReturnButton() {
                    try {
                        if (document.getElementById("__tavern_return_btn")) return;
                        let btn = document.createElement("button");
                        btn.id = "__tavern_return_btn";
                        btn.innerHTML = "✕ В TavernRev";
                        btn.style.cssText = "position:fixed !important; bottom:24px !important; right:20px !important; z-index:2147483647 !important; background:#4f46e5 !important; color:#ffffff !important; padding:12px 22px !important; border-radius:30px !important; font-weight:bold !important; font-size:15px !important; border:2px solid rgba(255,255,255,0.6) !important; box-shadow:0 8px 24px rgba(0,0,0,0.8) !important; cursor:pointer !important; font-family:system-ui,-apple-system,sans-serif !important; user-select:none !important; display:flex !important; align-items:center !important; gap:6px !important; touch-action:manipulation !important;";
                        
                        function doHide(e) {
                            if (e) {
                                try { e.preventDefault(); } catch(err) {}
                                try { e.stopPropagation(); } catch(err) {}
                            }
                            btn.innerHTML = "Сворачиваю...";
                            btn.style.opacity = "0.7";
                            window.location.hash = "#TAVERN_HIDE_WINDOW";
                        }

                        btn.addEventListener("click", doHide);
                        if (document.body) {
                            document.body.appendChild(btn);
                        }
                    } catch(e) {}
                }

                setInterval(injectReturnButton, 1000);
                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", injectReturnButton);
                } else {
                    injectReturnButton();
                }
            })();
        "###;

        let window = WebviewWindowBuilder::new(
            &app_handle,
            "janitor-login",
            WebviewUrl::External(login_url),
        )
        .title("Log in to Janitor.ai")
        .inner_size(500.0, 700.0)
        .initialization_script(init_script)
        .build()
        .map_err(|e| e.to_string())?;

        let _ = window.set_focus();

        let handle_clone = app_handle.clone();
        let win_clone = window.clone();

        tauri::async_runtime::spawn(async move {
            let script = r#"
                (function() {
                    try {
                        let cookies = document.cookie || "";
                        let userId = "";

                        for (let i = 0; i < localStorage.length; i++) {
                            let key = localStorage.key(i);
                            if (key && (key.includes("auth-token") || key.includes("supabase.auth.token"))) {
                                let val = localStorage.getItem(key);
                                if (val) {
                                    try {
                                        let parsed = JSON.parse(val);
                                        if (parsed.user && parsed.user.id) {
                                            userId = parsed.user.id;
                                        } else if (parsed.id) {
                                            userId = parsed.id;
                                        }
                                    } catch(e) {}
                                }
                            }
                        }

                        if (!userId && (cookies.includes("user_id%22%3A%22") || cookies.includes("\"user_id\":\""))) {
                            let m = cookies.match(/(?:user_id%22%3A%22|\"user_id\":\"|\"id\":\"|id%22%3A%22)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                            if (m) {
                                userId = m[1];
                            }
                        }

                        if ((cookies.includes("sb-auth-token") || cookies.includes("sb-auth-auth-token") || cookies.includes("stores=")) && cookies.length > 50) {
                            return JSON.stringify({
                                session_token: cookies,
                                user_id: userId
                            });
                        }
                    } catch(e) {}
                    return null;
                })()
            "#;

            for _ in 0..1200 {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;

                if handle_clone.get_webview_window("janitor-login").is_none() {
                    break;
                }

                let bridge_script = format!(
                    r###"
                    (function() {{
                        let res = {};
                        if (res) {{
                            let b64 = btoa(unescape(encodeURIComponent(res)));
                            window.location.hash = "#TAVERN_AUTH_" + b64;
                        }}
                    }})();
                    "###,
                    script
                );

                let _ = win_clone.eval(&bridge_script);

                use base64::engine::general_purpose::STANDARD;
                use base64::Engine;

                if let Ok(url) = win_clone.url() {
                    if let Some(fragment) = url.fragment() {
                        if fragment == "TAVERN_HIDE_WINDOW" {
                            let _ = win_clone.hide();
                            let _ = win_clone.eval("window.location.hash = '';");
                        } else if let Some(b64) = fragment.strip_prefix("TAVERN_AUTH_") {
                            if let Ok(decoded_bytes) = STANDARD.decode(b64) {
                                if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                                    if let Ok(payload) = serde_json::from_str::<JanitorAuthPayload>(&json_str) {
                                        if !payload.session_token.is_empty() && !payload.user_id.is_empty() {
                                            use tauri::Emitter;
                                            println!("[Janitor Auth] Successfully captured auth: uid={}", payload.user_id);
                                            let _ = handle_clone.emit("janitor-auth-captured", payload);
                                            let _ = win_clone.hide();
                                            let _ = win_clone.eval("window.location.hash = '';");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }
}

#[tauri::command]
pub async fn capture_janitor_auth_from_window(app_handle: AppHandle) -> Result<JanitorAuthPayload, String> {
    let window = app_handle.get_webview_window("janitor-login")
        .ok_or_else(|| "Janitor login window is not open".to_string())?;

    let extract_script = r#"
        (function() {
            try {
                let cookies = document.cookie || "";
                let userId = "";

                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key) {
                        let val = localStorage.getItem(key);
                        if (val) {
                            try {
                                let parsed = JSON.parse(val);
                                if (parsed && parsed.user && parsed.user.id) {
                                    userId = parsed.user.id;
                                    break;
                                } else if (parsed && parsed.id && typeof parsed.id === 'string' && parsed.id.length === 36) {
                                    userId = parsed.id;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                }

                if (!userId) {
                    let m = cookies.match(/(?:user_id%22%3A%22|\"user_id\":\"|\"id\":\"|id%22%3A%22)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                    if (m) {
                        userId = m[1];
                    }
                }

                return JSON.stringify({
                    session_token: cookies,
                    user_id: userId
                });
            } catch(e) {
                return JSON.stringify({ session_token: "", user_id: "" });
            }
        })()
    "#;

    let bridge_script = format!(
        r###"
        try {{
            let res = {};
            if (res) {{
                let b64 = btoa(unescape(encodeURIComponent(res)));
                window.location.hash = "#TAVERN_AUTH_" + b64;
            }}
        }} catch(e) {{}}
        "###,
        extract_script
    );

    let _ = window.eval(&bridge_script);
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    if let Ok(url) = window.url() {
        if let Some(fragment) = url.fragment() {
            if let Some(b64) = fragment.strip_prefix("TAVERN_AUTH_") {
                if let Ok(decoded_bytes) = STANDARD.decode(b64) {
                    if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                        if let Ok(payload) = serde_json::from_str::<JanitorAuthPayload>(&json_str) {
                            if !payload.session_token.is_empty() {
                                return Ok(payload);
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not read cookies from window. Please ensure you are logged into Janitor.ai.".to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JanitorSessionStatus {
    pub is_window_running: bool,
    pub is_window_visible: bool,
    pub user_id: Option<String>,
}

#[tauri::command]
pub async fn get_janitor_session_status(app_handle: AppHandle) -> Result<JanitorSessionStatus, String> {
    #[cfg(target_os = "android")]
    {
        Ok(JanitorSessionStatus {
            is_window_running: false,
            is_window_visible: false,
            user_id: None,
        })
    }

    #[cfg(not(target_os = "android"))]
    {
        let window = app_handle.get_webview_window("janitor-login");
        let is_running = window.is_some();
        let is_visible = window.as_ref().and_then(|w| w.is_visible().ok()).unwrap_or(false);
        let mut uid = None;
        if let Some(ref win) = window {
            use base64::engine::general_purpose::STANDARD;
            use base64::Engine;
            if let Ok(url) = win.url() {
                if let Some(fragment) = url.fragment() {
                    if let Some(b64) = fragment.strip_prefix("TAVERN_AUTH_") {
                        if let Ok(decoded_bytes) = STANDARD.decode(b64) {
                            if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                                if let Ok(payload) = serde_json::from_str::<JanitorAuthPayload>(&json_str) {
                                    if !payload.user_id.is_empty() {
                                        uid = Some(payload.user_id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(JanitorSessionStatus {
            is_window_running: is_running,
            is_window_visible: is_visible,
            user_id: uid,
        })
    }
}

#[tauri::command]
pub async fn hide_janitor_login_window(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    if let Some(window) = app_handle.get_webview_window("janitor-login") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn close_janitor_login_window(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    if let Some(window) = app_handle.get_webview_window("janitor-login") {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn test_janitor_connection(session_token: String, user_id: String) -> Result<bool, String> {
    let session_token = session_token.trim();
    let user_id = user_id.trim();

    if session_token.is_empty() {
        return Err("Session token is empty".to_string());
    }

    // Basic validity check: must contain either sb-auth, stores, eyJ, or __Secure
    let is_valid_format = session_token.contains("sb-auth") 
        || session_token.contains("stores") 
        || session_token.contains("eyJ")
        || session_token.contains("__Secure");

    if !is_valid_format {
        return Err("Invalid token format (must contain Supabase auth cookies or JWT token)".to_string());
    }

    if !user_id.is_empty() {
        let uuid_regex = regex::Regex::new(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").unwrap();
        if !uuid_regex.is_match(user_id) {
            return Err("User ID must be a valid UUID format".to_string());
        }
    }

    // If session_token is a full cookie header or a valid JWT token, mark as valid!
    Ok(true)
}

