use std::collections::HashMap;
use super::ast::Node;
use super::parser::Parser;
use rand::seq::SliceRandom;
use rand::Rng;
use chrono::Local;
use async_recursion::async_recursion;
use tokio::time::{sleep, Duration};

pub struct ScriptContext {
    pub vars: HashMap<String, String>,
    pub globals: HashMap<String, String>,
    pub char_name: String,
    pub user_name: String,
}

pub struct Evaluator {
    context: ScriptContext,
}

impl Evaluator {
    pub fn new(context: ScriptContext) -> Self {
        Self { context }
    }

    #[async_recursion]
    pub async fn evaluate(&mut self, text: &str) -> String {
        let mut parser = Parser::new(text);
        let nodes = parser.parse();
        self.execute_nodes(nodes).await
    }

    pub fn get_vars(&self) -> HashMap<String, String> {
        self.context.vars.clone()
    }

    pub fn set_var(&mut self, key: &str, value: &str) {
        self.context.vars.insert(key.to_string(), value.to_string());
    }

    pub fn get_globals(&self) -> HashMap<String, String> { self.context.globals.clone() }
    pub fn set_global(&mut self, key: &str, value: &str) { self.context.globals.insert(key.to_string(), value.to_string()); }

    async fn execute_nodes(&mut self, nodes: Vec<Node>) -> String {
        let mut output = String::new();
        for node in nodes {
            match node {
                Node::Text(t) => output.push_str(&t),
                Node::Macro { name, args, original } => {
                    output.push_str(&self.execute_macro(&name, &args, &original).await);
                },
                _ => {}
            }
        }
        output
    }

    #[async_recursion]
    async fn execute_macro(&mut self, name: &str, raw_args: &[String], original: &str) -> String {
        // Recursively evaluate the argument string first
        let arg_content = raw_args.first().map(|s| s.as_str()).unwrap_or("");
        let eval_args = self.evaluate(arg_content).await;
        
        let args: Vec<&str> = if eval_args.contains("::") {
            eval_args.split("::").collect()
        } else if eval_args.contains(',') {
            eval_args.split(',').collect()
        } else {
            eval_args.split(':').collect()
        };

        match name.to_lowercase().as_str() {
            "wait" | "delay" | "sleep" => {
                let duration_sec = args.first().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(1.0);
                let ms = (duration_sec * 1000.0) as u64;
                sleep(Duration::from_millis(ms)).await;
                String::new()
            },
            "setvar" => {
                if args.len() >= 2 {
                    let key = args[0].trim().to_string();
                    let val = args[1..].join("::"); // Handle value with ::
                    self.context.vars.insert(key, val);
                }
                String::new()
            },
            "getvar" => {
                if let Some(key) = args.first() {
                    self.context.vars.get(key.trim()).cloned().unwrap_or_default()
                } else {
                    String::new()
                }
            },
            "setglobalvar" => {
                if args.len() >= 2 {
                    let key = args[0].trim().to_string();
                    let val = args[1..].join("::");
                    self.context.globals.insert(key, val);
                }
                String::new()
            },
            "getglobalvar" => {
                if let Some(key) = args.first() {
                    self.context.globals.get(key.trim()).cloned().unwrap_or_default()
                } else {
                    String::new()
                }
            },
            "random" | "pick" => {
                let mut rng = rand::thread_rng();
                args.choose(&mut rng).unwrap_or(&"").trim().to_string()
            },
            "roll" => {
                let formula = args.first().unwrap_or(&"1d20").trim();
                let re = regex::Regex::new(r"(\d+)?d(\d+)(?:\+(\d+))?").unwrap();
                let mut rng = rand::thread_rng();
                if let Some(caps) = re.captures(formula) {
                    let count: u32 = caps.get(1).map_or(1, |m| m.as_str().parse().unwrap_or(1));
                    let sides: u32 = caps[2].parse().unwrap_or(20);
                    let bonus: u32 = caps.get(3).map_or(0, |m| m.as_str().parse().unwrap_or(0));
                    
                    if sides == 0 { "0".to_string() } else {
                        let mut total = 0;
                        for _ in 0..count {
                            total += rng.gen_range(1..=sides);
                        }
                        (total + bonus).to_string()
                    }
                } else {
                    "0".to_string()
                }
            },
            "add" | "sum" => args.iter().filter_map(|s| s.trim().parse::<f64>().ok()).sum::<f64>().to_string(),
            "sub" => {
                if let Some(first) = args.first().and_then(|s| s.trim().parse::<f64>().ok()) {
                    let rest: f64 = args.iter().skip(1).filter_map(|s| s.trim().parse::<f64>().ok()).sum();
                    (first - rest).to_string()
                } else { "0".to_string() }
            },
            "mul" => args.iter().filter_map(|s| s.trim().parse::<f64>().ok()).product::<f64>().to_string(),
            "div" => {
                if let Some(first) = args.first().and_then(|s| s.trim().parse::<f64>().ok()) {
                    let second = args.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(1.0);
                    if second != 0.0 { (first / second).to_string() } else { "0".to_string() }
                } else { "0".to_string() }
            },
            "gt" => {
                let a = args.first().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                let b = args.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                if a > b { "true".to_string() } else { "".to_string() }
            },
            "lt" => {
                let a = args.first().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                let b = args.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                if a < b { "true".to_string() } else { "".to_string() }
            },
            "gte" => {
                let a = args.first().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                let b = args.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                if a >= b { "true".to_string() } else { "".to_string() }
            },
            "lte" => {
                let a = args.first().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                let b = args.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
                if a <= b { "true".to_string() } else { "".to_string() }
            },
            "not" => {
                let val = args.first().map(|s| s.trim()).unwrap_or("");
                if val.is_empty() || val == "false" || val == "0" { "true".to_string() } else { "".to_string() }
            },
            "or" => {
                let a = args.first().map(|s| s.trim()).unwrap_or("");
                let b = args.get(1).map(|s| s.trim()).unwrap_or("");
                if !a.is_empty() && a != "false" && a != "0" { a.to_string() }
                else if !b.is_empty() && b != "false" && b != "0" { b.to_string() }
                else { "".to_string() }
            },
            "and" => {
                let a = args.first().map(|s| s.trim()).unwrap_or("");
                let b = args.get(1).map(|s| s.trim()).unwrap_or("");
                let a_truthy = !a.is_empty() && a != "false" && a != "0";
                let b_truthy = !b.is_empty() && b != "false" && b != "0";
                if a_truthy && b_truthy { b.to_string() } else { "".to_string() }
            },
            "incvar" => {
                if let Some(key) = args.first() {
                    let key = key.trim();
                    let current = self.context.vars.get(key).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
                    let new_val = current + 1.0;
                    self.context.vars.insert(key.to_string(), new_val.to_string());
                    new_val.to_string()
                } else { "".to_string() }
            },
            "decvar" => {
                if let Some(key) = args.first() {
                    let key = key.trim();
                    let current = self.context.vars.get(key).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
                    let new_val = current - 1.0;
                    self.context.vars.insert(key.to_string(), new_val.to_string());
                    new_val.to_string()
                } else { "".to_string() }
            },
            "incglobalvar" => {
                if let Some(key) = args.first() {
                    let key = key.trim();
                    let current = self.context.globals.get(key).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
                    let new_val = current + 1.0;
                    self.context.globals.insert(key.to_string(), new_val.to_string());
                    new_val.to_string()
                } else { "".to_string() }
            },
            "decglobalvar" => {
                if let Some(key) = args.first() {
                    let key = key.trim();
                    let current = self.context.globals.get(key).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
                    let new_val = current - 1.0;
                    self.context.globals.insert(key.to_string(), new_val.to_string());
                    new_val.to_string()
                } else { "".to_string() }
            },
            "char" => self.context.char_name.clone(),
            "user" => self.context.user_name.clone(),
            "time" => Local::now().format("%H:%M").to_string(),
            "date" => Local::now().format("%Y-%m-%d").to_string(),
            "noop" => String::new(),
            _ => {
                // Implicit Variable Lookup: {{varName}} -> value
                if let Some(val) = self.context.vars.get(name) {
                    return val.clone();
                }
                original.to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup() -> Evaluator {
        Evaluator::new(ScriptContext {
            vars: HashMap::new(),
            globals: HashMap::new(),
            char_name: "Char".to_string(),
            user_name: "User".to_string(),
        })
    }

    #[tokio::test]
    async fn test_basic_math() {
        let mut eval = setup().await;
        assert_eq!(eval.evaluate("{{add:10:5}}").await, "15");
        assert_eq!(eval.evaluate("{{sub:10:5}}").await, "5");
    }

    #[tokio::test]
    async fn test_nested_macros() {
        let mut eval = setup().await;
        assert_eq!(eval.evaluate("{{add:1:{{add:2:3}}}}").await, "6");
    }

    #[tokio::test]
    async fn test_vars() {
        let mut eval = setup().await;
        eval.evaluate("{{setvar:hp:100}}").await;
        assert_eq!(eval.evaluate("{{getvar:hp}}").await, "100");
        assert_eq!(eval.evaluate("{{hp}}").await, "100");
    }

    #[tokio::test]
    async fn test_wait_command() {
        let mut eval = setup().await;
        let start = std::time::Instant::now();
        eval.evaluate("{{wait:0.1}}").await;
        assert!(start.elapsed().as_millis() >= 100);
    }
}
