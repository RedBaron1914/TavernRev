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
        std::env::set_var("ORT_DYLIB_PATH", dylib_name);
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
    if let Some(app) = app_handle {
        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let fe_cache = cache_dir.join("fastembed");
            options.cache_dir = fe_cache.clone();
            
            #[cfg(target_os = "android")]
            {
                std::env::set_var("HOME", cache_dir.clone());
                std::env::set_var("XDG_CACHE_HOME", cache_dir.clone());
                std::env::set_var("XDG_DATA_HOME", cache_dir.clone());
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

pub fn embed_texts(texts: Vec<&str>) -> Result<Vec<Vec<f32>>, String> {
    let mut lock = get_model().lock().unwrap();
    let model = lock.as_mut().ok_or("Embedding model is not initialized")?;
    
    let embeddings = model.embed(texts, None).map_err(|e| format!("Embedding failed: {}", e))?;
    Ok(embeddings)
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
}

pub fn build_chat_index(
    conn: &rusqlite::Connection,
    chat_id: i64,
    messages: &[crate::database::Message],
    chunk_size: usize,
    overlap: usize,
) -> Result<usize, String> {
    // Basic chunking: group messages into text blocks
    if chunk_size == 0 || messages.is_empty() { return Ok(0); }
    
    // Clear old memory for this chat (Full re-index for simplicity right now)
    crate::database::delete_memory_vectors(conn, chat_id).map_err(|e| e.to_string())?;
    
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
    
    // Embed all chunks
    let texts: Vec<&str> = chunks.iter().map(|s| s.as_str()).collect();
    let embeddings = embed_texts(texts)?;
    
    // Save to DB
    for (idx, (text, emb)) in chunks.into_iter().zip(embeddings.into_iter()).enumerate() {
        let c_idx = chunk_indices[idx];
        crate::database::insert_memory_vector(conn, chat_id, c_idx, &text, &emb).map_err(|e| e.to_string())?;
    }
    
    Ok(chunk_counter as usize)
}

pub fn query_chat_memory(
    conn: &rusqlite::Connection,
    chat_id: i64,
    query_text: &str,
    top_k: usize,
    threshold: f32,
) -> Result<Vec<RetrievalResult>, String> {
    // 1. Embed query
    let query_embed = embed_texts(vec![query_text])?.into_iter().next().ok_or("Failed to embed query")?;
    
    // 2. Fetch all vectors for chat
    let vectors = crate::database::get_chat_vectors(conn, chat_id).map_err(|e| e.to_string())?;
    
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
    scored.retain(|r| r.score >= threshold);
    
    scored.truncate(top_k);
    
    // Sort chronologically for prompt injection
    scored.sort_by(|a, b| a.chunk_index.cmp(&b.chunk_index));
    
    Ok(scored)
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

    #[test]
    #[ignore]
    fn test_fastembed_integration() {
        // Since cargo test runs binaries in target/debug/deps/, we point to the parent dir where our downloaded DLL lives
        std::env::set_var("ORT_DYLIB_PATH", "../onnxruntime.dll");

        // Initialize a very small model just for testing
        let init = init_model(None, "AllMiniLML6V2");
        assert!(init.is_ok(), "Failed to initialize fastembed: {:?}", init.err());

        // Test embedding generation
        let embeddings = embed_texts(vec!["Hello", "World"]);
        assert!(embeddings.is_ok());

        let vectors = embeddings.unwrap();
        assert_eq!(vectors.len(), 2);
        assert_eq!(vectors[0].len(), 384); // AllMiniLML6V2 dimensionality
    }

    #[test]
    #[ignore]
    fn test_rag_end_to_end_retrieval() {
        std::env::set_var("ORT_DYLIB_PATH", "../onnxruntime.dll");
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

        let messages = vec![
            crate::database::Message {
                id: 1, chat_id: 1, role: "user".to_string(), content: "I love eating green apples.".to_string(),
                timestamp: "".to_string(), swipes: vec![], swipe_id: 0, is_system: false, extra: "".to_string(),
                images: None, sender_id: None, sender_name: None
            },
            crate::database::Message {
                id: 2, chat_id: 1, role: "char".to_string(), content: "The secret password to the vault is 'TavernRulez42'.".to_string(),
                timestamp: "".to_string(), swipes: vec![], swipe_id: 0, is_system: false, extra: "".to_string(),
                images: None, sender_id: None, sender_name: None
            },
            crate::database::Message {
                id: 3, chat_id: 1, role: "user".to_string(), content: "It is raining outside today.".to_string(),
                timestamp: "".to_string(), swipes: vec![], swipe_id: 0, is_system: false, extra: "".to_string(),
                images: None, sender_id: None, sender_name: None
            },
        ];

        // Index the chat (chunk size 1 to keep them separate)
        let indexed = build_chat_index(&conn, 1, &messages, 1, 0).unwrap();
        assert_eq!(indexed, 3);

        // Query memory asking for the password
        let results = query_chat_memory(&conn, 1, "What is the secret password?", 1, 0.0).unwrap();
        
        assert_eq!(results.len(), 1);
        // It should semantically match message #2
        assert!(results[0].text_content.contains("TavernRulez42"));
    }
}
