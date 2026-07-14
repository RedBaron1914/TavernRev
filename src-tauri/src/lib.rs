mod database;
pub mod message_extra;
pub mod lorebook;
pub mod prompt_engine;
mod importer;
use std::sync::{Arc, Mutex, atomic::AtomicBool};

// --- MODULES ---
mod api_client;
pub mod commands;
pub mod generation;
mod transformers;
pub mod script_engine;
pub mod sync_manager;
pub mod google_drive_manager;
pub mod routing;
pub mod vector_memory;
pub mod image_gen;

pub struct GenerationState(pub Mutex<Option<Arc<AtomicBool>>>);
pub struct StartupError(pub Mutex<Option<String>>);
pub struct LastPrompt(pub Mutex<String>);
pub struct ImageGenPromptState(pub Mutex<Option<tokio::sync::oneshot::Sender<String>>>);

use database::{init_db, DbState};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};




pub fn get_avatars_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
    app_dir.join("avatars")
}

pub fn sanitize_filename(name: &str) -> String {
    std::path::Path::new(name)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("unnamed")
        .to_string()
}

// --- Database Commands ---

#[cfg(not(target_os = "android"))]
fn init_logging() {}

#[cfg(target_os = "android")]
fn init_logging() {
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Info)
            .with_tag("TavernRev"),
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let startup_error = StartupError(Mutex::new(None));
            
            // Setup directories
            let presets_dir = commands::get_presets_dir(&handle);
            let _ = fs::create_dir_all(&presets_dir);
            let _ = commands::seed_default_preset(&presets_dir);
            
            let connections_dir = commands::get_connections_dir(&handle);
            let _ = fs::create_dir_all(&connections_dir);
            let _ = commands::seed_default_connection(&connections_dir);
            
            let avatars_dir = get_avatars_dir(&handle);
            let _ = fs::create_dir_all(&avatars_dir);
            
            let attachments_dir = commands::get_attachments_dir(&handle);
            let _ = fs::create_dir_all(&attachments_dir);

            // Safe Environment Setup for FastEmbed/ORT
            vector_memory::resolve_ort_dylib(&handle);
            #[cfg(target_os = "android")]
            if let Ok(cache_dir) = app.path().app_cache_dir() {
                std::env::set_var("HOME", cache_dir.clone());
                std::env::set_var("XDG_CACHE_HOME", cache_dir.clone());
                std::env::set_var("XDG_DATA_HOME", cache_dir.clone());
                
                let apk_path = cache_dir.join("update.apk");
                if apk_path.exists() {
                    if let Err(e) = std::fs::remove_file(&apk_path) {
                        log::warn!("Failed to delete old update.apk: {}", e);
                    } else {
                        log::info!("Cleaned up old update.apk");
                    }
                }
            }

            // Setup database
            match init_db(handle) {
                Ok(conn) => {
                    log::info!("Database initialized successfully");
                    app.manage(DbState(Mutex::new(conn)));
                },
                Err(e) => {
                    let err_msg = format!("CRITICAL: Database initialization failed.\nError: {}\n\nTry clearing app data or reinstalling.", e);
                    log::error!("{}", err_msg);
                    eprintln!("{}", err_msg);
                    *startup_error.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(err_msg);
                }
            }

            app.manage(GenerationState(Mutex::new(None)));
            app.manage(LastPrompt(Mutex::new(String::new())));
            app.manage(ImageGenPromptState(Mutex::new(None)));
            app.manage(startup_error);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_startup_error,
            commands::get_last_prompt,
            commands::init_vector_model,
            commands::init_custom_vector_model,
            commands::build_chat_index,
            commands::build_lorebook_index,
            commands::query_chat_memory,
            // GROUPS
            commands::create_group,
            commands::get_groups,
            commands::delete_group,
            commands::update_group,
            commands::get_group_members,
            commands::add_group_member,
            commands::remove_group_member,
            commands::toggle_group_member_mute,
            // DB
            commands::get_characters,
            commands::create_character,
            commands::create_character_full,
            commands::update_character,
            commands::delete_character,
            commands::export_character_json,
            commands::import_character_card,
            commands::get_user_personas,
            commands::create_user_persona,
            commands::update_user_persona,
            commands::delete_user_persona,
            commands::set_default_persona,
            commands::update_chat_persona,
            commands::create_chat,
            commands::rename_chat,
            commands::get_chats,
            commands::delete_chat,
            commands::export_chat_jsonl,
            commands::import_chat_jsonl,
            commands::save_export_file,
            commands::branch_chat,
            commands::get_messages,
            commands::get_messages_paged,
            commands::save_message,
            commands::edit_message,
            commands::set_message_prompt_excluded,
            commands::auto_exclude_context_overflow,
            commands::get_chat_message_stats,
            commands::get_context_stats,
            commands::get_auto_trim_enabled,
            commands::set_auto_trim_enabled,
            commands::delete_message,
            commands::get_chat_stats,
            commands::tokenize_text,
            commands::get_modules_token_counts,
            // Utils
            commands::count_tokens,
            commands::create_quick_reply,
            commands::update_quick_reply,
            commands::delete_quick_reply,
            commands::get_quick_replies,
            commands::create_regex_script,
            commands::update_regex_script,
            commands::delete_regex_script,
            commands::get_regex_scripts,
            commands::import_regex_scripts,
            commands::process_input,
            commands::read_image_base64,
            commands::upload_avatar,
            commands::upload_attachment,
            // Presets
            commands::list_presets,
            commands::load_preset,
            commands::get_preset,
            commands::save_preset,
            commands::delete_preset,
            // Connections
            commands::list_connection_profiles,
            commands::load_connection_profile,
            commands::save_connection_profile,
            commands::delete_connection_profile,
            // Lorebooks
            commands::get_lorebooks,
            commands::import_lorebook,
            commands::create_lorebook,
            commands::delete_lorebook,
            commands::get_lore_entries,
            commands::create_lore_entry,
            commands::update_lore_entry,
            commands::delete_lore_entry,
            commands::get_chat_lorebooks,
            commands::get_chat_lorebook_links,
            commands::toggle_chat_lorebook,
            commands::get_character_lorebooks,
            commands::get_character_lorebook_links,
            commands::toggle_character_lorebook,
            commands::toggle_global_lorebook,
            commands::set_global_lorebook_enabled,
            commands::set_lorebook_excluded_from_global,
            commands::set_chat_lorebook_enabled,
            commands::set_character_lorebook_enabled,
            commands::debug_lore_generation,
            // Prompting
            commands::assemble_prompt_command,
            commands::process_macros_command,
            commands::process_macros_debug,
            commands::generate_image_horde,
            commands::generate_image_stateless,
            commands::get_horde_models,
            commands::get_a1111_models,
            commands::get_a1111_samplers,
            commands::get_a1111_vaes,
            commands::get_a1111_upscalers,
            commands::get_a1111_schedulers,
            generation::confirm_image_prompt,
            generation::cancel_image_prompt,
            generation::generate_reply,
            generation::regenerate_reply,
            generation::continue_reply,
            generation::revert_message_tail,
            generation::impersonate_user,
            generation::swipe_message,
            generation::stop_generation,
            generation::sync_message_swipes,
            commands::connect_dropbox,
            commands::get_dropbox_status,
            commands::logout_dropbox,
            commands::connect_gdrive,
            commands::get_gdrive_status,
            commands::logout_gdrive,
            commands::sync_push_all,
            commands::sync_push_chat,
            commands::sync_pull_all,
            commands::save_extension_script,
            commands::delete_extension_script,
            commands::get_extension_scripts,
            commands::install_android_update,
            generation::summarize_chat,
            generation::studio_assist,
            generation::update_chat_memory,
            generation::save_studio_chats,
            generation::load_studio_chats,
            generation::generate_text_stateless,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

