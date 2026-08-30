use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, ACCEPT, ORIGIN, REFERER};
use tauri::{AppHandle, Manager};
use std::sync::OnceLock;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

// JanitorChat fields are snake_case in the actual Janitor JSON
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorChat {
    pub character_id: String,
    pub id: i64,
    pub summary: String,
    pub user_id: String,
}

// JanitorChatMessage fields are snake_case in the actual Janitor JSON
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorChatMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
    pub chat_id: i64,
    pub created_at: String,
    pub id: i64,
    pub is_bot: bool,
    pub is_main: bool,
    pub message: String,
}

// JanitorProfile fields are snake_case in the actual Janitor JSON
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorProfile {
    pub id: String,
    pub name: String,
    pub user_appearance: String,
    pub user_name: String,
}

// JanitorProfileItem fields are snake_case except "type"
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorProfileItem {
    pub appearance: String,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub profile_type: String,
    pub user_name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorCacheRefetch {
    pub character: bool,
    pub chat: bool,
    pub profile: bool,
    pub script: bool,
}

// generation_settings fields are snake_case in the actual Janitor JSON
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorGenerationSettings {
    pub context_length: i64,
    pub enable_reasoning: bool,
    pub enable_reasoning_chat: bool,
    pub enable_router_temperature: bool,
    pub enable_short_responses: bool,
    pub max_new_token: i64,
    pub prefill_enabled: bool,
    pub prefill_text: String,
    pub temperature: f64,
    pub top_k: i64,
    pub top_p: f64,
    pub enable_thinking: bool,
    pub frequency_penalty: f64,
    pub repetition_penalty: f64,
}

// userConfig is mixed - most fields are snake_case, but a few are camelCase
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorUserConfig {
    pub allow_mobile_nsfw: bool,
    pub api: String,
    pub bad_words: Vec<String>,
    pub claude_jailbreak_prompt: String,
    #[serde(rename = "claudeApiKey")]
    pub claude_api_key: Option<String>,
    #[serde(rename = "claudeModel")]
    pub claude_model: String,
    pub generation_settings: JanitorGenerationSettings,
    pub janitor_router_enabled: bool,
    pub llm_prompt: String,
    pub open_ai_jailbreak_prompt: String,
    pub open_ai_mode: String,
    pub open_ai_reverse_proxy: String,
    #[serde(rename = "openAIKey")]
    pub open_ai_key: Option<String>,
    #[serde(rename = "openAiModel")]
    pub open_ai_model: String,
    pub proxy_global_prompt: String,
    #[serde(rename = "reverseProxyKey")]
    pub reverse_proxy_key: String,
    pub text_streaming: bool,
}

// JanitorGeneratePayload top-level keys are camelCase
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JanitorGeneratePayload {
    pub chat: JanitorChat,
    pub chat_messages: Vec<JanitorChatMessage>,
    pub client_platform: String,
    pub forced_prompt_generation_cache_refetch: JanitorCacheRefetch,
    pub generate_mode: String,
    pub generate_type: String,
    pub profile: JanitorProfile,
    pub profiles: Vec<JanitorProfileItem>,
    pub user_config: JanitorUserConfig,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorGenerateResponse {
    pub messages: Vec<OpenAIMessage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JanitorSessionConfig {
    pub session_token: String,
    pub user_id: String,
}

/// Sends a request to Janitor.ai's generateAlpha endpoint to compile the prompt.
pub async fn fetch_shadow_prompt(
    app_handle: &AppHandle,
    session: &JanitorSessionConfig,
    character_id: &str,
    chat_id: i64,
    history: &[crate::prompt_engine::Message],
    user_name: &str,
    user_desc: &str,
) -> Result<JanitorGenerateResponse, String> {
    let client = get_client();

    // 1. Format Chat Messages for Janitor payload
    // Use staggered timestamps so Janitor can correctly order messages
    let mut chat_messages = Vec::new();
    let base_time = chrono::Utc::now();
    let msg_count = history.len();

    for (idx, msg) in history.iter().enumerate() {
        let is_bot = msg.role == "char" || msg.role == "assistant";
        // Offset each message back in time so older messages are earlier
        let offset_secs = (msg_count - idx) as i64 * 2;
        let msg_time = base_time - chrono::Duration::seconds(offset_secs);
        chat_messages.push(JanitorChatMessage {
            character_id: if is_bot { Some(character_id.to_string()) } else { None },
            chat_id,
            created_at: msg_time.to_rfc3339(),
            id: (idx + 1000) as i64, // arbitrary message ID
            is_bot,
            is_main: true,
            message: msg.content.clone(),
        });
    }

    // 2. Build Payload
    let payload = JanitorGeneratePayload {
        chat: JanitorChat {
            character_id: character_id.to_string(),
            id: chat_id,
            summary: String::new(),
            user_id: session.user_id.clone(),
        },
        chat_messages,
        client_platform: "web".to_string(),
        forced_prompt_generation_cache_refetch: JanitorCacheRefetch {
            character: true,
            chat: true,    // Refresh chat lorebook trigger cache
            profile: false,
            script: true,
        },
        generate_mode: "GENERATE".to_string(), // Normal generation, not "ALTERNATIVE" (regenerate)
        generate_type: "CHAT".to_string(),
        profile: JanitorProfile {
            id: session.user_id.clone(),
            name: user_name.to_string(),
            user_name: user_name.to_string(),
            user_appearance: user_desc.to_string(),
        },
        profiles: vec![JanitorProfileItem {
            id: session.user_id.clone(),
            name: user_name.to_string(),
            user_name: user_name.to_string(),
            appearance: user_desc.to_string(),
            profile_type: "profile".to_string(),
        }],
        user_config: JanitorUserConfig {
            allow_mobile_nsfw: true,
            api: "openai".to_string(),
            bad_words: Vec::new(),
            claude_jailbreak_prompt: "".to_string(),
            claude_api_key: None,
            claude_model: "".to_string(),
            generation_settings: JanitorGenerationSettings {
                context_length: 128000,
                enable_reasoning: true,
                enable_reasoning_chat: false,
                enable_router_temperature: false,
                enable_short_responses: false,
                max_new_token: 64, // Non-zero so server doesn't reject or return empty
                prefill_enabled: false,
                prefill_text: "".to_string(),
                temperature: 1.0,
                top_k: 0,
                top_p: 1.0,           // Valid range: 0 < top_p <= 1
                enable_thinking: true,
                frequency_penalty: 0.0,
                repetition_penalty: 1.0, // 1.0 = no penalty (neutral)
            },
            janitor_router_enabled: false,
            llm_prompt: "".to_string(),
            open_ai_jailbreak_prompt: "".to_string(),
            open_ai_mode: "proxy".to_string(),
            open_ai_reverse_proxy: "https://api.openai.com/v1/chat/completions".to_string(),
            open_ai_key: None,
            open_ai_model: "gpt-4o".to_string(),
            proxy_global_prompt: "".to_string(),
            reverse_proxy_key: "-".to_string(),
            text_streaming: false, // Must be false — true causes SSE stream, not parseable as JSON
        },
    };

    let payload_json_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    println!("[Janitor Debug] Payload JSON (first 500 chars): {}", &payload_json_str[..payload_json_str.len().min(500)]);

    // Strategy A: On Desktop, if Janitor login window is currently open / running, execute fetch directly inside it!
    #[cfg(not(target_os = "android"))]
    {
        let windows = app_handle.webview_windows();
        let mut _created_temporary = false;
        let target_win = match app_handle.get_webview_window("janitor-login")
            .or_else(|| windows.values().find(|w| w.label().contains("janitor")).cloned()) {
            Some(w) => Some(w),
            None => {
                let _ = crate::janitor::auth::open_janitor_login_window(app_handle.clone()).await;
                _created_temporary = true;
                app_handle.get_webview_window("janitor-login")
            }
        };

        if let Some(window) = target_win.as_ref() {
            println!("[Janitor Debug] Executing generateAlpha inside live Janitor WebView window '{}'!", window.label());

            let req_id = format!("{}", chrono::Utc::now().timestamp_millis());

            // Clear any stale fragment from a previous call before starting the poll loop
            let _ = window.eval("window.location.hash = '';");

            let call_script = format!(
                r#"
                if (window.__TAVERN_RUN_SHADOW) {{
                    window.__TAVERN_RUN_SHADOW("{}", {});
                }} else {{
                    document.title = "TAVERN_SHADOW_ERR:{}:__TAVERN_RUN_SHADOW is not defined";
                }}
                "#,
                req_id,
                payload_json_str,
                req_id
            );

            let _ = window.eval(&call_script);

            let ok_prefix = format!("TAVERN_SHADOW_RES_{}_", req_id);
            let err_prefix = format!("TAVERN_SHADOW_ERR_{}_", req_id);

            use base64::engine::general_purpose::STANDARD;
            use base64::Engine;

            // Give the eval and JS async fetch a moment to start before first check
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            // Wait up to 10 seconds for webview url hash update
            for _ in 0..50 {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;

                if let Ok(url) = window.url() {
                    if let Some(fragment) = url.fragment() {
                        println!("[Janitor Debug] URL fragment: {}", &fragment[..fragment.len().min(200)]);
                        if let Some(b64) = fragment.strip_prefix(&ok_prefix) {
                            if let Ok(decoded_bytes) = STANDARD.decode(b64) {
                                if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                                    if let Ok(resp) = serde_json::from_str::<JanitorGenerateResponse>(&json_str) {
                                        println!("[Janitor Debug] Successfully received prompt from WebView bridge URL hash!");
                                        return Ok(resp);
                                    }
                                }
                            }
                        } else if let Some(b64) = fragment.strip_prefix(&err_prefix) {
                            let err_msg = STANDARD.decode(b64)
                                 .ok()
                                 .and_then(|bytes| String::from_utf8(bytes).ok())
                                 .unwrap_or_else(|| "Unknown bridge error".to_string());
                            println!("[Janitor Debug] In-WebView generateAlpha returned error: {}", err_msg);
                            return Err(format!("Janitor returned error: {}", err_msg));
                        }
                    }
                }
            }
            println!("[Janitor Debug] WebView window url hash timeout! current url: {:?}", window.url());
        }
    }

    // Strategy B: Direct reqwest call (standard on Android, fallback on Desktop)
    let token_trimmed = session.session_token.trim();
    let mut cookie_val = String::new();
    let mut bearer_token = String::new();

    if token_trimmed.starts_with("eyJ") {
        bearer_token = token_trimmed.to_string();
    } else if token_trimmed.contains('=') {
        cookie_val = token_trimmed.to_string();

        let mut chunk0 = String::new();
        let mut chunk1 = String::new();

        for part in token_trimmed.split(';') {
            let p = part.trim();
            if let Some((k, v)) = p.split_once('=') {
                let key = k.trim();
                let val = v.trim().trim_matches('"');
                if key == "sb-auth-auth-token.0" || key.ends_with("auth-token.0") {
                    chunk0 = val.to_string();
                } else if key == "sb-auth-auth-token.1" || key.ends_with("auth-token.1") {
                    chunk1 = val.to_string();
                }
            }
        }

        let combined = format!("{}{}", chunk0, chunk1);
        if !combined.is_empty() {
            let clean_combined = combined
                .replace("%3D", "=")
                .replace("%3d", "=")
                .replace("%2B", "+")
                .replace("%2b", "+")
                .replace("%2F", "/")
                .replace("%2f", "/");

            let b64_str = if clean_combined.starts_with("base64-") {
                &clean_combined[7..]
            } else {
                &clean_combined
            };

            use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
            use base64::Engine;

            let clean_str = b64_str.trim();
            let no_pad = clean_str.trim_end_matches('=');

            let decoded_bytes = STANDARD.decode(clean_str)
                .or_else(|_| STANDARD_NO_PAD.decode(no_pad))
                .or_else(|_| URL_SAFE.decode(clean_str))
                .or_else(|_| URL_SAFE_NO_PAD.decode(no_pad))
                .ok();

            if let Some(bytes) = decoded_bytes {
                if let Ok(json_str) = String::from_utf8(bytes) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        if let Some(tok) = parsed.get("access_token").and_then(|t| t.as_str()) {
                            bearer_token = tok.to_string();
                        }
                    }
                }
            }

            if bearer_token.is_empty() && clean_combined.starts_with("eyJ") {
                bearer_token = clean_combined;
            }
        }
    } else {
        cookie_val = format!("__Secure-next-auth.session-token={}", token_trimmed);
        bearer_token = token_trimmed.to_string();
    }

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream, application/json, */*"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://janitorai.com"));
    headers.insert(REFERER, HeaderValue::from_str(&format!("https://janitorai.com/chats/{}", chat_id)).unwrap_or_else(|_| HeaderValue::from_static("https://janitorai.com/")));
    headers.insert("sec-fetch-dest", HeaderValue::from_static("empty"));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("cors"));
    headers.insert("sec-fetch-site", HeaderValue::from_static("same-origin"));
    headers.insert("sec-ch-ua", HeaderValue::from_static("\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Opera GX\";v=\"134\""));
    headers.insert("sec-ch-ua-mobile", HeaderValue::from_static("?0"));
    headers.insert("sec-ch-ua-platform", HeaderValue::from_static("\"Windows\""));
    headers.insert("x-app-version", HeaderValue::from_static("10.0.0.9"));
    if let Ok(req_id) = HeaderValue::from_str(&session.user_id) {
        headers.insert("x-request-id", req_id);
    }
    headers.insert("user-agent", HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/134.0.0.0"));
    
    if !cookie_val.is_empty() {
        if let Ok(c_val) = HeaderValue::from_str(&cookie_val) {
            headers.insert("cookie", c_val);
        }
    }

    if !bearer_token.is_empty() {
        if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", bearer_token)) {
            headers.insert("authorization", auth_val);
        }
    }

    let url = "https://janitorai.com/generateAlpha";
    println!("[Janitor Debug Reqwest] Sending request to generateAlpha with bearer_len={}, cookie_len={}", bearer_token.len(), cookie_val.len());
    let res = client.post(url)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network request to Janitor failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let headers_str = format!("{:?}", res.headers());
        let body = res.text().await.unwrap_or_default();
        println!("[Janitor Debug Reqwest Error] status: {}, headers: {}, body: {}", status, headers_str, body);
        return Err(format!("Janitor returned error status {}: {}", status, body));
    }

    let response_data: JanitorGenerateResponse = res.json()
        .await
        .map_err(|e| format!("Failed to parse Janitor generateAlpha response: {}", e))?;

    Ok(response_data)
}

/// Extracts lorebook-only content from Janitor's compiled system prompt.
///
/// Janitor's system prompt structure:
///   [jailbreak preamble: CL0-CL4, reasoning_effort, etc.]
///   <CharName's Persona>...</CharName's Persona>
///   <UserPersona>...</UserPersona>
///   <example_dialogs>...</example_dialogs>
///   [Lorebook entries — what we ACTUALLY want]
///
/// Strategy: find the LAST closing structural tag. Everything after it is lorebook content.
/// This is robust even when opening tags and content are on the same line.
pub fn extract_lorebook_delta(
    _base_description: &str,
    _base_personality: &str,
    _base_scenario: &str,
    compiled_system_prompt: &str,
) -> Option<String> {
    let text = compiled_system_prompt.replace("\r\n", "\n");

    // Track the end position of the last-seen structural closing tag
    let mut last_close_end: usize = 0;

    // Fixed close tags
    for tag in &["</UserPersona>", "</example_dialogs>"] {
        if let Some(pos) = text.rfind(tag) {
            let end = pos + tag.len();
            if end > last_close_end {
                last_close_end = end;
            }
        }
    }

    // Dynamic persona close tags: </CharName's Persona>
    // Search for all "</" occurrences and check if they close a persona block
    let mut search_from = 0;
    while let Some(rel_start) = text[search_from..].find("</") {
        let abs_start = search_from + rel_start;
        if let Some(rel_end) = text[abs_start..].find('>') {
            let abs_end = abs_start + rel_end + 1;
            let tag_slice = &text[abs_start..abs_end];
            if tag_slice.ends_with("'s Persona>") {
                if abs_end > last_close_end {
                    last_close_end = abs_end;
                }
            }
            search_from = abs_end;
        } else {
            break;
        }
    }

    if last_close_end == 0 {
        // No structural blocks found at all — no lorebook to extract
        return None;
    }

    // Everything after the last structural closing tag is lorebook content
    let lorebook_raw = &text[last_close_end..];

    let cleaned: Vec<&str> = lorebook_raw
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.join("\n"))
    }
}
