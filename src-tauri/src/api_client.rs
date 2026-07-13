use crate::prompt_engine::PromptModule;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(Client::new)
}

// --- Config Structures ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConnectionProfile {
    pub api_type: String, // "chat_completion", "horde", etc.
    pub base_url: String,
    pub api_key: String,
    pub model_id: String,
    #[serde(default = "default_post_processing")]
    pub post_processing: String,
    #[serde(default = "default_context_size")]
    pub context_size: i32,
}

fn default_post_processing() -> String {
    "none".to_string()
}
fn default_context_size() -> i32 {
    4096
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Preset {
    pub temperature: f32,
    pub repetition_penalty: f32,
    pub top_p: f32,
    pub presence_penalty: f32,
    pub frequency_penalty: f32,
    #[serde(default)]
    pub top_k: i32,
    #[serde(default)]
    pub min_p: f32,
    #[serde(default)]
    pub top_a: f32,
    pub openai_max_tokens: i32,
    pub stream_openai: bool,
    #[serde(default)]
    pub impersonation_prompt: String,
    #[serde(default)]
    pub continue_nudge_prompt: String,
    #[serde(default)]
    pub assistant_prefill: String,
    #[serde(default)]
    pub request_images: bool,
    #[serde(default)]
    pub send_char_avatar: bool,
    #[serde(default)]
    pub send_user_avatar: bool,
    #[serde(default)]
    pub char_avatar_prompt: String,
    #[serde(default)]
    pub user_avatar_prompt: String,
    #[serde(default)]
    pub new_chat_prompt: String,
    #[serde(default)]
    pub new_example_chat_prompt: String,
    #[serde(default)]
    pub stop_strings: String,
    #[serde(default)]
    pub reasoning_effort: String,
    #[serde(default = "default_true")]
    pub show_thoughts: bool,
    #[serde(default = "default_wi_depth")]
    pub wi_scan_depth: i32,
    #[serde(default = "default_true")]
    pub wi_recursive: bool,
    #[serde(default)]
    pub wi_case_sensitive: bool,
    #[serde(default = "default_true")]
    pub wi_match_whole_words: bool,
    #[serde(default = "default_recursion")]
    pub wi_max_recursion: i32,
    #[serde(default)]
    pub wi_token_budget: i32,
    #[serde(default)]
    pub wi_context_percent: i32,
    #[serde(default = "default_true")]
    pub wi_include_names: bool,
    #[serde(default)]
    pub wi_insertion_strategy: String,
    #[serde(default)]
    pub squash_system_messages: bool,
    #[serde(default)]
    pub studio_assistant_prompt: String,
    #[serde(default)]
    pub sd_horde_api_key: String,
    #[serde(default = "default_sd_auto_url")]
    pub sd_auto_url: String,
    #[serde(default)]
    pub sd_auto_auth: String,
    #[serde(default = "default_sd_auto_vae")]
    pub sd_auto_vae: String,
    #[serde(default = "default_sd_auto_scheduler")]
    pub sd_auto_scheduler: String,
    #[serde(default = "default_sd_auto_upscaler")]
    pub sd_auto_upscaler: String,
    #[serde(default)]
    pub sd_auto_hires_steps: i32,
    #[serde(default = "default_sd_auto_clip_skip")]
    pub sd_auto_clip_skip: i32,
    #[serde(default = "default_sd_auto_denoising")]
    pub sd_auto_denoising: f32,
    #[serde(default = "default_sd_auto_upscale_by")]
    pub sd_auto_upscale_by: f32,
    #[serde(default)]
    pub sd_use_tool: bool,
    #[serde(default)]
    pub sd_edit_prompts: bool,
    #[serde(default = "default_sd_provider")]
    pub sd_provider: String,
    #[serde(default = "default_true")]
    pub sd_allow_nsfw: bool,
    #[serde(default = "default_true")]
    pub sd_sanitize_prompts: bool,
    #[serde(default)]
    pub sd_restore_faces: bool,
    #[serde(default = "default_true")]
    pub sd_karras: bool,
    #[serde(default)]
    pub sd_hires_fix: bool,
    #[serde(default)]
    pub sd_seed: String,
    #[serde(default = "default_sd_model")]
    pub sd_model: String,
    #[serde(default = "default_sd_width")]
    pub sd_width: i32,
    #[serde(default = "default_sd_height")]
    pub sd_height: i32,
    #[serde(default = "default_sd_steps")]
    pub sd_steps: i32,
    #[serde(default = "default_sd_sampler")]
    pub sd_sampler: String,
    #[serde(default = "default_sd_cfg")]
    pub sd_cfg_scale: f32,
    pub prompts: Vec<PromptModule>,
}

fn default_sd_width() -> i32 {
    512
}
fn default_sd_height() -> i32 {
    512
}
fn default_sd_steps() -> i32 {
    20
}
fn default_sd_sampler() -> String {
    "k_euler_a".to_string()
}
fn default_sd_cfg() -> f32 {
    7.0
}
fn default_sd_provider() -> String {
    "horde".to_string()
}
fn default_sd_model() -> String {
    "stable_diffusion".to_string()
}
fn default_sd_auto_url() -> String {
    "http://127.0.0.1:7860".to_string()
}
fn default_sd_auto_vae() -> String {
    "Automatic".to_string()
}
fn default_sd_auto_scheduler() -> String {
    "Automatic".to_string()
}
fn default_sd_auto_upscaler() -> String {
    "Latent".to_string()
}
fn default_sd_auto_clip_skip() -> i32 {
    1
}
fn default_sd_auto_denoising() -> f32 {
    0.7
}
fn default_sd_auto_upscale_by() -> f32 {
    2.0
}

impl Default for Preset {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            repetition_penalty: 1.0,
            top_p: 1.0,
            presence_penalty: 0.0,
            frequency_penalty: 0.0,
            top_k: 0,
            min_p: 0.0,
            top_a: 0.0,
            openai_max_tokens: 1024,
            stream_openai: true,
            impersonation_prompt: String::new(),
            continue_nudge_prompt: String::new(),
            assistant_prefill: String::new(),
            request_images: false,
            send_char_avatar: false,
            send_user_avatar: false,
            char_avatar_prompt: String::new(),
            user_avatar_prompt: String::new(),
            new_chat_prompt: String::new(),
            new_example_chat_prompt: String::new(),
            stop_strings: String::new(),
            reasoning_effort: String::new(),
            show_thoughts: true,
            wi_scan_depth: 5,
            wi_recursive: true,
            wi_case_sensitive: false,
            wi_match_whole_words: true,
            wi_max_recursion: 5,
            wi_token_budget: 0,
            wi_context_percent: 0,
            wi_include_names: true,
            wi_insertion_strategy: String::new(),
            squash_system_messages: false,
            studio_assistant_prompt: String::new(),
            sd_horde_api_key: "0000000000".to_string(),
            sd_auto_url: "http://127.0.0.1:7860".to_string(),
            sd_auto_auth: String::new(),
            sd_auto_vae: "Automatic".to_string(),
            sd_auto_scheduler: "Automatic".to_string(),
            sd_auto_upscaler: "Latent".to_string(),
            sd_auto_hires_steps: 0,
            sd_auto_clip_skip: 1,
            sd_auto_denoising: 0.7,
            sd_auto_upscale_by: 2.0,
            sd_use_tool: false,
            sd_edit_prompts: false,
            sd_provider: default_sd_provider(),
            sd_allow_nsfw: true,
            sd_sanitize_prompts: true,
            sd_restore_faces: false,
            sd_karras: true,
            sd_hires_fix: false,
            sd_seed: String::new(),
            sd_model: default_sd_model(),
            sd_width: default_sd_width(),
            sd_height: default_sd_height(),
            sd_steps: default_sd_steps(),
            sd_sampler: default_sd_sampler(),
            sd_cfg_scale: default_sd_cfg(),
            prompts: vec![],
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_wi_depth() -> i32 {
    5
}
fn default_recursion() -> i32 {
    5
}

// --- OpenAI API Structures ---

#[derive(Serialize, Debug, Clone)]
pub struct OpenAITool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAIFunctionDef,
}

pub fn get_available_tools() -> Vec<OpenAITool> {
    vec![
        OpenAITool {
            tool_type: "function".to_string(),
            function: OpenAIFunctionDef {
                name: "get_system_time".to_string(),
                description: "Returns the current local system time, date, and timezone. Call this whenever you need to know the current time to answer the user.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {}
                }),
            }
        },
        OpenAITool {
            tool_type: "function".to_string(),
            function: OpenAIFunctionDef {
                name: "generate_image".to_string(),
                description: "Generates an image of the character or current scenario based on the provided prompt tags. Use this when the user explicitly asks for a picture/photo, or when the current narrative context strongly suggests generating a visual representation. The prompt MUST be a comma-separated list of visual tags (e.g. '1girl, red hair, blue eyes, smiling, forest background').".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "A comma-separated list of visual tags describing the image to generate."
                        }
                    },
                    "required": ["prompt"]
                }),
            }
        }
    ]
}

#[derive(Serialize, Debug, Clone)]
pub struct OpenAIFunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAIFunctionCall,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct OpenAIMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<OpenAIContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(untagged)]
pub enum OpenAIContent {
    Text(String),
    Array(Vec<OpenAIPart>),
}

#[derive(Serialize, Debug, Clone)]
pub struct OpenAIPart {
    #[serde(rename = "type")]
    pub part_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<OpenAIImageUrl>,
}

#[derive(Serialize, Debug, Clone)]
pub struct OpenAIImageUrl {
    pub url: String,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct OpenAIRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub stream: bool,
    pub max_tokens: Option<i32>,
    pub temperature: f32,
    pub top_p: f32,
    pub presence_penalty: f32,
    pub frequency_penalty: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_a: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repetition_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OpenAITool>>,
}

#[derive(Deserialize, Debug)]
struct OpenAIStreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    message: MessageContent,
}

#[derive(Deserialize, Debug)]
struct MessageContent {
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Deserialize, Debug)]
struct StreamChoice {
    delta: Delta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Delta {
    content: Option<String>,
    tool_calls: Option<Vec<DeltaToolCall>>,
}

#[derive(Deserialize, Debug)]
struct DeltaToolCall {
    index: usize,
    id: Option<String>,
    function: Option<DeltaFunction>,
}

#[derive(Deserialize, Debug)]
struct DeltaFunction {
    name: Option<String>,
    arguments: Option<String>,
}

// --- Horde API Structures ---

#[derive(Serialize, Debug)]
struct HordeRequest {
    prompt: String,
    params: HordeParams,
    models: Vec<String>,
}

#[derive(Serialize, Debug)]
struct HordeParams {
    n: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_context_length: Option<i32>,
    max_length: i32,
    rep_pen: f32,
    temperature: f32,
    top_p: f32,
}

#[derive(Deserialize, Debug)]
struct HordeAsyncResponse {
    id: String,
}

#[derive(Deserialize, Debug)]
struct HordeStatusResponse {
    done: bool,
    generations: Option<Vec<HordeGeneration>>,
}

#[derive(Deserialize, Debug)]
struct HordeGeneration {
    text: String,
}

// --- Google API Structures ---

#[derive(Serialize, Debug)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    #[serde(rename = "generationConfig")]
    generation_config: GoogleConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "systemInstruction")]
    system_instruction: Option<GoogleContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
}

#[derive(Serialize, Debug)]
pub struct GoogleContent {
    pub role: String,
    pub parts: Vec<GooglePart>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GooglePart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "inlineData")]
    pub inline_data: Option<GoogleInlineData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "functionCall")]
    pub function_call: Option<GoogleFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "functionResponse")]
    pub function_response: Option<GoogleFunctionResponse>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GoogleFunctionCall {
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GoogleFunctionResponse {
    pub name: String,
    pub response: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GoogleInlineData {
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub data: String,
}

#[derive(Serialize, Debug)]
struct GoogleConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: i32,
    #[serde(rename = "topP")]
    top_p: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "thinkingConfig")]
    thinking_config: Option<ThinkingConfig>,
}

#[derive(Serialize, Debug)]
struct ThinkingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "includeThoughts")]
    include_thoughts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "thinkingBudget")]
    budget: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "thinkingLevel")]
    thinking_level: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GoogleStreamResponse {
    candidates: Option<Vec<GoogleCandidate>>,
}

#[derive(Deserialize, Debug)]
struct GoogleCandidate {
    content: Option<GoogleContentResponse>,
}

#[derive(Deserialize, Debug)]
struct GoogleContentResponse {
    parts: Option<Vec<GooglePart>>,
}

// --- EMBEDDINGS ---

#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Option<Vec<EmbeddingData>>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

pub async fn generate_embeddings(
    api_url: String,
    api_key: String,
    model: String,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let client = get_client();
    let url = {
        let base = api_url.trim_end_matches('/').to_string();
        if base.ends_with("/v1/chat/completions") {
            base.replace("/chat/completions", "/embeddings")
        } else if base.ends_with("/chat/completions") {
            base.replace("/chat/completions", "/v1/embeddings")
        } else if base.ends_with("/v1") {
            format!("{}/embeddings", base)
        } else if !base.contains('/') || (base.starts_with("http") && base.split('/').count() <= 3)
        {
            // It's just a base URL like http://127.0.0.1:5000, add default path
            format!("{}/v1/embeddings", base)
        } else {
            // User provided a specific path (e.g. /api/v1/model/embed), use it as is
            base
        }
    };

    let mut all_embeddings = Vec::new();

    // Chunking to handle API batch limits (e.g., OpenAI allows max 2048)
    for chunk in texts.chunks(1000) {
        let req_body = EmbeddingRequest {
            model: model.clone(),
            input: chunk.to_vec(),
        };

        let mut req = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&req_body);

        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        let status = resp.status();

        if !status.is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, err_text));
        }

        let parsed: EmbeddingResponse = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        if let Some(data) = parsed.data {
            let embeddings: Vec<Vec<f32>> = data.into_iter().map(|d| d.embedding).collect();
            all_embeddings.extend(embeddings);
        } else {
            return Err("No embedding data returned in chunk".to_string());
        }
    }

    Ok(all_embeddings)
}

// --- GENERATION FUNCTIONS ---

pub async fn generate_google(
    app_handle: AppHandle,
    api_key: String,
    model: String,
    messages: Vec<OpenAIMessage>,
    preset: &Preset,
    abort_token: Arc<AtomicBool>,
    gen_id: u64,
    target_id: Option<i64>,
    tools_payload: Option<Vec<OpenAITool>>,
) -> Result<(String, Option<Vec<OpenAIToolCall>>), String> {
    let client = get_client();

    // Convert messages
    let mut contents = Vec::new();
    let mut system_parts = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            if let Some(OpenAIContent::Text(text)) = &msg.content {
                system_parts.push(GooglePart {
                    text: Some(text.clone()),
                    inline_data: None,
                    function_call: None,
                    function_response: None,
                });
            }
        } else if msg.role == "tool" {
            if let Some(OpenAIContent::Text(text)) = &msg.content {
                let tc_id = msg.tool_call_id.clone().unwrap_or_default();
                contents.push(GoogleContent {
                    role: "user".to_string(), // Tool responses must be user role in Google API
                    parts: vec![GooglePart {
                        text: None,
                        inline_data: None,
                        function_call: None,
                        function_response: Some(GoogleFunctionResponse {
                            name: tc_id,
                            response: serde_json::json!({"result": text}),
                        }),
                    }],
                });
            }
        } else {
            let role = if msg.role == "assistant" || msg.role == "char" {
                "model"
            } else {
                "user"
            };
            let mut parts = Vec::new();

            if let Some(calls) = &msg.tool_calls {
                for call in calls {
                    let args_val: serde_json::Value =
                        serde_json::from_str(&call.function.arguments)
                            .unwrap_or(serde_json::json!({}));
                    parts.push(GooglePart {
                        text: None,
                        inline_data: None,
                        function_call: Some(GoogleFunctionCall {
                            name: call.function.name.clone(),
                            args: args_val,
                        }),
                        function_response: None,
                    });
                }
            }

            match &msg.content {
                Some(OpenAIContent::Text(text)) => {
                    parts.push(GooglePart {
                        text: Some(text.clone()),
                        inline_data: None,
                        function_call: None,
                        function_response: None,
                    });
                }
                Some(OpenAIContent::Array(array)) => {
                    for part in array {
                        if part.part_type == "text" {
                            if let Some(t) = &part.text {
                                parts.push(GooglePart {
                                    text: Some(t.clone()),
                                    inline_data: None,
                                    function_call: None,
                                    function_response: None,
                                });
                            }
                        } else if part.part_type == "image_url" {
                            if let Some(img) = &part.image_url {
                                if let Some(comma_pos) = img.url.find(',') {
                                    let mime_part = &img.url[0..comma_pos];
                                    let data = &img.url[comma_pos + 1..];
                                    let mime = if let Some(semi) = mime_part.find(';') {
                                        if mime_part.len() > 5 {
                                            &mime_part[5..semi]
                                        } else {
                                            "image/jpeg"
                                        }
                                    } else {
                                        "image/jpeg"
                                    };

                                    parts.push(GooglePart {
                                        text: None,
                                        inline_data: Some(GoogleInlineData {
                                            mime_type: mime.to_string(),
                                            data: data.to_string(),
                                        }),
                                        function_call: None,
                                        function_response: None,
                                    });
                                }
                            }
                        }
                    }
                }
                None => {}
            }

            if !parts.is_empty() {
                contents.push(GoogleContent {
                    role: role.to_string(),
                    parts,
                });
            }
        }
    }

    let system_instruction = if !system_parts.is_empty() {
        Some(GoogleContent {
            role: "user".to_string(), // API requires role, but for sys instruct it might be ignored or specific
            parts: system_parts,
        })
    } else {
        None
    };

    let is_gemini_3 = model.contains("gemini-3");
    let is_flash = model.contains("flash");

    let thinking_config = if preset.reasoning_effort.is_empty() || preset.reasoning_effort == "none"
    {
        None
    } else if is_gemini_3 {
        let level = match preset.reasoning_effort.as_str() {
            "low" => "LOW",
            "medium" => "MEDIUM",
            "high" => "HIGH",
            _ => "HIGH",
        };
        Some(ThinkingConfig {
            include_thoughts: Some(preset.show_thoughts),
            budget: None,
            thinking_level: Some(level.to_string()),
        })
    } else {
        let budget = match preset.reasoning_effort.as_str() {
            "low" => 1024,
            "medium" => {
                if is_flash {
                    12288
                } else {
                    16384
                }
            }
            "high" => {
                if is_flash {
                    24576
                } else {
                    32768
                }
            }
            _ => 0,
        };
        if budget > 0 {
            Some(ThinkingConfig {
                include_thoughts: Some(preset.show_thoughts),
                budget: Some(budget),
                thinking_level: None,
            })
        } else {
            None
        }
    };

    let google_tools = tools_payload.map(|t_arr| {
        let decls: Vec<_> = t_arr
            .into_iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.function.name,
                    "description": t.function.description,
                    "parameters": t.function.parameters
                })
            })
            .collect();
        vec![serde_json::json!({
            "functionDeclarations": decls
        })]
    });

    // Merge consecutive messages with the same role to strictly satisfy Gemini's alternating roles requirement
    let mut alternating_contents: Vec<GoogleContent> = Vec::new();
    for content in contents {
        if let Some(last) = alternating_contents.last_mut() {
            if last.role == content.role {
                // Merge parts
                last.parts.extend(content.parts);
                continue;
            }
        }
        alternating_contents.push(content);
    }

    // Gemini also requires the first message to be from the user
    if let Some(first) = alternating_contents.first() {
        if first.role != "user" {
            alternating_contents.insert(
                0,
                GoogleContent {
                    role: "user".to_string(),
                    parts: vec![GooglePart {
                        text: Some("Start.".to_string()),
                        inline_data: None,
                        function_call: None,
                        function_response: None,
                    }],
                },
            );
        }
    }

    let req = GoogleRequest {
        contents: alternating_contents,
        generation_config: GoogleConfig {
            temperature: preset.temperature,
            max_output_tokens: preset.openai_max_tokens,
            top_p: preset.top_p,
            thinking_config,
        },
        system_instruction,
        tools: google_tools,
    };

    println!(
        "--- GOOGLE PROMPT DEBUG ---\n{}\n--- END PROMPT ---",
        debug_google_request(&req)
    );

    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse", model, api_key.trim());

    let mut response_text = String::new();
    let res = client
        .post(&url)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Google Request Failed: {}", e.without_url()))?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Google API Error: {}", text));
    }

    let mut stream = res.bytes_stream();
    let mut parsed_tool_calls: Vec<OpenAIToolCall> = Vec::new();

    loop {
        if abort_token.load(Ordering::Relaxed) {
            if !response_text.is_empty() {
                return Ok((response_text, None));
            }
            return Err("Aborted by user".to_string());
        }

        match tokio::time::timeout(std::time::Duration::from_millis(100), stream.next()).await {
            Ok(Some(item)) => match item {
                Ok(chunk) => {
                    let s = String::from_utf8_lossy(&chunk);
                    for line in s.lines() {
                        if let Some(data_str) = line.strip_prefix("data: ") {
                            if data_str.trim() == "[DONE]" {
                                break;
                            }

                            if let Ok(json) = serde_json::from_str::<GoogleStreamResponse>(data_str)
                            {
                                if let Some(candidates) = json.candidates {
                                    if let Some(cand) = candidates.first() {
                                        if let Some(content) = &cand.content {
                                            if let Some(parts) = &content.parts {
                                                for part in parts {
                                                    if let Some(text) = &part.text {
                                                        response_text.push_str(text);
                                                        let _ = app_handle.emit(
                                                            "stream-token",
                                                            StreamPayload {
                                                                content: text.clone(),
                                                                gen_id,
                                                                target_id,
                                                            },
                                                        );
                                                    }
                                                    if let Some(fc) = &part.function_call {
                                                        parsed_tool_calls.push(OpenAIToolCall {
                                                            id: fc.name.clone(),
                                                            tool_type: "function".to_string(),
                                                            function: OpenAIFunctionCall {
                                                                name: fc.name.clone(),
                                                                arguments: serde_json::to_string(
                                                                    &fc.args,
                                                                )
                                                                .unwrap_or_default(),
                                                            },
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => {
                    if !response_text.is_empty() {
                        return Ok((response_text, None));
                    }
                    return Err("Stream Error".to_string());
                }
            },
            Ok(None) => break,
            Err(_) => continue,
        }
    }

    Ok((
        response_text,
        if parsed_tool_calls.is_empty() {
            None
        } else {
            Some(parsed_tool_calls)
        },
    ))
}

pub async fn generate_horde(
    app_handle: AppHandle,
    api_key: String,
    model: String,
    prompt: String,
    preset: &Preset,
    context_size: i32,
    abort_token: Arc<AtomicBool>,
    gen_id: u64,
    target_id: Option<i64>,
) -> Result<String, String> {
    let client = get_client();
    let api_key = if api_key.is_empty() {
        "0000000000".to_string()
    } else {
        api_key
    };

    let req = HordeRequest {
        prompt,
        models: vec![model],
        params: HordeParams {
            n: 1,
            max_context_length: Some(context_size), // USE IT
            max_length: preset.openai_max_tokens,
            rep_pen: preset.repetition_penalty,
            temperature: preset.temperature,
            top_p: preset.top_p,
        },
    };

    // println!("--- HORDE PROMPT DEBUG ---\n{}\n--- END PROMPT ---", serde_json::to_string_pretty(&req).unwrap_or_default());
    println!("--- HORDE PROMPT DEBUG: Sending request... ---");

    // 1. Submit Async Request
    let res = client
        .post("https://stablehorde.net/api/v2/generate/text/async")
        .header("apikey", &api_key)
        .header("Client-Agent", "TavernRev:1.4.0:github.com/TavernRev")
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Horde Request Failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Horde API Error: {} - {}", status, err_text));
    }

    let init_json: HordeAsyncResponse = res.json().await.map_err(|e| e.to_string())?;
    let id = init_json.id;

    // 2. Poll Status
    let mut text = String::new();
    let mut attempts = 0;

    loop {
        if abort_token.load(Ordering::Relaxed) {
            let _ = client
                .delete(format!(
                    "https://stablehorde.net/api/v2/generate/status/{}",
                    id
                ))
                .header("apikey", &api_key)
                .send()
                .await;
            return Err("Aborted by user".to_string());
        }

        if attempts > 120 {
            return Err("Horde Generation Timed Out".to_string());
        }

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        attempts += 1;

        let status_res = client
            .get(format!(
                "https://stablehorde.net/api/v2/generate/text/status/{}",
                id
            ))
            .header("apikey", &api_key)
            .send()
            .await;

        if let Ok(s_res) = status_res {
            if let Ok(status) = s_res.json::<HordeStatusResponse>().await {
                if status.done {
                    if let Some(gens) = status.generations {
                        if let Some(gen) = gens.first() {
                            text = gen.text.clone();
                            // Fake stream emission for UI
                            let _ = app_handle.emit(
                                "stream-token",
                                StreamPayload {
                                    content: text.clone(),
                                    gen_id,
                                    target_id,
                                },
                            );
                        }
                    }
                    break;
                }
            }
        }
    }

    Ok(text)
}

#[derive(Clone, Serialize)]
struct StreamPayload {
    content: String,
    gen_id: u64,
    target_id: Option<i64>,
}

pub async fn generate_stream(
    app_handle: AppHandle,
    api_url: String,
    api_key: String,
    request: OpenAIRequest,
    abort_token: Arc<AtomicBool>,
    gen_id: u64,
    target_id: Option<i64>,
) -> Result<(String, Option<Vec<OpenAIToolCall>>), String> {
    let client = get_client();
    let url = if api_url.ends_with("/chat/completions") {
        api_url
    } else {
        format!("{}/chat/completions", api_url.trim_end_matches('/'))
    };

    let mut response_text = String::new();
    let mut tool_calls_map: std::collections::HashMap<usize, OpenAIToolCall> =
        std::collections::HashMap::new();

    println!(
        "--- OPENAI PROMPT DEBUG ---\n{}\n--- END PROMPT ---",
        debug_openai_request(&request)
    );

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e.without_url()))?;

    if !res.status().is_success() {
        return Err(format!("API Error: {}", res.status()));
    }

    if request.stream {
        let mut stream = res.bytes_stream();

        loop {
            if abort_token.load(Ordering::Relaxed) {
                if !response_text.is_empty() {
                    return Ok((response_text, None));
                }
                return Err("Aborted by user".to_string());
            }

            match tokio::time::timeout(std::time::Duration::from_millis(100), stream.next()).await {
                Ok(Some(item)) => match item {
                    Ok(chunk) => {
                        let s = String::from_utf8_lossy(&chunk);
                        for line in s.lines() {
                            if let Some(data_str) = line.strip_prefix("data: ") {
                                if data_str.trim() == "[DONE]" {
                                    break;
                                }
                                match serde_json::from_str::<OpenAIStreamResponse>(data_str) {
                                    Ok(json) => {
                                        if let Some(choice) = json.choices.first() {
                                            if let Some(content) = &choice.delta.content {
                                                response_text.push_str(content);
                                                let _ = app_handle.emit(
                                                    "stream-token",
                                                    StreamPayload {
                                                        content: content.clone(),
                                                        gen_id,
                                                        target_id,
                                                    },
                                                );
                                            }
                                            if let Some(tc_array) = &choice.delta.tool_calls {
                                                for tc in tc_array.iter() {
                                                    let entry = tool_calls_map
                                                        .entry(tc.index)
                                                        .or_insert(OpenAIToolCall {
                                                            id: tc.id.clone().unwrap_or_default(),
                                                            tool_type: "function".to_string(),
                                                            function: OpenAIFunctionCall {
                                                                name: String::new(),
                                                                arguments: String::new(),
                                                            },
                                                        });
                                                    if let Some(f) = &tc.function {
                                                        if let Some(name) = &f.name {
                                                            entry.function.name.push_str(name);
                                                        }
                                                        if let Some(args) = &f.arguments {
                                                            entry.function.arguments.push_str(args);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        println!(
                                            "DEBUG: Failed to parse stream JSON: {}. Raw data: {}",
                                            e, data_str
                                        );
                                        let _ = app_handle.emit(
                                            "backend-log",
                                            format!("Stream Parse Error: {}. Raw: {}", e, data_str),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => {
                        if !response_text.is_empty() {
                            return Ok((response_text, None));
                        }
                        return Err("Stream Error".to_string());
                    }
                },
                Ok(None) => break,
                Err(_) => continue,
            }
        }
    } else {
        let json: OpenAIResponse = res.json().await.map_err(|e| e.to_string())?;
        if abort_token.load(Ordering::Relaxed) {
            return Err("Aborted by user".to_string());
        }
        if let Some(choice) = json.choices.first() {
            if let Some(content) = &choice.message.content {
                response_text = content.clone();
                if gen_id != 0 {
                    let _ = app_handle.emit(
                        "stream-token",
                        StreamPayload {
                            content: response_text.clone(),
                            gen_id,
                            target_id,
                        },
                    );
                }
            }
            if let Some(tc_array) = &choice.message.tool_calls {
                for (idx, tc) in tc_array.iter().enumerate() {
                    tool_calls_map.insert(idx, tc.clone());
                }
            }
        }
    }

    let final_tool_calls = if tool_calls_map.is_empty() {
        None
    } else {
        let mut calls: Vec<_> = tool_calls_map.into_iter().collect();
        calls.sort_by_key(|(idx, _)| *idx);
        let sorted_calls: Vec<_> = calls.into_iter().map(|(_, tc)| tc).collect();
        Some(sorted_calls)
    };

    Ok((response_text, final_tool_calls))
}

fn debug_openai_request(req: &OpenAIRequest) -> String {
    let mut val = serde_json::to_value(req).unwrap_or(serde_json::Value::Null);
    if let Some(msgs) = val.get_mut("messages").and_then(|m| m.as_array_mut()) {
        for msg in msgs {
            if let Some(content) = msg.get_mut("content") {
                if let Some(parts) = content.as_array_mut() {
                    for part in parts {
                        if part["type"] == "image_url" {
                            if let Some(url_obj) = part.get_mut("image_url") {
                                if let Some(url) = url_obj.get_mut("url") {
                                    *url = serde_json::json!("[BASE64 IMAGE]");
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    serde_json::to_string_pretty(&val).unwrap_or_default()
}

fn debug_google_request(req: &GoogleRequest) -> String {
    let mut val = serde_json::to_value(req).unwrap_or(serde_json::Value::Null);
    if let Some(contents) = val.get_mut("contents").and_then(|c| c.as_array_mut()) {
        for content in contents {
            if let Some(parts) = content.get_mut("parts").and_then(|p| p.as_array_mut()) {
                for part in parts {
                    if let Some(inline) = part.get_mut("inlineData") {
                        if let Some(data) = inline.get_mut("data") {
                            *data = serde_json::json!("[BASE64 IMAGE]");
                        }
                    }
                }
            }
        }
    }
    // Also system instruction
    if let Some(sys) = val.get_mut("system_instruction") {
        if let Some(parts) = sys.get_mut("parts").and_then(|p| p.as_array_mut()) {
            for part in parts {
                if let Some(inline) = part.get_mut("inlineData") {
                    if let Some(data) = inline.get_mut("data") {
                        *data = serde_json::json!("[BASE64 IMAGE]");
                    }
                }
            }
        }
    }
    serde_json::to_string_pretty(&val).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_available_tools() {
        let tools = get_available_tools();
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].tool_type, "function");
        assert_eq!(tools[0].function.name, "get_system_time");
        assert_eq!(tools[1].function.name, "generate_image");
    }

    #[test]
    fn test_openai_message_serialization_with_tools() -> Result<(), String> {
        let tc = OpenAIToolCall {
            id: "call_123".to_string(),
            tool_type: "function".to_string(),
            function: OpenAIFunctionCall {
                name: "get_system_time".to_string(),
                arguments: "{}".to_string(),
            },
        };

        let msg = OpenAIMessage {
            role: "assistant".to_string(),
            content: None,
            tool_calls: Some(vec![tc]),
            tool_call_id: None,
        };

        let json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        assert!(json.contains("tool_calls"));
        assert!(json.contains("get_system_time"));
        assert!(!json.contains("tool_call_id"));
        Ok(())
    }

    #[test]
    fn test_openai_tool_response_serialization() -> Result<(), String> {
        let msg = OpenAIMessage {
            role: "tool".to_string(),
            content: Some(OpenAIContent::Text("Current time is 12:00".to_string())),
            tool_calls: None,
            tool_call_id: Some("call_123".to_string()),
        };

        let json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        assert!(!json.contains("tool_calls"));
        assert!(json.contains("tool_call_id"));
        assert!(json.contains("call_123"));
        Ok(())
    }
}
