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

    pub fn auto_exclude_context_overflow(
        conn: &Connection,
        chat_id: i64,
        exclude_percent: f64,
    ) -> Result<usize> {
        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM messages WHERE chat_id = ?1 ORDER BY id ASC")?
            .query_map(params![chat_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let active_ids: Vec<i64> = ids
            .iter()
            .filter(|id| {
                let extra_str: String = conn
                    .query_row(
                        "SELECT extra FROM messages WHERE id = ?1",
                        params![id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "{}".to_string());
                !Self::from_str(&extra_str).exclude_from_prompt
            })
            .copied()
            .collect();

        if active_ids.is_empty() {
            return Ok(0);
        }

        let count = ((active_ids.len() as f64) * exclude_percent / 100.0).ceil() as usize;
        let to_exclude = count.min(active_ids.len());

        for &id in &active_ids[..to_exclude] {
            Self::update(conn, id, |extra| {
                extra.exclude_from_prompt = true;
                extra.exclude_reason = Some("context_overflow".to_string());
            })?;
        }

        Ok(to_exclude)
    }

    pub fn get_chat_message_stats(conn: &Connection, chat_id: i64) -> Result<(usize, usize)> {
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE chat_id = ?1",
            params![chat_id],
            |row| row.get(0),
        )?;
        let excluded: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE chat_id = ?1 AND COALESCE(extra, '{}') LIKE '%\"exclude_from_prompt\":true%'",
            params![chat_id],
            |row| row.get(0),
        )?;
        Ok((total as usize, excluded as usize))
    }

    pub fn get_context_overflow_count(conn: &Connection, chat_id: i64) -> Result<usize> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE chat_id = ?1 AND COALESCE(extra, '{}') LIKE '%context_overflow%'",
            params![chat_id],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }
}
