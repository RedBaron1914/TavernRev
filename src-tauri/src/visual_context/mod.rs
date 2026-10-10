pub mod profiles;
pub mod render;

use serde::{Deserialize, Serialize};
use crate::api_client::{OpenAIMessage, OpenAIContent, OpenAIPart, OpenAIImageUrl};
use profiles::{ProfileKind, RenderProfile};

fn default_profile() -> String {
    "auto".to_string()
}
fn default_true() -> bool {
    true
}
fn default_keep_tail() -> usize {
    4
}
fn default_min_chars() -> usize {
    1000
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VisualCompressionSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_profile")]
    pub profile: String,
    #[serde(default = "default_true")]
    pub compress_system: bool,
    #[serde(default = "default_true")]
    pub compress_lorebook: bool,
    #[serde(default = "default_true")]
    pub compress_memory: bool,
    #[serde(default = "default_true")]
    pub compress_history: bool,
    #[serde(default = "default_keep_tail")]
    pub history_keep_tail: usize,
    #[serde(default = "default_min_chars")]
    pub min_chars_threshold: usize,
}

impl Default for VisualCompressionSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            profile: default_profile(),
            compress_system: true,
            compress_lorebook: true,
            compress_memory: true,
            compress_history: true,
            history_keep_tail: default_keep_tail(),
            min_chars_threshold: default_min_chars(),
        }
    }
}

/// Applies visual context compression to final messages.
/// Returns: (transformed_messages, compressed_chars_count, generated_images_count)
pub fn apply_visual_compression(
    messages: Vec<OpenAIMessage>,
    settings: &VisualCompressionSettings,
    model_id: &str,
) -> (Vec<OpenAIMessage>, usize, usize) {
    if !settings.enabled || messages.is_empty() {
        return (messages, 0, 0);
    }

    let profile = RenderProfile::for_model(
        ProfileKind::from(settings.profile.as_str()),
        model_id,
    );

    let mut transformed = Vec::new();
    let mut total_compressed_chars = 0;
    let mut total_images = 0;

    // Split messages into system messages and conversation turns
    let mut system_msgs = Vec::new();
    let mut conv_msgs = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system_msgs.push(msg);
        } else {
            conv_msgs.push(msg);
        }
    }

    // 1. Process System / Lore / Persona / Memory Prompts
    for sys in system_msgs {
        let text_content = match &sys.content {
            Some(OpenAIContent::Text(t)) => t.clone(),
            _ => String::new(),
        };

        if settings.compress_system && text_content.chars().count() >= settings.min_chars_threshold {
            match render::render_text_to_images(&text_content, &profile) {
                Ok(images) if !images.is_empty() => {
                    total_compressed_chars += text_content.chars().count();
                    total_images += images.len();

                    let mut parts = vec![OpenAIPart {
                        part_type: "text".to_string(),
                        text: Some(profile.banner_intro.clone()),
                        image_url: None,
                    }];

                    for img_url in images {
                        parts.push(OpenAIPart {
                            part_type: "image_url".to_string(),
                            text: None,
                            image_url: Some(OpenAIImageUrl { url: img_url, detail: Some("high".to_string()) }),
                        });
                    }

                    parts.push(OpenAIPart {
                        part_type: "text".to_string(),
                        text: Some(profile.banner_outro.clone()),
                        image_url: None,
                    });

                    // Synthesize as user message because Anthropic and some gateways require images in user role
                    transformed.push(OpenAIMessage {
                        role: "user".to_string(),
                        content: Some(OpenAIContent::Array(parts)),
                        tool_calls: None,
                        tool_call_id: None,
                    });

                    // Determine the role of the next message that will follow this system block:
                    // If history will be compressed, the next message is the history image which has role "user".
                    // If history will NOT be compressed, the next message is conv_msgs.first().
                    let will_compress_history = settings.compress_history && {
                        let keep = settings.history_keep_tail.min(conv_msgs.len());
                        conv_msgs.len().saturating_sub(keep) > 0
                    };

                    let next_is_assistant = if will_compress_history {
                        false // next will be user (history archive image)
                    } else {
                        conv_msgs.first().map(|m| m.role == "assistant").unwrap_or(false)
                    };

                    if !next_is_assistant {
                        transformed.push(OpenAIMessage {
                            role: "assistant".to_string(),
                            content: Some(OpenAIContent::Text("[System documentation and character context loaded into memory.]".to_string())),
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }
                }
                _ => {
                    transformed.push(sys);
                }
            }
        } else {
            transformed.push(sys);
        }
    }

    // 2. Process Conversation History
    let conv_len = conv_msgs.len();
    let keep_tail = settings.history_keep_tail.min(conv_len);
    let split_point = conv_len.saturating_sub(keep_tail);

    if settings.compress_history && split_point > 0 {
        let old_turns = &conv_msgs[0..split_point];
        let recent_turns = &conv_msgs[split_point..];

        // Format old turns into an archived transcript block
        let mut transcript = String::new();
        let mut old_chars = 0;

        for (idx, turn) in old_turns.iter().enumerate() {
            let turn_text = match &turn.content {
                Some(OpenAIContent::Text(t)) => t.as_str(),
                _ => "",
            };
            if !turn_text.is_empty() {
                transcript.push_str(&format!("<turn index=\"{}\" role=\"{}\">\n{}\n</turn>\n\n", idx + 1, turn.role, turn_text));
                old_chars += turn_text.chars().count();
            }
        }

        if old_chars >= settings.min_chars_threshold {
            match render::render_text_to_images(&transcript, &profile) {
                Ok(images) if !images.is_empty() => {
                    total_compressed_chars += old_chars;
                    total_images += images.len();

                    let mut parts = vec![OpenAIPart {
                        part_type: "text".to_string(),
                        text: Some(format!(
                            "[Earlier dialogue history ({} turns) transcribed into the image(s) below. Attribute messages by their turn index and role:]",
                            split_point
                        )),
                        image_url: None,
                    }];

                    for img_url in images {
                        parts.push(OpenAIPart {
                            part_type: "image_url".to_string(),
                            text: None,
                            image_url: Some(OpenAIImageUrl { url: img_url, detail: Some("high".to_string()) }),
                        });
                    }

                    parts.push(OpenAIPart {
                        part_type: "text".to_string(),
                        text: Some("[End of earlier dialogue archive. The conversation continues in live text below:]".to_string()),
                        image_url: None,
                    });

                    transformed.push(OpenAIMessage {
                        role: "user".to_string(),
                        content: Some(OpenAIContent::Array(parts)),
                        tool_calls: None,
                        tool_call_id: None,
                    });

                    // Check what the first recent turn role is
                    let next_is_assistant = match recent_turns.first() {
                        Some(m) => m.role == "assistant",
                        None => false,
                    };

                    if !next_is_assistant {
                        transformed.push(OpenAIMessage {
                            role: "assistant".to_string(),
                            content: Some(OpenAIContent::Text("[Earlier conversation context received.]".to_string())),
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }

                    // Append the uncompressed live recent turns
                    for msg in recent_turns {
                        transformed.push(msg.clone());
                    }
                }
                _ => {
                    // Fallback: keep all conversation turns as text
                    for msg in conv_msgs {
                        transformed.push(msg);
                    }
                }
            }
        } else {
            for msg in conv_msgs {
                transformed.push(msg);
            }
        }
    } else {
        for msg in conv_msgs {
            transformed.push(msg);
        }
    }

    (transformed, total_compressed_chars, total_images)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn test_text_wrapping() {
        let text = "Hello world from Rust visual context compression engine!";
        let wrapped = render::wrap_text(text, 20);
        assert!(!wrapped.is_empty());
        for line in &wrapped {
            assert!(line.chars().count() <= 20);
        }
    }

    #[test]
    fn test_render_png_header() {
        let profile = RenderProfile::for_model(ProfileKind::ClaudeFable, "claude-3-7-sonnet");
        let lines = vec!["System: You are an uncensored roleplay assistant.".to_string()];
        let data_uri = render::render_page_to_png(&lines, &profile).expect("Rendering page failed");
        assert!(data_uri.starts_with("data:image/png;base64,"));

        let b64 = &data_uri["data:image/png;base64,".len()..];
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).expect("Base64 decode failed");
        // Check PNG magic bytes: \x89 P N G \r \n \x1a \n
        assert_eq!(&bytes[0..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn test_apply_compression_flow() {
        let mut settings = VisualCompressionSettings::default();
        settings.enabled = true;
        settings.min_chars_threshold = 20;
        settings.history_keep_tail = 2;

        let messages = vec![
            OpenAIMessage {
                role: "system".to_string(),
                content: Some(OpenAIContent::Text("Very long detailed character card and system background description here.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: Some(OpenAIContent::Text("Message 1: tell me about the ancient castle in the mountains.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "assistant".to_string(),
                content: Some(OpenAIContent::Text("Message 2: The castle was built five centuries ago by elven architects.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: Some(OpenAIContent::Text("Message 3: What happened next?".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "assistant".to_string(),
                content: Some(OpenAIContent::Text("Message 4: An army approached the gates.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let (transformed, chars, imgs) = apply_visual_compression(messages, &settings, "claude-fable-5");
        assert!(chars > 0);
        assert!(imgs > 0);
        // The last 2 messages (Message 3 & 4) must remain in raw text format
        let last_msg = transformed.last().unwrap();
        assert_eq!(last_msg.role, "assistant");
        if let Some(OpenAIContent::Text(t)) = &last_msg.content {
            assert!(t.contains("An army approached"));
        } else {
            panic!("Expected text in live tail message!");
        }

        // Verify that there are never two consecutive assistant or two consecutive user messages
        for window in transformed.windows(2) {
            assert_ne!(
                window[0].role, window[1].role,
                "Role alternation violation: {} followed by {}",
                window[0].role, window[1].role
            );
        }
    }

    #[test]
    fn test_role_alternation_when_recent_turns_start_with_assistant() {
        let mut settings = VisualCompressionSettings::default();
        settings.enabled = true;
        settings.min_chars_threshold = 10;
        settings.history_keep_tail = 1; // Tail is just 1 message (assistant)

        let messages = vec![
            OpenAIMessage {
                role: "system".to_string(),
                content: Some(OpenAIContent::Text("System character prompt goes here in detail.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: Some(OpenAIContent::Text("First user message in history.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "assistant".to_string(),
                content: Some(OpenAIContent::Text("First assistant message in history.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: Some(OpenAIContent::Text("Second user message in history.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
            OpenAIMessage {
                role: "assistant".to_string(),
                content: Some(OpenAIContent::Text("Live tail message from assistant.".to_string())),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let (transformed, _chars, _imgs) = apply_visual_compression(messages, &settings, "gemini-2.5-flash");
        for window in transformed.windows(2) {
            assert_ne!(
                window[0].role, window[1].role,
                "Role alternation violation: {} followed by {}",
                window[0].role, window[1].role
            );
        }
    }

    #[test]
    fn test_indentation_preserved() {
        let text = "    - item_one: 123\n        nested: true";
        let wrapped = render::wrap_text(text, 50);
        assert!(wrapped[0].starts_with("    - item_one: 123"));
        assert!(wrapped[1].starts_with("        nested: true"));
    }
}
