use fancy_regex::Regex;
use crate::script_engine::Evaluator;
use crate::database::RegexScript;

fn normalize_regex_pattern(pattern: &str) -> (String, bool) {
    if !pattern.starts_with('/') || pattern.len() < 2 {
        return (pattern.to_string(), true);
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
            // In a valid JS regex literal, the closing slash is the last unescaped slash before flags
        }
    }

    let Some(closing_index) = closing_index else {
        return (pattern.to_string(), true);
    };

    let body = &pattern[1..closing_index];
    let flags = &pattern[closing_index + 1..];
    let mut prefix = String::new();
    let mut is_global = false;

    if flags.contains('i') { prefix.push('i'); }
    if flags.contains('m') { prefix.push('m'); }
    if flags.contains('s') { prefix.push('s'); }
    if flags.contains('g') { is_global = true; }

    let normalized = if prefix.is_empty() {
        body.to_string()
    } else {
        format!("(?{}){}", prefix, body)
    };

    (normalized, is_global)
}

fn apply_js_replacement(content: &str, replacement: &str, caps: &fancy_regex::Captures) -> String {
    let mut res = String::new();
    let mut chars = replacement.chars().peekable();
    let m = caps.get(0).unwrap();
    
    while let Some(c) = chars.next() {
        if c == '$' {
            if let Some(&next) = chars.peek() {
                match next {
                    '$' => { res.push('$'); chars.next(); },
                    '&' => { res.push_str(m.as_str()); chars.next(); },
                    '`' => { res.push_str(&content[..m.start()]); chars.next(); },
                    '\'' => { res.push_str(&content[m.end()..]); chars.next(); },
                    '0'..='9' => {
                        chars.next();
                        let mut num_str = next.to_string();
                        if let Some(&next_next) = chars.peek() {
                            if next_next.is_ascii_digit() {
                                num_str.push(next_next);
                                chars.next();
                            }
                        }
                        if let Ok(group_idx) = num_str.parse::<usize>() {
                            if let Some(group) = caps.get(group_idx) {
                                res.push_str(group.as_str());
                            }
                        } else {
                            res.push('$');
                            res.push_str(&num_str);
                        }
                    },
                    _ => { res.push('$'); }
                }
            } else {
                res.push('$');
            }
        } else {
            res.push(c);
        }
    }
    res
}

pub async fn process_regex_scripts(content: &str, placement: &str, scripts: &[RegexScript], evaluator: &mut Evaluator) -> String {
    let mut final_content = content.to_string();

    for script in scripts {
        if script.disabled {
            continue;
        }

        // Check placement (user/ai/both)
        let script_placement = script.placement.to_lowercase();
        if script_placement != "both" && script_placement != placement {
            continue;
        }

        // Apply Regex
        let (normalized_pattern, is_global) = normalize_regex_pattern(&script.regex);
        if let Ok(re) = Regex::new(&normalized_pattern) {
            let mut result = String::new();
            let mut last_end = 0;
            let mut changed = false;
            let mut empty_match_preventer = None;
            
            for cap_res in re.captures_iter(&final_content) {
                if let Ok(caps) = cap_res {
                    let m = caps.get(0).unwrap();
                    
                    // Prevent infinite loops on empty matches
                    if m.start() == m.end() {
                        if Some(m.start()) == empty_match_preventer {
                            continue;
                        }
                        empty_match_preventer = Some(m.start());
                    }
                    
                    result.push_str(&final_content[last_end..m.start()]);
                    result.push_str(&apply_js_replacement(&final_content, &script.replacement, &caps));
                    last_end = m.end();
                    changed = true;
                    
                    if !is_global {
                        break;
                    }
                }
            }
            
            if changed {
                result.push_str(&final_content[last_end..]);
                println!("DEBUG: Regex Applied: '{}' -> '{}' (Placement: {}). Result: '{}'", script.regex, script.replacement, script.placement, result);
                final_content = evaluator.evaluate(&result).await;
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
        assert_eq!(normalize_regex_pattern("/apple/g"), ("apple".to_string(), true));
        assert_eq!(normalize_regex_pattern("/apple/is"), ("(?is)apple".to_string(), false));
        assert_eq!(normalize_regex_pattern("apple"), ("apple".to_string(), true));
    }

    #[tokio::test]
    async fn test_regex_js_compatibility() {
        let mut eval = setup_eval().await;

        let scripts = vec![
            // Test non-global (replace first only)
            RegexScript {
                id: 1,
                script_name: "NonGlobal".to_string(),
                regex: "/apple/".to_string(), // No 'g' flag
                replacement: "orange".to_string(),
                placement: "both".to_string(),
                run_on_markdown: false,
            },
            // Test full match ($&) and suffix ($')
            RegexScript {
                id: 2,
                script_name: "JS Replacements".to_string(),
                regex: "/banana/g".to_string(),
                replacement: "<$&> $'!".to_string(),
                placement: "both".to_string(),
                run_on_markdown: false,
            },
            // Test group backreferences ($1)
            RegexScript {
                id: 3,
                script_name: "Groups".to_string(),
                regex: "/(super) (man)/g".to_string(),
                replacement: "$2 $1".to_string(),
                placement: "both".to_string(),
                run_on_markdown: false,
            }
        ];

        let mut res = process_regex_scripts("apple and apple", "user", &scripts[0..1], &mut eval).await;
        assert_eq!(res, "orange and apple"); // Only first replaced

        res = process_regex_scripts("eating banana today", "user", &scripts[1..2], &mut eval).await;
        // matched "banana", $' is " today". So replacement is "<banana>  today!"
        assert_eq!(res, "eating <banana>  today! today");

        res = process_regex_scripts("super man", "user", &scripts[2..3], &mut eval).await;
        assert_eq!(res, "man super");
    }
}
