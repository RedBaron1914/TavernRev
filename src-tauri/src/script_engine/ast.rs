#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    Text(String),
    Macro {
        name: String,
        // Arguments are raw string for now, but can be parsed further if needed.
        // Or Vec<Node> if we support nested macros in args.
        // STScript: {{macro::arg1::arg2}}
        args: Vec<String>, 
        original: String,
    },
    Command {
        name: String,
        args: String,
    }
}
