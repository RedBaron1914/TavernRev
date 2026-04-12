use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Lorebook {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub is_global: bool,
    pub excluded_from_global: bool,
    pub global_enabled: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LoreEntry {
    pub id: i64,
    pub book_id: i64,
    pub keys: String,
    pub content: String,
    pub enabled: bool,
    pub constant: bool,
    pub priority: i64,
    pub probability: i64,
    pub position: String,
    pub depth: i64,
    #[serde(default)]
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LorebookLink {
    pub book_id: i64,
    pub enabled: bool,
}

pub fn create_lorebook(conn: &Connection, name: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO lorebooks (name, description, is_global) VALUES (?1, '', 0)",
        params![name],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_lorebooks(conn: &Connection) -> Result<Vec<Lorebook>> {
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_global, excluded_from_global, global_enabled FROM lorebooks")?;
    let rows = stmt.query_map([], |row| {
        Ok(Lorebook {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2).unwrap_or_default(),
            is_global: row.get(3).unwrap_or(false),
            excluded_from_global: row.get(4).unwrap_or(false),
            global_enabled: row.get(5).unwrap_or(true),
        })
    })?;
    let mut books = Vec::new();
    for row in rows {
        books.push(row?);
    }
    Ok(books)
}

pub fn delete_lorebook(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM lorebooks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn create_lore_entry(
    conn: &Connection,
    book_id: i64,
    keys: &str,
    content: &str,
    enabled: bool,
    constant: bool,
    priority: i64,
    probability: i64,
    position: &str,
    depth: i64,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO lore_entries (book_id, keys, content, enabled, constant, priority, probability, position, depth) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![book_id, keys, content, enabled, constant, priority, probability, position, depth],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_lore_entry(
    conn: &Connection,
    id: i64,
    keys: &str,
    content: &str,
    enabled: bool,
    constant: bool,
    priority: i64,
    probability: i64,
    position: &str,
    depth: i64,
) -> Result<()> {
    conn.execute(
        "UPDATE lore_entries SET keys = ?1, content = ?2, enabled = ?3, constant = ?4, priority = ?5, probability = ?6, position = ?7, depth = ?8 WHERE id = ?9",
        params![keys, content, enabled, constant, priority, probability, position, depth, id],
    )?;
    Ok(())
}

pub fn get_lore_entries(conn: &Connection, book_id: i64) -> Result<Vec<LoreEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, keys, content, enabled, constant, priority, probability, position, depth FROM lore_entries WHERE book_id = ?1",
    )?;
    let rows = stmt.query_map([book_id], |row| {
        Ok(LoreEntry {
            id: row.get(0)?,
            book_id: row.get(1)?,
            keys: row.get(2)?,
            content: row.get(3)?,
            enabled: row.get(4)?,
            constant: row.get(5).unwrap_or(false),
            priority: row.get(6).unwrap_or(100),
            probability: row.get(7).unwrap_or(100),
            position: row.get(8).unwrap_or("before_char".to_string()),
            depth: row.get(9).unwrap_or(4),
            source: "book".to_string(),
        })
    })?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn set_lore_entry_enabled(conn: &Connection, id: i64, enabled: bool) -> Result<()> {
    conn.execute(
        "UPDATE lore_entries SET enabled = ?1 WHERE id = ?2",
        params![enabled, id],
    )?;
    Ok(())
}

pub fn delete_lore_entry(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM lore_entries WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn link_character_lorebook(conn: &Connection, char_id: i64, book_id: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO character_lorebooks (character_id, book_id) VALUES (?1, ?2)",
        params![char_id, book_id],
    )?;
    Ok(())
}

pub fn get_active_lore_entries(
    conn: &Connection,
    char_id: i64,
    chat_id: i64,
) -> Result<Vec<LoreEntry>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.book_id, e.keys, e.content, e.enabled, e.constant, e.priority, e.probability, e.position, e.depth, 'character' as source
         FROM lore_entries e
         JOIN character_lorebooks cl ON e.book_id = cl.book_id
         WHERE cl.character_id = ?1 AND COALESCE(cl.enabled, 1) = 1 AND e.enabled = 1
         UNION
         SELECT e.id, e.book_id, e.keys, e.content, e.enabled, e.constant, e.priority, e.probability, e.position, e.depth, 'chat' as source
         FROM lore_entries e
         JOIN chat_lorebooks cl ON e.book_id = cl.book_id
         WHERE cl.chat_id = ?2 AND COALESCE(cl.enabled, 1) = 1 AND e.enabled = 1
         UNION
         SELECT e.id, e.book_id, e.keys, e.content, e.enabled, e.constant, e.priority, e.probability, e.position, e.depth, 'global' as source
         FROM lore_entries e
         JOIN lorebooks b ON e.book_id = b.id
         WHERE b.is_global = 1 AND COALESCE(b.global_enabled, 1) = 1 AND b.excluded_from_global = 0 AND e.enabled = 1",
    )?;

    let rows = stmt.query_map(params![char_id, chat_id], |row| {
        Ok(LoreEntry {
            id: row.get(0)?,
            book_id: row.get(1)?,
            keys: row.get(2)?,
            content: row.get(3)?,
            enabled: row.get(4)?,
            constant: row.get(5).unwrap_or(false),
            priority: row.get(6).unwrap_or(100),
            probability: row.get(7).unwrap_or(100),
            position: row.get(8).unwrap_or("before_char".to_string()),
            depth: row.get(9).unwrap_or(4),
            source: row.get(10).unwrap_or("global".to_string()),
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn toggle_global_lorebook(conn: &Connection, book_id: i64, is_global: bool) -> Result<()> {
    conn.execute(
        "UPDATE lorebooks SET is_global = ?1 WHERE id = ?2",
        params![is_global, book_id],
    )?;
    Ok(())
}

pub fn set_global_lorebook_enabled(conn: &Connection, book_id: i64, enabled: bool) -> Result<()> {
    conn.execute(
        "UPDATE lorebooks SET global_enabled = ?1 WHERE id = ?2",
        params![enabled, book_id],
    )?;
    Ok(())
}

pub fn set_lorebook_excluded_from_global(
    conn: &Connection,
    book_id: i64,
    excluded: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE lorebooks SET excluded_from_global = ?1 WHERE id = ?2",
        params![excluded, book_id],
    )?;
    Ok(())
}

pub fn get_chat_lorebook_ids(conn: &Connection, chat_id: i64) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT book_id FROM chat_lorebooks WHERE chat_id = ?1")?;
    let rows = stmt.query_map(params![chat_id], |row| row.get(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

pub fn get_chat_lorebook_links(conn: &Connection, chat_id: i64) -> Result<Vec<LorebookLink>> {
    let mut stmt = conn
        .prepare("SELECT book_id, COALESCE(enabled, 1) FROM chat_lorebooks WHERE chat_id = ?1")?;
    let rows = stmt.query_map(params![chat_id], |row| {
        Ok(LorebookLink {
            book_id: row.get(0)?,
            enabled: row.get(1).unwrap_or(true),
        })
    })?;
    let mut links = Vec::new();
    for row in rows {
        links.push(row?);
    }
    Ok(links)
}

pub fn toggle_chat_lorebook(
    conn: &Connection,
    chat_id: i64,
    book_id: i64,
    active: bool,
) -> Result<()> {
    if active {
        conn.execute(
            "INSERT OR IGNORE INTO chat_lorebooks (chat_id, book_id, enabled) VALUES (?1, ?2, 1)",
            params![chat_id, book_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM chat_lorebooks WHERE chat_id = ?1 AND book_id = ?2",
            params![chat_id, book_id],
        )?;
    }
    Ok(())
}

pub fn set_chat_lorebook_enabled(
    conn: &Connection,
    chat_id: i64,
    book_id: i64,
    enabled: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE chat_lorebooks SET enabled = ?1 WHERE chat_id = ?2 AND book_id = ?3",
        params![enabled, chat_id, book_id],
    )?;
    Ok(())
}

pub fn get_character_lorebook_ids(conn: &Connection, char_id: i64) -> Result<Vec<i64>> {
    let mut stmt =
        conn.prepare("SELECT book_id FROM character_lorebooks WHERE character_id = ?1")?;
    let rows = stmt.query_map(params![char_id], |row| row.get(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

pub fn get_character_lorebook_links(conn: &Connection, char_id: i64) -> Result<Vec<LorebookLink>> {
    let mut stmt = conn.prepare(
        "SELECT book_id, COALESCE(enabled, 1) FROM character_lorebooks WHERE character_id = ?1",
    )?;
    let rows = stmt.query_map(params![char_id], |row| {
        Ok(LorebookLink {
            book_id: row.get(0)?,
            enabled: row.get(1).unwrap_or(true),
        })
    })?;
    let mut links = Vec::new();
    for row in rows {
        links.push(row?);
    }
    Ok(links)
}

pub fn toggle_character_lorebook(
    conn: &Connection,
    char_id: i64,
    book_id: i64,
    active: bool,
) -> Result<()> {
    if active {
        conn.execute(
            "INSERT OR IGNORE INTO character_lorebooks (character_id, book_id, enabled) VALUES (?1, ?2, 1)",
            params![char_id, book_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM character_lorebooks WHERE character_id = ?1 AND book_id = ?2",
            params![char_id, book_id],
        )?;
    }
    Ok(())
}

pub fn set_character_lorebook_enabled(
    conn: &Connection,
    char_id: i64,
    book_id: i64,
    enabled: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE character_lorebooks SET enabled = ?1 WHERE character_id = ?2 AND book_id = ?3",
        params![enabled, char_id, book_id],
    )?;
    Ok(())
}

pub fn find_lorebook_id_by_name(conn: &Connection, name: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM lorebooks WHERE name = ?1",
        params![name],
        |row| row.get(0),
    )
    .optional()
}

pub fn set_chat_active_lorebook(conn: &Connection, chat_id: i64, book_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_lorebooks WHERE chat_id = ?1",
        params![chat_id],
    )?;
    conn.execute(
        "INSERT INTO chat_lorebooks (chat_id, book_id, enabled) VALUES (?1, ?2, 1)",
        params![chat_id, book_id],
    )?;
    Ok(())
}

pub fn unpack_character_lorebook(
    conn: &Connection,
    char_id: i64,
    card_data: &str,
) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(card_data).map_err(|e| e.to_string())?;

    if let Some(book) = v.get("data").and_then(|d| d.get("character_book")) {
        let book_name = book
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("Embedded Book");

        let book_id = create_lorebook(conn, book_name).map_err(|e| e.to_string())?;
        let _ = link_character_lorebook(conn, char_id, book_id);

        if let Some(entries) = book.get("entries").and_then(|e| e.as_array()) {
            for entry in entries {
                let keys = entry
                    .get("keys")
                    .and_then(|k| k.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str())
                            .collect::<Vec<_>>()
                            .join(",")
                    })
                    .unwrap_or_default();

                let content = entry.get("content").and_then(|c| c.as_str()).unwrap_or("");
                let enabled = entry
                    .get("enabled")
                    .and_then(|e| e.as_bool())
                    .unwrap_or(true);
                let constant = entry
                    .get("constant")
                    .and_then(|c| c.as_bool())
                    .unwrap_or(false);
                let priority = entry
                    .get("priority")
                    .and_then(|p| p.as_i64())
                    .unwrap_or(100);
                let position = entry
                    .get("position")
                    .and_then(|p| p.as_str())
                    .unwrap_or("before_char");
                let depth = entry.get("depth").and_then(|d| d.as_i64()).unwrap_or(4);

                let _ = create_lore_entry(
                    conn, book_id, &keys, content, enabled, constant, priority, 100, position,
                    depth,
                );
            }
        }
    }
    Ok(())
}
