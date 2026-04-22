use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use regex::Regex;
use rand::Rng;
use rand::seq::SliceRandom;
use chrono::Local;
use handlebars::{Handlebars, Helper, Context, RenderContext, Output, HelperResult};
use tiktoken_rs::cl100k_base;
use crate::script_engine::{Evaluator};

// --- DATA STRUCTURES ---

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct CharacterData {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_mes: String,
    pub mes_example: String,
    pub creator_notes: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PromptModule {
    pub identifier: String,
    pub name: String,
    pub content: String,
    #[serde(default = "default_role")]
    pub role: String,
    pub enabled: bool,
    #[serde(default)]
    pub injection_order: i64,
    #[serde(default)]
    pub injection_depth: i64,
    #[serde(default)]
    pub injection_position: i64, // 0 = Relative, 1 = In-Chat
    #[serde(default)]
    pub system_prompt: bool,
    pub marker: Option<bool>,
    #[serde(default)]
    pub forbid_overrides: bool,
    #[serde(default)]
    pub injection_trigger: Vec<String>,
}

fn default_role() -> String { "system".to_string() }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
    pub name: Option<String>,
    #[serde(default)]
    pub images: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct ScanEntry {
    pub id: Option<i64>,
    pub keys: Vec<String>,
    pub content: String,
    pub enabled: bool,
    pub constant: bool,
    pub priority: i64,
    pub probability: i64,
    pub position: String,
    pub depth: i64,
    pub source: String,
}

#[derive(Clone, Debug)]
pub struct WISettings {
    pub depth: i32,
    pub recursive: bool,
    pub case_sensitive: bool,
    pub match_whole_words: bool,
    pub max_recursion: i32,
    pub token_budget: i32,
    pub include_names: bool,
    pub insertion_strategy: String,
}

async fn apply_budget(entries: Vec<ScanEntry>, budget: i32) -> Vec<ScanEntry> {
    if budget <= 0 { return entries; }
    
    let bpe = match cl100k_base() {
        Ok(b) => b,
        Err(_) => return entries,
    };

    let mut current_tokens = 0;
    let mut final_entries = Vec::new();
    
    for entry in entries {
        let count = bpe.encode_with_special_tokens(&entry.content).len() as i32;
        if current_tokens + count <= budget {
            current_tokens += count;
            final_entries.push(entry);
        }
    }
    
    final_entries
}

// --- SCANNER ---

async fn scan_lore(text: &str, entries: &[ScanEntry], settings: &WISettings, evaluator: &mut Evaluator, ctx_map: &HashMap<String, String>) -> Vec<ScanEntry> {
    let mut triggered_indices = std::collections::HashSet::new();
    let mut active_entries = Vec::new();
    
    // Maintain both raw and lower versions for different matching modes
    let mut scan_text_raw = text.to_string(); 
    let mut scan_text_lower = text.to_lowercase();
    
    let max_depth = if settings.recursive { settings.max_recursion } else { 1 };
    let mut depth = 0;
    
    loop {
        if depth >= max_depth { break; }
        let mut new_triggers = false;
        let mut next_scan_text_raw = String::new();
        
        for (idx, entry) in entries.iter().enumerate() {
            if !entry.enabled || triggered_indices.contains(&idx) { continue; }
            
            if entry.probability < 100 {
                let roll: i64 = rand::thread_rng().gen_range(0..100);
                if roll >= entry.probability { continue; }
            }
            
            let mut matched = false;
            if entry.constant {
                matched = true;
            } else {
                for key in &entry.keys {
                    let key_trim = key.trim();
                    if key_trim.is_empty() { continue; }
                    
                    if settings.match_whole_words {
                        let escaped = regex::escape(key_trim);
                        let pattern = if settings.case_sensitive {
                            format!(r"\b{}\b", escaped)
                        } else {
                            format!(r"(?i)\b{}\b", escaped)
                        };
                        
                        if let Ok(re) = Regex::new(&pattern) {
                            if re.is_match(&scan_text_raw) {
                                matched = true;
                                break;
                            }
                        }
                    } else {
                        let target = if settings.case_sensitive { &scan_text_raw } else { &scan_text_lower };
                        let key_target = if settings.case_sensitive { key_trim.to_string() } else { key_trim.to_lowercase() };
                        
                        if target.contains(&key_target) {
                            matched = true;
                            break;
                        }
                    }
                }
            }
            
            if matched {
                triggered_indices.insert(idx);
                active_entries.push(entry.clone());
                
                // NEW: Process macros so they can trigger other lore entries in next depth
                let processed = process_text(evaluator, &entry.content, ctx_map).await;
                next_scan_text_raw.push_str(&processed);
                next_scan_text_raw.push('\n');
                new_triggers = true;
            }
        }
        
        if !new_triggers { break; }
        
        scan_text_raw = next_scan_text_raw.clone();
        scan_text_lower = scan_text_raw.to_lowercase();
        
        depth += 1;
    }
    
    active_entries.sort_by(|a, b| {
        match settings.insertion_strategy.as_str() {
            "global_first" => {
                let order = |s: &str| match s { "global" => 3, "chat" => 2, _ => 1 };
                let order_a = order(&a.source);
                let order_b = order(&b.source);
                if order_a != order_b { order_b.cmp(&order_a) } else { b.priority.cmp(&a.priority) }
            },
            "priority" => b.priority.cmp(&a.priority),
            _ => { // Default: char_first
                let order = |s: &str| match s { "character" => 3, "chat" => 2, _ => 1 };
                let order_a = order(&a.source);
                let order_b = order(&b.source);
                if order_a != order_b { order_b.cmp(&order_a) } else { b.priority.cmp(&a.priority) }
            }
        }
    });

    active_entries
}

// --- HELPERS ---

fn eq_helper(h: &Helper, _: &Handlebars, _: &Context, _: &mut RenderContext, out: &mut dyn Output) -> HelperResult {
    let p1 = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
    let p2 = h.param(1).and_then(|v| v.value().as_str()).unwrap_or("");
    if p1 == p2 { out.write("true")?; }
    Ok(())
}

fn random_helper(h: &Helper, _: &Handlebars, _: &Context, _: &mut RenderContext, out: &mut dyn Output) -> HelperResult {
    let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
    let opts: Vec<&str> = if param.contains("::") {
        param.split("::").collect()
    } else {
        param.split(',').collect()
    };
    
    let mut rng = rand::thread_rng();
    if let Some(choice) = opts.choose(&mut rng) {
        out.write(choice.trim())?;
    }
    Ok(())
}

static RE_ROLL_HELPER: OnceLock<Regex> = OnceLock::new();

fn roll_helper(h: &Helper, _: &Handlebars, _: &Context, _: &mut RenderContext, out: &mut dyn Output) -> HelperResult {
    let formula = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("1d20");
    let re = RE_ROLL_HELPER.get_or_init(|| Regex::new(r"(\d+)?d(\d+)(?:\+(\d+))?").unwrap());
    
    let mut rng = rand::thread_rng();
    let result = if let Some(caps) = re.captures(formula) {
        let count: u32 = caps.get(1).map_or(1, |m| m.as_str().parse().unwrap_or(1));
        let sides: u32 = caps[2].parse().unwrap_or(20);
        let bonus: u32 = caps.get(3).map_or(0, |m| m.as_str().parse().unwrap_or(0));
        
        if sides == 0 { 0 } else {
            let mut total = 0;
            for _ in 0..count {
                total += rng.gen_range(1..=sides);
            }
            total + bonus
        }
    } else {
        0
    };
    out.write(&result.to_string())?;
    Ok(())
}

static RE_THINK: OnceLock<Regex> = OnceLock::new();

pub fn clean_thinking(text: &str) -> String {
    let re = RE_THINK.get_or_init(|| Regex::new(r"(?si)<think>.*?</think>|<thinking>.*?</thinking>|<reasoning>.*?</reasoning>").unwrap());
    re.replace_all(text, "").to_string()
}

use std::sync::OnceLock;

static RE_GETVAR: OnceLock<Regex> = OnceLock::new();
static RE_RANDOM: OnceLock<Regex> = OnceLock::new();
static RE_ROLL: OnceLock<Regex> = OnceLock::new();
static HBS_REG: OnceLock<Handlebars<'static>> = OnceLock::new();

fn get_hbs() -> &'static Handlebars<'static> {
    HBS_REG.get_or_init(|| {
        let mut reg = Handlebars::new();
        reg.register_escape_fn(handlebars::no_escape);
        reg.register_helper("random", Box::new(random_helper));
        reg.register_helper("roll", Box::new(roll_helper));
        reg.register_helper("eq", Box::new(eq_helper));
        reg
    })
}

fn convert_to_handlebars(text: &str) -> String {
    let mut processed = text.to_string();
    let re_get = RE_GETVAR.get_or_init(|| Regex::new(r"\{\{getvar::(.*?)\}\}").unwrap());
    processed = re_get.replace_all(&processed, "{{$1}}").to_string();
    let re_rand = RE_RANDOM.get_or_init(|| Regex::new(r"\{\{random:\s*(.*?)\}\}").unwrap());
    processed = re_rand.replace_all(&processed, "{{random \"$1\"}}").to_string();
    let re_roll = RE_ROLL.get_or_init(|| Regex::new(r"\{\{roll:\s*(.*?)\}\}").unwrap());
    processed = re_roll.replace_all(&processed, "{{roll \"$1\"}}").to_string();
    processed
}

async fn process_text(
    evaluator: &mut Evaluator, 
    content: &str, 
    ctx_map: &HashMap<String, String>
) -> String {
    let st_processed = evaluator.evaluate(content).await;
    let hbs_input = convert_to_handlebars(&st_processed);
    
    let reg = get_hbs();
    
    let current_vars = evaluator.get_vars();
    let mut local_ctx = ctx_map.clone();
    for (k, v) in current_vars {
        local_ctx.insert(k, v);
    }

    match reg.render_template(&hbs_input, &local_ctx) {
        Ok(t) => t,
        Err(_) => st_processed
    }
}

// --- PROMPT ASSEMBLY ---

pub async fn assemble_prompt(
    modules: Vec<PromptModule>, 
    history: Vec<Message>,
    char_data: CharacterData,
    user_name: &str,
    user_description: &str,
    lore_entries: Vec<ScanEntry>,
    wi_settings: WISettings,
    evaluator: &mut Evaluator,
    token_budget: usize,
    new_example_chat_prompt: String
) -> (Vec<Message>, HashMap<String, String>) {
    let bpe = cl100k_base().unwrap();
    let count_tokens = |text: &str| bpe.encode_with_special_tokens(text).len();

    // 0. Clean history of thinking tags
    let history: Vec<Message> = history.into_iter().map(|mut m| {
        if m.role == "assistant" || m.role == "char" {
            m.content = clean_thinking(&m.content);
        }
        m
    }).collect();
    
    // --- 1. INITIALIZATION & VAR CAPTURE ---
    if let Ok(xml_re) = Regex::new(r"(?s)<([a-zA-Z0-9_\-]+)>([^<]*?)</([a-zA-Z0-9_\-]+)>") {
        let mut capture_vars = |text: &str| {
            for cap in xml_re.captures_iter(text) {
                let open_tag = cap[1].to_string();
                let content = cap[2].trim().to_string();
                let close_tag = cap[3].to_string();
                if open_tag == close_tag && !evaluator.get_vars().contains_key(&open_tag) {
                    evaluator.set_var(&open_tag, &content); 
                }
            }
        };
        capture_vars(&char_data.description);
        capture_vars(&char_data.scenario);
        for module in &modules { if module.enabled { capture_vars(&module.content); } }
    }

    let mut ctx_map = HashMap::new();
    ctx_map.insert("char".to_string(), char_data.name.clone());
    ctx_map.insert("user".to_string(), user_name.to_string());
    ctx_map.insert("persona".to_string(), user_description.to_string());
    ctx_map.insert("description".to_string(), char_data.description.clone());
    ctx_map.insert("personality".to_string(), char_data.personality.clone());
    ctx_map.insert("scenario".to_string(), char_data.scenario.clone());
    ctx_map.insert("first_mes".to_string(), char_data.first_mes.clone());
    ctx_map.insert("mes_example".to_string(), char_data.mes_example.clone());
    ctx_map.insert("creator_notes".to_string(), char_data.creator_notes.clone());
    ctx_map.insert("char_personality".to_string(), char_data.personality.clone());
    ctx_map.insert("original_message".to_string(), char_data.first_mes.clone());
    ctx_map.insert("time".to_string(), Local::now().format("%H:%M").to_string());
    ctx_map.insert("date".to_string(), Local::now().format("%Y-%m-%d").to_string());

    if let Some(last) = history.last() { 
        ctx_map.insert("lastMessage".to_string(), last.content.clone()); 
        ctx_map.insert("lastChatMessage".to_string(), last.content.clone()); 
    }
    if let Some(last_user) = history.iter().rfind(|m| m.role == "user") { ctx_map.insert("lastUserMessage".to_string(), last_user.content.clone()); }
    if let Some(last_char) = history.iter().rfind(|m| m.role != "user" && m.role != "system") { ctx_map.insert("lastCharMessage".to_string(), last_char.content.clone()); }

    let char_desc_disabled = modules.iter().any(|m| m.identifier == "charDescription" && !m.enabled);
    let persona_disabled = modules.iter().any(|m| m.identifier == "personaDescription" && !m.enabled);

    let (mut in_chat_modules, mut relative_modules): (Vec<_>, Vec<_>) = modules.into_iter().filter(|m| m.enabled).partition(|m| m.injection_position == 1);
    relative_modules.sort_by(|a, b| a.injection_order.cmp(&b.injection_order));

    let has_anchor_before = relative_modules.iter().any(|m| m.identifier == "main" && m.content.contains("{{anchorBefore}}"));
    let has_anchor_after = relative_modules.iter().any(|m| m.identifier == "main" && m.content.contains("{{anchorAfter}}"));
    let main_order = relative_modules.iter().find(|m| m.identifier == "main").map(|m| m.injection_order).unwrap_or(0);

    let mut anchor_before_text = String::new();
    let mut anchor_after_text = String::new();

    let mut final_relative_modules = Vec::new();
    for module in relative_modules {
        let is_extension = !["main", "charDescription", "charPersonality", "scenario", "mesExamples", "chatHistory", "personaDescription", "worldInfo", "worldInfoBefore", "worldInfoAfter"].contains(&module.identifier.as_str());

        if is_extension && has_anchor_before && module.injection_order <= main_order {
            let processed = process_text(evaluator, &module.content, &ctx_map).await;
            if !processed.is_empty() { anchor_before_text.push_str(&processed); anchor_before_text.push('\n'); }
        } else if is_extension && has_anchor_after && module.injection_order > main_order {
            let processed = process_text(evaluator, &module.content, &ctx_map).await;
            if !processed.is_empty() { anchor_after_text.push_str(&processed); anchor_after_text.push('\n'); }
        } else {
            final_relative_modules.push(module);
        }
    }

    ctx_map.insert("anchorBefore".to_string(), anchor_before_text.trim_end().to_string());
    ctx_map.insert("anchorAfter".to_string(), anchor_after_text.trim_end().to_string());

    let relative_modules = final_relative_modules;

    // --- 2. LORE SCANNING ---
    let mut scan_text = String::new();
    if wi_settings.include_names { scan_text.push_str(user_name); scan_text.push('\n'); scan_text.push_str(&char_data.name); scan_text.push('\n'); }
    scan_text.push_str(&char_data.description);
    scan_text.push_str(&char_data.scenario);
    for msg in history.iter().rev().take(wi_settings.depth as usize) { scan_text.push_str(&msg.content); scan_text.push('\n'); }
    let active_lore = scan_lore(&scan_text, &lore_entries, &wi_settings, evaluator, &ctx_map).await;
    let active_lore = apply_budget(active_lore, wi_settings.token_budget).await;
    
    let lore_before: Vec<String> = active_lore.iter().filter(|e| e.position == "before_char").map(|e| e.content.clone()).collect();
    let lore_after: Vec<String> = active_lore.iter().filter(|e| e.position == "after_char").map(|e| e.content.clone()).collect();
    let lore_before_em: Vec<String> = active_lore.iter().filter(|e| e.position == "before_em").map(|e| e.content.clone()).collect();
    let lore_after_em: Vec<String> = active_lore.iter().filter(|e| e.position == "after_em").map(|e| e.content.clone()).collect();
    let lore_before_an: Vec<String> = active_lore.iter().filter(|e| e.position == "before_an").map(|e| e.content.clone()).collect();
    let lore_after_an: Vec<String> = active_lore.iter().filter(|e| e.position == "after_an").map(|e| e.content.clone()).collect();
        
    let lore_text_before = lore_before.join("\n");
    let lore_text_after = lore_after.join("\n");
    let lore_text_before_em = lore_before_em.join("\n");
    let lore_text_after_em = lore_after_em.join("\n");
    let lore_text_before_an = lore_before_an.join("\n");
    let lore_text_after_an = lore_after_an.join("\n");
    let lore_text_generic = active_lore.iter().filter(|e| !e.position.starts_with("at_depth") && e.position != "outlet" && e.position != "before_char" && e.position != "after_char" && e.position != "before_em" && e.position != "after_em" && e.position != "before_an" && e.position != "after_an").map(|e| e.content.clone()).collect::<Vec<_>>().join("\n");

    let outlets: Vec<&ScanEntry> = active_lore.iter().filter(|e| e.position == "outlet").collect();
    for entry in outlets { let _ = process_text(evaluator, &entry.content, &ctx_map).await; }

    // Provide ST macros
    ctx_map.insert("wiBefore".to_string(), lore_text_before.clone());
    ctx_map.insert("loreBefore".to_string(), lore_text_before.clone());
    ctx_map.insert("wiAfter".to_string(), lore_text_after.clone());
    ctx_map.insert("loreAfter".to_string(), lore_text_after.clone());
    
    let example_separator = if new_example_chat_prompt.trim().is_empty() {
        "\n[Start a new Example Chat]\n".to_string()
    } else {
        format!("\n{}\n", new_example_chat_prompt)
    };
    let mes_examples_raw = char_data.mes_example.clone();
    let mut mes_examples_formatted = mes_examples_raw.replace("<START>", &example_separator);
    if !lore_text_before_em.is_empty() { mes_examples_formatted = format!("{}\n{}", lore_text_before_em, mes_examples_formatted); }
    if !lore_text_after_em.is_empty() { mes_examples_formatted = format!("{}\n{}", mes_examples_formatted, lore_text_after_em); }
    
    ctx_map.insert("mesExamplesRaw".to_string(), mes_examples_raw);
    ctx_map.insert("mesExamples".to_string(), mes_examples_formatted);

    // --- 4. PREPARE HISTORY ---
    let mut history_with_injections: Vec<Message> = Vec::new();
    for m in history {
        history_with_injections.push(Message {
            role: m.role.clone(),
            content: process_text(evaluator, &m.content, &ctx_map).await,
            name: m.name.clone(),
            images: m.images.clone()
        });
    }

    in_chat_modules.sort_by(|a, b| a.injection_depth.cmp(&b.injection_depth));
    for module in in_chat_modules {
        let depth = module.injection_depth as usize;
        let processed = process_text(evaluator, &module.content, &ctx_map).await;
        if processed.trim().is_empty() { continue; }
        let msg = Message { role: module.role.clone(), content: processed, name: None, images: None };
        if depth <= history_with_injections.len() { history_with_injections.insert(history_with_injections.len() - depth, msg); } else { history_with_injections.insert(0, msg); }
    }

    let depth_entries: Vec<&ScanEntry> = active_lore.iter().filter(|e| e.position.starts_with("at_depth")).collect();
    for entry in depth_entries {
        let depth = entry.depth as usize;
        let processed = process_text(evaluator, &entry.content, &ctx_map).await;
        if processed.trim().is_empty() { continue; }
        let role = match entry.position.as_str() { "at_depth_user" => "user", "at_depth_assistant" => "assistant", _ => "system" };
        let msg = Message { role: role.to_string(), content: processed, name: None, images: None };
        if depth <= history_with_injections.len() { history_with_injections.insert(history_with_injections.len() - depth, msg); } else { history_with_injections.insert(0, msg); }
    }

    // --- 5. ASSEMBLE PARTS ---
    let mut parts: Vec<(i64, Vec<Message>)> = Vec::new();
    let mut history_order = None;
    let mut char_inserted = false;
    let mut persona_inserted = false;
    let mut lore_inserted = false;

    for module in relative_modules.iter() {
        if module.identifier == "chatHistory" {
            history_order = Some(module.injection_order);
            continue;
        }
        
        let mut msgs = Vec::new();
        match module.identifier.as_str() {
            "personaDescription" => {
                persona_inserted = true;
                let content = if module.content.trim().is_empty() { user_description } else { &module.content };
                let processed = process_text(evaluator, content, &ctx_map).await;
                if !processed.trim().is_empty() { msgs.push(Message { role: module.role.clone(), content: processed, name: None, images: None }); }
            },
            "worldInfo" | "worldInfoBefore" | "worldInfoAfter" => {
                lore_inserted = true;
                let content = match module.identifier.as_str() {
                    "worldInfoBefore" => if !lore_text_before.is_empty() { &lore_text_before } else { &module.content },
                    "worldInfoAfter" => if !lore_text_after.is_empty() { &lore_text_after } else { &module.content },
                    _ => if !lore_text_generic.is_empty() { &lore_text_generic } else { &module.content }
                };
                let processed = process_text(evaluator, content, &ctx_map).await;
                if !processed.trim().is_empty() { msgs.push(Message { role: module.role.clone(), content: processed, name: None, images: None }); }
            },
            "charDescription" | "charPersonality" | "scenario" | "firstMessage" => {
                char_inserted = true;
                let content_src = if module.content.trim().is_empty() {
                    match module.identifier.as_str() {
                        "charDescription" => &char_data.description,
                        "charPersonality" => &char_data.personality,
                        "scenario" => &char_data.scenario,
                        "firstMessage" => &char_data.first_mes,
                        _ => &module.content
                    }
                } else { &module.content };
                let processed = process_text(evaluator, content_src, &ctx_map).await;
                if !processed.trim().is_empty() { msgs.push(Message { role: module.role.clone(), content: processed, name: None, images: None }); }
            },
            "mesExamples" => {
                char_inserted = true;
                let mut block = String::new();
                if !lore_text_before_em.is_empty() { block.push_str(&lore_text_before_em); block.push('\n'); }
                let content_src = if module.content.trim().is_empty() { &char_data.mes_example } else { &module.content };
                block.push_str(content_src);
                if !lore_text_after_em.is_empty() { block.push('\n'); block.push_str(&lore_text_after_em); }
                let processed = process_text(evaluator, &block, &ctx_map).await;
                
                if !processed.trim().is_empty() {
                    let example_separator = if new_example_chat_prompt.trim().is_empty() {
                        "\n[Start a new Example Chat]\n".to_string()
                    } else {
                        format!("\n{}\n", new_example_chat_prompt)
                    };
                    let formatted = processed.replace("<START>", &example_separator);
                    msgs.push(Message { role: module.role.clone(), content: formatted.trim().to_string(), name: None, images: None });
                }
            },
            "authorNote" | "authorsNote" => {
                let mut block = String::new();
                if !lore_text_before_an.is_empty() { block.push_str(&lore_text_before_an); block.push('\n'); }
                block.push_str(&module.content);
                if !lore_text_after_an.is_empty() { block.push('\n'); block.push_str(&lore_text_after_an); }
                let processed = process_text(evaluator, &block, &ctx_map).await;
                if !processed.trim().is_empty() { msgs.push(Message { role: module.role.clone(), content: processed, name: None, images: None }); }
            },
            _ => {
                let processed = process_text(evaluator, &module.content, &ctx_map).await;
                if !processed.trim().is_empty() { msgs.push(Message { role: module.role.clone(), content: processed, name: None, images: None }); }
            }
        }
        if !msgs.is_empty() { parts.push((module.injection_order, msgs)); }
    }

    // Fallbacks
    println!("DEBUG: Fallback Check - char_inserted={}, char_desc_disabled={}, persona_inserted={}, persona_disabled={}", 
             char_inserted, char_desc_disabled, persona_inserted, persona_disabled);

    if !char_inserted && !char_desc_disabled {
        let mut fallback = String::new();
        if !char_data.description.is_empty() { fallback.push_str(&char_data.description); fallback.push('\n'); }
        if !char_data.personality.is_empty() { fallback.push_str(&char_data.personality); fallback.push('\n'); }
        if !char_data.scenario.is_empty() { fallback.push_str(&char_data.scenario); }
        if !fallback.is_empty() {
            parts.push((0, vec![Message { role: "system".to_string(), content: fallback, name: None, images: None }]));
        }
    }
    
    if !persona_inserted && !persona_disabled && !user_description.is_empty() {
        let idx = if !char_inserted && !char_desc_disabled { 1 } else { 0 };
        parts.push((idx, vec![Message { role: "system".to_string(), content: user_description.to_string(), name: None, images: None }]));
    }

    if !lore_inserted && !lore_text_generic.is_empty() {
        parts.push((0, vec![Message { role: "system".to_string(), content: lore_text_generic, name: None, images: None }]));
    }

    // --- 6. TOKEN BUDGETING ---
    let static_tokens: usize = parts.iter().flat_map(|(_, msgs)| msgs).map(|m| count_tokens(&m.content)).sum();
    let budget_limit = if token_budget > 0 { token_budget } else { usize::MAX };
    let history_budget = if budget_limit > static_tokens { budget_limit - static_tokens } else if budget_limit > 0 { 0 } else { usize::MAX };
    
    let mut trimmed_history = Vec::new();
    
    if budget_limit == usize::MAX {
        trimmed_history = history_with_injections;
    } else {
        let mut used = 0;
        for mut msg in history_with_injections.into_iter().rev() {
            let c = count_tokens(&msg.content);
            if used + c > history_budget { 
                let remaining = history_budget.saturating_sub(used);
                if remaining > 20 {
                    let chars: Vec<char> = msg.content.chars().collect();
                    let keep_chars = remaining * 3; // Rough approximation: 1 token ~ 3 chars
                    if chars.len() > keep_chars {
                        msg.content = chars[chars.len() - keep_chars..].iter().collect();
                        trimmed_history.insert(0, msg);
                    } else {
                        trimmed_history.insert(0, msg);
                    }
                }
                break;
            }
            used += c;
            trimmed_history.insert(0, msg);
        }
    }

    if let Some(order) = history_order {
        parts.push((order, trimmed_history));
    } else {
        parts.push((i64::MAX, trimmed_history));
    }
    
    parts.sort_by_key(|k| k.0);
    let final_prompt: Vec<Message> = parts.into_iter().flat_map(|(_, msgs)| msgs).collect();
    
    (final_prompt, evaluator.get_vars())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script_engine::{Evaluator, ScriptContext};

    async fn setup_eval() -> Evaluator {
        Evaluator::new(ScriptContext {
            vars: HashMap::new(),
            globals: HashMap::new(),
            char_name: "Char".to_string(),
            user_name: "User".to_string(),
        })
    }

    #[tokio::test]
    async fn test_history_trimming() {
        let history = vec![
            Message { role: "user".to_string(), content: "Msg 1".to_string(), name: None, images: None },
            Message { role: "char".to_string(), content: "Msg 2".to_string(), name: None, images: None },
            Message { role: "user".to_string(), content: "Msg 3".to_string(), name: None, images: None },
        ];
        
        let modules = vec![
            PromptModule { identifier: "chatHistory".to_string(), name: "h".to_string(), content: "".to_string(), role: "system".to_string(), enabled: true, injection_order: 0, injection_depth: 0, injection_position: 0, system_prompt: false, marker: None, forbid_overrides: false, injection_trigger: vec![] }
        ];
        
        let char_data = CharacterData::default();
        let mut eval = setup_eval().await;
        let wi = WISettings { depth: 0, recursive: false, case_sensitive: false, match_whole_words: false, max_recursion: 0, token_budget: 0, include_names: false, insertion_strategy: "".to_string() };

        // Budget for approx 1.5 messages (each msg is ~2 tokens + overhead)
        let (msgs, _) = assemble_prompt(modules, history, char_data, "User", "", vec![], wi, &mut eval, 5, String::new()).await;
        
        // Should only have 1 message (the last one)
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].content, "Msg 3");
    }

    #[tokio::test]
    async fn test_async_lore_chain() {
        let mut eval = setup_eval().await;
        eval.set_var("loc", "forest");
        
        let lore = vec![
            ScanEntry { id: Some(1), keys: vec!["Trigger".to_string()], content: "I am in {{getvar:loc}}".to_string(), enabled: true, constant: false, priority: 1, probability: 100, position: "before_char".to_string(), depth: 0, source: "test".to_string() },
            ScanEntry { id: Some(2), keys: vec!["forest".to_string()], content: "The trees are green.".to_string(), enabled: true, constant: false, priority: 1, probability: 100, position: "after_char".to_string(), depth: 0, source: "test".to_string() },
        ];
        
        let settings = WISettings { depth: 0, recursive: true, case_sensitive: false, match_whole_words: false, max_recursion: 5, token_budget: 0, include_names: false, insertion_strategy: "priority".to_string() };
        
        let ctx_map = HashMap::new();
        let triggered = scan_lore("Trigger", &lore, &settings, &mut eval, &ctx_map).await;
        
        // Should trigger BOTH because forest was revealed by macro in Entry 1
        assert_eq!(triggered.len(), 2);
    }

    #[tokio::test]
    async fn test_continue_nudge_injection() {
        let modules = vec![
            PromptModule {
                identifier: "chatHistory".to_string(),
                name: "History".to_string(),
                content: String::new(),
                role: "system".to_string(),
                enabled: true,
                injection_order: 10,
                injection_depth: 0,
                injection_position: 0,
                system_prompt: true,
                marker: None,
                forbid_overrides: false,
                injection_trigger: vec![],
            },
            PromptModule {
                identifier: "continue_nudge".to_string(),
                name: "Nudge".to_string(),
                content: "Please continue.".to_string(),
                role: "user".to_string(),
                enabled: true,
                injection_order: 999,
                injection_depth: 0,
                injection_position: 1, // In-chat
                system_prompt: false,
                marker: None,
                forbid_overrides: false,
                injection_trigger: vec![],
            }
        ];
        
        let history = vec![
            Message { role: "user".to_string(), content: "Hello".to_string(), name: None, images: None },
            Message { role: "assistant".to_string(), content: "I am half-finished".to_string(), name: None, images: None },
        ];
        
        let char_data = CharacterData::default();
        let mut eval = setup_eval().await;
        let wi = WISettings {
            depth: 0, recursive: false, case_sensitive: false, match_whole_words: false,
            max_recursion: 0, token_budget: 1000, include_names: false, insertion_strategy: "char_first".to_string(),
        };

        let (msgs, _) = assemble_prompt(modules, history, char_data, "User", "", vec![], wi, &mut eval, 1000, String::new()).await;
        
        for (i, m) in msgs.iter().enumerate() {
            println!("[{}] {}: {}", i, m.role, m.content);
        }
        
        // Output format:
        // [0] user: Hello
        // [1] assistant: I am half-finished
        // [2] user: Please continue.
        
        assert_eq!(msgs.len(), 3, "Should have 3 chat messages (no system fallback since empty)");
        assert_eq!(msgs[2].role, "user");
        assert_eq!(msgs[2].content, "Please continue.");
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].content, "I am half-finished");
    }
}
