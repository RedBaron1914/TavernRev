use tauri::{AppHandle, Emitter};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::fs;
use crate::database::{self, DbState};
use crate::api_client;
use crate::vector_memory;
use crate::{GenerationState, commands::get_connections_dir, commands::get_presets_dir};

pub mod pipeline;



async fn perform_generation(
    app_handle: AppHandle,
    chat_id: i64,
    character_id: i64,
    profile_name: String,
    preset_name: String,
    user_name: String,
    history_limit_id: Option<i64>,
    include_limit_msg: bool,
    nudge: Option<String>,
    db_state: tauri::State<'_, DbState>,
    abort_token: Arc<AtomicBool>,
    target_msg_id: Option<i64>,
    gen_id: u64,
    forced_speaker_id: Option<i64>,
    rag_config: Option<vector_memory::RagConfig>,
) -> Result<(String, i64, String), String> {
    // 1. Data Collection
    let mut ctx = pipeline::load_context(
        &app_handle, chat_id, character_id, &profile_name, &preset_name, &user_name,
        history_limit_id, include_limit_msg, forced_speaker_id, nudge, rag_config, &db_state
    )?;
    
    // 2. Prompt Assembly
    let (final_messages, evaluator) = pipeline::prepare_prompt(&mut ctx, &app_handle, &db_state).await?;
    
    // 3. API Execution Loop
    let raw_ai_text = pipeline::execute_api_loop(final_messages, &ctx, &app_handle, abort_token, gen_id, target_msg_id).await?;
    
    // 4. Post Processing
    let final_text = pipeline::finalize_response(raw_ai_text, &ctx, evaluator, &app_handle, &db_state).await?;

    Ok((final_text, ctx.real_char_id, ctx.real_char_name))
}

#[tauri::command]
pub fn stop_generation(app_handle: tauri::AppHandle, gen_state: tauri::State<GenerationState>) {
    if let Ok(state) = gen_state.0.lock() {
        if let Some(token) = &*state {
            token.store(true, Ordering::Relaxed);
            let _ = app_handle.emit("generation-stopped", ());
        }
    }
}

#[tauri::command]
pub async fn generate_reply(
    app_handle: AppHandle,
    chat_id: i64,
    character_id: i64,
    profile_name: String,
    preset_name: String,
    user_name: String,
    gen_id: u64,
    forced_speaker_id: Option<i64>,
    rag_config: Option<vector_memory::RagConfig>,
    db_state: tauri::State<'_, DbState>,
    gen_state: tauri::State<'_, GenerationState>
) -> Result<(), String> {
    let abort_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut state) = gen_state.0.lock() {
        *state = Some(abort_token.clone());
    }

    let reply_result = perform_generation(app_handle.clone(), chat_id, character_id, profile_name, preset_name, user_name, None, false, None, db_state.clone(), abort_token, None, gen_id, forced_speaker_id, rag_config).await;

    if let Ok(mut state) = gen_state.0.lock() {
        *state = None;
    }

    let (reply, sender_id, sender_name) = reply_result?;

    {
        let conn = db_state.0.lock().unwrap();
        database::save_message_ext(&conn, chat_id, "char", &reply, None, Some(sender_id), Some(&sender_name)).map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("generation_finished", ());
    Ok(())
}

#[tauri::command]
pub async fn regenerate_reply(
    app_handle: AppHandle,
    chat_id: i64,
    message_id: i64,
    character_id: i64,
    profile_name: String,
    preset_name: String,
    user_name: String,
    gen_id: u64,
    custom_nudge: Option<String>,
    rag_config: Option<vector_memory::RagConfig>,
    db_state: tauri::State<'_, DbState>,
    gen_state: tauri::State<'_, GenerationState>
) -> Result<(), String> {
    let abort_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut state) = gen_state.0.lock() {
        *state = Some(abort_token.clone());
    }

    let original_sender_id = {
        let conn = db_state.0.lock().unwrap();
        conn.query_row("SELECT sender_id FROM messages WHERE id = ?1", rusqlite::params![message_id], |row| row.get::<_, Option<i64>>(0)).unwrap_or(None)
    };

    let reply_result = perform_generation(app_handle.clone(), chat_id, character_id, profile_name, preset_name, user_name, Some(message_id), false, custom_nudge, db_state.clone(), abort_token, Some(message_id), gen_id, original_sender_id, rag_config).await;

    if let Ok(mut state) = gen_state.0.lock() {
        *state = None;
    }

    let (reply, sender_id, sender_name) = reply_result?;

    {
        let conn = db_state.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT swipes FROM messages WHERE id = ?1").map_err(|e| e.to_string())?;
        let swipes_str: String = stmt.query_row(rusqlite::params![message_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        let mut swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        
        swipes.push(reply.clone());
        let new_swipes_json = serde_json::to_string(&swipes).map_err(|e| e.to_string())?;
        let new_index = swipes.len() - 1;

        conn.execute(
            "UPDATE messages SET content = ?1, swipes = ?2, swipe_id = ?3, sender_id = ?4, sender_name = ?5 WHERE id = ?6",
            rusqlite::params![reply, new_swipes_json, new_index, sender_id, sender_name, message_id]
        ).map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("generation_finished", ());
    Ok(())
}

#[tauri::command]
pub fn swipe_message(message_id: i64, swipe_index: usize, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT swipes FROM messages WHERE id = ?1").map_err(|e| e.to_string())?;
    let swipes_str: String = stmt.query_row(rusqlite::params![message_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();

    if swipe_index < swipes.len() {
        let content = &swipes[swipe_index];
        conn.execute(
            "UPDATE messages SET content = ?1, swipe_id = ?2 WHERE id = ?3",
            rusqlite::params![content, swipe_index, message_id]
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn sync_message_swipes(id: i64, swipes: Vec<String>, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap();
    database::update_message_swipes(&conn, id, &swipes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn continue_reply(
    app_handle: AppHandle,
    chat_id: i64,
    message_id: i64,
    character_id: i64,
    profile_name: String,
    preset_name: String,
    user_name: String,
    gen_id: u64,
    rag_config: Option<vector_memory::RagConfig>,
    db_state: tauri::State<'_, DbState>,
    gen_state: tauri::State<'_, GenerationState>
) -> Result<String, String> {
    let abort_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut state) = gen_state.0.lock() {
        *state = Some(abort_token.clone());
    }

    let presets_dir = get_presets_dir(&app_handle);
    let preset_content = fs::read_to_string(presets_dir.join(&preset_name)).map_err(|e| e.to_string())?;
    let preset: api_client::Preset = serde_json::from_str(&preset_content).map_err(|e| e.to_string())?;
    
    let original_sender_id = {
        let conn = db_state.0.lock().unwrap();
        conn.query_row(
            "SELECT sender_id FROM messages WHERE id = ?1", 
            rusqlite::params![message_id], 
            |row| Ok(row.get::<_, Option<i64>>(0).unwrap_or(None))
        ).unwrap_or(None)
    };

    let nudge = if preset.continue_nudge_prompt.trim().is_empty() { 
        Some("(continue the roleplay exactly where you left off without any meta-commentary)".to_string())
    } else { 
        Some(preset.continue_nudge_prompt.clone()) 
    };

    let reply_result = perform_generation(app_handle.clone(), chat_id, character_id, profile_name, preset_name, user_name, Some(message_id), true, nudge, db_state.clone(), abort_token, Some(message_id), gen_id, original_sender_id, rag_config).await;

    if let Ok(mut state) = gen_state.0.lock() {
        *state = None;
    }

    let (reply, sender_id, sender_name) = reply_result?;

    {
        let conn = db_state.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT content, swipes, swipe_id FROM messages WHERE id = ?1").map_err(|e| e.to_string())?;
        let (mut content, swipes_str, swipe_id): (String, String, usize) = stmt.query_row(rusqlite::params![message_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).map_err(|e| e.to_string())?;

        let update_log = format!("[DB] Continuing message: current length = {}, appended reply length = {}, target swipe_id = {}", content.len(), reply.len(), swipe_id);
        println!("{}", update_log);
        let _ = app_handle.emit("backend-log", update_log);

        content.push_str(&reply);

        let mut swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        if swipe_id < swipes.len() {
            swipes[swipe_id] = content.clone();
        } else {
            while swipes.len() <= swipe_id {
                swipes.push(String::new());
            }
            swipes[swipe_id] = content.clone();
        }
        let new_swipes_json = serde_json::to_string(&swipes).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE messages SET content = ?1, swipes = ?2, sender_id = ?3, sender_name = ?4 WHERE id = ?5",
            rusqlite::params![content, new_swipes_json, sender_id, sender_name, message_id]
        ).map_err(|e| {
            let err_log = format!("[DB Error] Failed to update message: {}", e);
            println!("{}", err_log);
            let _ = app_handle.emit("backend-log", err_log);
            e.to_string()
        })?;
    }

    let _ = app_handle.emit("generation_finished", ());
    Ok(reply)
}

#[tauri::command]
pub fn revert_message_tail(message_id: i64, text_to_strip: String, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT content, swipes, swipe_id FROM messages WHERE id = ?1").map_err(|e| e.to_string())?;
    let (mut content, swipes_str, swipe_id): (String, String, usize) = stmt.query_row(rusqlite::params![message_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).map_err(|e| e.to_string())?;

    if content.ends_with(&text_to_strip) {
        content = content.strip_suffix(&text_to_strip).unwrap_or(&content).to_string();

        let mut swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        if swipe_id < swipes.len() {
            swipes[swipe_id] = content.clone();
        }
        let new_swipes_json = serde_json::to_string(&swipes).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE messages SET content = ?1, swipes = ?2 WHERE id = ?3",
            rusqlite::params![content, new_swipes_json, message_id]
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn impersonate_user(
    app_handle: AppHandle,
    chat_id: i64,
    character_id: i64,
    profile_name: String,
    preset_name: String,
    user_name: String,
    gen_id: u64,
    user_input: Option<String>,
    rag_config: Option<vector_memory::RagConfig>,
    db_state: tauri::State<'_, DbState>,
    gen_state: tauri::State<'_, GenerationState>
) -> Result<String, String> {
    let abort_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut state) = gen_state.0.lock() {
        *state = Some(abort_token.clone());
    }

    let presets_dir = get_presets_dir(&app_handle);
    let preset_content = fs::read_to_string(presets_dir.join(&preset_name)).map_err(|e| e.to_string())?;
    let preset: api_client::Preset = serde_json::from_str(&preset_content).map_err(|e| e.to_string())?;
    
    let mut prompt = if preset.impersonation_prompt.is_empty() { 
        "Write as {{user}}".to_string() 
    } else { 
        preset.impersonation_prompt.clone() 
    };

    if let Some(inp) = &user_input {
        if !inp.trim().is_empty() && preset.impersonation_prompt.is_empty() {
            prompt = format!("{} Continue and improve this text from {{user}}: \"{}\"", prompt, inp);
        } else if !inp.trim().is_empty() {
            prompt = format!("{}\n\nUser's current draft: \"{}\"", prompt, inp);
        }
    }

    let reply_result = perform_generation(app_handle.clone(), chat_id, character_id, profile_name, preset_name, user_name, None, false, Some(prompt), db_state.clone(), abort_token, None, gen_id, None, rag_config).await;

    if let Ok(mut state) = gen_state.0.lock() {
        *state = None;
    }

    let (reply, _, _) = reply_result?;
    let _ = app_handle.emit("generation_finished", ());
    Ok(reply)
}

#[tauri::command]
pub async fn summarize_chat(chat_id: i64, profile_name: String, preset_name: String, db_state: tauri::State<'_, DbState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    let abort_token = Arc::new(AtomicBool::new(false));
    
    let chat_log = {
        let conn = db_state.0.lock().unwrap();
        let db_msgs = database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?;
        let start_idx = db_msgs.len().saturating_sub(40);
        let recent_msgs = &db_msgs[start_idx..];
        
        let mut log = String::new();
        for m in recent_msgs {
            if m.role == "system" { continue; }
            let name = m.sender_name.clone().unwrap_or_else(|| m.role.clone());
            log.push_str(&format!("{}: {}\n\n", name, m.content));
        }
        log
    };
    
    let profile_content = fs::read_to_string(get_connections_dir(&app_handle).join(&profile_name)).map_err(|e| e.to_string())?;
    let profile: crate::api_client::ConnectionProfile = serde_json::from_str(&profile_content).map_err(|e| e.to_string())?;
    
    let preset_content = fs::read_to_string(get_presets_dir(&app_handle).join(&preset_name)).map_err(|e| e.to_string())?;
    let preset: crate::api_client::Preset = serde_json::from_str(&preset_content).map_err(|e| e.to_string())?;
    
    let mut messages = Vec::new();
    messages.push(crate::prompt_engine::Message {
        role: "system".to_string(),
        content: "[System Note: Summarize the key events, current state, and character dynamics of the following chat log. Keep it concise. Focus purely on facts that are useful to remember later. Do not include meta-commentary.]".to_string(),
        name: None,
        images: None,
        db_id: None,
    });
    messages.push(crate::prompt_engine::Message {
        role: "user".to_string(),
        content: chat_log,
        name: None,
        images: None,
        db_id: None,
    });
    
    match profile.api_type.as_str() {
        "google" => {
            let final_messages: Vec<api_client::OpenAIMessage> = messages.iter().map(|m| {
                api_client::OpenAIMessage {
                    role: m.role.clone(),
                    content: Some(api_client::OpenAIContent::Text(m.content.clone())),
                    tool_calls: None,
                    tool_call_id: None,
                }
            }).collect();
            let _ = crate::api_client::generate_google(app_handle.clone(), profile.api_key, profile.model_id, final_messages, &preset, abort_token, 0, Some(-2), None).await?;
        },
        "chat_completion" | "openai" | "kobold" | "sillytavern" => {
            let final_messages: Vec<api_client::OpenAIMessage> = messages.iter().map(|m| {
                api_client::OpenAIMessage {
                    role: m.role.clone(),
                    content: Some(api_client::OpenAIContent::Text(m.content.clone())),
                    tool_calls: None,
                    tool_call_id: None,
                }
            }).collect();
            let req = api_client::OpenAIRequest {
                model: profile.model_id,
                messages: final_messages,
                stream: preset.stream_openai,
                max_tokens: Some(preset.openai_max_tokens),
                temperature: preset.temperature,
                top_p: preset.top_p,
                presence_penalty: preset.presence_penalty,
                frequency_penalty: preset.frequency_penalty,
                stop: None,
                reasoning_effort: None,
                top_k: if preset.top_k > 0 { Some(preset.top_k) } else { None },
                min_p: if preset.min_p > 0.0 { Some(preset.min_p) } else { None },
                top_a: if preset.top_a > 0.0 { Some(preset.top_a) } else { None },
                repetition_penalty: if preset.repetition_penalty != 1.0 { Some(preset.repetition_penalty) } else { None },
                tools: None,
            };
            let _ = crate::api_client::generate_stream(app_handle.clone(), profile.base_url, profile.api_key, req, abort_token, 0, Some(-2)).await?;
        },
        _ => { return Err("Summarization not supported for this API type yet.".into()); }
    }
    
    Ok(())
}

#[tauri::command]
pub fn update_chat_memory(chat_id: i64, memory: String, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap();
    database::update_chat_memory(&conn, chat_id, &memory).map_err(|e| e.to_string())?;
    Ok(())
}

