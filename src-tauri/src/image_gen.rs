use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use tauri::{AppHandle, Manager, Emitter};
use std::fs;
use base64::{engine::general_purpose, Engine as _};
use uuid::Uuid;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::http::Request;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeGenerateParams {
    pub sampler_name: String,
    pub cfg_scale: f32,
    pub steps: i32,
    pub width: i32,
    pub height: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub karras: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hires_fix: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_processing: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeGenerateRequest {
    pub prompt: String,
    pub params: HordeGenerateParams,
    pub nsfw: bool,
    pub censor_nsfw: bool,
    pub trusted_workers: bool,
    pub models: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeGenerateResponse {
    pub id: String,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeCheckResponse {
    pub finished: i32,
    pub processing: i32,
    pub restarted: i32,
    pub waiting: i32,
    pub done: bool,
    pub faulted: bool,
    pub wait_time: i32,
    pub queue_position: i32,
    pub is_possible: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeGenerationItem {
    pub img: String,
    pub seed: String,
    pub worker_name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HordeStatusResponse {
    pub generations: Option<Vec<HordeGenerationItem>>,
}

pub fn sanitize_prompt(prompt: &str) -> String {
    let mut cleaned = prompt.replace("\r\n", " ").replace('\n', " ");
    
    // Remove <think> blocks
    while let Some(start) = cleaned.find("<think>") {
        if let Some(end) = cleaned[start..].find("</think>") {
            cleaned.replace_range(start..start + end + "</think>".len(), "");
        } else {
            break;
        }
    }
    
    // Sometimes LLM includes ### Response: prefix
    if let Some(idx) = cleaned.find("### Response:") {
        cleaned = cleaned[idx + "### Response:".len()..].to_string();
    }
    
    cleaned.trim().to_string()
}

pub fn combine_prompts(prompt: &str, base_positive: &str, base_negative: &str, sanitize: bool) -> (String, String) {
    let mut actual_prompt = prompt.to_string();
    let mut custom_negative = String::new();

    if let Some(idx) = prompt.find("###") {
        actual_prompt = prompt[..idx].trim().to_string();
        custom_negative = prompt[idx + 3..].trim().to_string();
    }

    if sanitize {
        actual_prompt = sanitize_prompt(&actual_prompt);
        if !custom_negative.is_empty() {
            custom_negative = sanitize_prompt(&custom_negative);
        }
    }

    let final_positive = if !base_positive.trim().is_empty() {
        if actual_prompt.trim().is_empty() {
            base_positive.trim().to_string()
        } else {
            format!("{}, {}", base_positive.trim(), actual_prompt.trim())
        }
    } else {
        actual_prompt.trim().to_string()
    };

    let final_negative = if !base_negative.trim().is_empty() && !custom_negative.trim().is_empty() {
        format!("{}, {}", base_negative.trim(), custom_negative.trim())
    } else if !base_negative.trim().is_empty() {
        base_negative.trim().to_string()
    } else {
        custom_negative.trim().to_string()
    };

    (final_positive, final_negative)
}

pub async fn generate_image_horde(
    app_handle: AppHandle,
    api_key: String,
    prompt: String,
    base_positive: String,
    base_negative: String,
    model: String,
    width: i32,
    height: i32,
    steps: i32,
    sampler: String,
    cfg_scale: f32,
    nsfw: bool,
    sanitize: bool,
    restore_faces: bool,
    karras: bool,
    hires_fix: bool,
    seed: String,
) -> Result<String, String> {
    let (final_positive, final_negative) = combine_prompts(&prompt, &base_positive, &base_negative, sanitize);
    let mut horde_prompt = final_positive;
    if !final_negative.is_empty() {
        horde_prompt = format!("{} ### {}", horde_prompt, final_negative);
    }

    let mut post_processing = vec![];
    if restore_faces {
        post_processing.push("GFPGAN".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let req = HordeGenerateRequest {
        prompt: horde_prompt,
        params: HordeGenerateParams {
            sampler_name: sampler,
            cfg_scale,
            steps,
            width,
            height,
            karras: if karras { Some(true) } else { None },
            hires_fix: if hires_fix { Some(true) } else { None },
            post_processing: if post_processing.is_empty() { None } else { Some(post_processing) },
            seed: if seed.is_empty() || seed == "-1" { None } else { Some(seed) },
        },
        nsfw,
        censor_nsfw: false,
        trusted_workers: false,
        models: if model.is_empty() { vec![] } else { vec![model] },
    };

    let actual_api_key = if api_key.is_empty() || api_key == "0000000000" {
        "0000000000".to_string()
    } else {
        api_key
    };

    let res = client
        .post("https://stablehorde.net/api/v2/generate/async")
        .header("apikey", &actual_api_key)
        .header("Client-Agent", "TavernREV:1.5.0:unknown")
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Horde API Error: {}", err_text));
    }

    let gen_res: HordeGenerateResponse = res.json().await.map_err(|e| format!("gen async json parse error: {}", e))?;
    let req_id = gen_res.id;

    println!("Horde generation started: {}", req_id);

    // Poll until done
    let mut wait_time = 2;
    loop {
        tokio::time::sleep(Duration::from_secs(wait_time as u64)).await;

        let check_res = client
            .get(&format!("https://stablehorde.net/api/v2/generate/check/{}", req_id))
            .send()
            .await;

        if let Ok(res) = check_res {
            if !res.status().is_success() {
                println!("Horde check failed, continuing...");
                continue;
            }

            let status: HordeCheckResponse = res.json().await.map_err(|e| format!("check json parse error: {}", e))?;
            if status.faulted {
                return Err("Horde generation faulted (failed) on worker.".to_string());
            }
            if !status.is_possible {
                return Err("Horde generation is impossible (no workers support these params).".to_string());
            }

            // Emit progress event to frontend
            let _ = app_handle.emit("image-gen-progress", status.clone());

            if status.done {
                break; // Done!
            }
            wait_time = 5; // Wait 5 seconds between checks
        }
    }

    // Get final status (which contains the images)
    let status_res = client
        .get(&format!("https://stablehorde.net/api/v2/generate/status/{}", req_id))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !status_res.status().is_success() {
        return Err("Failed to fetch generation status".to_string());
    }

    let final_status: HordeStatusResponse = status_res.json().await.map_err(|e| format!("status json parse error: {}", e))?;
    
    if let Some(generations) = final_status.generations {
        if let Some(first) = generations.first() {
            let decoded = if first.img.starts_with("http://") || first.img.starts_with("https://") {
                // It's a URL (R2 storage), download it
                let mut img_res = client.get(&first.img).send().await.map_err(|e| format!("Failed to download image: {}", e))?;
                if !img_res.status().is_success() {
                    return Err(format!("Failed to download image from URL: {}", img_res.status()));
                }
                let mut data = Vec::new();
                let max_size = 20 * 1024 * 1024; // 20 MB
                while let Some(chunk) = img_res.chunk().await.map_err(|e| e.to_string())? {
                    data.extend_from_slice(&chunk);
                    if data.len() > max_size {
                        return Err("Image download exceeded 20MB limit".to_string());
                    }
                }
                data
            } else {
                // It's a base64 string
                general_purpose::STANDARD.decode(&first.img).map_err(|e| e.to_string())?
            };
            
            let filename = format!("img_{}.webp", Uuid::new_v4());
            
            // Get attachments dir
            let app_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;
            let attachments_dir = app_dir.join("attachments");
            if !attachments_dir.exists() {
                fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
            }
            
            let file_path = attachments_dir.join(&filename);
            fs::write(&file_path, decoded).map_err(|e| e.to_string())?;
            
            println!("Saved image to {:?}", file_path);
            
            // Return just the filename so frontend can resolve it relative to attachments dir
            return Ok(filename);
        }
    }

    Err("No image returned from Horde".to_string())
}

#[derive(Serialize)]
pub struct AutoGenerateRequest {
    pub prompt: String,
    pub negative_prompt: String,
    pub seed: i64,
    pub steps: i32,
    pub cfg_scale: f32,
    pub width: i32,
    pub height: i32,
    pub sampler_name: String,
    pub scheduler: String,
    pub enable_hr: bool,
    pub hr_scale: f32,
    pub hr_upscaler: String,
    pub hr_second_pass_steps: i32,
    pub denoising_strength: f32,
    pub restore_faces: bool,
    pub override_settings: serde_json::Value,
    pub override_settings_restore_afterwards: bool,
}

#[derive(Deserialize)]
pub struct AutoGenerateResponse {
    pub images: Option<Vec<String>>,
}

fn sanitize_a1111_url(url: &str) -> String {
    let mut clean_url = url.trim_end_matches('/').to_string();
    if clean_url.ends_with("/sdapi/v1") {
        clean_url = clean_url.strip_suffix("/sdapi/v1").unwrap().to_string();
    } else if clean_url.ends_with("/api") {
        clean_url = clean_url.strip_suffix("/api").unwrap().to_string();
    }
    clean_url
}

pub async fn generate_image_auto(
    app_handle: tauri::AppHandle,
    api_url: String,
    auth: String,
    prompt: String,
    base_positive: String,
    base_negative: String,
    width: i32,
    height: i32,
    steps: i32,
    sampler: String,
    cfg_scale: f32,
    scheduler: String,
    vae: String,
    upscaler: String,
    hires_steps: i32,
    clip_skip: i32,
    denoising: f32,
    upscale_by: f32,
    hires_fix: bool,
    restore_faces: bool,
    sanitize: bool,
) -> Result<String, String> {
    let client = Client::new();
    
    let (actual_prompt, negative_prompt) = combine_prompts(&prompt, &base_positive, &base_negative, sanitize);

    let req = AutoGenerateRequest {
        prompt: actual_prompt,
        negative_prompt,
        seed: -1,
        steps,
        cfg_scale,
        width,
        height,
        sampler_name: sampler,
        scheduler,
        enable_hr: hires_fix,
        hr_scale: upscale_by,
        hr_upscaler: upscaler,
        hr_second_pass_steps: hires_steps,
        denoising_strength: denoising,
        restore_faces,
        override_settings: serde_json::json!({
            "sd_vae": vae,
            "CLIP_stop_at_last_layers": clip_skip
        }),
        override_settings_restore_afterwards: true,
    };

    let url = format!("{}/sdapi/v1/txt2img", sanitize_a1111_url(&api_url));
    
    let _ = app_handle.emit("image-gen-progress", serde_json::json!({
        "processing": true,
        "message": "Generating image via A1111..."
    }));

    let mut request_builder = client.post(&url).json(&req);
    if !auth.is_empty() {
        let parts: Vec<&str> = auth.splitn(2, ':').collect();
        if parts.len() == 2 {
            request_builder = request_builder.basic_auth(parts[0], Some(parts[1]));
        }
    }
    
    let res = request_builder
        .send()
        .await
        .map_err(|e| format!("A1111 Request Failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("A1111 API Error: {}", err_text));
    }

    let gen_res: AutoGenerateResponse = res.json().await.map_err(|e| format!("A1111 json parse error: {}", e))?;
    
    if let Some(images) = gen_res.images {
        if let Some(first_img_b64) = images.first() {
            let decoded = general_purpose::STANDARD.decode(first_img_b64).map_err(|e| e.to_string())?;
            
            let filename = format!("img_{}.png", Uuid::new_v4());
            
            let app_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;
            let attachments_dir = app_dir.join("attachments");
            if !attachments_dir.exists() {
                fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
            }
            
            let file_path = attachments_dir.join(&filename);
            fs::write(&file_path, decoded).map_err(|e| e.to_string())?;
            
            println!("Saved A1111 image to {:?}", file_path);
            
            return Ok(filename);
        }
    }

    Err("No image returned from A1111".to_string())
}

pub fn sanitize_swarm_url(url: &str) -> String {
    let mut clean_url = url.trim_end_matches('/').to_string();
    if clean_url.ends_with("/API") {
        clean_url = clean_url.strip_suffix("/API").unwrap().to_string();
    } else if clean_url.ends_with("/api") {
        clean_url = clean_url.strip_suffix("/api").unwrap().to_string();
    }
    clean_url
}

pub async fn get_swarm_session(client: &Client, base_url: &str, auth_token: &str) -> Result<String, String> {
    let endpoint = format!("{}/API/GetNewSession", sanitize_swarm_url(base_url));
    let mut req = client.post(&endpoint).json(&serde_json::json!({}));
    if !auth_token.is_empty() {
        req = req.header("Cookie", format!("swarm_token={}", auth_token));
    }
    let res = req.send().await.map_err(|e| format!("Failed to connect to SwarmUI: {}", e))?;
    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("SwarmUI session error: {}", err_text));
    }
    let val: serde_json::Value = res.json().await.map_err(|e| format!("SwarmUI JSON parse error: {}", e))?;
    if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
        return Err(format!("SwarmUI error: {}", err));
    }
    if let Some(session_id) = val.get("session_id").and_then(|v| v.as_str()) {
        return Ok(session_id.to_string());
    }
    Err("SwarmUI did not return a session_id".to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SwarmModelItem {
    pub name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub class: Option<String>,
    pub trigger_phrase: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SwarmListModelsResponse {
    pub folders: Option<Vec<String>>,
    pub files: Option<Vec<SwarmModelItem>>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LoraInfo {
    pub name: String,
    pub trigger_phrase: Option<String>,
    pub tags: Option<Vec<String>>,
}

pub fn format_loras_for_prompt(loras: &[LoraInfo]) -> String {
    if loras.is_empty() {
        return String::new();
    }
    let mut lines = Vec::new();
    for l in loras {
        let mut line = format!("- `<lora:{}:1.0>`", l.name);
        let mut triggers = Vec::new();
        if let Some(tp) = &l.trigger_phrase {
            if !tp.trim().is_empty() {
                triggers.push(tp.trim().to_string());
            }
        }
        if let Some(tags) = &l.tags {
            for tag in tags {
                if !tag.trim().is_empty() && !triggers.contains(tag) {
                    triggers.push(tag.trim().to_string());
                }
            }
        }
        if !triggers.is_empty() {
            line.push_str(&format!(" (Triggers: {})", triggers.join(", ")));
        }
        lines.push(line);
    }
    format!(
        "Available LoRAs that can be included in the prompt using `<lora:name:weight>`:\n{}",
        lines.join("\n")
    )
}

pub async fn fetch_swarm_loras(url: &str, auth_token: &str) -> Result<Vec<LoraInfo>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let base_url = sanitize_swarm_url(url);
    let session_id = get_swarm_session(&client, &base_url, auth_token).await?;

    let endpoint = format!("{}/API/ListModels", base_url);
    let mut req = client.post(&endpoint).json(&serde_json::json!({
        "session_id": session_id,
        "path": "",
        "depth": 10,
        "subtype": "LoRA"
    }));
    if !auth_token.is_empty() {
        req = req.header("Cookie", format!("swarm_token={}", auth_token));
    }
    let res = req.send().await.map_err(|e| format!("ListModels LoRA request failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("ListModels LoRA HTTP error: {}", res.status()));
    }
    let data: SwarmListModelsResponse = res.json().await.map_err(|e| format!("ListModels LoRA parse error: {}", e))?;
    if let Some(err) = data.error {
        return Err(format!("SwarmUI error: {}", err));
    }
    let mut result = Vec::new();
    if let Some(files) = data.files {
        for file in files {
            result.push(LoraInfo {
                name: file.name,
                trigger_phrase: file.trigger_phrase,
                tags: file.tags,
            });
        }
    }
    Ok(result)
}

pub async fn fetch_a1111_loras(url: &str, auth: &str) -> Result<Vec<LoraInfo>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let endpoint = format!("{}/sdapi/v1/loras", sanitize_a1111_url(url));
    let mut req = client.get(&endpoint);
    if !auth.is_empty() {
        let encoded = general_purpose::STANDARD.encode(auth);
        req = req.header("Authorization", format!("Basic {}", encoded));
    }
    let res = req.send().await.map_err(|e| format!("A1111 loras request failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("A1111 loras HTTP error: {}", res.status()));
    }
    let items: Vec<serde_json::Value> = res.json().await.map_err(|e| format!("A1111 loras parse error: {}", e))?;
    let mut result = Vec::new();
    for item in items {
        if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
            let alias = item.get("alias").and_then(|a| a.as_str());
            let trigger = alias.filter(|a| !a.is_empty()).map(|a| a.to_string());
            result.push(LoraInfo {
                name: name.to_string(),
                trigger_phrase: trigger,
                tags: None,
            });
        }
    }
    Ok(result)
}

pub async fn fetch_swarm_models(url: &str, auth_token: &str) -> Result<Vec<crate::commands::A1111ModelInfo>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let base_url = sanitize_swarm_url(url);
    let session_id = get_swarm_session(&client, &base_url, auth_token).await?;

    let endpoint = format!("{}/API/ListModels", base_url);
    let mut req = client.post(&endpoint).json(&serde_json::json!({
        "session_id": session_id,
        "path": "",
        "depth": 10,
        "subtype": "Stable-Diffusion"
    }));
    if !auth_token.is_empty() {
        req = req.header("Cookie", format!("swarm_token={}", auth_token));
    }
    let res = req.send().await.map_err(|e| format!("ListModels request failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("ListModels HTTP error: {}", res.status()));
    }
    let data: SwarmListModelsResponse = res.json().await.map_err(|e| format!("ListModels parse error: {}", e))?;
    if let Some(err) = data.error {
        return Err(format!("SwarmUI error: {}", err));
    }
    let mut result = Vec::new();
    if let Some(files) = data.files {
        for file in files {
            let label = if let Some(t) = &file.title {
                if !t.is_empty() { t.clone() } else { file.name.clone() }
            } else {
                file.name.clone()
            };
            result.push(crate::commands::A1111ModelInfo {
                title: file.name,
                model_name: label,
            });
        }
    }
    Ok(result)
}

pub async fn fetch_swarm_samplers(url: &str, auth_token: &str) -> Result<Vec<crate::commands::A1111ModelInfo>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let base_url = sanitize_swarm_url(url);
    let session_id = get_swarm_session(&client, &base_url, auth_token).await?;

    let endpoint = format!("{}/API/ListT2IParams", base_url);
    let mut req = client.post(&endpoint).json(&serde_json::json!({
        "session_id": session_id
    }));
    if !auth_token.is_empty() {
        req = req.header("Cookie", format!("swarm_token={}", auth_token));
    }
    let res = req.send().await.map_err(|e| format!("ListT2IParams request failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("ListT2IParams HTTP error: {}", res.status()));
    }
    let val: serde_json::Value = res.json().await.map_err(|e| format!("ListT2IParams parse error: {}", e))?;
    let mut result = Vec::new();
    if let Some(list) = val.get("list").and_then(|l| l.as_array()) {
        for param in list {
            if param.get("id").and_then(|id| id.as_str()) == Some("sampler") {
                if let Some(values) = param.get("values").and_then(|v| v.as_array()) {
                    for v in values {
                        if let Some(s) = v.as_str() {
                            result.push(crate::commands::A1111ModelInfo {
                                title: s.to_string(),
                                model_name: s.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(result)
}

async fn generate_image_swarm_ws(
    app_handle: &AppHandle,
    client: &Client,
    base_url: &str,
    auth_token: &str,
    _session_id: &str,
    payload: &serde_json::Value,
) -> Result<String, String> {
    let ws_base = if base_url.starts_with("https://") {
        base_url.replacen("https://", "wss://", 1)
    } else if base_url.starts_with("http://") {
        base_url.replacen("http://", "ws://", 1)
    } else {
        format!("ws://{}", base_url)
    };

    let ws_url = format!("{}/API/GenerateText2ImageWS", ws_base);
    let mut req_builder = Request::builder().uri(&ws_url);
    if !auth_token.is_empty() {
        req_builder = req_builder.header("Cookie", format!("swarm_token={}", auth_token));
    }
    let req = req_builder.body(()).map_err(|e| format!("Invalid WS request: {}", e))?;

    let (ws_stream, _) = connect_async(req).await.map_err(|e| format!("WS connect failed: {}", e))?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    let json_text = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    ws_write.send(Message::Text(json_text)).await.map_err(|e| format!("WS send error: {}", e))?;

    while let Some(msg_result) = ws_read.next().await {
        let msg = msg_result.map_err(|e| format!("WS receive error: {}", e))?;
        if let Message::Text(text) = msg {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(err_id) = val.get("error_id").and_then(|e| e.as_str()) {
                    return Err(format!("error_id:{}", err_id));
                }
                if let Some(err) = val.get("error").and_then(|e| e.as_str()) {
                    return Err(format!("SwarmUI Error: {}", err));
                }

                // Handle live progress updates
                if let Some(progress) = val.get("gen_progress") {
                    let overall = progress.get("overall_percent").and_then(|p| p.as_f64()).unwrap_or(0.0);
                    let preview = progress.get("preview").and_then(|p| p.as_str());
                    let percent_num = (overall * 100.0).round() as i32;

                    let _ = app_handle.emit("image-gen-progress", serde_json::json!({
                        "processing": true,
                        "progress": overall,
                        "preview": preview,
                        "message": format!("SwarmUI: {}%", percent_num),
                    }));
                }

                if let Some(backend_status) = val.get("backend_status") {
                    if let Some(msg) = backend_status.get("message").and_then(|m| m.as_str()) {
                        if !msg.is_empty() {
                            let _ = app_handle.emit("image-gen-progress", serde_json::json!({
                                "processing": true,
                                "message": msg,
                            }));
                        }
                    }
                }

                // Handle completed image
                if let Some(img_obj) = val.get("image") {
                    let img_str = if let Some(s) = img_obj.get("image").and_then(|i| i.as_str()) {
                        s.to_string()
                    } else if let Some(s) = img_obj.as_str() {
                        s.to_string()
                    } else {
                        String::new()
                    };

                    if !img_str.is_empty() {
                        let img_bytes = if img_str.starts_with("data:") {
                            let b64_data = if let Some(idx) = img_str.find(',') {
                                &img_str[idx + 1..]
                            } else {
                                &img_str
                            };
                            general_purpose::STANDARD.decode(b64_data).map_err(|e| format!("Base64 decode error: {}", e))?
                        } else {
                            let image_url = if img_str.starts_with("http://") || img_str.starts_with("https://") {
                                img_str
                            } else {
                                let clean_path = img_str.trim_start_matches('/');
                                format!("{}/{}", base_url, clean_path)
                            };

                            let mut download_req = client.get(&image_url);
                            if !auth_token.is_empty() {
                                download_req = download_req.header("Cookie", format!("swarm_token={}", auth_token));
                            }
                            let img_res = download_req.send().await.map_err(|e| format!("Failed to download generated image: {}", e))?;
                            if !img_res.status().is_success() {
                                return Err(format!("Failed to download image: HTTP {}", img_res.status()));
                            }
                            img_res.bytes().await.map_err(|e| format!("Failed to read image bytes: {}", e))?.to_vec()
                        };

                        let filename = format!("img_{}.png", Uuid::new_v4());
                        let app_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;
                        let attachments_dir = app_dir.join("attachments");
                        if !attachments_dir.exists() {
                            fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
                        }

                        let file_path = attachments_dir.join(&filename);
                        fs::write(&file_path, img_bytes).map_err(|e| e.to_string())?;
                        println!("Saved SwarmUI WS image to {:?}", file_path);
                        return Ok(filename);
                    }
                }
            }
        }
    }

    Err("WebSocket connection closed without image result".to_string())
}

pub async fn generate_image_swarm(
    app_handle: AppHandle,
    api_url: String,
    auth_token: String,
    prompt: String,
    base_positive: String,
    base_negative: String,
    model: String,
    width: i32,
    height: i32,
    steps: i32,
    sampler: String,
    cfg_scale: f32,
    seed: String,
    sanitize: bool,
    hires_fix: bool,
    refiner_model: String,
    refiner_method: String,
    refiner_control_percent: f32,
    refiner_upscale_size: f32,
    refiner_steps: i32,
) -> Result<String, String> {
    let base_url = sanitize_swarm_url(&api_url);
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let (actual_prompt, negative_prompt) = combine_prompts(&prompt, &base_positive, &base_negative, sanitize);

    let seed_num: i64 = if seed.is_empty() || seed == "-1" {
        -1
    } else {
        seed.parse::<i64>().unwrap_or(-1)
    };

    let _ = app_handle.emit("image-gen-progress", serde_json::json!({
        "processing": true,
        "message": "Connecting to SwarmUI..."
    }));

    let mut session_id = get_swarm_session(&client, &base_url, &auth_token).await?;

    let mut attempts = 0;
    let max_attempts = 2;

    while attempts < max_attempts {
        attempts += 1;

        let _ = app_handle.emit("image-gen-progress", serde_json::json!({
            "processing": true,
            "message": if hires_fix { "Generating & Refining via SwarmUI..." } else { "Generating image via SwarmUI..." }
        }));

        let mut payload = serde_json::json!({
            "session_id": session_id,
            "images": 1,
            "donotsave": true,
            "prompt": actual_prompt,
            "negativeprompt": negative_prompt,
            "width": width,
            "height": height,
            "cfgscale": cfg_scale,
            "steps": steps,
            "seed": seed_num,
        });

        if !model.is_empty() {
            payload["model"] = serde_json::Value::String(model.clone());
        }
        if !sampler.is_empty() {
            payload["sampler"] = serde_json::Value::String(sampler.clone());
        }

        if hires_fix {
            let actual_refiner = if !refiner_model.is_empty() && refiner_model != "(same)" {
                refiner_model.clone()
            } else {
                model.clone()
            };
            if !actual_refiner.is_empty() {
                payload["refinermodel"] = serde_json::Value::String(actual_refiner);
            }
            if !refiner_method.is_empty() {
                payload["refinerupscalemethod"] = serde_json::Value::String(refiner_method.clone());
            }
            if refiner_upscale_size > 0.0 {
                payload["refinerupscalesize"] = serde_json::json!(refiner_upscale_size);
            }
            if refiner_control_percent > 0.0 {
                payload["refinercontrolpercent"] = serde_json::json!(refiner_control_percent);
            }
            if refiner_steps > 0 {
                payload["refinersteps"] = serde_json::json!(refiner_steps);
            }
        }

        // Try WebSocket first for live progress streaming
        match generate_image_swarm_ws(&app_handle, &client, &base_url, &auth_token, &session_id, &payload).await {
            Ok(img_file) => return Ok(img_file),
            Err(ws_err) => {
                if ws_err.contains("invalid_session_id") && attempts < max_attempts {
                    println!("SwarmUI session expired on WS, renewing session...");
                    session_id = get_swarm_session(&client, &base_url, &auth_token).await?;
                    continue;
                }
                println!("SwarmUI WebSocket generation fallback to HTTP due to: {}", ws_err);
            }
        }

        // HTTP Fallback
        let endpoint = format!("{}/API/GenerateText2Image", base_url);
        let mut req = client.post(&endpoint).json(&payload);
        if !auth_token.is_empty() {
            req = req.header("Cookie", format!("swarm_token={}", auth_token));
        }

        let res = req.send().await.map_err(|e| format!("SwarmUI request failed: {}", e))?;
        let status = res.status();
        if !status.is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("SwarmUI API Error ({}): {}", status, err_text));
        }

        let gen_val: serde_json::Value = res.json().await.map_err(|e| format!("SwarmUI JSON parse error: {}", e))?;

        if let Some(error_id) = gen_val.get("error_id").and_then(|e| e.as_str()) {
            if error_id == "invalid_session_id" && attempts < max_attempts {
                println!("SwarmUI session expired, renewing session...");
                session_id = get_swarm_session(&client, &base_url, &auth_token).await?;
                continue;
            }
        }

        if let Some(err) = gen_val.get("error").and_then(|e| e.as_str()) {
            return Err(format!("SwarmUI Error: {}", err));
        }

        if let Some(images) = gen_val.get("images").and_then(|imgs| imgs.as_array()) {
            if let Some(first) = images.first() {
                let img_str = if let Some(s) = first.as_str() {
                    s.to_string()
                } else if let Some(obj) = first.as_object() {
                    obj.get("image").and_then(|i| i.as_str()).unwrap_or_default().to_string()
                } else {
                    String::new()
                };

                if img_str.is_empty() {
                    return Err("SwarmUI returned an empty image path".to_string());
                }

                let img_bytes = if img_str.starts_with("data:") {
                    let b64_data = if let Some(idx) = img_str.find(',') {
                        &img_str[idx + 1..]
                    } else {
                        &img_str
                    };
                    general_purpose::STANDARD.decode(b64_data).map_err(|e| format!("Base64 decode error: {}", e))?
                } else {
                    let image_url = if img_str.starts_with("http://") || img_str.starts_with("https://") {
                        img_str
                    } else {
                        let clean_path = img_str.trim_start_matches('/');
                        format!("{}/{}", base_url, clean_path)
                    };

                    let mut download_req = client.get(&image_url);
                    if !auth_token.is_empty() {
                        download_req = download_req.header("Cookie", format!("swarm_token={}", auth_token));
                    }
                    let img_res = download_req.send().await.map_err(|e| format!("Failed to download generated image: {}", e))?;
                    if !img_res.status().is_success() {
                        return Err(format!("Failed to download image: HTTP {}", img_res.status()));
                    }
                    img_res.bytes().await.map_err(|e| format!("Failed to read image bytes: {}", e))?.to_vec()
                };

                let filename = format!("img_{}.png", Uuid::new_v4());
                let app_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;
                let attachments_dir = app_dir.join("attachments");
                if !attachments_dir.exists() {
                    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
                }

                let file_path = attachments_dir.join(&filename);
                fs::write(&file_path, img_bytes).map_err(|e| e.to_string())?;

                println!("Saved SwarmUI image to {:?}", file_path);
                return Ok(filename);
            }
        }

        return Err("No images returned from SwarmUI".to_string());
    }

    Err("SwarmUI generation failed after retry".to_string())
}
