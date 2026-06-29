use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use tauri::{AppHandle, Manager};
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
            seed: if seed.is_empty() { None } else { Some(seed) },
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
                let img_res = client.get(&first.img).send().await.map_err(|e| format!("Failed to download image: {}", e))?;
                if !img_res.status().is_success() {
                    return Err(format!("Failed to download image from URL: {}", img_res.status()));
                }
                img_res.bytes().await.map_err(|e| e.to_string())?.to_vec()
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
