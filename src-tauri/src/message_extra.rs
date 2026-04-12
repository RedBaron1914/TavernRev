use crate::database::Message;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct MessageExtra {
    pub exclude_from_prompt: bool,
    pub exclude_reason: Option<String>,
}

impl MessageExtra {
    pub fn from_str(extra: &str) -> Self {
        serde_json::from_str(extra).unwrap_or_default()
    }

    pub fn to_str(&self) -> Result<String, rusqlite::Error> {
        serde_json::to_string(self)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
    }

    pub fn is_excluded_from_prompt(message: &Message) -> bool {
        Self::from_str(&message.extra).exclude_from_prompt
    }
}
