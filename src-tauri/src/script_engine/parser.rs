use super::ast::Node;

pub struct Parser {
    input: Vec<char>,
    pos: usize,
}

impl Parser {
    pub fn new(input: &str) -> Self {
        Self {
            input: input.chars().collect(),
            pos: 0,
        }
    }

    pub fn parse(&mut self) -> Vec<Node> {
        let mut nodes = Vec::new();
        while self.pos < self.input.len() {
            if let Some(node) = self.parse_node() {
                nodes.push(node);
            }
        }
        nodes
    }

    #[allow(dead_code)]
    fn peek(&self, n: usize) -> Option<char> {
        if self.pos + n < self.input.len() {
            Some(self.input[self.pos + n])
        } else {
            None
        }
    }

    fn match_str(&self, s: &str) -> bool {
        let chars: Vec<char> = s.chars().collect();
        if self.pos + chars.len() > self.input.len() {
            return false;
        }
        for (i, c) in chars.iter().enumerate() {
            if self.input[self.pos + i] != *c {
                return false;
            }
        }
        true
    }

    fn parse_node(&mut self) -> Option<Node> {
        if self.match_str("{{") {
            return self.parse_macro();
        }
        
        let mut text = String::new();
        while self.pos < self.input.len() {
            // Check for escaped macro start \{{
            // In Rust string literal, backslash is \\.
            // In input chars, it is just '\'.
            if self.match_str("\\{{") { 
                self.pos += 1; // Skip \
                text.push('{');
                text.push('{');
                self.pos += 2; // Skip {{
                continue;
            }
            
            if self.match_str("{{") {
                break;
            }
            
            text.push(self.input[self.pos]);
            self.pos += 1;
        }
        
        if text.is_empty() { None } else { Some(Node::Text(text)) }
    }

    fn parse_macro(&mut self) -> Option<Node> {
        self.pos += 2; // Skip {{
        let start = self.pos;
        let mut depth = 1;
        
        while self.pos < self.input.len() {
            if self.match_str("{{") {
                depth += 1;
                self.pos += 2;
            } else if self.match_str("}}") {
                depth -= 1;
                if depth == 0 {
                    // Found end
                    let content: String = self.input[start..self.pos].iter().collect();
                    self.pos += 2; // Skip }}
                    
                    // Parse content: name::arg1::arg2 or name:arg1
                    let (name, args_str) = if let Some(idx) = content.find("::") {
                        let (n, a) = content.split_at(idx);
                        (n, &a[2..]) // Skip ::
                    } else if let Some(idx) = content.find(':') {
                        let (n, a) = content.split_at(idx);
                        (n, &a[1..]) // Skip :
                    } else {
                        (content.as_str(), "")
                    };

                    // Split args? Not yet. Keep raw because args might contain nested macros.
                    // Actually, if we want nested execution, we should parse args recursively later during evaluation.
                    // But for AST, we store them.
                    
                    // ST splits args by :: or , depending on macro.
                    // Let's store raw args.
                    
                    return Some(Node::Macro {
                        name: name.trim().to_string(),
                        args: vec![args_str.to_string()], // Placeholder logic
                        original: format!("{{{{{}}}}}", content),
                    });
                }
                self.pos += 2;
            } else {
                self.pos += 1;
            }
        }
        
        // Unclosed macro, treat as text
        self.pos = start; // Backtrack? No, consume rest as text
        // Actually, better to fail or return text.
        None
    }
}
