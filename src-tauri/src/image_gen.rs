use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use tauri::{AppHandle, Manager, Emitter};
use std::fs;
use base64::{engine::general_purpose, Engine as _};
use uuid::Uuid;

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

pub async fn generate_image_horde(
    app_handle: AppHandle,
    api_key: String,
    mut prompt: String,
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
    if sanitize {
        prompt = sanitize_prompt(&prompt);
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
        prompt,
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
        .header("Client-Agent", "TavernREV:1.4.0:unknown")
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
) -> Result<String, String> {
    let client = Client::new();
    
    // Process negative prompt
    let mut actual_prompt = prompt.clone();
    let mut negative_prompt = String::new();
    if let Some(idx) = prompt.find("###") {
        actual_prompt = prompt[..idx].trim().to_string();
        negative_prompt = prompt[idx + 3..].trim().to_string();
    }

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
