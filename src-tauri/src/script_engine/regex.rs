use fancy_regex::Regex;
use crate::script_engine::Evaluator;
use crate::database::RegexScript;

fn normalize_regex_pattern(pattern: &str) -> String {
    if !pattern.starts_with('/') || pattern.len() < 2 {
        return pattern.to_string();
    }

    let mut escaped = false;
    let mut closing_index = None;

    for (idx, ch) in pattern.char_indices().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if ch == '/' {
            closing_index = Some(idx);
        }
    }

    let Some(closing_index) = closing_index else {
        return pattern.to_string();
    };

    let body = &pattern[1..closing_index];
    let flags = &pattern[closing_index + 1..];
    let mut prefix = String::new();

    if flags.contains('i') {
        prefix.push('i');
    }
    if flags.contains('m') {
        prefix.push('m');
    }
    if flags.contains('s') {
        prefix.push('s');
    }

    if prefix.is_empty() {
        body.to_string()
    } else {
        format!("(?{}){}", prefix, body)
    }
}

pub async fn process_regex_scripts(content: &str, placement: &str, scripts: &[RegexScript], evaluator: &mut Evaluator) -> String {
    let mut final_content = content.to_string();

    for script in scripts {
        // Check placement (user/ai/both)
        let script_placement = script.placement.to_lowercase();
        if script_placement != "both" && script_placement != placement {
            continue;
        }

        // Apply Regex
        let normalized_pattern = normalize_regex_pattern(&script.regex);
        if let Ok(re) = Regex::new(&normalized_pattern) {
            // Regex replacement (supports $1, $2 for captures)
            let replaced_cow = re.replace_all(&final_content, &script.replacement);
            let replaced = replaced_cow.to_string();
            
            // If the content changed or script runs anyway, verify macros
            if replaced != final_content {
                println!("DEBUG: Regex Applied: '{}' -> '{}' (Placement: {}). Result: '{}'", script.regex, script.replacement, script.placement, replaced);
                // Run macros on the replaced string
                // Example: regex="attack", replacement="{{setvar::hp::{{sub::{{getvar::hp}}::10}}}}You attack!"
                final_content = evaluator.evaluate(&replaced).await;
            }
        }
    }
    
    final_content
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script_engine::ScriptContext;
    use std::collections::HashMap;

    async fn setup_eval() -> Evaluator {
        Evaluator::new(ScriptContext {
            vars: HashMap::new(),
            globals: HashMap::new(),
            char_name: "Bot".to_string(),
            user_name: "You".to_string(),
        })
    }

    #[tokio::test]
    async fn test_regex_placement_filtering() {
        let mut eval = setup_eval().await;
        let scripts = vec![
            RegexScript {
                id: 1,
                script_name: "AI Only".to_string(),
                regex: "apple".to_string(),
                replacement: "orange".to_string(),
                placement: "ai".to_string(),
                run_on_markdown: false,
            }
        ];
        
        // Should not replace because placement is "user" but script is "ai"
        let res_user = process_regex_scripts("I have an apple", "user", &scripts, &mut eval).await;
        assert_eq!(res_user, "I have an apple");

        // Should replace because placement matches
        let res_ai = process_regex_scripts("I have an apple", "ai", &scripts, &mut eval).await;
        assert_eq!(res_ai, "I have an orange");
    }

    #[tokio::test]
    async fn test_regex_macro_evaluation() {
        let mut eval = setup_eval().await;
        eval.set_var("fruit", "banana");

        let scripts = vec![
            RegexScript {
                id: 2,
                script_name: "Macro Inject".to_string(),
                regex: "apple".to_string(),
                replacement: "{{getvar:fruit}}".to_string(),
                placement: "both".to_string(),
                run_on_markdown: false,
            }
        ];

        let res = process_regex_scripts("I have an apple", "user", &scripts, &mut eval).await;
        assert_eq!(res, "I have an banana"); // The macro is evaluated AFTER replacement!
    }

    #[test]
    fn test_normalize_js_regex_literal() {
        assert_eq!(normalize_regex_pattern("/apple/g"), "apple");
        assert_eq!(normalize_regex_pattern("/apple/is"), "(?is)apple");
        assert_eq!(normalize_regex_pattern("apple"), "apple");
    }
}
