use crate::script_engine::{Evaluator};
use tokio::sync::mpsc::Sender;

#[derive(Debug, PartialEq, Clone)]
pub enum DbOp {
    SaveMessage { role: String, content: String },
    SetChatVar { key: String, val: String },
    DeleteChatVar { key: String },
    SetGlobalVar { key: String, val: String },
    DeleteGlobalVar { key: String },
    SetLoreEntry { id: i64, enabled: bool },
    SetLorebook { name: String },
}

#[derive(Debug, PartialEq)]
pub enum CommandResult {
    Handled(String),
    Ignored,
    Error(String),
    TriggerGeneration(String),
    ShowToast(String, String),
    SetBackground(String),
    SetStyle(String),
    Popup(String),
    DbOp(DbOp),
}

#[derive(Debug, Clone)]
pub enum ExecutionUpdate {
    DbOp(DbOp),
    Toast(String, String),
    Background(String),
    Style(String),
    Popup(String),
    Generation(String),
    Text(String),
    Error(String),
}

#[derive(Debug, Default)]
pub struct ExecutionOutput {
    pub text: String,
    pub generation: Option<String>,
    pub toasts: Vec<(String, String)>,
    pub background: Option<String>,
    pub style: Option<String>,
    pub popup: Option<String>,
    pub error: Option<String>,
    pub db_ops: Vec<DbOp>,
}

fn split_script(input: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    
    for c in input.chars() {
        match c {
            '{' => { depth += 1; current.push(c); },
            '}' => { if depth > 0 { depth -= 1; } current.push(c); },
            '|' => {
                if depth == 0 {
                    parts.push(current.trim().to_string());
                    current.clear();
                } else {
                    current.push(c);
                }
            },
            _ => current.push(c)
        }
    }
    if !current.trim().is_empty() {
        parts.push(current.trim().to_string());
    }
    parts
}

fn find_jump_target(atoms: &[String], start: usize, targets: &[&str]) -> usize {
    let mut depth = 0;
    let mut i = start + 1;
    while i < atoms.len() {
        let atom = &atoms[i];
        if atom.starts_with("/if ") {
            depth += 1;
        } else if atom.starts_with("/endif") {
            if depth == 0 {
                if targets.contains(&"/endif") { return i; }
            } else {
                depth -= 1;
            }
        } else if atom.starts_with("/else")
            && depth == 0 && targets.contains(&"/else") {
                return i;
            }
        i += 1;
    }
    i
}

pub async fn process_command(input: &str, context: &mut Evaluator, tx: Option<Sender<ExecutionUpdate>>) -> ExecutionOutput {
    if input.contains('|') || input.starts_with("/if") {
        return execute_script(input, context, tx).await;
    }
    
    let res = process_single_command(input, context).await;
    
    if let Some(tx) = &tx {
        let update = match &res {
            CommandResult::Handled(s) => if !s.is_empty() { Some(ExecutionUpdate::Text(s.clone())) } else { None },
            CommandResult::TriggerGeneration(s) => Some(ExecutionUpdate::Generation(s.clone())),
            CommandResult::ShowToast(m, t) => Some(ExecutionUpdate::Toast(m.clone(), t.clone())),
            CommandResult::SetBackground(bg) => Some(ExecutionUpdate::Background(bg.clone())),
            CommandResult::SetStyle(s) => Some(ExecutionUpdate::Style(s.clone())),
            CommandResult::Popup(p) => Some(ExecutionUpdate::Popup(p.clone())),
            CommandResult::Error(e) => Some(ExecutionUpdate::Error(e.clone())),
            CommandResult::DbOp(op) => Some(ExecutionUpdate::DbOp(op.clone())),
            CommandResult::Ignored => None,
        };
        if let Some(u) = update {
            let _ = tx.send(u).await;
        }
    }
    
    result_to_output(res)
}

fn result_to_output(res: CommandResult) -> ExecutionOutput {
    let mut out = ExecutionOutput::default();
    match res {
        CommandResult::Handled(s) => out.text = s,
        CommandResult::TriggerGeneration(s) => out.generation = Some(s),
        CommandResult::ShowToast(msg, t) => out.toasts.push((msg, t)),
        CommandResult::SetBackground(bg) => out.background = Some(bg),
        CommandResult::SetStyle(s) => out.style = Some(s),
        CommandResult::Popup(p) => out.popup = Some(p),
        CommandResult::Error(e) => out.error = Some(e),
        CommandResult::DbOp(op) => out.db_ops.push(op),
        CommandResult::Ignored => {},
    }
    out
}

async fn execute_script(input: &str, context: &mut Evaluator, tx: Option<Sender<ExecutionUpdate>>) -> ExecutionOutput {
    let atoms = split_script(input);
    let mut i = 0;
    let mut output = ExecutionOutput::default();

    while i < atoms.len() {
        let atom = &atoms[i];
        
        if atom.starts_with("/if ") {
            let arg = atom[4..].trim();
            let cond_res = context.evaluate(arg).await;
            let is_true = cond_res == "true" || cond_res == "1";
            
            if !is_true {
                i = find_jump_target(&atoms, i, &["/else", "/endif"]);
                if i < atoms.len() && atoms[i].starts_with("/else") {
                    // Allow execution of else block
                }
            }
        }
        else if atom.starts_with("/else") {
            i = find_jump_target(&atoms, i, &["/endif"]);
        }
        else if atom.starts_with("/endif") {
            // No-op
        }
        else {
            let res = process_single_command(atom, context).await;
            
            if let Some(tx) = &tx {
                let update = match &res {
                    CommandResult::Handled(s) => if !s.is_empty() { Some(ExecutionUpdate::Text(s.clone())) } else { None },
                    CommandResult::TriggerGeneration(s) => Some(ExecutionUpdate::Generation(s.clone())),
                    CommandResult::ShowToast(m, t) => Some(ExecutionUpdate::Toast(m.clone(), t.clone())),
                    CommandResult::SetBackground(bg) => Some(ExecutionUpdate::Background(bg.clone())),
                    CommandResult::SetStyle(s) => Some(ExecutionUpdate::Style(s.clone())),
                    CommandResult::Popup(p) => Some(ExecutionUpdate::Popup(p.clone())),
                    CommandResult::Error(e) => Some(ExecutionUpdate::Error(e.clone())),
                    CommandResult::DbOp(op) => Some(ExecutionUpdate::DbOp(op.clone())),
                    CommandResult::Ignored => None,
                };
                if let Some(u) = update {
                    let _ = tx.send(u).await;
                }
            }

            match res {
                CommandResult::Handled(msg) => {
                    if !msg.is_empty() {
                        if !output.text.is_empty() { output.text.push('\n'); }
                        output.text.push_str(&msg);
                    }
                },
                CommandResult::TriggerGeneration(msg) => output.generation = Some(msg),
                CommandResult::ShowToast(m, t) => output.toasts.push((m, t)),
                CommandResult::SetBackground(bg) => output.background = Some(bg),
                CommandResult::SetStyle(s) => output.style = Some(s),
                CommandResult::Popup(p) => output.popup = Some(p),
                CommandResult::DbOp(op) => output.db_ops.push(op),
                CommandResult::Error(e) => { output.error = Some(e); break; }, 
                CommandResult::Ignored => {}, 
            }
        }
        
        i += 1;
    }
    output
}

async fn process_single_command(input: &str, context: &mut Evaluator) -> CommandResult {
    if !input.starts_with('/') {
        return CommandResult::Ignored;
    }
    if input.starts_with("//") { return CommandResult::Ignored; }

    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = parts[0].trim().to_lowercase();
    let raw_args = parts.get(1).unwrap_or(&"").trim();
    
    let args = context.evaluate(raw_args).await;

    match cmd.as_str() {
        "/help" => CommandResult::Handled("Commands: /if cond | /else | /endif, /echo, /sys, /user, /char, /setvar key val, /getvar key, /roll dice, /send text".to_string()),
        "/echo" => CommandResult::Handled(args),
        "/sys" | "/system" => CommandResult::DbOp(DbOp::SaveMessage { role: "system".to_string(), content: args }),
        "/user" => CommandResult::DbOp(DbOp::SaveMessage { role: "user".to_string(), content: args }),
        "/char" | "/model" => CommandResult::DbOp(DbOp::SaveMessage { role: "char".to_string(), content: args }),
        "/setvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val = parts[1];
                context.set_var(key, val); 
                CommandResult::DbOp(DbOp::SetChatVar { key: key.to_string(), val: val.to_string() })
            } else {
                CommandResult::Error("Usage: /setvar key value".to_string())
            }
        },
        "/getvar" => {
            let val = context.get_vars().get(&args).cloned().unwrap_or_default();
            CommandResult::Handled(format!("{} = {}", args, val))
        },
        "/roll" => {
            let res = context.evaluate(&format!("{{{{roll:{}}}}}", args)).await;
            CommandResult::Handled(format!("Rolled: {}", res))
        },
        "/send" => CommandResult::TriggerGeneration(args),
        "/addvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val_str = parts[1];
                let current_val = context.get_vars().get(key).cloned().unwrap_or_default();
                let new_val = if let (Ok(cur), Ok(inc)) = (current_val.parse::<f64>(), val_str.parse::<f64>()) {
                    (cur + inc).to_string()
                } else {
                    format!("{}{}", current_val, val_str)
                };
                context.set_var(key, &new_val);
                CommandResult::DbOp(DbOp::SetChatVar { key: key.to_string(), val: new_val })
            } else { CommandResult::Error("Usage: /addvar key val".to_string()) }
        },
        "/subvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val_str = parts[1];
                let current_val = context.get_vars().get(key).cloned().unwrap_or_default();
                let new_val = if let (Ok(cur), Ok(sub)) = (current_val.parse::<f64>(), val_str.parse::<f64>()) {
                    (cur - sub).to_string()
                } else { current_val };
                context.set_var(key, &new_val);
                CommandResult::DbOp(DbOp::SetChatVar { key: key.to_string(), val: new_val })
            } else { CommandResult::Error("Usage: /subvar key val".to_string()) }
        },
        "/incvar" => {
            let key = args.trim();
            let current_val = context.get_vars().get(key).cloned().unwrap_or_default();
            let cur_num = current_val.parse::<f64>().unwrap_or(0.0);
            let new_val = (cur_num + 1.0).to_string();
            context.set_var(key, &new_val);
            CommandResult::DbOp(DbOp::SetChatVar { key: key.to_string(), val: new_val })
        },
        "/decvar" => {
            let key = args.trim();
            let current_val = context.get_vars().get(key).cloned().unwrap_or_default();
            let cur_num = current_val.parse::<f64>().unwrap_or(0.0);
            let new_val = (cur_num - 1.0).to_string();
            context.set_var(key, &new_val);
            CommandResult::DbOp(DbOp::SetChatVar { key: key.to_string(), val: new_val })
        },
        "/setglobalvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val = parts[1];
                context.set_global(key, val);
                CommandResult::DbOp(DbOp::SetGlobalVar { key: key.to_string(), val: val.to_string() })
            } else { CommandResult::Error("Usage: /setglobalvar key val".to_string()) }
        },
        "/getglobalvar" => {
            let val = context.get_globals().get(&args).cloned().unwrap_or_default();
            CommandResult::Handled(format!("{}={}", args, val))
        },
        "/enableentry" => {
            if let Ok(id) = args.parse::<i64>() {
                CommandResult::DbOp(DbOp::SetLoreEntry { id, enabled: true })
            } else { CommandResult::Error("Usage: /enableentry ID".to_string()) }
        },
        "/disableentry" => {
            if let Ok(id) = args.parse::<i64>() {
                CommandResult::DbOp(DbOp::SetLoreEntry { id, enabled: false })
            } else { CommandResult::Error("Usage: /disableentry ID".to_string()) }
        },
        "/flushvar" => {
            let key = args.trim();
            context.set_var(key, "");
            CommandResult::DbOp(DbOp::DeleteChatVar { key: key.to_string() })
        },
        "/flushglobalvar" => {
            let key = args.trim();
            context.set_global(key, "");
            CommandResult::DbOp(DbOp::DeleteGlobalVar { key: key.to_string() })
        },
        "/addglobalvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val_str = parts[1];
                let current = context.get_globals().get(key).cloned().unwrap_or_default();
                let new_val = if let (Ok(cur), Ok(inc)) = (current.parse::<f64>(), val_str.parse::<f64>()) {
                    (cur + inc).to_string()
                } else { format!("{}{}", current, val_str) };
                context.set_global(key, &new_val);
                CommandResult::DbOp(DbOp::SetGlobalVar { key: key.to_string(), val: new_val })
            } else { CommandResult::Error("Usage: /addglobalvar key val".to_string()) }
        },
        "/subglobalvar" => {
            let parts: Vec<&str> = args.splitn(2, ' ').collect();
            if parts.len() == 2 {
                let key = parts[0];
                let val_str = parts[1];
                let current = context.get_globals().get(key).cloned().unwrap_or_default();
                let new_val = if let (Ok(cur), Ok(sub)) = (current.parse::<f64>(), val_str.parse::<f64>()) {
                    (cur - sub).to_string()
                } else { current };
                context.set_global(key, &new_val);
                CommandResult::DbOp(DbOp::SetGlobalVar { key: key.to_string(), val: new_val })
            } else { CommandResult::Error("Usage: /subglobalvar key val".to_string()) }
        },
        "/incglobalvar" => {
            let key = args.trim();
            let current = context.get_globals().get(key).cloned().unwrap_or_default();
            let cur_num = current.parse::<f64>().unwrap_or(0.0);
            let new_val = (cur_num + 1.0).to_string();
            context.set_global(key, &new_val);
            CommandResult::DbOp(DbOp::SetGlobalVar { key: key.to_string(), val: new_val })
        },
        "/decglobalvar" => {
            let key = args.trim();
            let current = context.get_globals().get(key).cloned().unwrap_or_default();
            let cur_num = current.parse::<f64>().unwrap_or(0.0);
            let new_val = (cur_num - 1.0).to_string();
            context.set_global(key, &new_val);
            CommandResult::DbOp(DbOp::SetGlobalVar { key: key.to_string(), val: new_val })
        },
        "/lorebook" => {
            CommandResult::DbOp(DbOp::SetLorebook { name: args })
        },
        "/bubbles" => {
            let val = args.trim().to_lowercase();
            if val == "on" || val == "true" { CommandResult::SetStyle("bubbles".to_string()) }
            else { CommandResult::SetStyle("document".to_string()) }
        },
        "/toast" => CommandResult::ShowToast(args, "info".to_string()),
        "/bg" => CommandResult::SetBackground(args),
        "/popup" => CommandResult::Popup(args),
        _ => CommandResult::Ignored 
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::script_engine::{Evaluator, ScriptContext};
    use std::collections::HashMap;

    async fn setup() -> Evaluator {
        Evaluator::new(ScriptContext {
            vars: HashMap::new(),
            globals: HashMap::new(),
            char_name: "TestChar".to_string(),
            user_name: "TestUser".to_string(),
        })
    }

    #[tokio::test]
    async fn test_pure_echo() {
        let mut eval = setup().await;
        let res = process_command("/echo Hello", &mut eval, None).await;
        assert_eq!(res.text, "Hello");
    }

    #[tokio::test]
    async fn test_db_op_setvar() {
        let mut eval = setup().await;
        let res = process_command("/setvar hp 100", &mut eval, None).await;
        assert_eq!(res.db_ops.len(), 1);
        match &res.db_ops[0] {
            DbOp::SetChatVar { key, val } => {
                assert_eq!(key, "hp");
                assert_eq!(val, "100");
            },
            _ => panic!("Wrong op type"),
        }
        assert_eq!(eval.get_vars().get("hp").unwrap(), "100");
    }

    #[tokio::test]
    async fn test_pipe_script() {
        let mut eval = setup().await;
        let res = process_command("/setvar x 10 | /echo {{x}}", &mut eval, None).await;
        assert_eq!(res.text, "10");
        assert_eq!(res.db_ops.len(), 1);
    }

    #[tokio::test]
    async fn test_if_logic() {
        let mut eval = setup().await;
        let script = "/if {{gt:10:5}} | /echo Yes | /else | /echo No | /endif";
        let res = process_command(script, &mut eval, None).await;
        assert_eq!(res.text, "Yes");
    }
}
