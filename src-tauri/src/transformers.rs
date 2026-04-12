use crate::prompt_engine::Message;

pub fn merge_consecutive_roles(mut messages: Vec<Message>) -> Vec<Message> {
    println!("DEBUG: Merging messages. Count before: {}", messages.len());
    if messages.is_empty() {
        return messages;
    }

    let mut merged = Vec::new();
    let mut current = messages.remove(0);

    for msg in messages {
        if msg.role == current.role && msg.name == current.name {
            current.content.push_str("\n\n");
            current.content.push_str(&msg.content);

            // Merge images
            if let Some(imgs) = msg.images {
                let current_imgs = current.images.get_or_insert(Vec::new());
                current_imgs.extend(imgs);
            }
        } else {
            merged.push(current);
            current = msg;
        }
    }
    merged.push(current);
    println!("DEBUG: Count after: {}", merged.len());
    merged
} // "Semi-Strict": Alternating roles (User -> Assistant).
  // Matches SillyTavern's logic exactly: Squash -> Convert Mid-Systems -> Squash Again.
pub fn enforce_alternating_roles(messages: Vec<Message>) -> Vec<Message> {
    // 1. Initial Merge: Squash consecutive messages (e.g. System+System -> System)
    let mut squashed = merge_consecutive_roles(messages);

    // 2. Strict Conversion: Any System message that isn't at index 0 becomes User
    for (i, msg) in squashed.iter_mut().enumerate() {
        if i > 0 && msg.role == "system" {
            msg.role = "user".to_string();
        }
    }

    // 3. Second Merge: Squash the converted User messages with adjacent User messages
    let mut merged = merge_consecutive_roles(squashed);

    // 4. Ensure alternation start (User must follow System)
    if let Some(first_idx) = merged.iter().position(|m| m.role != "system") {
        if merged[first_idx].role == "assistant" {
            merged.insert(
                first_idx,
                Message {
                    role: "user".to_string(),
                    content: "[Start Chat]".to_string(),
                    name: None,
                    images: None,
                    db_id: None,
                },
            );
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_consecutive_roles() {
        let msgs = vec![
            Message {
                role: "system".to_string(),
                content: "Sys1".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
            Message {
                role: "system".to_string(),
                content: "Sys2".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
            Message {
                role: "user".to_string(),
                content: "Usr1".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
            Message {
                role: "user".to_string(),
                content: "Usr2".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
        ];
        let merged = merge_consecutive_roles(msgs);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].content, "Sys1\n\nSys2");
        assert_eq!(merged[1].content, "Usr1\n\nUsr2");
    }

    #[test]
    fn test_enforce_alternating_roles() {
        let msgs = vec![
            Message {
                role: "system".to_string(),
                content: "S1".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
            Message {
                role: "assistant".to_string(),
                content: "A1".to_string(),
                name: None,
                images: None,
                db_id: None,
            }, // Out of order!
            Message {
                role: "system".to_string(),
                content: "S2".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
            Message {
                role: "user".to_string(),
                content: "U1".to_string(),
                name: None,
                images: None,
                db_id: None,
            },
        ];
        let strict = enforce_alternating_roles(msgs);
        assert_eq!(strict[0].role, "system");
        assert_eq!(strict[0].content, "S1");
        assert_eq!(strict[1].role, "user"); // Inserted dummy user to enforce alternation!
        assert_eq!(strict[1].content, "[Start Chat]");
        assert_eq!(strict[2].role, "assistant");
        assert_eq!(strict[2].content, "A1");
        assert_eq!(strict[3].role, "user");
        assert_eq!(strict[3].content, "S2\n\nU1"); // S2 squashed into User!
    }
}
