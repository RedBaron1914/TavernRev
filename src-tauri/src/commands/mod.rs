use tauri::{AppHandle, Manager, Emitter};
use std::fs;
use std::path::PathBuf;
use crate::database::{self, DbState, Character, Chat, Message, UserPersona};
use crate::message_extra::MessageExtra;
use crate::{importer, prompt_engine, script_engine, vector_memory};
use crate::prompt_engine::{PromptModule, CharacterData, WISettings};
use crate::{StartupError, LastPrompt};

pub fn get_avatars_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    app_dir.join("avatars")
}

pub fn get_attachments_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    app_dir.join("attachments")
}

#[tauri::command]
pub fn upload_attachment(app_handle: AppHandle, data: Vec<u8>) -> Result<String, String> {
    let attachments_dir = get_attachments_dir(&app_handle);
    std::fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    
    let new_filename = format!("attach_{}.png", chrono::Local::now().timestamp_millis());
    let dest_path = attachments_dir.join(&new_filename);
    
    std::fs::write(&dest_path, &data).map_err(|e| e.to_string())?;
    Ok(new_filename)
}

#[tauri::command]
pub fn delete_attachment(app_handle: AppHandle, filename: String) -> Result<(), String> {
    let safe_filename = crate::sanitize_filename(&filename);
    let attachments_dir = get_attachments_dir(&app_handle);
    let dest_path = attachments_dir.join(&safe_filename);
    if dest_path.exists() {
        std::fs::remove_file(dest_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_extension_script(app_handle: AppHandle, file_name: String, content: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    let ext_dir = app_dir.join("extensions");
    if !ext_dir.exists() {
        std::fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
    }
    
    // Ensure it ends with .js for safety
    let safe_name = if file_name.ends_with(".js") { file_name } else { format!("{}.js", file_name) };
    let file_path = ext_dir.join(crate::sanitize_filename(&safe_name));
    
    std::fs::write(file_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_extension_script(app_handle: AppHandle, file_name: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    let ext_dir = app_dir.join("extensions");
    
    // Safely extract only the file name
    let path = std::path::Path::new(&file_name);
    let safe_base_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    if safe_base_name.is_empty() { return Err("Invalid file name".to_string()); }

    let file_path = ext_dir.join(safe_base_name);
    
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_extension_scripts(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    let ext_dir = app_dir.join("extensions");
    
    let mut scripts = Vec::new();
    if ext_dir.exists() && ext_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(ext_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("js") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        scripts.push(content);
                    }
                }
            }
        }
    }
    Ok(scripts)
}
use serde_json::json;
use serde::Serialize;
use std::collections::HashMap;
use base64::{engine::general_purpose, Engine};
#[tauri::command]
pub fn import_character_card(app_handle: AppHandle, data: Vec<u8>, file_name: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    // 1. Parse Metadata
    let mut character = importer::import_character_from_data(&data)?;

    // 2. Setup Avatars Dir
    let avatars_dir = get_avatars_dir(&app_handle);
    fs::create_dir_all(&avatars_dir).map_err(|e| e.to_string())?;

    // 3. Save Image (if PNG) or Use Default (if JSON)
    let is_json = file_name.to_lowercase().ends_with(".json");
    
    let new_filename = if is_json {
        "default.png".to_string()
    } else {
        let new_name = format!("{}_{}", chrono::Local::now().timestamp(), crate::sanitize_filename(&file_name)); // Unique name
        let dest_path = avatars_dir.join(&new_name);
        fs::write(&dest_path, &data).map_err(|e| e.to_string())?;
        new_name
    };

    // 4. Update Struct & Save DB
    character.avatar = new_filename;
    
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let char_id = database::create_character(&conn, &character).map_err(|e| e.to_string())?;

    // 5. Extract Embedded Lorebook
    if let Ok(card_json) = serde_json::from_str::<serde_json::Value>(&character.card_data) {
        if let Some(book) = card_json.get("character_book") {
             if let Some(entries) = book.get("entries").and_then(|e| e.as_array()) {
                if !entries.is_empty() {
                     let raw_name = book.get("name").and_then(|n| n.as_str()).unwrap_or("");
                     let book_name = if !raw_name.is_empty() {
                         format!("{} (Embedded)", raw_name)
                     } else {
                         format!("Embedded: {}", character.name)
                     };
                     
                     if let Ok(book_id) = database::create_lorebook(&conn, &book_name) {
                        for entry in entries {
                            let keys = if let Some(k) = entry.get("keys") {
                                if k.is_array() {
                                    k.as_array().unwrap().iter().map(|v| v.as_str().unwrap_or("").to_string()).collect::<Vec<_>>().join(",")
                                } else if k.is_string() {
                                    k.as_str().unwrap().to_string()
                                } else { "".to_string() }
                            } else { "".to_string() };
                            
                            let content = entry.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                            let enabled = entry.get("enabled").and_then(|e| e.as_bool()).unwrap_or(true);
                            let constant = entry.get("constant").and_then(|e| e.as_bool()).unwrap_or(false);
                            let priority = entry.get("order").or(entry.get("insertion_order")).and_then(|e| e.as_i64()).unwrap_or(100);
                            let position = entry.get("position").and_then(|e| e.as_str()).unwrap_or("before_char").to_string();
                            let probability = entry.get("probability").and_then(|e| e.as_i64()).unwrap_or(100);
                            let depth = entry.get("depth").and_then(|e| e.as_i64()).unwrap_or(4);
                            
                            let _ = database::create_lore_entry(&conn, book_id, &keys, &content, enabled, constant, priority, probability, &position, depth);
                        }
                        let _ = database::set_lorebook_excluded_from_global(&conn, book_id, true);
                        let _ = database::link_character_lorebook(&conn, char_id, book_id);
                     }
                }
             }
        }
    }

    Ok(char_id)
}

// --- GROUPS ---
use database::Group;

#[tauri::command]
pub fn create_group(name: String, avatar: String, scenario: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_group(&conn, &name, &avatar, &scenario).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_groups(db_state: tauri::State<DbState>) -> Result<Vec<Group>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_group(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_group(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_group(id: i64, name: String, avatar: String, scenario: String, activation_strategy: i64, generation_mode: i64, allow_self_responses: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_group(&conn, id, &name, &avatar, &scenario, activation_strategy, generation_mode, allow_self_responses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_group_members(group_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<Character>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_group_members(&conn, group_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_group_member(group_id: i64, character_id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::add_group_member(&conn, group_id, character_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_group_member(group_id: i64, character_id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::remove_group_member(&conn, group_id, character_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_group_member_mute(group_id: i64, character_id: i64, is_muted: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::toggle_group_member_mute(&conn, group_id, character_id, is_muted).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_characters(db_state: tauri::State<DbState>) -> Result<Vec<Character>, String> {
    println!("CMD: get_characters called");
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    match database::get_characters(&conn) {
        Ok(chars) => {
            println!("CMD: get_characters returning {} characters", chars.len());
            Ok(chars)
        },
        Err(e) => {
            println!("CMD ERROR: get_characters failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn create_character(name: String, avatar: String, description: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    println!("CMD: create_character called with name='{}'", name);
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let char = Character {
        id: 0,
        name,
        avatar,
        description,
        personality: String::new(),
        scenario: String::new(),
        first_mes: String::new(),
        mes_example: String::new(),
        creator_notes: String::new(),
        tags: "[]".to_string(),
        alternate_greetings: "[]".to_string(),
        card_data: "{}".to_string(),
        created_at: String::new(),
        uuid: String::new(),
        updated_at: String::new(),
        is_muted: false,
    };
    match database::create_character(&conn, &char) {
        Ok(id) => {
            println!("CMD: create_character success, new ID={}", id);
            Ok(id)
        },
        Err(e) => {
            println!("CMD ERROR: create_character failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn create_character_full(card: Character, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_character(&conn, &card).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_character(card: Character, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_character(&conn, &card).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_character(app_handle: AppHandle, id: i64, delete_lore: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    
    if delete_lore {
        if let Ok(mut stmt) = conn.prepare("SELECT book_id FROM character_lorebooks WHERE character_id = ?1") {
            if let Ok(iter) = stmt.query_map([id], |r| r.get(0)) {
                let book_ids: Vec<i64> = iter.filter_map(|r| r.ok()).collect();
                for b_id in book_ids {
                    let _ = database::delete_lorebook(&conn, b_id);
                }
            }
        }
    }
    
    let avatar_filename = database::get_character_avatar(&conn, id).unwrap_or_default();
    
    database::delete_character(&conn, id).map_err(|e| e.to_string())?;

    if let Some(filename) = avatar_filename {
        if !filename.is_empty() {
            let avatars_dir = get_avatars_dir(&app_handle);
            let path = avatars_dir.join(&filename);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn export_character_json(id: i64, db_state: tauri::State<DbState>) -> Result<String, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let char = database::get_character_by_id(&conn, id).map_err(|e| e.to_string())?;
    
    let tags: Vec<String> = serde_json::from_str(&char.tags).unwrap_or_default();
    let greetings: Vec<String> = serde_json::from_str(&char.alternate_greetings).unwrap_or_default();

    let v2_card = json!({
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            "name": char.name,
            "description": char.description,
            "personality": char.personality,
            "scenario": char.scenario,
            "first_mes": char.first_mes,
            "mes_example": char.mes_example,
            "creator_notes": char.creator_notes,
            "tags": tags,
            "alternate_greetings": greetings,
            "system_prompt": "",
            "post_history_instructions": ""
        }
    });

    Ok(serde_json::to_string_pretty(&v2_card).unwrap())
}

#[tauri::command]
pub fn export_chat_jsonl(chat_id: i64, db_state: tauri::State<DbState>) -> Result<String, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::export_chat_jsonl(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_chat_jsonl(character_id: i64, data: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::import_chat_jsonl_data(&conn, character_id, &data, None)
}

#[tauri::command]
pub fn save_export_file(app_handle: AppHandle, filename: String, content: String) -> Result<String, String> {
    let download_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    let path = download_dir.join(crate::sanitize_filename(&filename));
    
    std::fs::write(&path, content).map_err(|e| format!("Failed to write to {:?}: {}", path, e))?;
    
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_user_personas(db_state: tauri::State<DbState>) -> Result<Vec<UserPersona>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_user_personas(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_user_persona(name: String, avatar: String, description: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_user_persona(&conn, &name, &avatar, &description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_user_persona(persona: UserPersona, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_user_persona(&conn, &persona).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_user_persona(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_user_persona(&conn, id).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_default_persona(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_default_persona(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chat_persona(chat_id: i64, persona_id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_chat_persona(&conn, chat_id, persona_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_chat(character_id: i64, group_id: Option<i64>, name: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_chat(&conn, character_id, group_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_chat(id: i64, name: String, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::rename_chat(&conn, id, &name).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_chats(character_id: i64, group_id: Option<i64>, db_state: tauri::State<DbState>) -> Result<Vec<Chat>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_chats(&conn, character_id, group_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chat(app_handle: AppHandle, id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    
    // Fetch and delete images associated with all messages in this chat
    let images_to_delete = database::get_chat_images(&conn, id).unwrap_or_default();
    let attachments_dir = get_attachments_dir(&app_handle);
    for img in images_to_delete {
        let path = attachments_dir.join(&img);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    database::delete_chat(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_messages(chat_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<Message>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_messages(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_messages_paged(chat_id: i64, limit: i64, offset: i64, db_state: tauri::State<DbState>) -> Result<Vec<Message>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_messages_paged(&conn, chat_id, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_message(chat_id: i64, role: String, content: String, images: Option<Vec<String>>, db_state: tauri::State<'_, DbState>) -> Result<i64, String> {
    println!("DEBUG: save_message role='{}' input: '{}'", role, content);
    // 1. Fetch data with lock
    let (regex_scripts, mut vars, globals, char_name, user_name) = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let regex = database::get_regex_scripts(&conn).unwrap_or_default();
        let v = database::get_chat_variables(&conn, chat_id).unwrap_or_default();
        let g = database::get_global_variables(&conn).unwrap_or_default();
        
        let mut cn = "".to_string();
        let mut un = "You".to_string();
        
        if let Ok((cid, pid)) = conn.query_row("SELECT character_id, user_persona_id FROM chats WHERE id = ?1", [chat_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?))) {
             if let Ok(n) = conn.query_row("SELECT name FROM characters WHERE id = ?1", [cid], |r| r.get::<_, String>(0)) { cn = n; }
             if let Some(pid) = pid {
                 if let Ok(n) = conn.query_row("SELECT name FROM user_personas WHERE id = ?1", [pid], |r| r.get::<_, String>(0)) { un = n; }
             }
        }
        
        (regex, v, g, cn, un)
    }; // Lock dropped

    // 2. Process async logic
    let processed_content = if role == "user" {
        if !regex_scripts.is_empty() {
            let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
                vars: vars.clone(),
                globals,
                char_name,
                user_name,
            });
            
            let processed = script_engine::process_regex_scripts(&content, "user", &regex_scripts, &mut evaluator).await;
            
            vars = evaluator.get_vars();
            let new_globals = evaluator.get_globals();
            
            let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            for (k, v) in new_globals {
                let _ = database::set_global_variable(&conn, &k, &v);
            }
            
            processed
        } else {
            content
        }
    } else {
        content
    };

    // 3. Save results with lock
    println!("DEBUG: save_message processed: '{}'", processed_content);
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !vars.is_empty() {
        for (k, v) in vars {
            let _ = database::set_chat_variable(&conn, chat_id, &k, &v);
        }
    }
    database::save_message(&conn, chat_id, &role, &processed_content, images).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn edit_message(id: i64, content: String, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::edit_message(&conn, id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_message_prompt_excluded(
    id: i64,
    excluded: bool,
    reason: Option<String>,
    db_state: tauri::State<DbState>,
) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_message_prompt_excluded(&conn, id, excluded, reason.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]

pub fn auto_exclude_context_overflow(
    chat_id: i64,
    exclude_percent: Option<f64>,
    db_state: tauri::State<DbState>,
) -> Result<usize, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let percent = exclude_percent.unwrap_or(50.0).clamp(1.0, 100.0);
    MessageExtra::auto_exclude_context_overflow(&conn, chat_id, percent)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_message_stats(
    chat_id: i64,
    db_state: tauri::State<DbState>,
) -> Result<(usize, usize), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    MessageExtra::get_chat_message_stats(&conn, chat_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_context_stats(
    chat_id: i64,
    profile_name: Option<String>,
    app_handle: tauri::AppHandle,
    db_state: tauri::State<DbState>,
) -> Result<serde_json::Value, String> {
    use tiktoken_rs::cl100k_base;
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let (total, excluded) = MessageExtra::get_chat_message_stats(&conn, chat_id)
        .map_err(|e| e.to_string())?;
    let overflow_count = MessageExtra::get_context_overflow_count(&conn, chat_id)
        .map_err(|e| e.to_string())?;

    let messages = database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?;
    let active: Vec<_> = messages.iter().filter(|m| !database::message_is_excluded_from_prompt(m)).collect();

    let bpe = cl100k_base().map_err(|e| e.to_string())?;
    let tokens_used: usize = active.iter().map(|m| bpe.encode_with_special_tokens(&m.content).len()).sum();

    let context_size: usize = if let Some(name) = profile_name {
        let dir = get_connections_dir(&app_handle);
        let content = std::fs::read_to_string(dir.join(crate::sanitize_filename(&name))).unwrap_or_default();
        let profile: crate::api_client::ConnectionProfile = match serde_json::from_str(&content) {
            Ok(p) => p,
            Err(_) => return Ok(serde_json::json!({
                "total_messages": total,
                "excluded_messages": excluded,
                "overflow_trimmed": overflow_count,
                "tokens_used": tokens_used,
                "context_size": 0,
            })),
        };
        profile.context_size as usize
    } else {
        0
    };

    Ok(serde_json::json!({
        "total_messages": total,
        "excluded_messages": excluded,
        "overflow_trimmed": overflow_count,
        "tokens_used": tokens_used,
        "context_size": context_size,
    }))
}

#[tauri::command]
pub fn get_auto_trim_enabled(chat_id: i64, db_state: tauri::State<DbState>) -> Result<bool, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let enabled: bool = conn
        .query_row(
            "SELECT COALESCE(auto_trim_enabled, 1) FROM chats WHERE id = ?1",
            rusqlite::params![chat_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(enabled)
}

#[tauri::command]
pub fn set_auto_trim_enabled(chat_id: i64, enabled: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    conn.execute(
        "UPDATE chats SET auto_trim_enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled as i32, chat_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_message(app_handle: AppHandle, id: i64, mode: String, chat_id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    
    let images_to_delete = match mode.as_str() {
        "swipe" => {
            database::delete_swipe(&conn, id).map_err(|e| e.to_string())?;
            Vec::new()
        },
        "message" => { 
            let imgs = database::get_message_images(&conn, id).unwrap_or_default();
            database::delete_message(&conn, id).map_err(|e| e.to_string())?;
            imgs
        },
        "branch" => { 
            let imgs = database::get_branch_images(&conn, chat_id, id).unwrap_or_default();
            database::delete_message_branch(&conn, chat_id, id).map_err(|e| e.to_string())?;
            imgs
        },
        _ => return Err("Invalid deletion mode".to_string()),
    };

    let attachments_dir = get_attachments_dir(&app_handle);
    for img in images_to_delete {
        let path = attachments_dir.join(&img);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn branch_chat(chat_id: i64, from_msg_id: i64, new_name: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::branch_chat(&conn, chat_id, from_msg_id, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_stats(chat_id: i64, db_state: tauri::State<DbState>) -> Result<serde_json::Value, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let messages = database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?;
    
    let bpe = tiktoken_rs::cl100k_base().map_err(|e| e.to_string())?;
    
    let mut user_tokens = 0;
    let mut char_tokens = 0;

    for msg in &messages {
        let count = bpe.encode_with_special_tokens(&msg.content).len();
        if msg.role == "user" {
            user_tokens += count;
        } else {
            char_tokens += count;
        }
    }

    Ok(serde_json::json!({
        "message_count": messages.len(),
        "user_tokens": user_tokens,
        "char_tokens": char_tokens,
        "total_tokens": user_tokens + char_tokens
    }))
}

#[tauri::command]
pub fn tokenize_text(text: String) -> Vec<String> {
    let bpe = match tiktoken_rs::cl100k_base() {
        Ok(b) => b,
        Err(_) => return vec![text],
    };

    let tokens = bpe.encode_with_special_tokens(&text);
    tokens.into_iter().map(|t| bpe.decode(vec![t]).unwrap_or_default()).collect()
}


// --- Preset File Commands ---

pub fn get_presets_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    app_dir.join("presets")
}

#[tauri::command]
pub fn list_presets(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let presets_dir = get_presets_dir(&app_handle);
    let mut presets = Vec::new();
    if presets_dir.exists() {
        for entry in fs::read_dir(presets_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "json" {
                        presets.push(path.file_name().unwrap_or_default().to_string_lossy().into_owned());
                    }
                }
            }
        }
    }
    Ok(presets)
}

#[tauri::command]
pub fn load_preset(app_handle: AppHandle, file_name: String) -> Result<String, String> {
    let presets_dir = get_presets_dir(&app_handle);
    let file_path = presets_dir.join(crate::sanitize_filename(&file_name));
    fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_preset(app_handle: AppHandle, preset_name: String) -> Result<serde_json::Value, String> {
    let presets_dir = get_presets_dir(&app_handle);
    let safe_preset = crate::sanitize_filename(&preset_name);
    let preset_path = presets_dir.join(&safe_preset);
    let content = std::fs::read_to_string(preset_path).map_err(|e| format!("File read error: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("get_preset JSON parse error: {}. Content starts with: {}", e, &content.chars().take(50).collect::<String>()))
}

#[tauri::command]
pub fn save_preset(app_handle: AppHandle, file_name: String, content: String) -> Result<(), String> {
    let presets_dir = get_presets_dir(&app_handle);
    let file_path = presets_dir.join(crate::sanitize_filename(&file_name));
    fs::write(file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(app_handle: AppHandle, file_name: String) -> Result<(), String> {
    let presets_dir = get_presets_dir(&app_handle);
    let path = presets_dir.join(crate::sanitize_filename(&file_name));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Connection Profile Commands ---

pub fn get_connections_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    app_dir.join("connections")
}

#[tauri::command]
pub fn list_connection_profiles(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let dir = get_connections_dir(&app_handle);
    let mut profiles = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                profiles.push(path.file_name().unwrap_or_default().to_string_lossy().into_owned());
            }
        }
    }
    Ok(profiles)
}

#[tauri::command]
pub fn load_connection_profile(app_handle: AppHandle, file_name: String) -> Result<String, String> {
    let dir = get_connections_dir(&app_handle);
    let file_path = dir.join(crate::sanitize_filename(&file_name));
    fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_connection_profile(app_handle: AppHandle, file_name: String, content: String) -> Result<(), String> {
    let dir = get_connections_dir(&app_handle);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file_path = dir.join(crate::sanitize_filename(&file_name));
    fs::write(file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_connection_profile(app_handle: AppHandle, file_name: String) -> Result<(), String> {
    let dir = get_connections_dir(&app_handle);
    let file_path = dir.join(crate::sanitize_filename(&file_name));
    fs::remove_file(file_path).map_err(|e| e.to_string())
}

// --- Lorebook Commands ---

#[tauri::command]
pub fn get_lorebooks(db_state: tauri::State<DbState>) -> Result<Vec<database::Lorebook>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_lorebooks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_lorebook(name: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_lorebook(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_lorebook(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_lorebook(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_lore_entries(book_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<database::LoreEntry>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_lore_entries(&conn, book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_lore_entry(book_id: i64, keys: String, content: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // Default values for new manual entry
    database::create_lore_entry(&conn, book_id, &keys, &content, true, false, 100, 100, "before_char", 4).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lore_entry(id: i64, keys: String, content: String, enabled: bool, constant: bool, priority: i64, probability: i64, position: String, depth: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_lore_entry(&conn, id, &keys, &content, enabled, constant, priority, probability, &position, depth).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_lore_entry(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_lore_entry(&conn, id).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct V3Entry {
    key: Option<Vec<String>>,
    keys: Option<Vec<String>>,
    content: String,
    enabled: Option<bool>,
    constant: Option<bool>,
    order: Option<i64>,
    insertion_order: Option<i64>,
    position: Option<String>,
    probability: Option<i64>,
    depth: Option<i64>,
}

#[derive(serde::Deserialize)]
struct V3Book {
    name: Option<String>,
    entries: std::collections::HashMap<String, V3Entry>,
}

#[tauri::command]
pub fn import_lorebook(json_data: String, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let book: V3Book = serde_json::from_str(&json_data).map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    
    let name = book.name.unwrap_or("Imported Lorebook".to_string());
    let book_id = database::create_lorebook(&conn, &name).map_err(|e| e.to_string())?;
    
    for (_, entry) in book.entries {
        let keys_vec = entry.key.or(entry.keys).unwrap_or_default();
        let keys_str = keys_vec.join(",");
        let enabled = entry.enabled.unwrap_or(true);
        let constant = entry.constant.unwrap_or(false);
        let priority = entry.order.or(entry.insertion_order).unwrap_or(100);
        let position = entry.position.unwrap_or("before_char".to_string());
        let probability = entry.probability.unwrap_or(100);
        let depth = entry.depth.unwrap_or(4);
        
        database::create_lore_entry(&conn, book_id, &keys_str, &entry.content, enabled, constant, priority, probability, &position, depth).map_err(|e| e.to_string())?;
    }
    
    Ok(book_id)
}

#[tauri::command]
pub fn get_chat_lorebooks(chat_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<i64>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_chat_lorebook_ids(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_lorebook_links(chat_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<database::LorebookLink>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_chat_lorebook_links(&conn, chat_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_chat_lorebook(chat_id: i64, book_id: i64, active: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::toggle_chat_lorebook(&conn, chat_id, book_id, active).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_chat_lorebook_enabled(chat_id: i64, book_id: i64, enabled: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_chat_lorebook_enabled(&conn, chat_id, book_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_character_lorebooks(character_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<i64>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_character_lorebook_ids(&conn, character_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_character_lorebook_links(character_id: i64, db_state: tauri::State<DbState>) -> Result<Vec<database::LorebookLink>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_character_lorebook_links(&conn, character_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_character_lorebook(character_id: i64, book_id: i64, active: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::toggle_character_lorebook(&conn, character_id, book_id, active).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_character_lorebook_enabled(character_id: i64, book_id: i64, enabled: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_character_lorebook_enabled(&conn, character_id, book_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_global_lorebook(book_id: i64, active: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::toggle_global_lorebook(&conn, book_id, active).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_global_lorebook_enabled(book_id: i64, enabled: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_global_lorebook_enabled(&conn, book_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_lorebook_excluded_from_global(book_id: i64, excluded: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::set_lorebook_excluded_from_global(&conn, book_id, excluded).map_err(|e| e.to_string())
}



#[tauri::command]
pub async fn debug_lore_generation() -> Result<Vec<prompt_engine::Message>, String> {
    let char_data = CharacterData {
        name: "Char".to_string(),
        description: "CharDesc".to_string(),
        ..Default::default()
    };
    
    let history = vec![
        prompt_engine::Message { role: "user".to_string(), content: "Trigger mood check: {{getvar::mood}}".to_string(), name: None, images: None, db_id: None }
    ];
    
    let lore = vec![
        prompt_engine::ScanEntry {
            id: Some(1), keys: vec!["Trigger".to_string()], content: "{{setvar::mood::Happy}}".to_string(), 
            enabled: true, constant: false, priority: 10, probability: 100, position: "outlet".to_string(), depth: 0,
            source: "debug".to_string()
        }
    ];
    
    let modules = vec![
        PromptModule { identifier: "worldInfoBefore".to_string(), name: "wi_b".to_string(), content: "".to_string(), role: "system".to_string(), enabled: true, injection_order: 0, injection_depth: 0, injection_position: 0, system_prompt: true, marker: Some(true), forbid_overrides: false, injection_trigger: vec![] },
        PromptModule { identifier: "charDescription".to_string(), name: "desc".to_string(), content: "".to_string(), role: "system".to_string(), enabled: true, injection_order: 1, injection_depth: 0, injection_position: 0, system_prompt: true, marker: Some(true), forbid_overrides: false, injection_trigger: vec![] },
        PromptModule { identifier: "worldInfoAfter".to_string(), name: "wi_a".to_string(), content: "".to_string(), role: "system".to_string(), enabled: true, injection_order: 2, injection_depth: 0, injection_position: 0, system_prompt: true, marker: Some(true), forbid_overrides: false, injection_trigger: vec![] },
        PromptModule { identifier: "chatHistory".to_string(), name: "hist".to_string(), content: "".to_string(), role: "system".to_string(), enabled: true, injection_order: 10, injection_depth: 0, injection_position: 0, system_prompt: false, marker: Some(true), forbid_overrides: false, injection_trigger: vec![] }
    ];

    let wi_settings = WISettings { depth: 5, recursive: true, case_sensitive: false, match_whole_words: true, max_recursion: 5, token_budget: 0, include_names: true, insertion_strategy: String::new() };
    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars: HashMap::new(),
        globals: HashMap::new(),
        char_name: "Debug".to_string(),
        user_name: "User".to_string(),
    });
    let (msgs, _, _) = prompt_engine::assemble_prompt(modules, history, char_data, "User", "", lore, wi_settings, &mut evaluator, 0, String::new()).await;
    Ok(msgs)
}

// --- Prompting Commands ---

#[tauri::command]
pub async fn assemble_prompt_command(
    modules: Vec<PromptModule>, 
    history: Vec<prompt_engine::Message>,
    character: Character,
    user_name: String
) -> Vec<prompt_engine::Message> {
    let char_data = CharacterData {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.first_mes,
        mes_example: character.mes_example,
        creator_notes: character.creator_notes,
    };
    
    // Debug command uses empty vars
    let wi_settings = prompt_engine::WISettings { depth: 5, recursive: true, case_sensitive: false, match_whole_words: true, max_recursion: 5, token_budget: 0, include_names: true, insertion_strategy: String::new() };
    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars: std::collections::HashMap::new(),
        globals: std::collections::HashMap::new(),
        char_name: char_data.name.clone(),
        user_name: user_name.clone(),
    });
    let (msgs, _, _) = prompt_engine::assemble_prompt(modules, history, char_data, &user_name, "", vec![], wi_settings, &mut evaluator, 0, String::new()).await;
    msgs
}

#[tauri::command]
pub async fn process_macros_command(text: String, character: Character, user_name: String) -> Result<String, String> {
    let char_data = CharacterData {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.first_mes,
        mes_example: character.mes_example,
        creator_notes: character.creator_notes,
    };
    
    let module = PromptModule {
        identifier: "temp".to_string(),
        name: "temp".to_string(),
        content: text,
        role: "system".to_string(),
        enabled: true,
        injection_order: 1000,
        injection_depth: 0,
        injection_position: 2, // 2 = In-Chat, prevents gluing to the main System Prompt
        system_prompt: false,
        marker: None,
        forbid_overrides: false,
        injection_trigger: vec![]
    };

    let wi_settings = prompt_engine::WISettings { depth: 1, recursive: false, case_sensitive: false, match_whole_words: true, max_recursion: 5, token_budget: 0, include_names: true, insertion_strategy: String::new() };
    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars: std::collections::HashMap::new(),
        globals: std::collections::HashMap::new(),
        char_name: char_data.name.clone(),
        user_name: user_name.clone(),
    });
    let (msgs, _, _) = prompt_engine::assemble_prompt(vec![module], vec![], char_data, &user_name, "", vec![], wi_settings, &mut evaluator, 0, String::new()).await;
    Ok(msgs.last().map(|m| m.content.clone()).unwrap_or_default())
}

#[tauri::command]
pub async fn process_macros_debug(text: String, character_id: i64, db_state: tauri::State<'_, DbState>) -> Result<String, String> {
    // 1. Fetch Data (Lock & Drop)
    let char_data = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let character = database::get_character_by_id(&conn, character_id).map_err(|e| e.to_string())?;

        CharacterData {
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
            first_mes: character.first_mes,
            mes_example: character.mes_example,
            creator_notes: character.creator_notes,
        }
    };
    
    let module = PromptModule {
        identifier: "debug".to_string(),
        name: "Debug".to_string(),
        content: text,
        role: "system".to_string(),
        enabled: true,
        injection_order: 1000,
        injection_depth: 0,
        injection_position: 2, // 2 = In-Chat
        system_prompt: false,
        marker: None,
        forbid_overrides: false,
        injection_trigger: vec![],
    };
    
    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars: HashMap::new(),
        globals: HashMap::new(),
        char_name: char_data.name.clone(),
        user_name: "User".to_string(),
    });
    let wi_settings = WISettings {
        depth: 0,
        recursive: false,
        case_sensitive: false,
        match_whole_words: false,
        max_recursion: 0,
        token_budget: 0,
        include_names: false,
        insertion_strategy: "char_first".to_string(),
    };

    let (msgs, _, _) = prompt_engine::assemble_prompt(vec![module], vec![], char_data, "User", "", vec![], wi_settings, &mut evaluator, 0, String::new()).await;
    
    if msgs.is_empty() {
        Ok(String::new())
    } else {
        Ok(msgs.last().unwrap().content.clone())
    }
}


fn get_bpe() -> Result<&'static tiktoken_rs::CoreBPE, String> {
    static BPE: std::sync::OnceLock<tiktoken_rs::CoreBPE> = std::sync::OnceLock::new();
    if BPE.get().is_none() {
        let bpe = tiktoken_rs::cl100k_base().map_err(|e| e.to_string())?;
        let _ = BPE.set(bpe);
    }
    Ok(BPE.get().unwrap())
}

#[tauri::command]
pub fn count_tokens(text: String) -> Result<usize, String> {
    let bpe = get_bpe()?;
    let tokens = bpe.encode_with_special_tokens(&text);
    Ok(tokens.len())
}

#[tauri::command]
pub async fn get_modules_token_counts(
    modules: Vec<PromptModule>,
    chat_id: i64,
    character_id: i64,
    db_state: tauri::State<'_, DbState>
) -> Result<std::collections::HashMap<String, usize>, String> {
    let bpe = get_bpe()?;
    
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    
    // Get Data
    let char_data = database::get_character_by_id(&conn, character_id).unwrap_or_default();
    
    let messages = if chat_id > 0 {
        database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };

    let count = |text: &str| bpe.encode_with_special_tokens(text).len();

    let history_tokens: usize = messages.iter().map(|m| count(&m.content)).sum();
    
    let mut counts = std::collections::HashMap::new();
    
    for module in modules {
        let size = match module.identifier.as_str() {
            "chatHistory" => history_tokens,
            "charDescription" => count(if module.content.trim().is_empty() { &char_data.description } else { &module.content }),
            "charPersonality" => count(if module.content.trim().is_empty() { &char_data.personality } else { &module.content }),
            "scenario" => count(if module.content.trim().is_empty() { &char_data.scenario } else { &module.content }),
            "firstMessage" => count(if module.content.trim().is_empty() { &char_data.first_mes } else { &module.content }),
            "mesExamples" | "dialogueExamples" => count(if module.content.trim().is_empty() { &char_data.mes_example } else { &module.content }),
            "personaDescription" => 0, 
            _ => {
                let expanded = module.content
                    .replace("{{char}}", &char_data.name)
                    .replace("{{user}}", "User")
                    .replace("{{description}}", &char_data.description)
                    .replace("{{personality}}", &char_data.personality)
                    .replace("{{scenario}}", &char_data.scenario)
                    .replace("{{first_mes}}", &char_data.first_mes)
                    .replace("{{mes_example}}", &char_data.mes_example)
                    .replace("{{creator_notes}}", &char_data.creator_notes)
                    .replace("{{char_personality}}", &char_data.personality)
                    .replace("{{original_message}}", &char_data.first_mes);
                count(&expanded)
            }
        };
        counts.insert(module.identifier, size);
    }

    Ok(counts)
}

#[tauri::command]
pub fn read_image_base64(file_name: String, app_handle: AppHandle) -> Result<String, String> {
    let avatars_dir = get_avatars_dir(&app_handle);
    let path = avatars_dir.join(crate::sanitize_filename(&file_name));
    if !path.exists() {
        return Err("File not found".to_string());
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&data)))
}

#[tauri::command]
pub fn upload_avatar(app_handle: AppHandle, data: Vec<u8>) -> Result<String, String> {
    let avatars_dir = get_avatars_dir(&app_handle);
    fs::create_dir_all(&avatars_dir).map_err(|e| e.to_string())?;
    
    let new_filename = format!("avatar_{}.png", chrono::Local::now().timestamp_millis());
    let dest_path = avatars_dir.join(&new_filename);
    
    fs::write(&dest_path, &data).map_err(|e| e.to_string())?;
    Ok(new_filename)
}


#[derive(Clone, Serialize)]
struct ToastPayload {
    message: String,
    #[serde(rename = "type")]
    type_: String,
}

// --- STScript Processor ---

#[tauri::command]
pub async fn process_input(app_handle: AppHandle, chat_id: i64, input: String, db_state: tauri::State<'_, DbState>) -> Result<String, String> {
    // Parse for /commands
    if !input.starts_with('/') {
        return Ok("".to_string());
    }

    // 1. Fetch Context Data (Lock & Drop)
    let (char_name, user_name, vars, globals) = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        
        let mut cn = "Character".to_string();
        let un = "You".to_string();
        if let Ok(char_id) = conn.query_row("SELECT character_id FROM chats WHERE id = ?1", [chat_id], |r| r.get::<_, i64>(0)) {
             if let Ok(n) = conn.query_row("SELECT name FROM characters WHERE id = ?1", [char_id], |r| r.get::<_, String>(0)) { cn = n; }
        }
        
        let v = database::get_chat_variables(&conn, chat_id).unwrap_or_default();
        let g = database::get_global_variables(&conn).unwrap_or_default();
        (cn, un, v, g)
    };

    // 2. Async Execution (No Lock)
    let mut evaluator = script_engine::Evaluator::new(script_engine::ScriptContext {
        vars,
        globals,
        char_name,
        user_name
    });
    
    let result = script_engine::commands::process_command(&input, &mut evaluator, None).await;

    // 3. Apply Side Effects (Lock)
    {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        for op in result.db_ops {
            match op {
                script_engine::commands::DbOp::SaveMessage { role, content } => {
                    let _ = database::save_message(&conn, chat_id, &role, &content, None);
                },
                script_engine::commands::DbOp::SetChatVar { key, val } => {
                    let _ = database::set_chat_variable(&conn, chat_id, &key, &val);
                },
                script_engine::commands::DbOp::DeleteChatVar { key } => {
                    let _ = database::delete_chat_variable(&conn, chat_id, &key);
                },
                script_engine::commands::DbOp::SetGlobalVar { key, val } => {
                    let _ = database::set_global_variable(&conn, &key, &val);
                },
                script_engine::commands::DbOp::DeleteGlobalVar { key } => {
                    let _ = database::delete_global_variable(&conn, &key);
                },
                script_engine::commands::DbOp::SetLoreEntry { id, enabled } => {
                    let _ = database::set_lore_entry_enabled(&conn, id, enabled);
                },
                script_engine::commands::DbOp::SetLorebook { name } => {
                    if let Ok(Some(id)) = database::find_lorebook_id_by_name(&conn, &name) {
                        let _ = database::set_chat_active_lorebook(&conn, chat_id, id);
                    }
                }
            }
        }
        
        if !result.text.is_empty() {
             // System echo
             let _ = database::save_message(&conn, chat_id, "system", &result.text, None);
        }
    }

    // 4. Emit Events (No Lock needed)
    for (msg, t) in result.toasts {
        let _ = app_handle.emit("toast-message", ToastPayload { message: msg, type_: t });
    }
    if let Some(bg) = result.background {
        let _ = app_handle.emit("set-background", bg);
    }
    if let Some(style) = result.style {
        let _ = app_handle.emit("set-style", style);
    }
    if let Some(popup) = result.popup {
        let _ = app_handle.emit("show-popup", popup);
    }
    
    if let Some(gen_prompt) = result.generation {
        return Ok(format!("generate:{}", gen_prompt));
    }

    Ok("handled".to_string())
}

#[tauri::command]
pub fn create_regex_script(name: String, regex: String, replacement: String, placement: String, run_on_markdown: Option<bool>, disabled: Option<bool>, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let r_md = run_on_markdown.unwrap_or(true);
    let r_dis = disabled.unwrap_or(false);
    database::create_regex_script(&conn, &name, &regex, &replacement, &placement, r_md, r_dis).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_regex_script(script: database::RegexScript, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_regex_script(&conn, &script).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_regex_script(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_regex_script(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_regex_scripts(db_state: tauri::State<DbState>) -> Result<Vec<database::RegexScript>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_regex_scripts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_quick_reply(label: String, content: String, icon: String, is_global: bool, db_state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::create_quick_reply(&conn, &label, &content, &icon, is_global).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_quick_reply(id: i64, label: String, content: String, icon: String, is_global: bool, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::update_quick_reply(&conn, id, &label, &content, &icon, is_global).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_quick_replies(db_state: tauri::State<DbState>) -> Result<Vec<database::QuickReply>, String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::get_quick_replies(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_quick_reply(id: i64, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    database::delete_quick_reply(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_regex_scripts(scripts: Vec<database::RegexScript>, db_state: tauri::State<DbState>) -> Result<(), String> {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    for script in scripts {
        database::create_regex_script(&conn, &script.script_name, &script.regex, &script.replacement, &script.placement, script.run_on_markdown, script.disabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- App Setup ---

pub fn seed_default_connection(connections_dir: &PathBuf) -> Result<(), std::io::Error> {
    // If empty or Default.json missing, create it
    let path = connections_dir.join("Default.json");
    if !path.exists() {
        let content = json!({
            "name": "Default",
            "api_type": "chat_completion",
            "chat_source": "custom",
            "api_key": "",
            "base_url": "http://127.0.0.1:5000/v1",
            "model_id": "",
            "context_size": 4096,
            "post_processing": "none"
        });
        fs::write(path, content.to_string())?;
    }
    Ok(())
}

pub fn seed_default_preset(presets_dir: &PathBuf) -> Result<(), std::io::Error> {
    if fs::read_dir(presets_dir)?.next().is_none() {
        let default_preset_path = presets_dir.join("Default.json");
        let default_content = json!({
            "temperature": 1.0,
            "top_p": 0.8,
            "repetition_penalty": 1.0,
            "prompts": []
        });
        fs::write(default_preset_path, default_content.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn connect_dropbox(app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<String, String> {
    use crate::sync_manager::*;
    use tiny_http::{Server, Response};
    use tauri_plugin_opener::OpenerExt;

    let verifier = generate_verifier();
    let challenge = generate_challenge(&verifier);
    let auth_url = build_auth_url(&challenge);

    // Start local server
    let server = Server::http("127.0.0.1:1234").map_err(|e| e.to_string())?;
    
    // Open browser
    app_handle.opener().open_url(&auth_url, None::<String>).map_err(|e| e.to_string())?;

    // Wait for redirect
    if let Some(request) = server.recv_timeout(std::time::Duration::from_secs(120)).map_err(|e| e.to_string())? {
        let url = request.url();
        if let Some(code_pos) = url.find("code=") {
            let code = &url[code_pos + 5..].split('&').next().unwrap_or("");
            
            // Exchange code
            let token_data = exchange_code_for_token(code, &verifier).await?;
            
            // Save token
            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = database::set_global_variable(&conn, "dropbox_token", &token_data.access_token);
                if let Some(rt) = token_data.refresh_token {
                    let _ = database::set_global_variable(&conn, "dropbox_refresh_token", &rt);
                }
            }

            let html = "<html><body style='font-family:sans-serif; background:#111; color:#eee; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;'>
                <h1 style='color:#6366f1;'>TavernRev Connected!</h1>
                <p>Authentication successful. You can close this tab now.</p>
                </body></html>";
            
            let response = Response::from_string(html)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
            let _ = request.respond(response);
            
            return Ok("success".to_string());
        }
    }

    Err("Authorization timed out or failed".to_string())
}

#[tauri::command]
pub fn get_dropbox_status(db_state: tauri::State<DbState>) -> bool {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let vars = database::get_global_variables(&conn).unwrap_or_default();
    vars.contains_key("dropbox_token")
}

#[tauri::command]
pub fn logout_dropbox(db_state: tauri::State<DbState>) {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let _ = database::delete_global_variable(&conn, "dropbox_token");
}

#[tauri::command]
pub async fn connect_gdrive(app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<String, String> {
    use crate::sync_manager::*;
    use tiny_http::{Server, Response};
    use tauri_plugin_opener::OpenerExt;

    let verifier = generate_verifier();
    let challenge = generate_challenge(&verifier);
    let auth_url = crate::google_drive_manager::build_auth_url(&challenge);

    // Start local server
    let server = Server::http("127.0.0.1:1234").map_err(|e| e.to_string())?;
    
    // Open browser
    app_handle.opener().open_url(&auth_url, None::<String>).map_err(|e| e.to_string())?;

    // Wait for redirect
    if let Some(request) = server.recv_timeout(std::time::Duration::from_secs(120)).map_err(|e| e.to_string())? {
        let url = request.url();
        if let Some(code_pos) = url.find("code=") {
            let code = &url[code_pos + 5..].split('&').next().unwrap_or("");
            
            // Exchange code
            let token_data = crate::google_drive_manager::exchange_code_for_token(code, &verifier).await?;
            
            // Save token
            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = database::set_global_variable(&conn, "gdrive_token", &token_data.access_token);
                if let Some(rt) = token_data.refresh_token {
                    let _ = database::set_global_variable(&conn, "gdrive_refresh_token", &rt);
                }
            }

            let html = "<html><body style='font-family:sans-serif; background:#111; color:#eee; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;'>
                <h1 style='color:#6366f1;'>Google Drive Connected!</h1>
                <p>Authentication successful. You can close this tab now.</p>
                </body></html>";
            
            let response = Response::from_string(html)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
            let _ = request.respond(response);
            
            return Ok("success".to_string());
        }
    }

    Err("Authorization timed out or failed".to_string())
}

#[tauri::command]
pub fn get_gdrive_status(db_state: tauri::State<DbState>) -> bool {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let vars = database::get_global_variables(&conn).unwrap_or_default();
    vars.contains_key("gdrive_token")
}

#[tauri::command]
pub fn logout_gdrive(db_state: tauri::State<DbState>) {
    let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let _ = database::delete_global_variable(&conn, "gdrive_token");
}

fn db_time_to_iso(db_time: &str) -> String {
    let t = db_time.trim();
    if t.is_empty() { return String::new(); }
    format!("{}Z", t.replace(" ", "T"))
}

fn iso_to_timestamp(iso: &str) -> i64 {
    if iso.is_empty() { return 0; }
    match chrono::DateTime::parse_from_rfc3339(iso) {
        Ok(dt) => dt.timestamp(),
        Err(_) => 0,
    }
}

async fn get_valid_token(db_state: &tauri::State<'_, DbState>) -> Result<String, String> {
    let (access_token, refresh_token) = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let vars = database::get_global_variables(&conn).unwrap_or_default();
        let at = vars.get("dropbox_token").cloned().ok_or("Not logged in to Dropbox")?;
        let rt = vars.get("dropbox_refresh_token").cloned();
        (at, rt)
    }; // MutexGuard dropped here

    // Try a simple request to check if token is valid
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "path": "",
        "recursive": false
    });
    
    let res = client.post("https://api.dropboxapi.com/2/files/list_folder")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await;

    // If request succeeds or fails for a reason other than 401, token is probably fine
    if let Ok(response) = res {
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Ok(access_token);
        }
    }

    // Token is expired (401). Try to refresh.
    if let Some(rt) = refresh_token {
        println!("SYNC: Token expired. Attempting refresh...");
        match crate::sync_manager::refresh_access_token(&rt).await {
            Ok(new_token_data) => {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = database::set_global_variable(&conn, "dropbox_token", &new_token_data.access_token);
                // Dropbox might return a new refresh token, update it if so
                if let Some(new_rt) = new_token_data.refresh_token {
                    let _ = database::set_global_variable(&conn, "dropbox_refresh_token", &new_rt);
                }
                println!("SYNC: Token refreshed successfully.");
                return Ok(new_token_data.access_token);
            },
            Err(e) => {
                println!("SYNC: Refresh failed: {}", e);
                return Err("Session expired. Please reconnect to Dropbox.".to_string());
            }
        }
    }

    Err("Session expired. Please reconnect to Dropbox.".to_string())
}

async fn get_valid_gdrive_token(db_state: &tauri::State<'_, DbState>) -> Result<String, String> {
    let (access_token, refresh_token) = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let vars = database::get_global_variables(&conn).unwrap_or_default();
        let at = vars.get("gdrive_token").cloned().ok_or("Not logged in to Google Drive")?;
        let rt = vars.get("gdrive_refresh_token").cloned();
        (at, rt)
    };

    let client = reqwest::Client::new();
    let res = client.get("https://www.googleapis.com/drive/v3/about?fields=user")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await;

    if let Ok(response) = res {
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Ok(access_token);
        }
    }

    if let Some(rt) = refresh_token {
        println!("SYNC: GDrive Token expired. Attempting refresh...");
        match crate::google_drive_manager::refresh_access_token(&rt).await {
            Ok(new_token_data) => {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = database::set_global_variable(&conn, "gdrive_token", &new_token_data.access_token);
                if let Some(new_rt) = new_token_data.refresh_token {
                    let _ = database::set_global_variable(&conn, "gdrive_refresh_token", &new_rt);
                }
                println!("SYNC: GDrive Token refreshed successfully.");
                return Ok(new_token_data.access_token);
            },
            Err(e) => {
                println!("SYNC: GDrive Refresh failed: {}", e);
                return Err("Session expired. Please reconnect to Google Drive.".to_string());
            }
        }
    }

    Err("Session expired. Please reconnect to Google Drive.".to_string())
}

async fn push_gdrive(app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    let token = get_valid_gdrive_token(&db_state).await?;
    let _ = app_handle.emit("sync-progress", "Starting Push...");

    let avatars_dir = get_avatars_dir(&app_handle);

    // Resolve folders
    let root_id = crate::google_drive_manager::get_or_create_folder(&token, "TavernRev", None).await?;
    let personas_id = crate::google_drive_manager::get_or_create_folder(&token, "personas", Some(&root_id)).await?;
    let chars_id = crate::google_drive_manager::get_or_create_folder(&token, "characters", Some(&root_id)).await?;
    let groups_id = crate::google_drive_manager::get_or_create_folder(&token, "groups", Some(&root_id)).await?;
    let chats_id = crate::google_drive_manager::get_or_create_folder(&token, "chats", Some(&root_id)).await?;
    let avatars_id = crate::google_drive_manager::get_or_create_folder(&token, "avatars", Some(&root_id)).await?;

    let mut cloud_groups = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &groups_id).await {
        for f in files {
            cloud_groups.insert(f.name.to_lowercase(), (f.id, f.modified_time.unwrap_or_default()));
        }
    }

    let mut cloud_chars = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &chars_id).await {
        for f in files {
            cloud_chars.insert(f.name.to_lowercase(), (f.id, f.modified_time.unwrap_or_default()));
        }
    }

    let mut cloud_chats = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &chats_id).await {
        for f in files {
            cloud_chats.insert(f.name.to_lowercase(), (f.id, f.modified_time.unwrap_or_default()));
        }
    }

    let mut cloud_personas = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &personas_id).await {
        for f in files {
            cloud_personas.insert(f.name.to_lowercase(), f.id);
        }
    }

    let mut cloud_avatars = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &avatars_id).await {
        for f in files {
            cloud_avatars.insert(f.name.to_lowercase(), f.id);
        }
    }

    // --- User Personas ---
    let personas = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        database::get_user_personas(&conn).map_err(|e| e.to_string())?
    };

    let total_p = personas.len();
    for (i, p) in personas.into_iter().enumerate() {
        let _ = app_handle.emit("sync-progress", format!("Pushing Personas ({}/{})", i + 1, total_p));
        let name = format!("{}.json", p.name);
        let content = serde_json::to_vec(&p).map_err(|e| e.to_string())?;
        let existing_id = cloud_personas.get(&name.to_lowercase()).map(|s| s.as_str());
        let _ = crate::google_drive_manager::upload_file(&token, &name, &personas_id, content, existing_id).await;

        if !p.avatar.is_empty() && p.avatar != "user_default.png" {
            let avatar_path = avatars_dir.join(&p.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let avatar_name = &p.avatar;
                    let existing_avatar_id = cloud_avatars.get(&avatar_name.to_lowercase()).map(|s| s.as_str());
                    let _ = crate::google_drive_manager::upload_file(&token, avatar_name, &avatars_id, bytes, existing_avatar_id).await;
                }
            }
        }
    }

    // --- Characters ---
    let chars = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        database::get_characters(&conn).map_err(|e| e.to_string())?
    };

    let total_c = chars.len();
    for (i, char) in chars.into_iter().enumerate() {
        let name = format!("{}.json", char.uuid);
        let local_iso_time = db_time_to_iso(&char.updated_at);
        
        let mut existing_id = None;
        if let Some((id, cloud_mod)) = cloud_chars.get(&name.to_lowercase()) {
            existing_id = Some(id.as_str());
            if !local_iso_time.is_empty() && !cloud_mod.is_empty() && cloud_mod >= &local_iso_time {
                continue;
            }
        }
        
        let _ = app_handle.emit("sync-progress", format!("Pushing Characters ({}/{})", i + 1, total_c));
        let content = serde_json::to_vec(&char).map_err(|e| e.to_string())?;
        if let Err(e) = crate::google_drive_manager::upload_file(&token, &name, &chars_id, content, existing_id).await {
            eprintln!("SYNC ERROR: Failed to upload character {}: {}", name, e);
        }

        // Push Avatar
        if !char.avatar.is_empty() && char.avatar != "default.png" {
            let avatar_path = avatars_dir.join(&char.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let avatar_name = &char.avatar;
                    let existing_avatar_id = cloud_avatars.get(&avatar_name.to_lowercase()).map(|s| s.as_str());
                    let _ = crate::google_drive_manager::upload_file(&token, avatar_name, &avatars_id, bytes, existing_avatar_id).await;
                }
            }
        }
    }

    // --- Groups ---
    let groups = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        database::export_cloud_groups(&conn).unwrap_or_default()
    };

    let total_g = groups.len();
    for (i, group) in groups.into_iter().enumerate() {
        let name = format!("{}.json", group.uuid);
        let local_iso_time = db_time_to_iso(&group.updated_at);
        
        let mut existing_id = None;
        if let Some((id, cloud_mod)) = cloud_groups.get(&name.to_lowercase()) {
            existing_id = Some(id.as_str());
            if !local_iso_time.is_empty() && !cloud_mod.is_empty() && cloud_mod >= &local_iso_time {
                continue;
            }
        }
        
        let _ = app_handle.emit("sync-progress", format!("Pushing Groups ({}/{})", i + 1, total_g));
        let content = serde_json::to_vec(&group).map_err(|e| e.to_string())?;
        crate::google_drive_manager::upload_file(&token, &name, &groups_id, content, existing_id).await?;
        
        // Push Group Avatar
        if !group.avatar.is_empty() && group.avatar != "default.png" {
            let avatar_path = avatars_dir.join(&group.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let avatar_name = &group.avatar;
                    let existing_avatar_id = cloud_avatars.get(&avatar_name.to_lowercase()).map(|s| s.as_str());
                    let _ = crate::google_drive_manager::upload_file(&token, avatar_name, &avatars_id, bytes, existing_avatar_id).await;
                }
            }
        }
    }

    // --- Chats ---
    let chat_rows: Vec<(i64, String, String)> = {
        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut stmt = conn.prepare("SELECT id, uuid, updated_at FROM chats").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((
            row.get::<_, i64>(0)?, 
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?.unwrap_or_default()
        )))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        rows
    };

    let total_chats = chat_rows.len();
    for (i, (id, uuid, updated_at)) in chat_rows.into_iter().enumerate() {
        let name = format!("{}.jsonl", uuid);
        let local_iso_time = db_time_to_iso(&updated_at);

        let mut existing_id = None;
        if let Some((cid, cloud_mod)) = cloud_chats.get(&name.to_lowercase()) {
            existing_id = Some(cid.as_str());
            if !local_iso_time.is_empty() && !cloud_mod.is_empty() && cloud_mod >= &local_iso_time {
                continue;
            }
        }

        let _ = app_handle.emit("sync-progress", format!("Pushing Chats ({}/{})", i + 1, total_chats));
        // Re-acquire lock to export single chat
        let jsonl = {
            let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            database::export_chat_jsonl(&conn, id).map_err(|e| e.to_string())?
        };
        
        if let Err(e) = crate::google_drive_manager::upload_file(&token, &name, &chats_id, jsonl.into_bytes(), existing_id).await {
            eprintln!("SYNC ERROR: Failed to upload chat {}: {}", name, e);
        }
    }

    let _ = app_handle.emit("sync-progress", "Done!");
    Ok(())
}

async fn pull_gdrive(app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    let token = get_valid_gdrive_token(&db_state).await?;
    let _ = app_handle.emit("sync-progress", "Starting Pull...");

    let avatars_dir = get_avatars_dir(&app_handle);

    // Resolve folders
    let root_id = crate::google_drive_manager::get_or_create_folder(&token, "TavernRev", None).await?;
    let personas_id = crate::google_drive_manager::get_or_create_folder(&token, "personas", Some(&root_id)).await?;
    let chars_id = crate::google_drive_manager::get_or_create_folder(&token, "characters", Some(&root_id)).await?;
    let groups_id = crate::google_drive_manager::get_or_create_folder(&token, "groups", Some(&root_id)).await?;
    let chats_id = crate::google_drive_manager::get_or_create_folder(&token, "chats", Some(&root_id)).await?;
    let avatars_id = crate::google_drive_manager::get_or_create_folder(&token, "avatars", Some(&root_id)).await?;

    let mut cloud_avatars = std::collections::HashMap::new();
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &avatars_id).await {
        for f in files {
            cloud_avatars.insert(f.name.to_lowercase(), f.id);
        }
    }

    // --- 0. Sync Personas ---
    let _ = app_handle.emit("sync-progress", "Scanning Personas...");
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &personas_id).await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let name = file.name;
            if !name.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Personas ({}/{})", i + 1, total));
            println!("SYNC: Downloading persona {}", name);
            if let Ok(bytes) = crate::google_drive_manager::download_file(&token, &file.id).await {
                if let Ok(persona) = serde_json::from_slice::<database::UserPersona>(&bytes) {
                    {
                        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                        let existing = database::get_user_personas(&conn).unwrap_or_default();
                        if let Some(existing_p) = existing.iter().find(|p| p.name == persona.name) {
                            let mut updated = persona.clone();
                            updated.id = existing_p.id;
                            let _ = database::update_user_persona(&conn, &updated);
                        } else {
                            let _ = database::create_user_persona(&conn, &persona.name, &persona.avatar, &persona.description);
                        }
                    }

                    if !persona.avatar.is_empty() && persona.avatar != "user_default.png" {
                        let local_path = avatars_dir.join(&persona.avatar);
                        if !local_path.exists() {
                            if let Some(avatar_id) = cloud_avatars.get(&persona.avatar.to_lowercase()) {
                                if let Ok(avatar_bytes) = crate::google_drive_manager::download_file(&token, avatar_id).await {
                                    let _ = std::fs::create_dir_all(&avatars_dir);
                                if let Err(e) = std::fs::write(&local_path, avatar_bytes) {
                                    println!("SYNC: Failed to write avatar file {:?}: {}", local_path, e);
                                }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 1. Sync Characters ---
    let _ = app_handle.emit("sync-progress", "Scanning Characters...");
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &chars_id).await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let name = file.name;
            if !name.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Characters ({}/{})", i + 1, total));

            // Delta Sync Check
            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                if let Ok(Some(id)) = database::find_character_by_uuid(&conn, uuid) {
                    if let Ok(mut stmt) = conn.prepare("SELECT updated_at FROM characters WHERE id = ?1") {
                        if let Ok(updated) = stmt.query_row(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                            local_updated_at = db_time_to_iso(&updated);
                        }
                    }
                }
            }

            let cloud_mod = file.modified_time.unwrap_or_default();
            if !local_updated_at.is_empty() && local_updated_at >= cloud_mod {
                continue;
            }

            println!("SYNC: Downloading character {}", name);
            let bytes = crate::google_drive_manager::download_file(&token, &file.id).await?;
            let char: database::Character = serde_json::from_slice(&bytes).map_err(|e| format!("Decode error for {}: {}", name, e))?;
            
            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let existing_id = database::find_character_by_uuid(&conn, &char.uuid).map_err(|e| e.to_string())?;
                
                if let Some(id) = existing_id {
                    let mut updated_char = char.clone();
                    updated_char.id = id;
                    database::update_character(&conn, &updated_char).map_err(|e| e.to_string())?;
                    println!("SYNC: Updated character {} (ID: {})", updated_char.name, id);
                    let _ = database::unpack_character_lorebook(&conn, id, &updated_char.card_data);
                } else {
                    let new_id = database::create_character(&conn, &char).map_err(|e| e.to_string())?;
                    println!("SYNC: Created character {} (ID: {})", char.name, new_id);
                    let _ = database::unpack_character_lorebook(&conn, new_id, &char.card_data);
                }
            } // Lock released here

            // Pull Avatar if missing
            if !char.avatar.is_empty() && char.avatar != "default.png" {
                let local_path = avatars_dir.join(&char.avatar);
                if !local_path.exists() {
                    if let Some(avatar_id) = cloud_avatars.get(&char.avatar.to_lowercase()) {
                        if let Ok(avatar_bytes) = crate::google_drive_manager::download_file(&token, avatar_id).await {
                            let _ = std::fs::write(local_path, avatar_bytes);
                        }
                    }
                }
            }
        }
    }

    // --- Groups ---
    let _ = app_handle.emit("sync-progress", "Scanning Groups...");
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &groups_id).await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let name = file.name;
            if !name.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Groups ({}/{})", i + 1, total));

            // Delta Sync Check
            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                if let Ok(updated) = conn.query_row("SELECT updated_at FROM groups WHERE uuid = ?1", rusqlite::params![uuid], |row| row.get::<_, String>(0)) {
                    local_updated_at = db_time_to_iso(&updated);
                }
            }
            if let Some(cloud_mod) = file.modified_time {
                if !local_updated_at.is_empty() && !cloud_mod.is_empty() && cloud_mod <= local_updated_at {
                    continue; // Local is newer or identical
                }
            }

            if let Ok(bytes) = crate::google_drive_manager::download_file(&token, &file.id).await {
                if let Ok(group_data) = serde_json::from_slice::<database::CloudGroup>(&bytes) {
                    {
                        let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                        let _ = database::import_cloud_group(&conn, &group_data);
                    }

                    // Pull Group Avatar
                    if !group_data.avatar.is_empty() && group_data.avatar != "default.png" {
                        if let Some(avatar_id) = cloud_avatars.get(&group_data.avatar.to_lowercase()) {
                            let avatar_path = avatars_dir.join(&group_data.avatar);
                            if !avatar_path.exists() {
                                if let Ok(avatar_bytes) = crate::google_drive_manager::download_file(&token, avatar_id).await {
                                    let _ = std::fs::create_dir_all(&avatars_dir);
                                    if let Err(e) = std::fs::write(&avatar_path, avatar_bytes) {
                                        println!("SYNC: Failed to write group avatar file {:?}: {}", avatar_path, e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 2. Sync Chats ---
    let _ = app_handle.emit("sync-progress", "Scanning Chats...");
    if let Ok(files) = crate::google_drive_manager::list_folder(&token, &chats_id).await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let name = file.name;
            if !name.ends_with(".jsonl") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Chats ({}/{})", i + 1, total));

            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if uuid.is_empty() { continue; }

            {
                let conn = db_state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                if let Ok(Some(id)) = database::find_chat_by_uuid(&conn, uuid) {
                    if let Ok(mut stmt) = conn.prepare("SELECT updated_at FROM chats WHERE id = ?1") {
                        if let Ok(updated) = stmt.query_row(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                            local_updated_at = db_time_to_iso(&updated);
                        }
                    }
                }
            }

            let cloud_mod = file.modified_time.unwrap_or_default();
            if !local_updated_at.is_empty() && local_updated_at >= cloud_mod {
                continue;
            }

            println!("SYNC: Downloading chat {}", name);
            let bytes = crate::google_drive_manager::download_file(&token, &file.id).await?;
            let data = String::from_utf8(bytes).map_err(|e| format!("UTF8 error for {}: {}", name, e))?;
            
            println!("SYNC: Processing chat UUID {}", uuid);

            let header_str = data.lines().next().ok_or("Empty chat file")?;
            let header: serde_json::Value = serde_json::from_str(header_str).map_err(|e| e.to_string())?;
            let char_name = header["character_name"].as_str().unwrap_or("Unknown");
            let char_uuid = header["character_uuid"].as_str().unwrap_or("");

            let conn = db_state.0.lock().unwrap();
            
            // Find character by UUID
            let char_id = if !char_uuid.is_empty() {
                 database::find_character_by_uuid(&conn, char_uuid).unwrap_or(None)
            } else { None };

            let final_char_id = match char_id {
                Some(id) => id,
                None => {
                    // Fallback to name
                    if let Ok(chars) = database::get_characters(&conn) {
                        if let Some(c) = chars.iter().find(|c| c.name == char_name) {
                            c.id
                        } else {
                            eprintln!("Warning: Character {} (UUID: {}) not found locally. Skipping chat sync.", char_name, char_uuid);
                            continue;
                        }
                    } else {
                        continue;
                    }
                }
            };

            if let Err(e) = database::import_chat_jsonl_data(&conn, final_char_id, &data, Some(uuid)) {
                eprintln!("SYNC ERROR: Failed to import chat {}: {}", uuid, e);
            }        }
    }

    let _ = app_handle.emit("sync-progress", "Done!");
    Ok(())
}

#[tauri::command]
pub async fn sync_push_chat(chat_id: i64, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    let (uuid, jsonl) = {
        let conn = db_state.0.lock().unwrap();
        let uuid: String = conn.query_row("SELECT uuid FROM chats WHERE id = ?1", rusqlite::params![chat_id], |r| r.get(0)).map_err(|e| e.to_string())?;
        let jsonl = database::export_chat_jsonl(&conn, chat_id).map_err(|e| e.to_string())?;
        (uuid, jsonl)
    };
    let name = format!("{}.jsonl", uuid);

    let provider = {
        let conn = db_state.0.lock().unwrap();
        if conn.query_row("SELECT token FROM cloud_tokens WHERE provider = 'gdrive'", [], |_| Ok(())).is_ok() {
            "gdrive"
        } else if conn.query_row("SELECT token FROM cloud_tokens WHERE provider = 'dropbox'", [], |_| Ok(())).is_ok() {
            "dropbox"
        } else {
            ""
        }
    };

    if provider == "gdrive" {
        if let Ok(token) = get_valid_gdrive_token(&db_state).await {
            let root_id = crate::google_drive_manager::get_or_create_folder(&token, "TavernRev", None).await.unwrap_or_default();
            if !root_id.is_empty() {
                let chats_id = crate::google_drive_manager::get_or_create_folder(&token, "chats", Some(&root_id)).await.unwrap_or_default();
                let mut existing_id = None;
                if let Ok(files) = crate::google_drive_manager::list_folder(&token, &chats_id).await {
                    if let Some(f) = files.into_iter().find(|f| f.name.to_lowercase() == name.to_lowercase()) {
                        existing_id = Some(f.id);
                    }
                }
                let _ = crate::google_drive_manager::upload_file(&token, &name, &chats_id, jsonl.into_bytes(), existing_id.as_deref()).await;
                println!("Auto-sync (GDrive) complete for chat: {}", name);
            }
        }
    } else if provider == "dropbox" {
        if let Ok(token) = get_valid_token(&db_state).await {
            let path = format!("/chats/{}", name);
            let _ = crate::sync_manager::upload_file(&token, &path, jsonl.into_bytes(), None).await;
            println!("Auto-sync (Dropbox) complete for chat: {}", name);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_push_all(provider: String, app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    if provider == "gdrive" {
        return push_gdrive(app_handle, db_state).await;
    }
    
    let token = get_valid_token(&db_state).await?;
    let _ = app_handle.emit("sync-progress", "Starting Push...");

    let avatars_dir = get_avatars_dir(&app_handle);

    let mut cloud_chars = std::collections::HashMap::new();
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/characters").await {
        for f in files {
            cloud_chars.insert(f.path.to_lowercase(), f.client_modified);
        }
    }

    let mut cloud_chats = std::collections::HashMap::new();
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/chats").await {
        for f in files {
            cloud_chats.insert(f.path.to_lowercase(), f.client_modified);
        }
    }

    // --- User Personas ---
    let personas = {
        let conn = db_state.0.lock().unwrap();
        database::get_user_personas(&conn).map_err(|e| e.to_string())?
    };

    let total_p = personas.len();
    for (i, p) in personas.into_iter().enumerate() {
        let _ = app_handle.emit("sync-progress", format!("Pushing Personas ({}/{})", i + 1, total_p));
        let path = format!("/personas/{}.json", p.name);
        let content = serde_json::to_vec(&p).map_err(|e| e.to_string())?;
        let _ = crate::sync_manager::upload_file(&token, &path, content, None).await;

        if !p.avatar.is_empty() && p.avatar != "user_default.png" {
            let avatar_path = avatars_dir.join(&p.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let cloud_path = format!("/avatars/{}", p.avatar);
                    let _ = crate::sync_manager::upload_file(&token, &cloud_path, bytes, None).await;
                }
            }
        }
    }

    // --- Characters ---
    let chars = {
        let conn = db_state.0.lock().unwrap();
        database::get_characters(&conn).map_err(|e| e.to_string())?
    };

    let total_c = chars.len();
    for (i, char) in chars.into_iter().enumerate() {
        let path = format!("/characters/{}.json", char.uuid);
        let local_iso_time = db_time_to_iso(&char.updated_at);
        
        if let Some(cloud_mod) = cloud_chars.get(&path.to_lowercase()) {
            if !local_iso_time.is_empty() && iso_to_timestamp(&cloud_mod) >= iso_to_timestamp(&local_iso_time) {
                continue;
            }
        }
        
        let _ = app_handle.emit("sync-progress", format!("Pushing Characters ({}/{})", i + 1, total_c));
        let content = serde_json::to_vec(&char).map_err(|e| e.to_string())?;
        let time_arg = if local_iso_time.is_empty() { None } else { Some(local_iso_time.as_str()) };
        if let Err(e) = crate::sync_manager::upload_file(&token, &path, content, time_arg).await {
            eprintln!("SYNC ERROR: Failed to upload character {}: {}", path, e);
        }

        // Push Avatar
        if !char.avatar.is_empty() && char.avatar != "default.png" {
            let avatar_path = avatars_dir.join(&char.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let cloud_path = format!("/avatars/{}", char.avatar);
                    let _ = crate::sync_manager::upload_file(&token, &cloud_path, bytes, None).await;
                }
            }
        }
    }

    // --- Groups ---
    let groups = {
        let conn = db_state.0.lock().unwrap();
        database::export_cloud_groups(&conn).unwrap_or_default()
    };
    
    let mut cloud_groups = std::collections::HashMap::new();
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/groups").await {
        for f in files {
            cloud_groups.insert(f.path.to_lowercase(), f.client_modified);
        }
    }

    let total_g = groups.len();
    for (i, group) in groups.into_iter().enumerate() {
        let name = format!("{}.json", group.uuid);
        let path = format!("/groups/{}", name);
        let local_iso_time = db_time_to_iso(&group.updated_at);
        
        if let Some(cloud_mod) = cloud_groups.get(&path.to_lowercase()) {
            if !local_iso_time.is_empty() && iso_to_timestamp(&cloud_mod) >= iso_to_timestamp(&local_iso_time) {
                continue;
            }
        }
        
        let _ = app_handle.emit("sync-progress", format!("Pushing Groups ({}/{})", i + 1, total_g));
        let content = serde_json::to_vec(&group).map_err(|e| e.to_string())?;
        let time_arg = if local_iso_time.is_empty() { None } else { Some(local_iso_time.as_str()) };
        let _ = crate::sync_manager::upload_file(&token, &path, content, time_arg).await;
        
        // Push Group Avatar
        if !group.avatar.is_empty() && group.avatar != "default.png" {
            let avatar_path = avatars_dir.join(&group.avatar);
            if avatar_path.exists() {
                if let Ok(bytes) = std::fs::read(&avatar_path) {
                    let cloud_path = format!("/avatars/{}", group.avatar);
                    let _ = crate::sync_manager::upload_file(&token, &cloud_path, bytes, None).await;
                }
            }
        }
    }

    // --- Chats ---
    let chat_rows: Vec<(i64, String, String)> = {
        let conn = db_state.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, uuid, updated_at FROM chats").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((
            row.get::<_, i64>(0)?, 
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?.unwrap_or_default()
        )))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        rows
    };

    let total_chats = chat_rows.len();
    for (i, (id, uuid, updated_at)) in chat_rows.into_iter().enumerate() {
        let path = format!("/chats/{}.jsonl", uuid);
        let local_iso_time = db_time_to_iso(&updated_at);

        if let Some(cloud_mod) = cloud_chats.get(&path.to_lowercase()) {
            if !local_iso_time.is_empty() && iso_to_timestamp(&cloud_mod) >= iso_to_timestamp(&local_iso_time) {
                continue;
            }
        }

        let _ = app_handle.emit("sync-progress", format!("Pushing Chats ({}/{})", i + 1, total_chats));
        // Re-acquire lock to export single chat
        let jsonl = {
            let conn = db_state.0.lock().unwrap();
            database::export_chat_jsonl(&conn, id).map_err(|e| e.to_string())?
        };
        
        let time_arg = if local_iso_time.is_empty() { None } else { Some(local_iso_time.as_str()) };
        if let Err(e) = crate::sync_manager::upload_file(&token, &path, jsonl.into_bytes(), time_arg).await {
            eprintln!("SYNC ERROR: Failed to upload chat {}: {}", path, e);
        }
    }

    let _ = app_handle.emit("sync-progress", "Done!");
    Ok(())
}

#[tauri::command]
pub async fn sync_pull_all(provider: String, app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    if provider == "gdrive" {
        return pull_gdrive(app_handle, db_state).await;
    }

    let token = get_valid_token(&db_state).await?;
    let _ = app_handle.emit("sync-progress", "Starting Pull...");

    let avatars_dir = get_avatars_dir(&app_handle);

    // --- 0. Sync Personas ---
    let _ = app_handle.emit("sync-progress", "Scanning Personas...");
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/personas").await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let path = file.path;
            if !path.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Personas ({}/{})", i + 1, total));
            println!("SYNC: Downloading persona {}", path);
            if let Ok(bytes) = crate::sync_manager::download_file(&token, &path).await {
                if let Ok(persona) = serde_json::from_slice::<database::UserPersona>(&bytes) {
                    {
                        let conn = db_state.0.lock().unwrap();
                        let existing = database::get_user_personas(&conn).unwrap_or_default();
                        if let Some(existing_p) = existing.iter().find(|p| p.name == persona.name) {
                            let mut updated = persona.clone();
                            updated.id = existing_p.id;
                            let _ = database::update_user_persona(&conn, &updated);
                        } else {
                            let _ = database::create_user_persona(&conn, &persona.name, &persona.avatar, &persona.description);
                        }
                    }

                    if !persona.avatar.is_empty() && persona.avatar != "user_default.png" {
                        let local_path = avatars_dir.join(&persona.avatar);
                        if !local_path.exists() {
                            let cloud_path = format!("/avatars/{}", persona.avatar);
                            if let Ok(avatar_bytes) = crate::sync_manager::download_file(&token, &cloud_path).await {
                                let _ = std::fs::create_dir_all(&avatars_dir);
                                if let Err(e) = std::fs::write(&local_path, avatar_bytes) {
                                    println!("SYNC: Failed to write avatar file {:?}: {}", local_path, e);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 1. Sync Characters ---
    let _ = app_handle.emit("sync-progress", "Scanning Characters...");
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/characters").await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let path = file.path;
            if !path.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Characters ({}/{})", i + 1, total));

            // Delta Sync Check
            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            {
                let conn = db_state.0.lock().unwrap();
                if let Ok(Some(id)) = database::find_character_by_uuid(&conn, uuid) {
                    if let Ok(mut stmt) = conn.prepare("SELECT updated_at FROM characters WHERE id = ?1") {
                        if let Ok(updated) = stmt.query_row(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                            local_updated_at = db_time_to_iso(&updated);
                        }
                    }
                }
            }

            if !local_updated_at.is_empty() && local_updated_at >= file.client_modified {
                continue;
            }

            println!("SYNC: Downloading character {}", path);
            let bytes = crate::sync_manager::download_file(&token, &path).await?;
            let char: database::Character = serde_json::from_slice(&bytes).map_err(|e| format!("Decode error for {}: {}", path, e))?;
            
            {
                let conn = db_state.0.lock().unwrap();
                let existing_id = database::find_character_by_uuid(&conn, &char.uuid).map_err(|e| e.to_string())?;
                
                if let Some(id) = existing_id {
                    let mut updated_char = char.clone();
                    updated_char.id = id;
                    database::update_character(&conn, &updated_char).map_err(|e| e.to_string())?;
                    println!("SYNC: Updated character {} (ID: {})", updated_char.name, id);
                    // Repack lorebook just in case it changed
                    let _ = database::unpack_character_lorebook(&conn, id, &updated_char.card_data);
                } else {
                    let new_id = database::create_character(&conn, &char).map_err(|e| e.to_string())?;
                    println!("SYNC: Created character {} (ID: {})", char.name, new_id);
                    let _ = database::unpack_character_lorebook(&conn, new_id, &char.card_data);
                }
            } // Lock released here

            // Pull Avatar if missing
            if !char.avatar.is_empty() && char.avatar != "default.png" {
                let local_path = avatars_dir.join(&char.avatar);
                if !local_path.exists() {
                    let cloud_path = format!("/avatars/{}", char.avatar);
                    if let Ok(avatar_bytes) = crate::sync_manager::download_file(&token, &cloud_path).await {
                        let _ = std::fs::write(local_path, avatar_bytes);
                    }
                }
            }
        }
    }

    // --- Groups ---
    let _ = app_handle.emit("sync-progress", "Scanning Groups...");
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/groups").await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let path = file.path;
            if !path.ends_with(".json") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Groups ({}/{})", i + 1, total));

            // Delta Sync Check
            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            {
                let conn = db_state.0.lock().unwrap();
                if let Ok(updated) = conn.query_row("SELECT updated_at FROM groups WHERE uuid = ?1", rusqlite::params![uuid], |row| row.get::<_, String>(0)) {
                    local_updated_at = db_time_to_iso(&updated);
                }
            }
            let cloud_mod = file.client_modified;
            if !local_updated_at.is_empty() && cloud_mod <= local_updated_at {
                continue; // Local is newer or identical
            }

            if let Ok(bytes) = crate::sync_manager::download_file(&token, &path).await {
                if let Ok(group_data) = serde_json::from_slice::<database::CloudGroup>(&bytes) {
                    {
                        let conn = db_state.0.lock().unwrap();
                        let _ = database::import_cloud_group(&conn, &group_data);
                    }

                    // Pull Avatar
                    if !group_data.avatar.is_empty() && group_data.avatar != "default.png" {
                        let local_path = avatars_dir.join(&group_data.avatar);
                        if !local_path.exists() {
                            let cloud_path = format!("/avatars/{}", group_data.avatar);
                            if let Ok(avatar_bytes) = crate::sync_manager::download_file(&token, &cloud_path).await {
                                let _ = std::fs::create_dir_all(&avatars_dir);
                                if let Err(e) = std::fs::write(&local_path, avatar_bytes) {
                                    println!("SYNC: Failed to write avatar file {:?}: {}", local_path, e);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 2. Sync Chats ---
    let _ = app_handle.emit("sync-progress", "Scanning Chats...");
    if let Ok(files) = crate::sync_manager::list_folder(&token, "/chats").await {
        let total = files.len();
        for (i, file) in files.into_iter().enumerate() {
            let path = file.path;
            if !path.ends_with(".jsonl") { continue; }
            let _ = app_handle.emit("sync-progress", format!("Pulling Chats ({}/{})", i + 1, total));

            let mut local_updated_at = String::new();
            let uuid = std::path::Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if uuid.is_empty() { continue; }

            {
                let conn = db_state.0.lock().unwrap();
                if let Ok(Some(id)) = database::find_chat_by_uuid(&conn, uuid) {
                    if let Ok(mut stmt) = conn.prepare("SELECT updated_at FROM chats WHERE id = ?1") {
                        if let Ok(updated) = stmt.query_row(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                            local_updated_at = db_time_to_iso(&updated);
                        }
                    }
                }
            }

            if !local_updated_at.is_empty() && local_updated_at >= file.client_modified {
                continue;
            }

            println!("SYNC: Downloading chat {}", path);
            let bytes = crate::sync_manager::download_file(&token, &path).await?;
            let data = String::from_utf8(bytes).map_err(|e| format!("UTF8 error for {}: {}", path, e))?;
            
            println!("SYNC: Processing chat UUID {}", uuid);

            let header_str = data.lines().next().ok_or("Empty chat file")?;
            let header: serde_json::Value = serde_json::from_str(header_str).map_err(|e| e.to_string())?;
            let char_name = header["character_name"].as_str().unwrap_or("Unknown");
            let char_uuid = header["character_uuid"].as_str().unwrap_or("");

            let conn = db_state.0.lock().unwrap();
            
            // Find character by UUID
            let char_id = if !char_uuid.is_empty() {
                 database::find_character_by_uuid(&conn, char_uuid).unwrap_or(None)
            } else { None };

            let final_char_id = match char_id {
                Some(id) => id,
                None => {
                    // Fallback to name
                    if let Ok(chars) = database::get_characters(&conn) {
                        if let Some(c) = chars.iter().find(|c| c.name == char_name) {
                            c.id
                        } else {
                            eprintln!("Warning: Character {} (UUID: {}) not found locally. Skipping chat sync.", char_name, char_uuid);
                            continue;
                        }
                    } else {
                        continue;
                    }
                }
            };

            if let Err(e) = database::import_chat_jsonl_data(&conn, final_char_id, &data, Some(uuid)) {
                eprintln!("SYNC ERROR: Failed to import chat {}: {}", uuid, e);
            }        }
    }

    let _ = app_handle.emit("sync-progress", "Done!");
    Ok(())
}

#[tauri::command]
pub fn get_startup_error(state: tauri::State<StartupError>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_last_prompt(state: tauri::State<LastPrompt>) -> String {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub async fn init_vector_model(app_handle: AppHandle, model_name: String) -> Result<String, String> {
    vector_memory::init_model(Some(&app_handle), &model_name)?;
    Ok(format!("Model {} initialized successfully", model_name))
}

#[tauri::command]
pub async fn init_custom_vector_model(_app_handle: AppHandle, folder_path: String) -> Result<String, String> {
    vector_memory::init_custom_model(&folder_path)?;
    Ok("Custom model initialized successfully".to_string())
}

#[tauri::command]
pub async fn build_chat_index(chat_id: i64, chunk_size: usize, overlap: usize, config: vector_memory::RagConfig, db_state: tauri::State<'_, DbState>) -> Result<usize, String> {
    vector_memory::build_chat_index(&*db_state, chat_id, chunk_size, overlap, &config).await
}

#[tauri::command]
pub async fn build_lorebook_index(chat_id: i64, chunk_size: usize, overlap: usize, config: vector_memory::RagConfig, db_state: tauri::State<'_, DbState>) -> Result<usize, String> {
    let char_id = {
        let conn = db_state.0.lock().unwrap();
        conn.query_row("SELECT character_id FROM chats WHERE id = ?1", [chat_id], |r| r.get::<_, i64>(0)).unwrap_or(0)
    };
    vector_memory::build_lorebook_index(&*db_state, char_id, chat_id, chunk_size, overlap, &config).await
}

#[tauri::command]
pub async fn query_chat_memory(chat_id: i64, query_text: String, config: vector_memory::RagConfig, db_state: tauri::State<'_, DbState>) -> Result<Vec<vector_memory::RetrievalResult>, String> {
    vector_memory::query_chat_memory(&*db_state, chat_id, &query_text, &config).await
}

#[tauri::command]
pub async fn generate_image_horde(
    app_handle: AppHandle,
    api_key: String,
    prompt: String,
    model: String,
    width: i32,
    height: i32,
    steps: i32,
    sampler: String,
    cfg_scale: f32,
) -> Result<String, String> {
    crate::image_gen::generate_image_horde(
        app_handle, api_key, prompt, model, width, height, steps, sampler, cfg_scale,
        true, true, false, true, false, String::new(),
    ).await
}

#[tauri::command]
pub async fn generate_image_stateless(
    app_handle: AppHandle,
    preset_name: String,
    prompt: String,
) -> Result<String, String> {
    println!("DEBUG: generate_image_stateless called! preset={}, prompt={}", preset_name, prompt);
    let presets_dir = crate::commands::get_presets_dir(&app_handle);
    let safe_preset = crate::sanitize_filename(&preset_name);
    let preset_path = presets_dir.join(&safe_preset);
    let preset_content = std::fs::read_to_string(&preset_path)
        .map_err(|e| format!("File read error for {:?}: {}", preset_path, e))?;
    let preset: crate::api_client::Preset = serde_json::from_str(&preset_content)
        .map_err(|e| format!("Preset JSON parse error: {}. Content starts with: {}", e, &preset_content.chars().take(50).collect::<String>()))?;

    if preset.sd_provider == "auto" {
        crate::image_gen::generate_image_auto(
            app_handle,
            preset.sd_auto_url,
            preset.sd_auto_auth,
            prompt,
            preset.sd_width,
            preset.sd_height,
            preset.sd_steps,
            preset.sd_sampler,
            preset.sd_cfg_scale,
            preset.sd_auto_scheduler,
            preset.sd_auto_vae,
            preset.sd_auto_upscaler,
            preset.sd_auto_hires_steps,
            preset.sd_auto_clip_skip,
            preset.sd_auto_denoising,
            preset.sd_auto_upscale_by,
            preset.sd_hires_fix,
            preset.sd_restore_faces,
        ).await
    } else {
        crate::image_gen::generate_image_horde(
            app_handle,
            preset.sd_horde_api_key,
            prompt,
            preset.sd_model,
            preset.sd_width,
            preset.sd_height,
            preset.sd_steps,
            preset.sd_sampler,
            preset.sd_cfg_scale,
            preset.sd_allow_nsfw,
            preset.sd_sanitize_prompts,
            preset.sd_restore_faces,
            preset.sd_karras,
            preset.sd_hires_fix,
            preset.sd_seed,
        ).await
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct HordeModelInfo {
    pub name: String,
    pub count: f32,
    pub queued: f32,
    pub eta: f32,
}

#[tauri::command]
pub async fn get_horde_models() -> Result<Vec<HordeModelInfo>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://stablehorde.net/api/v2/status/models")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err("Failed to fetch models from AI Horde".to_string());
    }

    let mut models: Vec<HordeModelInfo> = res.json().await.map_err(|e| e.to_string())?;
    models.sort_by(|a, b| a.name.cmp(&b.name));
    
    Ok(models)
}

// --- A1111 Fetch Endpoints ---

fn sanitize_a1111_url(url: &str) -> String {
    let mut clean_url = url.trim_end_matches('/').to_string();
    if clean_url.ends_with("/sdapi/v1") {
        clean_url = clean_url.strip_suffix("/sdapi/v1").unwrap().to_string();
    } else if clean_url.ends_with("/api") {
        clean_url = clean_url.strip_suffix("/api").unwrap().to_string();
    }
    clean_url
}

async fn a1111_get(url: &str, auth: &str) -> Result<serde_json::Value, String> {
    println!("Fetching A1111 endpoint: {}", url);
    let client = reqwest::Client::new();
    let mut request = client.get(url);
    if !auth.is_empty() {
        let parts: Vec<&str> = auth.splitn(2, ':').collect();
        if parts.len() == 2 {
            request = request.basic_auth(parts[0], Some(parts[1]));
        }
    }
    let res = request.send().await.map_err(|e| format!("Request failed: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("A1111 API Error ({}): {}", status, err_text.chars().take(100).collect::<String>()));
    }
    res.json().await.map_err(|e| format!("JSON Parse Error: {}", e))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct A1111ModelInfo {
    pub title: String,
    pub model_name: String,
}

#[tauri::command]
pub async fn get_a1111_models(url: String, auth: String) -> Result<Vec<A1111ModelInfo>, String> {
    let endpoint = format!("{}/sdapi/v1/sd-models", sanitize_a1111_url(&url));
    let val = a1111_get(&endpoint, &auth).await?;
    let models: Vec<A1111ModelInfo> = serde_json::from_value(val).map_err(|e| e.to_string())?;
    Ok(models)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct A1111SamplerInfo {
    pub name: String,
}

#[tauri::command]
pub async fn get_a1111_samplers(url: String, auth: String) -> Result<Vec<A1111ModelInfo>, String> { // Reusing struct layout
    let endpoint = format!("{}/sdapi/v1/samplers", sanitize_a1111_url(&url));
    let val = a1111_get(&endpoint, &auth).await?;
    let mut samplers: Vec<A1111ModelInfo> = Vec::new();
    if let Some(arr) = val.as_array() {
        for s in arr {
            if let Some(name) = s.get("name").and_then(|n| n.as_str()) {
                samplers.push(A1111ModelInfo { title: name.to_string(), model_name: name.to_string() });
            }
        }
    }
    Ok(samplers)
}

#[tauri::command]
pub async fn get_a1111_vaes(url: String, auth: String) -> Result<Vec<A1111ModelInfo>, String> {
    let endpoint = format!("{}/sdapi/v1/sd-vae", sanitize_a1111_url(&url));
    let val = a1111_get(&endpoint, &auth).await?;
    let mut vaes: Vec<A1111ModelInfo> = vec![A1111ModelInfo { title: "Automatic".to_string(), model_name: "Automatic".to_string() }, A1111ModelInfo { title: "None".to_string(), model_name: "None".to_string() }];
    if let Some(arr) = val.as_array() {
        for v in arr {
            if let Some(name) = v.get("model_name").and_then(|n| n.as_str()) {
                vaes.push(A1111ModelInfo { title: name.to_string(), model_name: name.to_string() });
            }
        }
    }
    Ok(vaes)
}

#[tauri::command]
pub async fn get_a1111_upscalers(url: String, auth: String) -> Result<Vec<A1111ModelInfo>, String> {
    let endpoint = format!("{}/sdapi/v1/upscalers", sanitize_a1111_url(&url));
    let val = a1111_get(&endpoint, &auth).await?;
    let mut upscalers: Vec<A1111ModelInfo> = Vec::new();
    if let Some(arr) = val.as_array() {
        for u in arr {
            if let Some(name) = u.get("name").and_then(|n| n.as_str()) {
                upscalers.push(A1111ModelInfo { title: name.to_string(), model_name: name.to_string() });
            }
        }
    }
    Ok(upscalers)
}

#[tauri::command]
pub async fn get_a1111_schedulers(url: String, auth: String) -> Result<Vec<A1111ModelInfo>, String> {
    let endpoint = format!("{}/sdapi/v1/schedulers", sanitize_a1111_url(&url));
    let mut schedulers: Vec<A1111ModelInfo> = vec![
        A1111ModelInfo { title: "Automatic".to_string(), model_name: "Automatic".to_string() },
        A1111ModelInfo { title: "Uniform".to_string(), model_name: "Uniform".to_string() },
        A1111ModelInfo { title: "Karras".to_string(), model_name: "Karras".to_string() },
        A1111ModelInfo { title: "Exponential".to_string(), model_name: "Exponential".to_string() },
        A1111ModelInfo { title: "Polyexponential".to_string(), model_name: "Polyexponential".to_string() },
        A1111ModelInfo { title: "SGM Uniform".to_string(), model_name: "SGM Uniform".to_string() },
        A1111ModelInfo { title: "KL Optimal".to_string(), model_name: "KL Optimal".to_string() },
        A1111ModelInfo { title: "Align Your Steps".to_string(), model_name: "Align Your Steps".to_string() },
        A1111ModelInfo { title: "Simple".to_string(), model_name: "Simple".to_string() },
        A1111ModelInfo { title: "Normal".to_string(), model_name: "Normal".to_string() },
    ];
    
    // Attempt to fetch if endpoint exists, otherwise fallback to static list
    if let Ok(val) = a1111_get(&endpoint, &auth).await {
        if let Some(arr) = val.as_array() {
            schedulers.clear();
            for s in arr {
                if let Some(name) = s.get("name").and_then(|n| n.as_str()) {
                    schedulers.push(A1111ModelInfo { title: name.to_string(), model_name: name.to_string() });
                }
            }
        }
    }
    
    Ok(schedulers)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn install_android_update(app: AppHandle, url: String) -> Result<(), String> {
    use std::fs;
    use jni::objects::JValue;
    
    let cache_dir = app.path().app_cache_dir().map_err(|_| "Could not find cache dir")?;
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    let dest_path = cache_dir.join("update.apk");
    
    let mut response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    let dest_path_str = dest_path.to_string_lossy().to_string();
    
    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let activity = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };

    let j_path = env.new_string(&dest_path_str).map_err(|e| e.to_string())?;
    env.call_method(
        activity,
        "installApk",
        "(Ljava/lang/String;)V",
        &[JValue::Object(&j_path.into())]
    ).map_err(|e| format!("JNI Error: {:?}", e))?;

    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn install_android_update(_app: AppHandle, _url: String) -> Result<(), String> {
    Err("Only supported on Android".to_string())
}
