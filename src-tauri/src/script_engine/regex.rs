use regex::Regex;
use crate::script_engine::Evaluator;
use crate::database::RegexScript;

pub async fn process_regex_scripts(content: &str, placement: &str, scripts: &[RegexScript], evaluator: &mut Evaluator) -> String {
    let mut final_content = content.to_string();

    for script in scripts {
        // Check placement (user/ai/both)
        let script_placement = script.placement.to_lowercase();
        if script_placement != "both" && script_placement != placement {
            continue;
        }

        // Apply Regex
        if let Ok(re) = Regex::new(&script.regex) {
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
}
