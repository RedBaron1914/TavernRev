use crate::database::Message;
use rusqlite::{params, Connection, Result};
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

    pub fn to_str(&self) -> Result<String> {
        serde_json::to_string(self)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
    }

    pub fn is_excluded_from_prompt(message: &Message) -> bool {
        Self::from_str(&message.extra).exclude_from_prompt
    }

    pub fn update<F>(conn: &Connection, id: i64, f: F) -> Result<()>
    where
        F: FnOnce(&mut Self),
    {
        let existing: String = conn
            .query_row(
                "SELECT extra FROM messages WHERE id = ?1",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )?
            .unwrap_or_else(|| "{}".to_string());

        let mut extra = Self::from_str(&existing);
        f(&mut extra);

        conn.execute(
            "UPDATE messages SET extra = ?1 WHERE id = ?2",
            params![extra.to_str()?, id],
        )?;

        Ok(())
    }
}
