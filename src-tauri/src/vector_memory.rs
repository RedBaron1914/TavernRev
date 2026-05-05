use fastembed::{TextEmbedding, InitOptions, EmbeddingModel, UserDefinedEmbeddingModel, TokenizerFiles, InitOptionsUserDefined};
use std::sync::{OnceLock, Mutex};
use std::fs;
use std::path::Path;
use tauri::Manager;

static EMBEDDING_MODEL: OnceLock<Mutex<Option<TextEmbedding>>> = OnceLock::new();

pub fn get_model() -> &'static Mutex<Option<TextEmbedding>> {
    EMBEDDING_MODEL.get_or_init(|| Mutex::new(None))
}

fn get_dylib_name() -> &'static str {
    #[cfg(target_os = "windows")]
    return "onnxruntime.dll";
    #[cfg(target_os = "android")]
    return "libonnxruntime.so";
    #[cfg(target_os = "macos")]
    return "libonnxruntime.dylib";
    #[cfg(all(not(target_os = "windows"), not(target_os = "android"), not(target_os = "macos")))]
    return "libonnxruntime.so";
}

#[allow(unused_variables)]
pub fn resolve_ort_dylib(app_handle: &tauri::AppHandle) {
    let dylib_name = get_dylib_name();
    
    #[cfg(target_os = "android")]
    {
        // Android automatically resolves libraries in jniLibs via dlopen,
        // so setting ORT_DYLIB_PATH is completely unnecessary and dangerous due to set_var panics.
    }

    #[cfg(not(target_os = "android"))]
    {
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let dll_path = resource_dir.join(dylib_name);
            if dll_path.exists() {
                std::env::set_var("ORT_DYLIB_PATH", dll_path);
                println!("VectorMemory: ORT_DYLIB_PATH set to bundled resource.");
            } else {
                let exe_dir = std::env::current_exe().unwrap_or_default();
                if let Some(parent) = exe_dir.parent() {
                    let exe_dll = parent.join(dylib_name);
                    if exe_dll.exists() {
                        std::env::set_var("ORT_DYLIB_PATH", exe_dll);
                    }
                }
            }
        }
    }
}

fn verify_dll_exists() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return Ok(()); // Skip strict path check on Android due to OS sandboxing
    }

    #[cfg(not(target_os = "android"))]
    {
        let dylib_name = get_dylib_name();
        if let Ok(p) = std::env::var("ORT_DYLIB_PATH") {
            if !Path::new(&p).exists() {
                return Err(format!("CRITICAL: {} not found at expected path: {}", dylib_name, p));
            }
        } else if !Path::new(dylib_name).exists() {
            return Err(format!("CRITICAL: {} is missing from the application folder. Please place it next to the executable.", dylib_name));
        }
        Ok(())
    }
}

pub fn init_model(app_handle: Option<&tauri::AppHandle>, model_name: &str) -> Result<(), String> {
    verify_dll_exists()?;
    
    let model_enum = match model_name {
        "MultilingualE5Small" => EmbeddingModel::MultilingualE5Small,
        "AllMiniLML6V2" => EmbeddingModel::AllMiniLML6V2,
        "NomicEmbedText" => EmbeddingModel::NomicEmbedTextV15,
        _ => EmbeddingModel::MultilingualE5Small,
    };
    
    println!("VectorMemory: Initializing model: {:?}", model_enum);
    
    let mut options = InitOptions::new(model_enum);
    options.show_download_progress = true;

    // Fix Android crash: explicitly set cache directory using Tauri's path resolver
    // hf-hub and dirs crates panic if HOME or cache directories are missing.
    // NOTE: Environment variables (HOME, XDG) are now safely set in lib.rs setup block!
    if let Some(app) = app_handle {
        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let fe_cache = cache_dir.join("fastembed");
            options.cache_dir = fe_cache.clone();
            
            #[cfg(target_os = "android")]
            {
                let _ = std::fs::create_dir_all(&fe_cache);
            }
        }
    }
    
    let model = TextEmbedding::try_new(options).map_err(|e| format!("Failed to load model: {}", e))?;
    
    *get_model().lock().unwrap() = Some(model);
    println!("VectorMemory: Model initialized successfully.");
    Ok(())
}

pub fn init_custom_model(folder_path: &str) -> Result<(), String> {
    let p = Path::new(folder_path);
    println!("VectorMemory: Loading custom model from: {:?}", p);
    
    let onnx_file = fs::read(p.join("model.onnx")).map_err(|e| format!("Missing model.onnx: {}", e))?;
    
    let tokenizer_files = TokenizerFiles {
        tokenizer_file: fs::read(p.join("tokenizer.json")).map_err(|e| format!("Missing tokenizer.json: {}", e))?,
        config_file: fs::read(p.join("config.json")).map_err(|e| format!("Missing config.json: {}", e))?,
        tokenizer_config_file: fs::read(p.join("tokenizer_config.json")).map_err(|e| format!("Missing tokenizer_config.json: {}", e))?,
        special_tokens_map_file: fs::read(p.join("special_tokens_map.json")).map_err(|e| format!("Missing special_tokens_map.json: {}", e))?,
    };
    
    let user_model = UserDefinedEmbeddingModel::new(onnx_file, tokenizer_files);
    
    let model = TextEmbedding::try_new_from_user_defined(user_model, InitOptionsUserDefined::default())
        .map_err(|e| format!("Failed to initialize custom model: {}", e))?;
    
    *get_model().lock().unwrap() = Some(model);
    println!("VectorMemory: Custom model initialized successfully.");
    Ok(())
}

pub async fn embed_texts(texts: Vec<&str>, config: &RagConfig) -> Result<Vec<Vec<f32>>, String> {
    if config.api_type == "api" {
        let texts_owned: Vec<String> = texts.into_iter().map(|s| s.to_string()).collect();
        crate::api_client::generate_embeddings(
            config.api_url.clone(),
            config.api_key.clone(),
            config.api_model.clone(),
            texts_owned
        ).await
    } else {
        let mut lock = get_model().lock().unwrap();
        let model = lock.as_mut().ok_or("Local embedding model is not initialized. Check RagSettingsTab.")?;

        let embeddings = model.embed(texts, None).map_err(|e| format!("Local embedding failed: {}", e))?;
        Ok(embeddings)
    }
}
pub fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f32 {
    if v1.len() != v2.len() { return 0.0; }
    let mut dot_product = 0.0;
    let mut norm1 = 0.0;
    let mut norm2 = 0.0;
    for i in 0..v1.len() {
        dot_product += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    if norm1 == 0.0 || norm2 == 0.0 { return 0.0; }
    dot_product / (norm1.sqrt() * norm2.sqrt())
}

#[derive(serde::Serialize, Clone)]
pub struct RetrievalResult {
    pub chunk_index: i64,
    pub text_content: String,
    pub score: f32,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct RagConfig {
    pub enabled: bool,
    pub top_k: usize,
    pub threshold: f32,
    pub injection_depth: usize,
    pub template: String,
    
    // Embedding API Settings
    #[serde(default)]
    pub api_type: String, // "local", "api"
    #[serde(default)]
    pub api_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub api_model: String,
}

pub async fn build_chat_index(
    db_state: &crate::database::DbState,
    chat_id: i64,
    chunk_size: usize,
    overlap: usize,
    config: &RagConfig,
) -> Result<usize, String> {
    let messages = {
        let conn = db_state.0.lock().unwrap();
        crate::database::get_messages(&conn, chat_id).map_err(|e| e.to_string())?
    };

    if chunk_size == 0 || messages.is_empty() { return Ok(0); }
    
    let mut chunks = Vec::new();
    let mut chunk_indices = Vec::new();
    
    let mut i = 0;
    let mut chunk_counter = 0;
    while i < messages.len() {
        let end = std::cmp::min(i + chunk_size, messages.len());
        let slice = &messages[i..end];
        
        let mut block = String::new();
        for m in slice {
            let role_name = if m.role == "user" { "User" } else { "Character" };
            block.push_str(&format!("{}: {}\n", role_name, m.content));
        }
        
        chunks.push(block);
        chunk_indices.push(chunk_counter);
        chunk_counter += 1;
        
        if end == messages.len() { break; }
        i += chunk_size.saturating_sub(overlap).max(1); // Advance by chunk size minus overlap
    }
    
    if chunks.is_empty() { return Ok(0); }
    
    // Embed all chunks (NO LOCK HELD HERE)
    let texts: Vec<&str> = chunks.iter().map(|s| s.as_str()).collect();
    let embeddings = embed_texts(texts, config).await?;
    
    // Save to DB (re-acquire lock)
    let conn = db_state.0.lock().unwrap();
    // Clear old memory for this chat
    crate::database::delete_memory_vectors(&conn, chat_id).map_err(|e| e.to_string())?;

    for (idx, (text, emb)) in chunks.into_iter().zip(embeddings.into_iter()).enumerate() {
        let c_idx = chunk_indices[idx];
        crate::database::insert_memory_vector(&conn, chat_id, c_idx, &text, &emb).map_err(|e| e.to_string())?;
    }
    
    Ok(chunk_counter as usize)
}

pub async fn query_chat_memory(
    db_state: &crate::database::DbState,
    chat_id: i64,
    query_text: &str,
    config: &RagConfig,
) -> Result<Vec<RetrievalResult>, String> {
    // 1. Embed query (NO LOCK HELD)
    let query_embed = embed_texts(vec![query_text], config).await?.into_iter().next().ok_or("Failed to embed query")?;
    
    // 2. Fetch all vectors for chat (Lock DB briefly)
    let vectors = {
        let conn = db_state.0.lock().unwrap();
        crate::database::get_chat_vectors(&conn, chat_id).map_err(|e| e.to_string())?
    };
    
    // 3. Compute similarities
    let mut scored: Vec<RetrievalResult> = vectors.into_iter().map(|v| {
        let score = cosine_similarity(&query_embed, &v.embedding);
        RetrievalResult {
            chunk_index: v.chunk_index,
            text_content: v.text_content,
            score,
        }
    }).collect();
    
    // 4. Sort and filter
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.retain(|r| r.score >= config.threshold);
    
    scored.truncate(config.top_k);
    
    // Sort chronologically for prompt injection
    scored.sort_by(|a, b| a.chunk_index.cmp(&b.chunk_index));
    
    Ok(scored)
}

pub async fn build_lorebook_index(
    db_state: &crate::database::DbState,
    char_id: i64,
    chat_id: i64,
    chunk_size: usize,
    overlap: usize,
    config: &RagConfig,
) -> Result<usize, String> {
    let entries = {
        let conn = db_state.0.lock().unwrap();
        crate::database::get_active_lore_entries(&conn, char_id, chat_id).map_err(|e| e.to_string())?
    };

    if chunk_size == 0 || entries.is_empty() { return Ok(0); }

    let mut chunks = Vec::new();
    let mut chunk_indices = Vec::new();
    let mut entry_ids = Vec::new();
    let mut chunk_counter = 0;

    for entry in entries {
        // Clear old memory for this entry
        {
            let conn = db_state.0.lock().unwrap();
            crate::database::delete_lore_vectors(&conn, entry.id).map_err(|e| e.to_string())?;
        }

        // We chunk by characters. The chunk_size should be e.g. 400.
        let chars: Vec<char> = entry.content.chars().collect();
        if chars.is_empty() { continue; }
        
        let mut i = 0;
        while i < chars.len() {
            let end = std::cmp::min(i + chunk_size, chars.len());
            let slice = &chars[i..end];
            let text: String = slice.iter().collect();
            
            let block = format!("Keys: {}\n{}", entry.keys, text);
            chunks.push(block);
            chunk_indices.push(chunk_counter);
            entry_ids.push(entry.id);
            chunk_counter += 1;
            
            if end == chars.len() { break; }
            i += chunk_size.saturating_sub(overlap).max(1);
        }
    }

    if chunks.is_empty() { return Ok(0); }

    let texts: Vec<&str> = chunks.iter().map(|s| s.as_str()).collect();
    let embeddings = embed_texts(texts, config).await?;

    let conn = db_state.0.lock().unwrap();
    for (idx, (text, emb)) in chunks.into_iter().zip(embeddings.into_iter()).enumerate() {
        let e_id = entry_ids[idx];
        let c_idx = chunk_indices[idx];
        crate::database::insert_lore_vector(&conn, e_id, c_idx, &text, &emb).map_err(|e| e.to_string())?;
    }

    Ok(chunk_counter as usize)
}

pub async fn query_lorebook_memory(
    db_state: &crate::database::DbState,
    char_id: i64,
    chat_id: i64,
    query_text: &str,
    config: &RagConfig,
) -> Result<Vec<i64>, String> {
    // 1. Embed query
    let query_embed = embed_texts(vec![query_text], config).await?.into_iter().next().ok_or("Failed to embed query")?;

    // 2. Fetch all vectors for active lore entries
    let vectors = {
        let conn = db_state.0.lock().unwrap();
        let entries = crate::database::get_active_lore_entries(&conn, char_id, chat_id).map_err(|e| e.to_string())?;
        let entry_ids: Vec<i64> = entries.into_iter().map(|e| e.id).collect();
        crate::database::get_lore_vectors(&conn, &entry_ids).map_err(|e| e.to_string())?
    };

    // 3. Compute similarities and score
    let mut scored: Vec<(i64, f32)> = vectors.into_iter().map(|v| {
        let score = cosine_similarity(&query_embed, &v.embedding);
        (v.entry_id, score)
    }).collect();

    // 4. Sort and filter
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    let mut matched_entry_ids = Vec::new();
    for (e_id, score) in scored {
        if score >= config.threshold {
            if !matched_entry_ids.contains(&e_id) {
                matched_entry_ids.push(e_id);
                // For lorebooks, maybe top_k represents max entries? 
                // Let's rely on standard top_k limit
                if matched_entry_ids.len() >= config.top_k {
                    break;
                }
            }
        }
    }

    Ok(matched_entry_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let v1 = vec![1.0, 2.0, 3.0];
        let v2 = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v1, &v2);
        assert!((sim - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let v1 = vec![1.0, 0.0];
        let v2 = vec![0.0, 1.0];
        let sim = cosine_similarity(&v1, &v2);
        assert!((sim - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let v1 = vec![1.0, 2.0];
        let v2 = vec![-1.0, -2.0];
        let sim = cosine_similarity(&v1, &v2);
        assert!((sim - (-1.0)).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_different_lengths() {
        let v1 = vec![1.0, 2.0, 3.0];
        let v2 = vec![1.0, 2.0];
        let sim = cosine_similarity(&v1, &v2);
        assert_eq!(sim, 0.0);
    }

    #[tokio::test]
    #[ignore]
    async fn test_fastembed_integration() {
        // Initialize a very small model just for testing
        let init = init_model(None, "AllMiniLML6V2");
        assert!(init.is_ok(), "Failed to initialize fastembed: {:?}", init.err());

        let config = RagConfig {
            enabled: true, top_k: 3, threshold: 0.5, injection_depth: 0, template: String::new(),
            api_type: "local".to_string(), api_url: "".to_string(), api_key: "".to_string(), api_model: "".to_string(),
        };

        // Test embedding generation
        let embeddings = embed_texts(vec!["Hello", "World"], &config).await;
        assert!(embeddings.is_ok());

        let vectors = embeddings.unwrap();
        assert_eq!(vectors.len(), 2);
        assert_eq!(vectors[0].len(), 384); // AllMiniLML6V2 dimensionality
    }

    #[tokio::test]
    #[ignore]
    async fn test_rag_end_to_end_retrieval() {
        init_model(None, "AllMiniLML6V2").unwrap();

        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE memory_vectors (
                id INTEGER PRIMARY KEY,
                chat_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text_content TEXT NOT NULL,
                embedding BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )", [],
        ).unwrap();
        
        conn.execute(
            "CREATE TABLE messages (
                id INTEGER PRIMARY KEY,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                swipe_id INTEGER DEFAULT 0,
                is_system BOOLEAN DEFAULT 0,
                extra TEXT DEFAULT '{}',
                images TEXT,
                sender_id INTEGER,
                sender_name TEXT
            )", [],
        ).unwrap();
        
        let db_state = crate::database::DbState(Mutex::new(conn));
        
        let conn_ref = db_state.0.lock().unwrap();
        crate::database::save_message(&conn_ref, 1, "user", "I love eating green apples.", None).unwrap();
        crate::database::save_message(&conn_ref, 1, "char", "The secret password to the vault is 'TavernRulez42'.", None).unwrap();
        crate::database::save_message(&conn_ref, 1, "user", "It is raining outside today.", None).unwrap();
        drop(conn_ref);

        let config = RagConfig {
            enabled: true, top_k: 1, threshold: 0.0, injection_depth: 0, template: String::new(),
            api_type: "local".to_string(), api_url: "".to_string(), api_key: "".to_string(), api_model: "".to_string(),
        };

        // Index the chat (chunk size 1 to keep them separate)
        let indexed = build_chat_index(&db_state, 1, 1, 0, &config).await.unwrap();
        assert_eq!(indexed, 3);

        // Query memory asking for the password
        let results = query_chat_memory(&db_state, 1, "What is the secret password?", &config).await.unwrap();
        
        assert_eq!(results.len(), 1);
        // It should semantically match message #2
        assert!(results[0].text_content.contains("TavernRulez42"));
    }
}
