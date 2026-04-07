use rand::seq::SliceRandom;
use rand::Rng;
use rusqlite::Connection;
use crate::database::{Character, Message};

fn get_talkativeness(char: &Character) -> f64 {
    if char.card_data.trim().is_empty() { return 0.5; }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&char.card_data) {
        // Try direct extensions object first (from importer.rs)
        if let Some(ext) = v.get("extensions") {
            if let Some(t) = ext.get("talkativeness").and_then(|t| t.as_f64()) {
                return t;
            }
            if let Some(t_str) = ext.get("talkativeness").and_then(|t| t.as_str()) {
                return t_str.parse::<f64>().unwrap_or(0.5);
            }
        }
        // Try V2 wrapper format just in case
        if let Some(data) = v.get("data") {
            if let Some(ext) = data.get("extensions") {
                if let Some(t) = ext.get("talkativeness").and_then(|t| t.as_f64()) {
                    return t;
                }
                if let Some(t_str) = ext.get("talkativeness").and_then(|t| t.as_str()) {
                    return t_str.parse::<f64>().unwrap_or(0.5);
                }
            }
        }
    }
    0.5
}

pub fn determine_next_speaker(
    _conn: &Connection,
    members: &[Character],
    last_messages: &[Message],
    activation_strategy: i64,
    allow_self_responses: bool,
) -> Result<Option<Character>, String> {
    let mut active_members: Vec<Character> = members.iter().filter(|m| !m.is_muted).cloned().collect();
    
    if active_members.is_empty() {
        return Err("All group members are muted.".to_string());
    }

    // STRATEGY 2: Manual
    if activation_strategy == 2 {
        return Err("MANUAL_ROUTING_REQUIRED".to_string());
    }

    // Self-Responses check
    let last_char_message = last_messages.iter().rev().find(|m| m.role == "char");
    let last_speaker_id = last_char_message.and_then(|m| m.sender_id);

    if !allow_self_responses && active_members.len() > 1 {
        if let Some(lsid) = last_speaker_id {
            active_members.retain(|m| m.id != lsid);
        }
    }

    // STRATEGY 1: List (Round Robin)
    if activation_strategy == 1 {
        if let Some(lsid) = last_speaker_id {
            // Find the original index in the FULL members list (even muted ones might have spoken before being muted)
            if let Some(idx) = members.iter().position(|m| m.id == lsid) {
                // Scan forward to find the next active member
                for offset in 1..=members.len() {
                    let next_idx = (idx + offset) % members.len();
                    let candidate = &members[next_idx];
                    if !candidate.is_muted
                        && (allow_self_responses || candidate.id != lsid || active_members.len() == 1) {
                             return Ok(Some(candidate.clone()));
                        }
                }
            }
        }
        return Ok(Some(active_members[0].clone()));
    }

    // STRATEGY 0: Natural (Default)
    let mut rng = rand::thread_rng();

    // 1. Mentions Check
    if let Some(last_msg) = last_messages.last() {
        let text_words: Vec<&str> = last_msg.content.split(|c: char| !c.is_alphanumeric()).filter(|s| !s.is_empty()).collect();
        
        let mut mentioned_members = Vec::new();
        for member in &active_members {
            let name_parts: Vec<&str> = member.name.split_whitespace().collect();
            let mut is_mentioned = false;
            
            for part in name_parts {
                let part_lower = part.to_lowercase();
                if text_words.iter().any(|w| w.to_lowercase() == part_lower) {
                    is_mentioned = true;
                    break;
                }
            }
            
            if is_mentioned {
                mentioned_members.push(member.clone());
            }
        }

        if !mentioned_members.is_empty() {
            let chosen = mentioned_members.choose(&mut rng).unwrap();
            return Ok(Some(chosen.clone()));
        }
    }

    // 2. Talkativeness Check
    let mut willing_members = Vec::new();
    for member in &active_members {
        let prob = get_talkativeness(member);
        if rng.gen::<f64>() <= prob {
            willing_members.push(member.clone());
        }
    }

    if !willing_members.is_empty() {
        let chosen = willing_members.choose(&mut rng).unwrap();
        return Ok(Some(chosen.clone()));
    }

    // 3. Random Fallback
    let chosen = active_members.choose(&mut rng).unwrap();
    Ok(Some(chosen.clone()))
}
