use tauri::{AppHandle, Manager, Emitter};
use std::sync::{Arc, atomic::AtomicBool};
use std::fs;
use std::collections::HashMap;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};
use crate::database::{DbState, Character};
use crate::database;
use crate::prompt_engine::{self, CharacterData, assemble_prompt, WISettings};
use crate::{api_client, transformers, script_engine, vector_memory};
use crate::{LastPrompt, commands::get_connections_dir, commands::get_presets_dir};

fn load_image_base64(path: &Path) -> Option<String> {
    if let Ok(bytes) = fs::read(path) {
        let b64 = general_purpose::STANDARD.encode(&bytes);
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("png").to_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/png"
        };
        Some(format!("data:{};base64,{}", mime, b64))
    } else {
        None
    }
}

pub struct GenerationContext {
    pub chat_id: i64,
    pub real_char_id: i64,
    pub real_char_name: String,
    pub char_obj: Character,
    pub user_name: String,
    pub user_desc: String,
    pub user_avatar: String,
    pub profile: api_client::ConnectionProfile,
    pub preset: api_client::Preset,
    pub vars: HashMap<String, String>,
    pub globals: HashMap<String, String>,
    pub original_msgs: Vec<prompt_engine::Message>,
    pub rag_config: Option<vector_memory::RagConfig>,
    pub nudge: Option<String>,
    pub trimmed_db_ids: Vec<i64>,
    pub auto_trim_enabled: bool,
}

pub fn load_context(
    app_handle: &AppHandle,
    chat_id: i64,
    character_id: i64,
    profile_name: &str,
    preset_name: &str,
    user_name: &str,
    history_limit_id: Option<i64>,
    include_limit_msg: bool,
    forced_speaker_id: Option<i64>,
    nudge: Option<String>,
    rag_config: Option<vector_memory::RagConfig>,
    db_state: &tauri::State<'_, DbState>,
) -> Result<GenerationContext, String> {
    let connections_dir = get_connections_dir(app_handle);
    let presets_dir = get_presets_dir(app_handle);
    
    let profile_content = fs::read_to_string(connections_dir.join(profile_name)).map_err(|e| format!("Failed to read profile: {}", e))?;
    let preset_content = fs::read_to_string(presets_dir.join(preset_name)).map_err(|e| format!("Failed to read preset: {}", e))?;
    
    let profile: api_client::ConnectionProfile = serde_json::from_str(&profile_content).map_err(|e| format!("Invalid profile JSON: {}", e))?;
    let preset: api_client::Preset = serde_json::from_str(&preset_content).map_err(|e| format!("Invalid preset JSON: {}", e))?;

    let conn = db_state.0.lock().unwrap();
    
    let mut real_char_id = character_id;
    let mut real_char_name = String::new();
    
    if character_id == 0 {
        let group_id: Option<i64> = conn.query_row("SELECT group_id FROM chats WHERE id = ?1", rusqlite::params![chat_id], |row| row.get(0)).ok().flatten();
        if let Some(gid) = group_id {
            let (strategy, allow_self_responses, _group_scenario): (i64, bool, String) = conn.query_row(
                "SELECT activation_strategy, allow_self_responses, scenario FROM groups WHERE id = ?1", 
                rusqlite::params![gid], 
                |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, Option<String>>(2)?.unwrap_or_default()))
            ).unwrap_or((0, false, String::new()));
            let members = database::get_group_members(&conn, gid).unwrap_or_default();
            
            if let Some(forced_id) = forced_speaker_id {
                real_char_id = forced_id;
                if let Some(c) = members.iter().find(|m| m.id == forced_id) {
                    real_char_name = c.name.clone();
                }
            } else {
                let history = database::get_messages(&conn, chat_id).unwrap_or_default();
                match crate::routing::determine_next_speaker(&conn, &members, &history, strategy, allow_self_responses) {
                    Ok(Some(next_speaker)) => {
                        real_char_id = next_speaker.id;
                        real_char_name = next_speaker.name.clone();
                    },
                    Ok(None) => return Err("Group has no members".to_string()),
                    Err(e) => return Err(e),
                }
            }
        } else {
            return Err("System character requires a valid group_id in chat".to_string());
        }
    }
    
    if character_id == 0 {
        #[derive(serde::Serialize, Clone)]
        struct SpeakerEvent {
            sender_id: i64,
            sender_name: String,
        }
        let _ = app_handle.emit("speaker_determined", SpeakerEvent { sender_id: real_char_id, sender_name: real_char_name.clone() });
    }
    
    let mut char_obj = database::get_character_by_id(&conn, real_char_id).map_err(|e| format!("Character {} not found: {}", real_char_id, e))?;

    if character_id == 0 {
        let group_id: Option<i64> = conn.query_row("SELECT group_id FROM chats WHERE id = ?1", rusqlite::params![chat_id], |row| row.get(0)).ok().flatten();
        if let Some(gid) = group_id {
            if let Ok(group_scen) = conn.query_row("SELECT scenario FROM groups WHERE id = ?1", rusqlite::params![gid], |row| row.get::<_, Option<String>>(0)) {
                if let Some(scen) = group_scen {
                    if !scen.trim().is_empty() {
                        char_obj.scenario = scen;
                    }
                }
            }
        }
    }
    
    let msgs_db = database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?;
    let vars = database::get_chat_variables(&conn, chat_id).unwrap_or_default();
    let globals = database::get_global_variables(&conn).unwrap_or_default();
    
    let mut user_desc = String::new();
    let mut user_avatar = String::new();

    if let Ok(mut stmt) = conn.prepare("SELECT p.description, p.avatar FROM chats c LEFT JOIN user_personas p ON c.user_persona_id = p.id WHERE c.id = ?1") {
         if let Ok((desc, av)) = stmt.query_row(rusqlite::params![chat_id], |row| Ok((row.get::<_, Option<String>>(0), row.get::<_, Option<String>>(1)))) {
             user_desc = desc.unwrap_or_default().unwrap_or_default();
             user_avatar = av.unwrap_or_default().unwrap_or_default();
         }
    }
    
    if user_desc.is_empty() {
         if let Ok((desc, av)) = conn.query_row("SELECT description, avatar FROM user_personas WHERE is_default = 1 LIMIT 1", [], |row| Ok((row.get::<_, Option<String>>(0), row.get::<_, Option<String>>(1)))) {
             user_desc = desc.unwrap_or_default().unwrap_or_default();
             user_avatar = av.unwrap_or_default().unwrap_or_default();
         } else if let Ok((desc, av)) = conn.query_row("SELECT description, avatar FROM user_personas LIMIT 1", [], |row| Ok((row.get::<_, Option<String>>(0), row.get::<_, Option<String>>(1)))) {
             user_desc = desc.unwrap_or_default().unwrap_or_default();
             user_avatar = av.unwrap_or_default().unwrap_or_default();
         }
    }
    
    let filtered_db = if let Some(limit) = history_limit_id {
        if include_limit_msg {
            msgs_db.into_iter().take_while(|m| m.id <= limit).collect()
        } else {
            msgs_db.into_iter().take_while(|m| m.id < limit).collect()
        }
    } else {
        msgs_db
    };

    let original_msgs: Vec<prompt_engine::Message> = filtered_db.into_iter().filter(|m| !database::message_is_excluded_from_prompt(m)).map(|m| {
        let mut final_content = m.content.clone();
        if character_id == 0 && m.role != "system" {
            let name_prefix = m.sender_name.clone().unwrap_or_else(|| {
                if m.role == "user" { user_name.to_string() } else { "Unknown".to_string() }
            });
            final_content = format!("{}: {}", name_prefix, final_content);
        }
        prompt_engine::Message { 
            role: m.role,
            content: final_content,
            name: m.sender_name,
            images: m.images,
            db_id: Some(m.id),
        }
    }).collect();

    let auto_trim_enabled: bool = conn
        .query_row(
            "SELECT COALESCE(auto_trim_enabled, 1) FROM chats WHERE id = ?1",
            rusqlite::params![chat_id],
            |row| row.get(0),
        )
        .unwrap_or(true);

    Ok(GenerationContext {
        chat_id,
        real_char_id,
        real_char_name,
        char_obj,
        user_name: user_name.to_string(),
        user_desc,
        user_avatar,
        profile,
        preset,
        vars,
        globals,
        original_msgs,
        rag_config,
        nudge,
        trimmed_db_ids: Vec::new(),
        auto_trim_enabled,
    })
}

pub async fn prepare_prompt(
    ctx: &mut GenerationContext,
    app_handle: &AppHandle,
    db_state: &tauri::State<'_, DbState>,
) -> Result<(Vec<api_client::OpenAIMessage>, script_engine::Evaluator), String> {
    // --- 2. Module & RAG Injection ---
    let mut msgs = ctx.original_msgs.clone();
    
    if msgs.is_empty() {
        let prompt = if let Some(custom) = ctx.nudge.take() {
            custom
        } else if ctx.preset.new_chat_prompt.trim().is_empty() {
            "[Start a new roleplay as {{char}}. Set the scene and write the first message based on the scenario.]".to_string()
        } else {
            ctx.preset.new_chat_prompt.clone()
        };
        
        msgs.push(prompt_engine::Message {
            role: "system".to_string(),
            content: prompt,
            name: None,
            images: None,
            db_id: None,
        });
    }

    if let Some(rag) = &ctx.rag_config {
        if rag.enabled {
            let mut query = String::new();
            for m in msgs.iter().rev().take(3).rev() {
                query.push_str(&m.content);
                query.push('\n');
            }
            
            if !query.trim().is_empty() {
                let results = crate::vector_memory::query_chat_memory(&*db_state, ctx.chat_id, &query, rag).await;
                if let Ok(results) = results {
                    if !results.is_empty() {
                        let mut combined_memory = String::new();
                        let results_len = results.len();
                        for r in results {
                            combined_memory.push_str(&r.text_content);
                            combined_memory.push_str("\n---\n");
                        }
                        
                        let memory_str = rag.template.replace("{{text}}", combined_memory.trim_end());
                        
                        ctx.preset.prompts.push(prompt_engine::PromptModule {
                            identifier: "rag_memory".to_string(),
                            name: "RAG Memory".to_string(),
                            content: memory_str,
                            role: "system".to_string(),
                            enabled: true,
                            injection_order: 10,
                            injection_depth: rag.injection_depth as i64,
                            injection_position: 2, // 2 = in chat
                            system_prompt: true,
                            marker: None,
                            forbid_overrides: false,
                            injection_trigger: vec![],
                        });
                        
                        #[derive(serde::Serialize, Clone)]
                        struct RagEvent { count: usize } 
                        let _ = app_handle.emit("rag_status", RagEvent { count: results_len });
                    }
                }
            }
        }
    }

    if let Some(n) = &ctx.nudge {
        ctx.preset.prompts.push(prompt_engine::PromptModule {
            identifier: "continue_nudge".to_string(),
            name: "Continue Nudge".to_string(),
            content: n.clone(),
            role: "user".to_string(),
            enabled: true,
            injection_order: 999, // Very end
            injection_depth: 0,
            injection_position: 1, // In-chat
            system_prompt: false,
            marker: None,
            forbid_overrides: false,
            injection_trigger: vec![],
        });
    }

    // --- 3. Chat Memory (Summarization) as Module ---
    let chat_memory = if ctx.chat_id > 0 {
        let conn = db_state.0.lock().unwrap();
        conn.query_row("SELECT memory FROM chats WHERE id = ?1", rusqlite::params![ctx.chat_id], |row| row.get::<_, Option<String>>(0)).unwrap_or_default().unwrap_or_default()
    } else { String::new() };

    if !chat_memory.is_empty() {
        // Find existing chatMemory module or create a default one
        if let Some(m) = ctx.preset.prompts.iter_mut().find(|p| p.identifier == "chatMemory") {
            // Update its content with the actual summary from DB
            m.content = m.content.replace("{{memory}}", &chat_memory);
            // If the module was just the macro, ensure it has context
            if !m.content.contains(&chat_memory) {
                m.content = format!("{}\n{}", m.content, chat_memory);
            }
        } else {
            // Default injection if not in preset
            let mut dynamic_order = 5;
            if let Some(ch) = ctx.preset.prompts.iter().find(|p| p.identifier == "chatHistory") {
                dynamic_order = ch.injection_order - 1;
            }

            ctx.preset.prompts.push(prompt_engine::PromptModule {
                identifier: "chatMemory".to_string(),
                name: "Chat Memory".to_string(),
                content: format!("[System Note: Chat Context]\n{}", chat_memory),
                role: "system".to_string(),
                enabled: true,
                injection_order: dynamic_order,
                injection_depth: 0,
                injection_position: 0, // Main System Prompt
                system_prompt: true,
                marker: None,
                forbid_overrides: false,
                injection_trigger: vec![],
            });
        }
    }

    // --- 4. Lorebook & Prompt Assembly ---
    let mut lore_entries_db = {
        let conn = db_state.0.lock().unwrap();
        database::get_active_lore_entries(&conn, ctx.real_char_id, ctx.chat_id).unwrap_or_default()
    };

    // Semantic Lorebook Search
    if let Some(rag) = &ctx.rag_config {
        if rag.enabled {
            let mut query = String::new();
            for m in msgs.iter().rev().take(2).rev() {
                query.push_str(&m.content);
                query.push('\n');
            }
            if !query.trim().is_empty() {
                if let Ok(matched_ids) = crate::vector_memory::query_lorebook_memory(&*db_state, ctx.real_char_id, ctx.chat_id, &query, rag).await {
                    for entry in &mut lore_entries_db {
                        if matched_ids.contains(&entry.id) {
                            // Forcefully activate the entry via RAG semantic match
                            entry.constant = true;
                        }
                    }
                }
            }
        }
    }
    
    let lore_entries: Vec<prompt_engine::ScanEntry> = lore_entries_db.into_iter().map(|e| {
        prompt_engine::ScanEntry {
            id: Some(e.id),
            keys: e.keys.split(',').map(|s| s.trim().to_string()).collect(),
            content: e.content,
            enabled: e.enabled,
            constant: e.constant,
            priority: e.priority,
            probability: e.probability,
            position: e.position,
            depth: e.depth,
            source: e.source
        }
    }).collect();

    let char_data = CharacterData {
        name: ctx.char_obj.name.clone(),
        description: ctx.char_obj.description.clone(),
        personality: ctx.char_obj.personality.clone(),
        scenario: ctx.char_obj.scenario.clone(),
        first_mes: ctx.char_obj.first_mes.clone(),
        mes_example: ctx.char_obj.mes_example.clone(),
        creator_notes: ctx.char_obj.creator_notes.clone(),
    };
    
    let mut effective_budget = ctx.preset.wi_token_budget;
    if effective_budget <= 0 && ctx.preset.wi_context_percent > 0 {
        effective_budget = (ctx.profile.context_size as f32 * (ctx.preset.wi_context_percent as f32 / 100.0)) as i32;
    }

    let wi_settings = WISettings {
        depth: ctx.preset.wi_scan_depth,
        recursive: ctx.preset.wi_recursive,
        case_sensitive: ctx.preset.wi_case_sensitive,
        match_whole_words: ctx.preset.wi_match_whole_words,
        max_recursion: ctx.preset.wi_max_recursion,
        token_budget: effective_budget,
        include_names: ctx.preset.wi_include_names,
        insertion_strategy: ctx.preset.wi_insertion_strategy.clone(),
    };

    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars: ctx.vars.clone(),
        globals: ctx.globals.clone(),
        char_name: ctx.char_obj.name.clone(),
        user_name: ctx.user_name.clone(),
    });
    
    evaluator.set_var("persona", &ctx.user_desc);

    let budget = if ctx.profile.context_size > 0 {
        let reserved = ctx.preset.openai_max_tokens as i64 + 200;
        if (ctx.profile.context_size as i64) > reserved {
            (ctx.profile.context_size as i64 - reserved) as usize
        } else {
            ctx.profile.context_size as usize
        }
    } else { 0 };

    let (mut messages, updated_vars, trimmed_db_ids) = assemble_prompt(ctx.preset.prompts.clone(), msgs, char_data, &ctx.user_name, &ctx.user_desc, lore_entries, wi_settings, &mut evaluator, budget, ctx.preset.new_example_chat_prompt.clone()).await;

    ctx.trimmed_db_ids = trimmed_db_ids;

    if ctx.preset.request_images {
        let app_data = app_handle.path().app_data_dir().unwrap_or_default();
        let avatars_dir = app_data.join("avatars");
        let mut visual_msgs = Vec::new();
        
        if ctx.preset.send_char_avatar && !ctx.char_obj.avatar.trim().is_empty() && ctx.char_obj.avatar != "default_avatar.png" {
            let path = avatars_dir.join(&ctx.char_obj.avatar);
            if let Some(b64) = load_image_base64(&path) {
                let prompt = ctx.preset.char_avatar_prompt.replace("{{char}}", &ctx.char_obj.name).replace("{{user}}", &ctx.user_name);
                visual_msgs.push(prompt_engine::Message { role: "user".to_string(), content: prompt, name: None, images: Some(vec![b64]), db_id: None });
            }
        }
        
        if ctx.preset.send_user_avatar && !ctx.user_avatar.trim().is_empty() && ctx.user_avatar != "default_user.png" {
            let path = avatars_dir.join(&ctx.user_avatar);
            if let Some(b64) = load_image_base64(&path) {
                let prompt = ctx.preset.user_avatar_prompt.replace("{{char}}", &ctx.char_obj.name).replace("{{user}}", &ctx.user_name);
                visual_msgs.push(prompt_engine::Message { role: "user".to_string(), content: prompt, name: None, images: Some(vec![b64]), db_id: None });            }
        }
        
        let insert_idx = messages.iter().position(|m| m.role != "system").unwrap_or(messages.len());
        for msg in visual_msgs.into_iter().rev() {
            messages.insert(insert_idx, msg);
        }
    }

    if !updated_vars.is_empty() {
        let conn = db_state.0.lock().unwrap();
        for (k, v) in updated_vars {
            let _ = database::set_chat_variable(&conn, ctx.chat_id, &k, &v);
        }
    }

    if !ctx.preset.assistant_prefill.trim().is_empty() {
        messages.push(prompt_engine::Message {
            role: "assistant".to_string(),
            content: ctx.preset.assistant_prefill.clone(),
            name: None,
            images: None,
            db_id: None,
        });
    }

    match ctx.profile.post_processing.as_str() {
        "merge" | "tools" | "merge_tools" => { messages = transformers::merge_consecutive_roles(messages); },
        "semi_strict" | "strict" | "semi_strict_tools" | "strict_tools" => { messages = transformers::enforce_alternating_roles(messages); },
        _ => { if ctx.preset.squash_system_messages { messages = transformers::merge_consecutive_roles(messages); } }
    }

    let final_messages: Vec<api_client::OpenAIMessage> = messages.iter().map(|m| {
        let content = if ctx.preset.request_images {
            if let Some(images) = &m.images {
                if images.is_empty() {
                    api_client::OpenAIContent::Text(m.content.clone())
                } else {
                    let mut parts = vec![api_client::OpenAIPart { part_type: "text".to_string(), text: Some(m.content.clone()), image_url: None }];
                    for img in images {
                        parts.push(api_client::OpenAIPart { part_type: "image_url".to_string(), text: None, image_url: Some(api_client::OpenAIImageUrl { url: img.clone() }) });
                    }
                    api_client::OpenAIContent::Array(parts)
                }
            } else { api_client::OpenAIContent::Text(m.content.clone()) }
        } else { api_client::OpenAIContent::Text(m.content.clone()) };

        api_client::OpenAIMessage {
            role: m.role.clone(),
            content: Some(content),
            tool_calls: None,
            tool_call_id: None,
        }
    }).collect();

    Ok((final_messages, evaluator))
}

pub async fn execute_api_loop(
    mut final_messages: Vec<api_client::OpenAIMessage>,
    ctx: &GenerationContext,
    app_handle: &AppHandle,
    abort_token: Arc<AtomicBool>,
    gen_id: u64,
    target_msg_id: Option<i64>,
) -> Result<String, String> {
    let mut response_text = String::new();
    let mut loop_count = 0;
    let use_tools = ctx.profile.post_processing.ends_with("_tools") || ctx.profile.post_processing == "tools";
    
    let final_response = loop {
        if loop_count > 5 { break response_text; }
        
        let tools_payload = if use_tools { Some(api_client::get_available_tools()) } else { None };

        let prompt_log = format!("[AI] Prompt Sent to API (Loop {}):\n{}", loop_count, final_messages.iter().map(|m| {
            let t = match &m.content {
                Some(api_client::OpenAIContent::Text(text)) => text.clone(),
                _ => "<Complex Content>".to_string()
            };
            format!("[{}] {}", m.role, t)
        }).collect::<Vec<_>>().join("\n"));
        
        println!("{}", prompt_log);
        if let Some(state) = app_handle.try_state::<LastPrompt>() {
            if let Ok(mut lock) = state.0.lock() { *lock = prompt_log.clone(); }
        }
        let _ = app_handle.emit("backend-log", prompt_log);

        let (text, tool_calls) = match ctx.profile.api_type.as_str() {
            "google" => {
                api_client::generate_google(app_handle.clone(), ctx.profile.api_key.clone(), ctx.profile.model_id.clone(), final_messages.clone(), &ctx.preset, abort_token.clone(), gen_id, target_msg_id, tools_payload.clone()).await?
            },
            "horde" => {
                let prompt_text = final_messages.iter().filter_map(|m| {
                    if let Some(api_client::OpenAIContent::Text(text)) = &m.content {
                        Some(format!("{}: {}\n", m.role, text))
                    } else { None }
                }).collect::<Vec<_>>().join("") + &format!("{}:", ctx.char_obj.name); 
                
                let text = api_client::generate_horde(app_handle.clone(), ctx.profile.api_key.clone(), ctx.profile.model_id.clone(), prompt_text, &ctx.preset, ctx.profile.context_size, abort_token.clone(), gen_id, target_msg_id).await?;
                (text, None)
            },
            _ => {
                let stop_vec = if !ctx.preset.stop_strings.is_empty() { Some(ctx.preset.stop_strings.split(',').map(|s| s.trim().to_string()).collect()) } else { None };
                let reasoning_effort = if !ctx.preset.reasoning_effort.is_empty() && ctx.preset.reasoning_effort != "none" { Some(ctx.preset.reasoning_effort.clone()) } else { None };
        
                let req = api_client::OpenAIRequest {
                    model: ctx.profile.model_id.clone(),
                    messages: final_messages.clone(),
                    stream: ctx.preset.stream_openai,
                    max_tokens: Some(ctx.preset.openai_max_tokens),
                    temperature: ctx.preset.temperature,
                    top_p: ctx.preset.top_p,
                    presence_penalty: ctx.preset.presence_penalty,
                    frequency_penalty: ctx.preset.frequency_penalty,
                    stop: stop_vec,
                    reasoning_effort,
                    top_k: if ctx.preset.top_k > 0 { Some(ctx.preset.top_k) } else { None },
                    min_p: if ctx.preset.min_p > 0.0 { Some(ctx.preset.min_p) } else { None },
                    top_a: if ctx.preset.top_a > 0.0 { Some(ctx.preset.top_a) } else { None },
                    repetition_penalty: if ctx.preset.repetition_penalty != 1.0 { Some(ctx.preset.repetition_penalty) } else { None },
                    tools: tools_payload,
                };
                crate::api_client::generate_stream(app_handle.clone(), ctx.profile.base_url.clone(), ctx.profile.api_key.clone(), req, abort_token.clone(), gen_id, target_msg_id).await?
            }
        };

        if abort_token.load(std::sync::atomic::Ordering::Relaxed) {
            break text;
        }

        if let Some(calls) = tool_calls {
            if !response_text.is_empty() && !text.is_empty() { response_text.push_str("\n\n"); }
            response_text.push_str(&text);
            
            let assistant_content = if text.is_empty() { None } else { Some(api_client::OpenAIContent::Text(text.clone())) };
            final_messages.push(api_client::OpenAIMessage {
                role: "assistant".to_string(),
                content: assistant_content,
                tool_calls: Some(calls.clone()),
                tool_call_id: None,
            });

            for tc in calls {
                let result_string;
                if tc.function.name == "get_system_time" {
                    result_string = format!("Current Local Time is {}", chrono::Local::now().to_rfc2822());
                    println!("Executed Tool get_system_time: {}", result_string);
                } else {
                    result_string = "Error: Tool execution failed or tool not found.".to_string();
                }

                final_messages.push(api_client::OpenAIMessage {
                    role: "tool".to_string(),
                    content: Some(api_client::OpenAIContent::Text(result_string)),
                    tool_calls: None,
                    tool_call_id: Some(tc.id),
                });
            }
            
            loop_count += 1;
            continue;
        } else {
            response_text.push_str(&text);
            break response_text;
        }
    };

    Ok(final_response)
}

pub async fn finalize_response(
    response_text: String,
    ctx: &GenerationContext,
    mut evaluator: script_engine::Evaluator,
    app_handle: &AppHandle,
    db_state: &tauri::State<'_, DbState>,
) -> Result<String, String> {
    let regex_scripts = {
        let conn = db_state.0.lock().unwrap();
        database::get_regex_scripts(&conn).unwrap_or_default()
    };
    
    let final_response = script_engine::process_regex_scripts(&response_text, "ai", &regex_scripts, &mut evaluator).await;
                
    let response_log = format!("[AI] Response Received (Length {}):\n{}", final_response.len(), final_response);
    println!("{}", response_log);
    let _ = app_handle.emit("backend-log", response_log);

    let new_vars = evaluator.get_vars();
    let new_globals = evaluator.get_globals();
    
    if !new_vars.is_empty() || !new_globals.is_empty() {
        let conn = db_state.0.lock().unwrap();
        for (k, v) in new_vars {
            let _ = database::set_chat_variable(&conn, ctx.chat_id, &k, &v);
        }
        for (k, v) in new_globals {
            let _ = database::set_global_variable(&conn, &k, &v);
        }
    }

    if !ctx.trimmed_db_ids.is_empty() && ctx.auto_trim_enabled {
        let conn = db_state.0.lock().unwrap();
        for &id in &ctx.trimmed_db_ids {
            let _ = crate::message_extra::MessageExtra::update(&conn, id, |extra| {
                if !extra.exclude_from_prompt {
                    extra.exclude_from_prompt = true;
                    extra.exclude_reason = Some("context_overflow".to_string());
                }
            });
        }
    }
            
    Ok(final_response)
}

