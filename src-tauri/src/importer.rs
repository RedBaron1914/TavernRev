use serde::Deserialize;
use base64::{Engine as _, engine::general_purpose};
use crate::database::Character;

#[derive(Deserialize, Debug)]
struct V2Data {
    name: String,
    description: Option<String>,
    personality: Option<String>,
    scenario: Option<String>,
    first_mes: Option<String>,
    mes_example: Option<String>,
    creator_notes: Option<String>,
    system_prompt: Option<String>,
    post_history_instructions: Option<String>,
    alternate_greetings: Option<Vec<String>>,
    tags: Option<Vec<String>>,
    creator: Option<String>,
    character_version: Option<String>,
    extensions: Option<serde_json::Value>,
    character_book: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct V2Card {
    #[allow(dead_code)]
    spec: String,
    #[allow(dead_code)]
    spec_version: String,
    data: V2Data,
}

fn convert_v2_to_char(v2_card: V2Card) -> Result<Character, String> {
    let d = v2_card.data;
    Ok(Character {
        id: 0,
        name: d.name,
        avatar: String::new(),
        description: d.description.unwrap_or_default(),
        personality: d.personality.unwrap_or_default(),
        scenario: d.scenario.unwrap_or_default(),
        first_mes: d.first_mes.unwrap_or_default(),
        mes_example: d.mes_example.unwrap_or_default(),
        creator_notes: d.creator_notes.unwrap_or_default(),
        tags: serde_json::to_string(&d.tags.unwrap_or_default()).unwrap_or("[]".to_string()),
        alternate_greetings: serde_json::to_string(&d.alternate_greetings.unwrap_or_default()).unwrap_or("[]".to_string()),
        card_data: serde_json::json!({
            "extensions": d.extensions,
            "character_book": d.character_book,
            "creator": d.creator,
            "character_version": d.character_version,
            "system_prompt": d.system_prompt,
            "post_history_instructions": d.post_history_instructions
        }).to_string(),
        created_at: String::new(),
        uuid: String::new(),
        updated_at: String::new(),
        is_muted: false,
    })
}

pub fn import_character_from_data(buffer: &[u8]) -> Result<Character, String> {
    // 1. Try Direct JSON
    if let Ok(v2_card) = serde_json::from_slice::<V2Card>(buffer) {
        return convert_v2_to_char(v2_card);
    }

    // 2. Try PNG "chara" chunk
    let search_key = b"chara\0";
    let start_idx = buffer.windows(search_key.len())
        .position(|window| window == search_key);

    let json_data = if let Some(idx) = start_idx {
        if idx < 8 {
            return Err("Invalid PNG structure: 'chara' found too early".to_string());
        }
        
        let len_slice = &buffer[idx-8..idx-4];
        let chunk_len = u32::from_be_bytes(len_slice.try_into().map_err(|_| "Failed to read chunk length")?) as usize;
        
        if chunk_len < 6 {
             return Err("Invalid chunk length".to_string());
        }
        
        let text_len = chunk_len - 6;
        let content_start = idx + 6;
        
        if content_start + text_len > buffer.len() {
            return Err("Chunk length exceeds buffer".to_string());
        }

        let base64_data = &buffer[content_start .. content_start + text_len];
        
        let decoded_bytes = general_purpose::STANDARD.decode(base64_data)
            .map_err(|e| format!("Base64 decode error: {}", e))?;
        String::from_utf8(decoded_bytes).map_err(|e| format!("UTF8 error: {}", e))?
    } else {
        return Err("No 'chara' chunk found in PNG/JSON".to_string());
    };

    // Try V2
    if let Ok(v2_card) = serde_json::from_str::<V2Card>(&json_data) {
        return convert_v2_to_char(v2_card);
    }

    // Try V1 (Flat)
    if let Ok(v1_data) = serde_json::from_str::<V2Data>(&json_data) {
        let v2_fake = V2Card {
            spec: "chara_card_v2".to_string(),
            spec_version: "1.0".to_string(),
            data: v1_data,
        };
        return convert_v2_to_char(v2_fake);
    }

    Err("Unknown character card format (Neither V2 nor V1)".to_string())
}
