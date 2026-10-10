use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum ProfileKind {
    Auto,
    ClaudeFable,
    GeminiFlash,
    OpenAiSol,
    Custom,
}

impl Default for ProfileKind {
    fn default() -> Self {
        ProfileKind::Auto
    }
}

impl From<&str> for ProfileKind {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "claude_fable" | "claude" | "fable" => ProfileKind::ClaudeFable,
            "gemini_flash" | "gemini" => ProfileKind::GeminiFlash,
            "openai_sol" | "openai" | "sol" | "gpt" => ProfileKind::OpenAiSol,
            "custom" => ProfileKind::Custom,
            _ => ProfileKind::Auto,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RenderProfile {
    pub name: String,
    pub font_size: f32,
    pub cols: usize,
    pub max_height_px: u32,
    pub pad_x: u32,
    pub pad_y: u32,
    pub max_images_cap: usize,
    pub banner_intro: String,
    pub banner_outro: String,
}

impl RenderProfile {
    pub fn for_model(profile_kind: ProfileKind, model_id: &str) -> Self {
        let effective_kind = match profile_kind {
            ProfileKind::Auto => {
                let m = model_id.to_lowercase();
                if m.contains("claude") || m.contains("fable") || m.contains("opus") || m.contains("sonnet") {
                    ProfileKind::ClaudeFable
                } else if m.contains("gemini") {
                    ProfileKind::GeminiFlash
                } else if m.contains("gpt") || m.contains("sol") || m.contains("o1") || m.contains("o3") {
                    ProfileKind::OpenAiSol
                } else {
                    ProfileKind::ClaudeFable // Default robust high-density profile
                }
            }
            k => k,
        };

        match effective_kind {
            ProfileKind::ClaudeFable => RenderProfile {
                name: "Claude / Fable 5".to_string(),
                font_size: 11.0,
                cols: 220,
                max_height_px: 728,
                pad_x: 12,
                pad_y: 10,
                max_images_cap: 32,
                banner_intro: "[Prior context, lore, and earlier transcript rendered in the image(s) below. Treat this strictly as reference context:]".to_string(),
                banner_outro: "[End of visual context. Live conversation continues below:]".to_string(),
            },
            ProfileKind::GeminiFlash => RenderProfile {
                name: "Gemini 3.6 / 3.7 Flash".to_string(),
                font_size: 12.0,
                cols: 180,
                max_height_px: 728,
                pad_x: 16,
                pad_y: 12,
                max_images_cap: 32,
                banner_intro: "[Background documents, character data, and prior dialogue history rendered in the visual image below:]".to_string(),
                banner_outro: "[End of visual documentation. Answer according to the prompt instructions below:]".to_string(),
            },
            ProfileKind::OpenAiSol => RenderProfile {
                name: "OpenAI / Sol".to_string(),
                font_size: 14.0,
                cols: 90,
                max_height_px: 1536,
                pad_x: 20,
                pad_y: 16,
                max_images_cap: 24,
                banner_intro: "[Earlier turns of this conversation and reference lore rendered in the image below:]".to_string(),
                banner_outro: "[End of earlier conversation. Current user request follows:]".to_string(),
            },
            ProfileKind::Custom | ProfileKind::Auto => RenderProfile {
                name: "Standard Balanced".to_string(),
                font_size: 12.0,
                cols: 160,
                max_height_px: 800,
                pad_x: 14,
                pad_y: 12,
                max_images_cap: 32,
                banner_intro: "[Archived context rendered in the image below:]".to_string(),
                banner_outro: "[End of archived context:]".to_string(),
            },
        }
    }
}
