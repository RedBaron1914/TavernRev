use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// --- Data Structs ---

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Character {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub first_mes: String,
    #[serde(default)]
    pub mes_example: String,
    #[serde(default)]
    pub creator_notes: String,
    #[serde(default)]
    pub tags: String, // JSON array
    #[serde(default)]
    pub alternate_greetings: String, // JSON array
    #[serde(default)]
    pub card_data: String, // Full JSON dump for extensions/lorebooks
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub is_muted: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct UserPersona {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Chat {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub character_id: i64,
    #[serde(default)]
    pub user_persona_id: Option<i64>,
    #[serde(default)]
    pub group_id: Option<i64>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub memory: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Message {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub chat_id: i64,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub sender_id: Option<i64>,
    #[serde(default)]
    pub sender_name: Option<String>,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub swipes: Vec<String>,
    #[serde(default)]
    pub swipe_id: usize,
    #[serde(default)]
    pub is_system: bool,
    #[serde(
        default = "default_extra",
        serialize_with = "crate::database::serialize_extra_as_object"
    )]
    pub extra: String,
    #[serde(default)]
    pub images: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Group {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub activation_strategy: i64, // 0 = Natural, 1 = List, 2 = Manual
    #[serde(default)]
    pub generation_mode: i64, // 0 = Swap, 1 = Join
    #[serde(default)]
    pub allow_self_responses: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct CloudGroupMember {
    #[serde(default)]
    pub char_uuid: String,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub is_muted: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct CloudGroup {
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub activation_strategy: i64,
    #[serde(default)]
    pub generation_mode: i64,
    #[serde(default)]
    pub allow_self_responses: bool,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub members: Vec<CloudGroupMember>,
}

pub struct MemoryVector {
    pub chunk_index: i64,
    pub text_content: String,
    pub embedding: Vec<f32>,
}

pub struct LoreVector {
    pub entry_id: i64,
    pub embedding: Vec<f32>,
}

pub fn insert_lore_vector(
    conn: &Connection,
    entry_id: i64,
    chunk_index: i64,
    text_content: &str,
    embedding: &[f32],
) -> Result<i64> {
    let bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|&f| f.to_le_bytes().to_vec())
        .collect();

    conn.execute(
        "INSERT INTO lore_vectors (entry_id, chunk_index, text_content, embedding) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![entry_id, chunk_index, text_content, bytes],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_lore_vectors(conn: &Connection, entry_ids: &[i64]) -> Result<Vec<LoreVector>> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    
    // SQLite doesn't have a built-in IN with array, so we build the placeholders string
    let placeholders: String = entry_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT entry_id, embedding FROM lore_vectors WHERE entry_id IN ({})", placeholders);
    
    let mut stmt = conn.prepare(&sql)?;
    
    // Convert &[i64] to dynamic parameters
    let params: Vec<&dyn rusqlite::ToSql> = entry_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    
    let rows = stmt.query_map(params.as_slice(), |row| {
        let entry_id: i64 = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;

        let mut embedding = Vec::new();
        for chunk in blob.chunks_exact(4) {
            if chunk.len() == 4 {
                if let Ok(arr) = chunk.try_into() {
                    let f = f32::from_le_bytes(arr);
                    embedding.push(f);
                }
            }
        }

        Ok(LoreVector {
            entry_id,
            embedding,
        })
    })?;

    let mut results = Vec::new();
    for v in rows.flatten() {
        results.push(v);
    }
    Ok(results)
}

pub fn delete_lore_vectors(conn: &Connection, entry_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM lore_vectors WHERE entry_id = ?1",
        params![entry_id],
    )?;
    Ok(())
}

pub fn insert_memory_vector(
    conn: &Connection,
    chat_id: i64,
    chunk_index: i64,
    text_content: &str,
    embedding: &[f32],
) -> Result<i64> {
    // Convert f32 array to little-endian bytes for BLOB storage
    let bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|&f| f.to_le_bytes().to_vec())
        .collect();

    conn.execute(
        "INSERT INTO memory_vectors (chat_id, chunk_index, text_content, embedding) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![chat_id, chunk_index, text_content, bytes],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_chat_vectors(conn: &Connection, chat_id: i64) -> Result<Vec<MemoryVector>> {
    let mut stmt = conn.prepare("SELECT chunk_index, text_content, embedding FROM memory_vectors WHERE chat_id = ?1 ORDER BY chunk_index ASC")?;
    let rows = stmt.query_map(params![chat_id], |row| {
        let chunk_index: i64 = row.get(0)?;
        let text_content: String = row.get(1)?;
        let blob: Vec<u8> = row.get(2)?;

        let mut embedding = Vec::new();
        for chunk in blob.chunks_exact(4) {
            if chunk.len() == 4 {
                if let Ok(arr) = chunk.try_into() {
                    let f = f32::from_le_bytes(arr);
                    embedding.push(f);
                }
            }
        }

        Ok(MemoryVector {
            chunk_index,
            text_content,
            embedding,
        })
    })?;

    let mut results = Vec::new();
    for v in rows.flatten() {
        results.push(v);
    }
    Ok(results)
}

pub fn delete_memory_vectors(conn: &Connection, chat_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM memory_vectors WHERE chat_id = ?1",
        params![chat_id],
    )?;
    Ok(())
}

fn default_extra() -> String {
    "{}".to_string()
}

fn serialize_extra_as_object<S: serde::Serializer>(extra: &str, s: S) -> Result<S::Ok, S::Error> {
    let parsed: serde_json::Value = serde_json::from_str(extra).unwrap_or_default();
    parsed.serialize(s)
}

pub use crate::message_extra::MessageExtra;

pub fn message_is_excluded_from_prompt(message: &Message) -> bool {
    MessageExtra::is_excluded_from_prompt(message)
}

fn generate_uuid() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    format!("{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

// --- DB State ---

pub struct DbState(pub Mutex<Connection>);

// --- Initialization ---

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let column_names: Vec<Result<String>> = stmt.query_map([], |row| row.get(1))?.collect();
    for name in column_names.into_iter().flatten() {
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn init_db(app_handle: AppHandle) -> Result<Connection> {
    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .unwrap_or_default();
    std::fs::create_dir_all(&app_dir).ok();
    let db_path = app_dir.join("tavern.db");

    let conn = Connection::open(db_path)?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // Android-safe journal mode (WAL is unstable on some release builds)
    #[cfg(target_os = "android")]
    {
        let _ = conn.execute("PRAGMA journal_mode = DELETE;", []);
        let _ = conn.execute("PRAGMA synchronous = NORMAL;", []);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _: String = conn
            .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
            .unwrap_or_default();
        let _ = conn.execute("PRAGMA synchronous = NORMAL;", []);
    }

    // 1. ALL TABLES
    conn.execute(
        "CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT,
            personality TEXT DEFAULT '', scenario TEXT DEFAULT '', first_mes TEXT DEFAULT '',
            mes_example TEXT DEFAULT '', creator_notes TEXT DEFAULT '',
            tags TEXT DEFAULT '[]', alternate_greetings TEXT DEFAULT '[]',
            card_data TEXT DEFAULT '{}', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uuid TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, scenario TEXT DEFAULT '',
            activation_strategy INTEGER DEFAULT 0, generation_mode INTEGER DEFAULT 0,
            allow_self_responses BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uuid TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER NOT NULL, character_id INTEGER NOT NULL,
            sort_order INTEGER DEFAULT 0, is_muted BOOLEAN DEFAULT 0,
            PRIMARY KEY (group_id, character_id),
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_personas (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT, is_default BOOLEAN DEFAULT 0
        )", [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL, name TEXT NOT NULL, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uuid TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_persona_id INTEGER,
            group_id INTEGER,
            memory TEXT DEFAULT '',
            FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY(user_persona_id) REFERENCES user_personas(id) ON DELETE SET NULL,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            swipes TEXT DEFAULT '[]', swipe_id INTEGER DEFAULT 0,
            is_system INTEGER DEFAULT 0, extra TEXT DEFAULT '{}',
            images TEXT DEFAULT '[]',
            sender_id INTEGER,
            sender_name TEXT,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )", [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS memory_vectors (
            id INTEGER PRIMARY KEY,
            chat_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            embedding BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_variables (
            chat_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
            PRIMARY KEY(chat_id, key),
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS lorebooks (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, is_global BOOLEAN DEFAULT 1
        )", [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS lore_entries (
            id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, keys TEXT NOT NULL, content TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1, constant BOOLEAN DEFAULT 0, priority INTEGER DEFAULT 100,
            probability INTEGER DEFAULT 100, position TEXT DEFAULT 'before_char', depth INTEGER DEFAULT 4,
            FOREIGN KEY(book_id) REFERENCES lorebooks(id) ON DELETE CASCADE
        )", [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS lore_vectors (
            id INTEGER PRIMARY KEY,
            entry_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            embedding BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(entry_id) REFERENCES lore_entries(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS regex_scripts (
            id INTEGER PRIMARY KEY, script_name TEXT NOT NULL, regex TEXT NOT NULL,
            replacement TEXT DEFAULT '', placement TEXT DEFAULT 'both', run_on_markdown BOOLEAN DEFAULT 1, disabled BOOLEAN DEFAULT 0
        )", [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS quick_replies (
            id INTEGER PRIMARY KEY, label TEXT NOT NULL, content TEXT NOT NULL,
            icon TEXT DEFAULT '', is_global BOOLEAN DEFAULT 1
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS global_variables (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )?;

    if !column_exists(&conn, "regex_scripts", "disabled")? {
        conn.execute("ALTER TABLE regex_scripts ADD COLUMN disabled BOOLEAN DEFAULT 0", [])?;
    }
    
    // --- CORE MIGRATIONS (For Upgrades from v0.7.0) ---
    if !column_exists(&conn, "characters", "uuid")? {
        conn.execute("ALTER TABLE characters ADD COLUMN uuid TEXT", [])?;
    }
    if !column_exists(&conn, "characters", "updated_at")? {
        conn.execute("ALTER TABLE characters ADD COLUMN updated_at TIMESTAMP", [])?;
        conn.execute(
            "UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
            [],
        )?;
    }
    if !column_exists(&conn, "chats", "uuid")? {
        conn.execute("ALTER TABLE chats ADD COLUMN uuid TEXT", [])?;
    }
    if !column_exists(&conn, "chats", "updated_at")? {
        conn.execute("ALTER TABLE chats ADD COLUMN updated_at TIMESTAMP", [])?;
        conn.execute(
            "UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
            [],
        )?;
    }
    if !column_exists(&conn, "chats", "memory")? {
        conn.execute("ALTER TABLE chats ADD COLUMN memory TEXT DEFAULT ''", [])?;
    }

    // Initialize NULL UUIDs (Safely)
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM characters WHERE uuid IS NULL") {
        if let Ok(rows) = stmt.query_map([], |r| r.get(0)) {
            let ids: Vec<i64> = rows.filter_map(|r| r.ok()).collect();
            for id in ids {
                let uuid = generate_uuid();
                let _ = conn.execute(
                    "UPDATE characters SET uuid = ?1 WHERE id = ?2",
                    rusqlite::params![uuid, id],
                );
            }
        }
    }

    if let Ok(mut stmt) = conn.prepare("SELECT id FROM chats WHERE uuid IS NULL") {
        if let Ok(rows) = stmt.query_map([], |r| r.get(0)) {
            let ids: Vec<i64> = rows.filter_map(|r| r.ok()).collect();
            for id in ids {
                let uuid = generate_uuid();
                let _ = conn.execute(
                    "UPDATE chats SET uuid = ?1 WHERE id = ?2",
                    rusqlite::params![uuid, id],
                );
            }
        }
    }

    // Migration check for V2 fields
    if !column_exists(&conn, "characters", "first_mes")? {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN personality TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN scenario TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN first_mes TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN mes_example TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN creator_notes TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN tags TEXT DEFAULT '[]'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN alternate_greetings TEXT DEFAULT '[]'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN card_data TEXT DEFAULT '{}'",
            [],
        );
    }

    if !column_exists(&conn, "chats", "user_persona_id")? {
        let _ = conn.execute("ALTER TABLE chats ADD COLUMN user_persona_id INTEGER REFERENCES user_personas(id) ON DELETE SET NULL", []);
    }

    // --- GROUP CHATS MIGRATION (v0.9.0) ---
    if !column_exists(&conn, "chats", "group_id")? {
        let _ = conn.execute(
            "ALTER TABLE chats ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE",
            [],
        );
    }
    if !column_exists(&conn, "messages", "sender_id")? {
        let _ = conn.execute("ALTER TABLE messages ADD COLUMN sender_id INTEGER", []);
    }
    if !column_exists(&conn, "messages", "sender_name")? {
        let _ = conn.execute("ALTER TABLE messages ADD COLUMN sender_name TEXT", []);
    }

    // Seed System Character for Group Chats (id = 0)
    let _ = conn.execute(
        "INSERT OR IGNORE INTO characters (id, name, avatar, description, uuid) VALUES (0, 'System', 'default.png', 'System Profile for Group Chats', '00000000-0000-0000-0000-000000000000')",
        []
    );

    // Initialize default persona if table empty
    if conn
        .query_row::<i64, _, _>("SELECT COUNT(*) FROM user_personas", [], |row| row.get(0))
        .unwrap_or(0)
        == 0
    {
        let _ = conn.execute(
            "INSERT INTO user_personas (name, avatar, description, is_default) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["You", "user_default.png", "A weary traveler.", 1]
        );
    }

    if !column_exists(&conn, "chats", "auto_trim_enabled")? {
        let _ = conn.execute(
            "ALTER TABLE chats ADD COLUMN auto_trim_enabled INTEGER NOT NULL DEFAULT 1",
            [],
        );
    }

    // Triggers for Synchronization
    conn.execute_batch(
        "
        CREATE TRIGGER IF NOT EXISTS tr_update_char_timestamp 
        AFTER UPDATE ON characters
        BEGIN
            UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_chat_timestamp 
        AFTER UPDATE ON chats
        BEGIN
            UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_chat_on_msg_insert
        AFTER INSERT ON messages
        BEGIN
            UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.chat_id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_chat_on_msg_update
        AFTER UPDATE ON messages
        BEGIN
            UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.chat_id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_chat_on_msg_delete
        AFTER DELETE ON messages
        BEGIN
            UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.chat_id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_group_timestamp
        AFTER UPDATE ON groups
        BEGIN
            UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_group_on_member_insert
        AFTER INSERT ON group_members
        BEGIN
            UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.group_id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_group_on_member_update
        AFTER UPDATE ON group_members
        BEGIN
            UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.group_id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_update_group_on_member_delete
        AFTER DELETE ON group_members
        BEGIN
            UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.group_id;
        END;
    ",
    )?;

    // Lorebooks and Cascades
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_lorebooks (
            chat_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
            PRIMARY KEY(chat_id, book_id),
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY(book_id) REFERENCES lorebooks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS character_lorebooks (
            character_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
            PRIMARY KEY(character_id, book_id),
            FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY(book_id) REFERENCES lorebooks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Migrations
    let _ = conn.execute(
        "ALTER TABLE lore_entries ADD COLUMN constant BOOLEAN DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lore_entries ADD COLUMN priority INTEGER DEFAULT 100",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lore_entries ADD COLUMN probability INTEGER DEFAULT 100",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lore_entries ADD COLUMN position TEXT DEFAULT 'before_char'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lore_entries ADD COLUMN depth INTEGER DEFAULT 4",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lorebooks ADD COLUMN is_global BOOLEAN DEFAULT 1",
        [],
    );
    // Fix existing books that were incorrectly created with is_global = 0
    let _ = conn.execute(
        "UPDATE lorebooks SET is_global = 1 WHERE is_global = 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lorebooks ADD COLUMN excluded_from_global BOOLEAN DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE lorebooks ADD COLUMN global_enabled BOOLEAN DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE chat_lorebooks ADD COLUMN enabled BOOLEAN DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE character_lorebooks ADD COLUMN enabled BOOLEAN DEFAULT 1",
        [],
    );

    seed_default_data(&conn)?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chats_character_id ON chats(character_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chats_group_id ON chats(group_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)",
        [],
    )?;

    Ok(conn)
}

fn seed_default_data(conn: &Connection) -> Result<()> {
    // Seed default character (if empty)
    if conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM characters", [], |row| row.get(0))? == 0 {
        // Create a default character struct
        let char = Character {
            name: "Eldara".to_string(),
            avatar: "default_avatar.png".to_string(),
            description: "A witty and mysterious barmaid with a story to tell.".to_string(),
            first_mes: "Welcome to the tavern, traveler! What can I get you?".to_string(),
            ..Default::default()
        };
        create_character(conn, &char)?;
    }
    // Seed default user persona
    if conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM user_personas", [], |row| row.get(0))? == 0
    {
        conn.execute(
            "INSERT INTO user_personas (name, avatar, description, is_default) VALUES (?1, ?2, ?3, 1)",
            ["You", "user_avatar.png", "A weary traveler arriving at the tavern."],
        )?;
    }
    Ok(())
}

// --- CRUD Functions ---

// Characters
pub fn create_character(conn: &Connection, char: &Character) -> Result<i64> {
    let uuid = if char.uuid.is_empty() {
        generate_uuid()
    } else {
        char.uuid.clone()
    };
    conn.execute(
        "INSERT INTO characters (name, avatar, description, personality, scenario, first_mes, mes_example, creator_notes, tags, alternate_greetings, card_data, uuid, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)",
        rusqlite::params![
            &char.name, &char.avatar, &char.description, &char.personality, &char.scenario, 
            &char.first_mes, &char.mes_example, &char.creator_notes, &char.tags, 
            &char.alternate_greetings, &char.card_data, &uuid
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_character(conn: &Connection, char: &Character) -> Result<usize> {
    conn.execute(
        "UPDATE characters SET 
            name = ?1, avatar = ?2, description = ?3, personality = ?4, scenario = ?5, 
            first_mes = ?6, mes_example = ?7, creator_notes = ?8, tags = ?9, 
            alternate_greetings = ?10, card_data = ?11,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?12",
        rusqlite::params![
            char.name,
            char.avatar,
            char.description,
            char.personality,
            char.scenario,
            char.first_mes,
            char.mes_example,
            char.creator_notes,
            char.tags,
            char.alternate_greetings,
            char.card_data,
            char.id
        ],
    )
}

pub fn delete_character(conn: &Connection, id: i64) -> Result<usize> {
    if id == 0 {
        return Err(rusqlite::Error::InvalidQuery); // Protect System character
    }
    conn.execute("DELETE FROM characters WHERE id = ?1", params![id])
}

pub fn get_characters(conn: &Connection) -> Result<Vec<Character>> {
    let sql = "SELECT id, name, avatar, description, personality, scenario, first_mes, mes_example, creator_notes, tags, alternate_greetings, card_data, created_at, uuid, updated_at FROM characters WHERE id > 0 ORDER BY created_at DESC";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(Character {
            id: row.get("id")?,
            name: row
                .get::<_, Option<String>>("name")?
                .unwrap_or_else(|| "Unknown".to_string()),
            avatar: row.get::<_, Option<String>>("avatar")?.unwrap_or_default(),
            description: row
                .get::<_, Option<String>>("description")?
                .unwrap_or_default(),
            personality: row
                .get::<_, Option<String>>("personality")?
                .unwrap_or_default(),
            scenario: row
                .get::<_, Option<String>>("scenario")?
                .unwrap_or_default(),
            first_mes: row
                .get::<_, Option<String>>("first_mes")?
                .unwrap_or_default(),
            mes_example: row
                .get::<_, Option<String>>("mes_example")?
                .unwrap_or_default(),
            creator_notes: row
                .get::<_, Option<String>>("creator_notes")?
                .unwrap_or_default(),
            tags: row
                .get::<_, Option<String>>("tags")?
                .unwrap_or_else(|| "[]".to_string()),
            alternate_greetings: row
                .get::<_, Option<String>>("alternate_greetings")?
                .unwrap_or_else(|| "[]".to_string()),
            card_data: row
                .get::<_, Option<String>>("card_data")?
                .unwrap_or_else(|| "{}".to_string()),
            created_at: row
                .get::<_, Option<String>>("created_at")?
                .unwrap_or_default(),
            uuid: row
                .get::<_, Option<String>>("uuid")?
                .unwrap_or_else(|| "temp-uuid".to_string()),
            updated_at: row
                .get::<_, Option<String>>("updated_at")?
                .unwrap_or_default(),
            is_muted: false,
        })
    })?;

    let mut results = Vec::new();
    for r in rows {
        match r {
            Ok(c) => {
                results.push(c);
            }
            Err(e) => {
                println!("DB DEBUG ERROR: Failed to map character row: {}", e);
            }
        }
    }
    Ok(results)
}

pub fn get_character_by_id(conn: &Connection, id: i64) -> Result<Character> {
    let sql = "SELECT id, name, avatar, description, personality, scenario, first_mes, mes_example, creator_notes, tags, alternate_greetings, card_data, created_at, uuid, updated_at FROM characters WHERE id = ?1";

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Character {
            id: row.get("id")?,
            name: row.get("name")?,
            avatar: row.get("avatar")?,
            description: row.get("description")?,
            personality: row.get("personality")?,
            scenario: row.get("scenario")?,
            first_mes: row.get("first_mes")?,
            mes_example: row.get("mes_example")?,
            creator_notes: row.get("creator_notes")?,
            tags: row
                .get::<_, Option<String>>("tags")?
                .unwrap_or_else(|| "[]".to_string()),
            alternate_greetings: row
                .get::<_, Option<String>>("alternate_greetings")?
                .unwrap_or_else(|| "[]".to_string()),
            card_data: row
                .get::<_, Option<String>>("card_data")?
                .unwrap_or_else(|| "{}".to_string()),
            created_at: row
                .get::<_, Option<String>>("created_at")?
                .unwrap_or_default(),
            uuid: row
                .get::<_, Option<String>>("uuid")?
                .unwrap_or_else(|| "temp-uuid".to_string()),
            updated_at: row
                .get::<_, Option<String>>("updated_at")?
                .unwrap_or_default(),
            is_muted: false,
        })
    })?;

    if let Some(row) = rows.next() {
        Ok(row?)
    } else {
        Err(rusqlite::Error::QueryReturnedNoRows)
    }
}

// --- GROUPS & MULTIPLAYER ---

pub fn create_group(conn: &Connection, name: &str, avatar: &str, scenario: &str) -> Result<i64> {
    let uuid = generate_uuid();
    conn.execute(
        "INSERT INTO groups (name, avatar, scenario, uuid) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![name, avatar, scenario, uuid],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_groups(conn: &Connection) -> Result<Vec<Group>> {
    let mut stmt = conn.prepare("SELECT id, name, avatar, scenario, activation_strategy, generation_mode, allow_self_responses, created_at, uuid, updated_at FROM groups ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Group {
            id: row.get(0)?,
            name: row.get(1)?,
            avatar: row.get(2)?,
            scenario: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            activation_strategy: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            generation_mode: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
            allow_self_responses: row.get::<_, Option<bool>>(6)?.unwrap_or(false),
            created_at: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
            uuid: row
                .get::<_, Option<String>>(8)?
                .unwrap_or_else(|| "temp-uuid".to_string()),
            updated_at: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
        })
    })?;

    let mut results = Vec::new();
    for g in rows.flatten() {
        results.push(g);
    }
    Ok(results)
}

pub fn export_cloud_groups(conn: &Connection) -> Result<Vec<CloudGroup>> {
    let groups = get_groups(conn)?;
    let mut cloud_groups = Vec::new();

    for g in groups {
        let mut stmt = conn.prepare(
            "
            SELECT c.uuid, gm.sort_order, gm.is_muted 
            FROM group_members gm 
            JOIN characters c ON c.id = gm.character_id 
            WHERE gm.group_id = ?1
        ",
        )?;
        let members = stmt
            .query_map([g.id], |row| {
                Ok(CloudGroupMember {
                    char_uuid: row.get(0)?,
                    sort_order: row.get(1)?,
                    is_muted: row.get(2)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        cloud_groups.push(CloudGroup {
            uuid: g.uuid,
            name: g.name,
            avatar: g.avatar,
            scenario: g.scenario,
            activation_strategy: g.activation_strategy,
            generation_mode: g.generation_mode,
            allow_self_responses: g.allow_self_responses,
            updated_at: g.updated_at,
            members,
        });
    }

    Ok(cloud_groups)
}

pub fn import_cloud_group(conn: &Connection, cg: &CloudGroup) -> Result<()> {
    // We inserted by UUID, but SQLite ON CONFLICT is on Primary Key. We need to handle UUID explicitly.
    // Wait, `groups` table does not have UNIQUE constraint on `uuid`!
    // Let's manually check if it exists.
    let group_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM groups WHERE uuid = ?1",
            rusqlite::params![cg.uuid],
            |r| r.get(0),
        )
        .ok();

    let actual_group_id = if let Some(id) = group_id {
        conn.execute(
            "UPDATE groups SET name = ?1, avatar = ?2, scenario = ?3, activation_strategy = ?4, generation_mode = ?5, allow_self_responses = ?6, updated_at = ?7 WHERE id = ?8",
            rusqlite::params![cg.name, cg.avatar, cg.scenario, cg.activation_strategy, cg.generation_mode, cg.allow_self_responses, cg.updated_at, id],
        )?;
        id
    } else {
        conn.execute(
            "INSERT INTO groups (uuid, name, avatar, scenario, activation_strategy, generation_mode, allow_self_responses, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![cg.uuid, cg.name, cg.avatar, cg.scenario, cg.activation_strategy, cg.generation_mode, cg.allow_self_responses, cg.updated_at],
        )?;
        conn.last_insert_rowid()
    };

    // Replace members
    conn.execute(
        "DELETE FROM group_members WHERE group_id = ?1",
        rusqlite::params![actual_group_id],
    )?;

    for m in &cg.members {
        if let Some(char_id) = find_character_by_uuid(conn, &m.char_uuid)? {
            conn.execute(
                "INSERT INTO group_members (group_id, character_id, sort_order, is_muted) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![actual_group_id, char_id, m.sort_order, m.is_muted]
            )?;
        }
    }

    Ok(())
}

pub fn delete_group(conn: &Connection, group_id: i64) -> Result<()> {
    conn.execute("DELETE FROM groups WHERE id = ?1", params![group_id])?;
    Ok(())
}

pub fn add_group_member(conn: &Connection, group_id: i64, character_id: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO group_members (group_id, character_id) VALUES (?1, ?2)",
        params![group_id, character_id],
    )?;
    Ok(())
}

pub fn remove_group_member(conn: &Connection, group_id: i64, character_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM group_members WHERE group_id = ?1 AND character_id = ?2",
        params![group_id, character_id],
    )?;
    Ok(())
}

pub fn toggle_group_member_mute(
    conn: &Connection,
    group_id: i64,
    character_id: i64,
    is_muted: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE group_members SET is_muted = ?1 WHERE group_id = ?2 AND character_id = ?3",
        params![is_muted, group_id, character_id],
    )?;
    Ok(())
}

pub fn get_group_members(conn: &Connection, group_id: i64) -> Result<Vec<Character>> {
    let sql = format!(
        "SELECT c.id, c.name, c.avatar, c.description, c.personality, c.scenario, c.first_mes, c.mes_example, c.creator_notes, c.tags, c.alternate_greetings, c.card_data, c.created_at, {} as uuid, {} as updated_at, gm.is_muted 
         FROM characters c
         INNER JOIN group_members gm ON c.id = gm.character_id
         WHERE gm.group_id = ?1 ORDER BY gm.sort_order ASC",
        if column_exists(conn, "characters", "uuid").unwrap_or(false) { "c.uuid" } else { "'temp-uuid'" },
        if column_exists(conn, "characters", "updated_at").unwrap_or(false) { "c.updated_at" } else { "c.created_at" }
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![group_id], |row| {
        Ok(Character {
            id: row.get("id")?,
            name: row
                .get::<_, Option<String>>("name")?
                .unwrap_or_else(|| "Unknown".to_string()),
            avatar: row.get::<_, Option<String>>("avatar")?.unwrap_or_default(),
            description: row
                .get::<_, Option<String>>("description")?
                .unwrap_or_default(),
            personality: row
                .get::<_, Option<String>>("personality")?
                .unwrap_or_default(),
            scenario: row
                .get::<_, Option<String>>("scenario")?
                .unwrap_or_default(),
            first_mes: row
                .get::<_, Option<String>>("first_mes")?
                .unwrap_or_default(),
            mes_example: row
                .get::<_, Option<String>>("mes_example")?
                .unwrap_or_default(),
            creator_notes: row
                .get::<_, Option<String>>("creator_notes")?
                .unwrap_or_default(),
            tags: row
                .get::<_, Option<String>>("tags")?
                .unwrap_or_else(|| "[]".to_string()),
            alternate_greetings: row
                .get::<_, Option<String>>("alternate_greetings")?
                .unwrap_or_else(|| "[]".to_string()),
            card_data: row
                .get::<_, Option<String>>("card_data")?
                .unwrap_or_else(|| "{}".to_string()),
            created_at: row
                .get::<_, Option<String>>("created_at")?
                .unwrap_or_default(),
            uuid: row
                .get::<_, Option<String>>("uuid")?
                .unwrap_or_else(|| "temp-uuid".to_string()),
            updated_at: row
                .get::<_, Option<String>>("updated_at")?
                .unwrap_or_default(),
            is_muted: row.get::<_, Option<bool>>("is_muted")?.unwrap_or(false),
        })
    })?;

    let mut results = Vec::new();
    for c in rows.flatten() {
        results.push(c);
    }
    Ok(results)
}

pub fn update_group(
    conn: &Connection,
    id: i64,
    name: &str,
    avatar: &str,
    scenario: &str,
    activation_strategy: i64,
    generation_mode: i64,
    allow_self_responses: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE groups SET name = ?1, avatar = ?2, scenario = ?3, activation_strategy = ?4, generation_mode = ?5, allow_self_responses = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
        rusqlite::params![name, avatar, scenario, activation_strategy, generation_mode, allow_self_responses, id],
    )?;
    Ok(())
}

// User Personas
pub fn create_user_persona(
    conn: &Connection,
    name: &str,
    avatar: &str,
    description: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO user_personas (name, avatar, description, is_default) VALUES (?1, ?2, ?3, 0)",
        params![name, avatar, description],
    )?;
    let id = conn.last_insert_rowid();

    // If first one, make default
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM user_personas", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 1 {
        let _ = conn.execute(
            "UPDATE user_personas SET is_default = 1 WHERE id = ?1",
            params![id],
        );
    }
    Ok(id)
}

pub fn set_default_persona(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("UPDATE user_personas SET is_default = 0", [])?;
    conn.execute(
        "UPDATE user_personas SET is_default = 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn update_user_persona(conn: &Connection, persona: &UserPersona) -> Result<()> {
    conn.execute(
        "UPDATE user_personas SET name = ?1, avatar = ?2, description = ?3 WHERE id = ?4",
        rusqlite::params![
            persona.name,
            persona.avatar,
            persona.description,
            persona.id
        ],
    )?;
    Ok(())
}

pub fn delete_user_persona(conn: &Connection, id: i64) -> Result<usize> {
    conn.execute("DELETE FROM user_personas WHERE id = ?1", params![id])
}

pub fn get_user_personas(conn: &Connection) -> Result<Vec<UserPersona>> {
    let mut stmt =
        conn.prepare("SELECT id, name, avatar, description, is_default FROM user_personas")?;
    let rows = stmt.query_map([], |row| {
        Ok(UserPersona {
            id: row.get(0)?,
            name: row.get(1)?,
            avatar: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            description: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            is_default: row.get::<_, Option<bool>>(4)?.unwrap_or(false),
        })
    })?;
    let mut personas = Vec::new();
    for row in rows {
        personas.push(row?);
    }
    Ok(personas)
}
pub fn update_chat_persona(conn: &Connection, chat_id: i64, persona_id: i64) -> Result<usize> {
    conn.execute(
        "UPDATE chats SET user_persona_id = ?1 WHERE id = ?2",
        rusqlite::params![persona_id, chat_id],
    )
}

// Chats
pub fn create_chat(
    conn: &Connection,
    character_id: i64,
    group_id: Option<i64>,
    name: &str,
) -> Result<i64> {
    let uuid = generate_uuid();
    let default_persona_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM user_personas WHERE is_default = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    conn.execute(
        "INSERT INTO chats (character_id, group_id, name, uuid, user_persona_id) VALUES (?1, ?2, ?3, ?4, ?5)", 
        rusqlite::params![character_id, group_id, name, uuid, default_persona_id]
    )?;
    let chat_id = conn.last_insert_rowid();

    // Prepare first message data (Read Phase)
    if group_id.is_none() && character_id != 0 {
        let first_mes_data: Option<(String, String)> = {
            let mut stmt = conn
                .prepare("SELECT first_mes, alternate_greetings FROM characters WHERE id = ?1")?;
            stmt.query_row(params![character_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .ok()
        }; // stmt dropped here

        // Insert First Message (Write Phase)
        if let Some((first_mes, alts_json)) = first_mes_data {
            if !first_mes.trim().is_empty() {
                let mut swipes = vec![first_mes.clone()];
                if let Ok(alts) = serde_json::from_str::<Vec<String>>(&alts_json) {
                    let valid_alts: Vec<String> =
                        alts.into_iter().filter(|s| !s.trim().is_empty()).collect();
                    swipes.extend(valid_alts);
                }
                let swipes_json =
                    serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

                let _ = conn.execute(
                    "INSERT INTO messages (chat_id, role, content, swipes, swipe_id, is_system, extra) VALUES (?1, ?2, ?3, ?4, 0, 0, '{}')", 
                    rusqlite::params![chat_id, "char", first_mes, swipes_json]
                );
            }
        }
    }

    Ok(chat_id)
}
pub fn rename_chat(conn: &Connection, id: i64, new_name: &str) -> Result<usize> {
    conn.execute(
        "UPDATE chats SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_name, id],
    )
}

pub fn export_chat_jsonl(conn: &Connection, chat_id: i64) -> Result<String, rusqlite::Error> {
    // 1. Get Chat Metadata for Header
    let has_uuid = column_exists(conn, "characters", "uuid").unwrap_or(false);

    let sql = format!(
        "
        SELECT ch.name, char.name, ch.created_at, p.name{}
        FROM chats ch 
        JOIN characters char ON ch.character_id = char.id 
        LEFT JOIN user_personas p ON ch.user_persona_id = p.id
        WHERE ch.id = ?1",
        if has_uuid {
            ", char.uuid"
        } else {
            ", '' as uuid"
        }
    );

    let mut stmt = conn.prepare(&sql)?;

    let (_chat_name, char_name, create_date, persona_name, char_uuid): (
        String,
        String,
        String,
        Option<String>,
        String,
    ) = stmt.query_row([chat_id], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
        ))
    })?;

    let header = serde_json::json!({
        "user_name": persona_name.unwrap_or_else(|| "You".to_string()),
        "character_name": char_name,
        "character_uuid": char_uuid,
        "create_date": create_date,
        "chat_metadata": {}
    });

    let mut output = serde_json::to_string(&header).unwrap_or_else(|_| "{}".to_string());
    output.push('\n');

    // 2. Get Messages
    let messages = get_messages(conn, chat_id)?;
    for msg in messages {
        let entry = serde_json::json!({
            "name": if msg.role == "user" { "You" } else { &char_name },
            "is_user": msg.role == "user",
            "is_system": msg.is_system,
            "send_date": msg.timestamp,
            "mes": msg.content,
            "swipes": msg.swipes,
            "swipe_id": msg.swipe_id,
            "extra": serde_json::from_str::<serde_json::Value>(&msg.extra).unwrap_or_default()
        });
        output.push_str(&serde_json::to_string(&entry).unwrap_or_else(|_| "{}".to_string()));
        output.push('\n');
    }

    Ok(output)
}

pub fn get_chats(conn: &Connection, character_id: i64, group_id: Option<i64>) -> Result<Vec<Chat>> {
    let sql = if group_id.is_some() {
        "SELECT id, character_id, user_persona_id, group_id, name, created_at, uuid, updated_at, memory FROM chats WHERE group_id = ?1 ORDER BY id DESC"
    } else {
        "SELECT id, character_id, user_persona_id, group_id, name, created_at, uuid, updated_at, memory FROM chats WHERE character_id = ?1 AND group_id IS NULL ORDER BY id DESC"
    };

    let mut stmt = conn.prepare(sql)?;
    let query_param = group_id.unwrap_or(character_id);
    let rows = stmt.query_map(params![query_param], |row| {
        Ok(Chat {
            id: row.get("id")?,
            character_id: row.get("character_id")?,
            user_persona_id: row.get("user_persona_id").ok(),
            group_id: row.get("group_id").unwrap_or(None),
            name: row
                .get::<_, Option<String>>("name")?
                .unwrap_or_else(|| "Untitled".to_string()),
            created_at: row
                .get::<_, Option<String>>("created_at")?
                .unwrap_or_default(),
            uuid: row
                .get::<_, Option<String>>("uuid")?
                .unwrap_or_else(|| "temp-uuid".to_string()),
            updated_at: row
                .get::<_, Option<String>>("updated_at")?
                .unwrap_or_default(),
            memory: row.get::<_, Option<String>>("memory")?.unwrap_or_default(),
        })
    })?;

    let mut results = Vec::new();
    for c in rows.flatten() {
        results.push(c);
    }
    Ok(results)
}

pub fn update_chat_memory(conn: &Connection, chat_id: i64, memory: &str) -> Result<usize> {
    conn.execute(
        "UPDATE chats SET memory = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![memory, chat_id],
    )
}

pub fn delete_chat(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![id])?;
    conn.execute("DELETE FROM chat_variables WHERE chat_id = ?1", params![id])?;
    conn.execute("DELETE FROM chats WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn find_character_by_uuid(conn: &Connection, uuid: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM characters WHERE uuid = ?1",
        params![uuid],
        |r| r.get(0),
    )
    .optional()
}

pub fn find_chat_by_uuid(conn: &Connection, uuid: &str) -> Result<Option<i64>> {
    conn.query_row("SELECT id FROM chats WHERE uuid = ?1", params![uuid], |r| {
        r.get(0)
    })
    .optional()
}

pub fn import_chat_jsonl_data(
    conn: &Connection,
    character_id: i64,
    data: &str,
    chat_uuid: Option<&str>,
) -> Result<i64, String> {
    let mut lines = data.lines();
    let header_str = lines.next().ok_or("Empty file")?;
    let header: serde_json::Value =
        serde_json::from_str(header_str).map_err(|e| format!("Invalid header: {}", e))?;
    let chat_name = header["character_name"].as_str().unwrap_or("Imported Chat");

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;

    // Create chat with UUID if provided
    let chat_id = match chat_uuid {
        Some(uuid) => {
            // Delete existing chat to avoid duplicates, inside the transaction
            if let Ok(Some(id)) = find_chat_by_uuid(conn, uuid) {
                let _ = conn.execute(
                    "DELETE FROM messages WHERE chat_id = ?1",
                    rusqlite::params![id],
                );
                let _ = conn.execute("DELETE FROM chats WHERE id = ?1", rusqlite::params![id]);
            }

            let default_persona_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM user_personas WHERE is_default = 1 LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .ok();
            if let Err(e) = conn.execute("INSERT INTO chats (character_id, name, uuid, user_persona_id) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![character_id, chat_name, uuid, default_persona_id]) {
                let _ = conn.execute("ROLLBACK", []);
                return Err(e.to_string());
            }
            conn.last_insert_rowid()
        }
        None => match create_chat(conn, character_id, None, chat_name) {
            Ok(id) => id,
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(e.to_string());
            }
        },
    };

    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let m_res: Result<serde_json::Value, _> = serde_json::from_str(line);
        let m = match m_res {
            Ok(v) => v,
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(format!("Invalid message line: {}", e));
            }
        };

        let role = if m["is_user"].as_bool().unwrap_or(false) {
            "user"
        } else {
            "char"
        };
        let content = m["mes"].as_str().unwrap_or("");
        let timestamp = m["send_date"].as_str().unwrap_or("");
        let swipes_val = m["swipes"].clone();

        // Fix manual escaping: securely serialize the swipes array
        let swipes_str = if swipes_val.is_array() {
            serde_json::to_string(&swipes_val).unwrap_or_else(|_| "[]".to_string())
        } else {
            serde_json::to_string(&vec![content]).unwrap_or_else(|_| "[]".to_string())
        };

        let swipe_id = m["swipe_id"].as_u64().unwrap_or(0);
        let is_system = m["is_system"].as_bool().unwrap_or(false);
        let extra = m["extra"].to_string();

        if let Err(e) = conn.execute(
            "INSERT INTO messages (chat_id, role, content, timestamp, swipes, swipe_id, is_system, extra) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![chat_id, role, content, timestamp, swipes_str, swipe_id, if is_system { 1 } else { 0 }, extra]
        ) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(e.to_string());
        }
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(chat_id)
}

// Messages
pub fn set_chat_variable(conn: &Connection, chat_id: i64, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO chat_variables (chat_id, key, value) VALUES (?1, ?2, ?3)",
        rusqlite::params![chat_id, key, value],
    )?;
    Ok(())
}

pub fn delete_chat_variable(conn: &Connection, chat_id: i64, key: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_variables WHERE chat_id = ?1 AND key = ?2",
        params![chat_id, key],
    )?;
    Ok(())
}

pub fn get_chat_variables(
    conn: &Connection,
    chat_id: i64,
) -> Result<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM chat_variables WHERE chat_id = ?1")?;
    let rows = stmt.query_map(params![chat_id], |row| Ok((row.get(0)?, row.get(1)?)))?;

    let mut vars = std::collections::HashMap::new();
    for row in rows {
        let (k, v): (String, String) = row?;
        vars.insert(k, v);
    }
    Ok(vars)
}

pub fn get_messages(conn: &Connection, chat_id: i64) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare("SELECT id, chat_id, role, content, timestamp, swipes, swipe_id, is_system, extra, images, sender_id, sender_name FROM messages WHERE chat_id = ?1 ORDER BY id ASC")?;
    let iter = stmt.query_map(params![chat_id], |row| {
        let swipes_str: String = row
            .get::<_, Option<String>>(5)?
            .unwrap_or_else(|| "[]".to_string());
        let swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        let swipe_id: usize = row.get::<_, Option<usize>>(6)?.unwrap_or(0);
        let images_str: String = row
            .get::<_, Option<String>>(9)?
            .unwrap_or_else(|| "[]".to_string());
        let images: Option<Vec<String>> = serde_json::from_str(&images_str).ok();

        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
            swipes,
            swipe_id,
            is_system: row.get::<_, i32>(7)? != 0,
            extra: row
                .get::<_, Option<String>>(8)?
                .unwrap_or_else(|| "{}".to_string()),
            images,
            sender_id: row.get(10).unwrap_or(None),
            sender_name: row.get(11).unwrap_or(None),
        })
    })?;
    iter.collect()
}

pub fn get_messages_paged(
    conn: &Connection,
    chat_id: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare("SELECT id, chat_id, role, content, timestamp, swipes, swipe_id, is_system, extra, images, sender_id, sender_name FROM messages WHERE chat_id = ?1 ORDER BY timestamp DESC, id DESC LIMIT ?2 OFFSET ?3")?;
    let iter = stmt.query_map(rusqlite::params![chat_id, limit, offset], |row| {
        let swipes_str: String = row
            .get::<_, Option<String>>(5)?
            .unwrap_or_else(|| "[]".to_string());
        let swipes: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        let swipe_id: usize = row.get::<_, Option<usize>>(6)?.unwrap_or(0);
        let images_str: String = row
            .get::<_, Option<String>>(9)?
            .unwrap_or_else(|| "[]".to_string());
        let images: Option<Vec<String>> = serde_json::from_str(&images_str).ok();

        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            timestamp: row.get(4)?,
            swipes,
            swipe_id,
            is_system: row.get::<_, i32>(7)? != 0,
            extra: row
                .get::<_, Option<String>>(8)?
                .unwrap_or_else(|| "{}".to_string()),
            images,
            sender_id: row.get(10).unwrap_or(None),
            sender_name: row.get(11).unwrap_or(None),
        })
    })?;
    let mut messages: Vec<Message> = iter.collect::<Result<_, _>>()?;
    messages.reverse();
    Ok(messages)
}

pub fn save_message(
    conn: &Connection,
    chat_id: i64,
    role: &str,
    content: &str,
    images: Option<Vec<String>>,
) -> Result<i64> {
    save_message_ext(conn, chat_id, role, content, images, None, None)
}

pub fn save_message_ext(
    conn: &Connection,
    chat_id: i64,
    role: &str,
    content: &str,
    images: Option<Vec<String>>,
    sender_id: Option<i64>,
    sender_name: Option<&str>,
) -> Result<i64> {
    let swipes_json = serde_json::to_string(&vec![content]).unwrap_or_else(|_| "[]".to_string());
    let images_json =
        serde_json::to_string(&images.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO messages (chat_id, role, content, swipes, swipe_id, is_system, extra, images, sender_id, sender_name) VALUES (?1, ?2, ?3, ?4, 0, 0, '{}', ?5, ?6, ?7)",
        rusqlite::params![chat_id, role, content, swipes_json, images_json, sender_id, sender_name]
    )?;
    Ok(conn.last_insert_rowid())
}
pub fn edit_message(conn: &Connection, id: i64, new_content: &str) -> Result<()> {
    let swipes: Vec<String> = {
        let mut stmt = conn.prepare("SELECT swipes, swipe_id FROM messages WHERE id = ?1")?;
        let (swipes_str, swipe_id): (String, usize) = stmt.query_row(params![id], |row| {
            Ok((
                row.get(0).unwrap_or_else(|_| "[]".to_string()),
                row.get(1).unwrap_or(0),
            ))
        })?;

        let mut s: Vec<String> = serde_json::from_str(&swipes_str).unwrap_or_default();
        if swipe_id < s.len() {
            s[swipe_id] = new_content.to_string();
        } else {
            s.push(new_content.to_string());
        }
        s
    };

    let new_swipes_json = serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE messages SET content = ?1, swipes = ?2 WHERE id = ?3",
        rusqlite::params![new_content, new_swipes_json, id],
    )?;
    Ok(())
}

pub fn set_message_prompt_excluded(
    conn: &Connection,
    id: i64,
    excluded: bool,
    reason: Option<&str>,
) -> Result<()> {
    MessageExtra::update(conn, id, |extra| {
        extra.exclude_from_prompt = excluded;
        extra.exclude_reason = if excluded {
            Some(reason.unwrap_or("manual").to_string())
        } else {
            None
        };
    })
}

pub fn update_message_swipes(conn: &Connection, id: i64, swipes: &Vec<String>) -> Result<()> {
    let json = serde_json::to_string(swipes).unwrap_or("[]".to_string());
    conn.execute(
        "UPDATE messages SET swipes = ?1 WHERE id = ?2",
        params![json, id],
    )?;
    Ok(())
}

pub fn delete_message(conn: &Connection, id: i64) -> Result<usize> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])
}

pub fn delete_swipe(conn: &Connection, id: i64) -> Result<()> {
    let (mut swipes, swipe_id): (Vec<String>, usize) = {
        let mut stmt = conn.prepare("SELECT swipes, swipe_id FROM messages WHERE id = ?1")?;
        let (swipes_str, swipe_id): (String, usize) = stmt.query_row(params![id], |row| {
            Ok((
                row.get(0).unwrap_or_else(|_| "[]".to_string()),
                row.get(1).unwrap_or(0),
            ))
        })?;
        (
            serde_json::from_str(&swipes_str).unwrap_or_default(),
            swipe_id,
        )
    };

    if swipe_id < swipes.len() {
        swipes.remove(swipe_id);
    }

    if swipes.is_empty() {
        delete_message(conn, id)?;
    } else {
        let new_index = if swipe_id >= swipes.len() {
            swipes.len().saturating_sub(1)
        } else {
            swipe_id
        };
        let new_content = &swipes[new_index];
        let new_swipes_json = serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "UPDATE messages SET content = ?1, swipes = ?2, swipe_id = ?3 WHERE id = ?4",
            rusqlite::params![new_content, new_swipes_json, new_index, id],
        )?;
    }
    Ok(())
}

pub fn delete_message_branch(conn: &Connection, chat_id: i64, from_id: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM messages WHERE chat_id = ?1 AND id >= ?2",
        params![chat_id, from_id],
    )
}

pub fn branch_chat(
    conn: &Connection,
    chat_id: i64,
    from_msg_id: i64,
    new_name: &str,
) -> Result<i64> {
    let (char_id, user_p_id, group_id): (i64, Option<i64>, Option<i64>) = {
        let mut stmt = conn
            .prepare("SELECT character_id, user_persona_id, group_id FROM chats WHERE id = ?1")?;
        stmt.query_row(params![chat_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
    };

    conn.execute(
        "INSERT INTO chats (character_id, user_persona_id, group_id, name) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![char_id, user_p_id, group_id, new_name],
    )?;
    let new_chat_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO messages (chat_id, role, content, swipes, swipe_id, timestamp)
         SELECT ?1, role, content, swipes, swipe_id, timestamp
         FROM messages WHERE chat_id = ?2 AND id <= ?3",
        rusqlite::params![new_chat_id, chat_id, from_msg_id],
    )?;

    Ok(new_chat_id)
}

// --- LOREBOOKS (re-exported from lorebook module) ---
pub use crate::lorebook::{
    create_lore_entry, create_lorebook, delete_lore_entry, delete_lorebook,
    find_lorebook_id_by_name, get_active_lore_entries, get_character_lorebook_ids,
    get_character_lorebook_links, get_chat_lorebook_ids, get_chat_lorebook_links, get_lore_entries,
    get_lorebooks, link_character_lorebook, set_character_lorebook_enabled,
    set_chat_active_lorebook, set_chat_lorebook_enabled, set_global_lorebook_enabled,
    set_lore_entry_enabled, set_lorebook_excluded_from_global, toggle_character_lorebook,
    toggle_chat_lorebook, toggle_global_lorebook, unpack_character_lorebook, update_lore_entry,
    LoreEntry, Lorebook, LorebookLink,
};

// --- REGEX SCRIPTS ---

#[derive(Serialize, Deserialize, Debug)]
pub struct RegexScript {
    pub id: i64,
    pub script_name: String,
    pub regex: String,
    pub replacement: String,
    pub placement: String,
    pub run_on_markdown: bool,
    #[serde(default)]
    pub disabled: bool,
}

pub fn create_regex_script(
    conn: &Connection,
    name: &str,
    regex: &str,
    replacement: &str,
    placement: &str,
    run_on_markdown: bool,
    disabled: bool,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO regex_scripts (script_name, regex, replacement, placement, run_on_markdown, disabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, regex, replacement, placement, run_on_markdown, disabled]
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_regex_scripts(conn: &Connection) -> Result<Vec<RegexScript>> {
    let mut stmt = conn.prepare(
        "SELECT id, script_name, regex, replacement, placement, run_on_markdown, disabled FROM regex_scripts",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(RegexScript {
            id: row.get(0)?,
            script_name: row.get(1)?,
            regex: row.get(2)?,
            replacement: row.get(3).unwrap_or_default(),
            placement: row.get(4).unwrap_or("both".to_string()),
            run_on_markdown: row.get(5).unwrap_or(true),
            disabled: row.get(6).unwrap_or(false),
        })
    })?;
    let mut scripts = Vec::new();
    for row in rows {
        scripts.push(row?);
    }
    Ok(scripts)
}

pub fn update_regex_script(conn: &Connection, script: &RegexScript) -> Result<()> {
    conn.execute(
        "UPDATE regex_scripts SET script_name = ?1, regex = ?2, replacement = ?3, placement = ?4, run_on_markdown = ?5, disabled = ?6 WHERE id = ?7",
        params![script.script_name, script.regex, script.replacement, script.placement, script.run_on_markdown, script.disabled, script.id]
    )?;
    Ok(())
}

pub fn delete_regex_script(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM regex_scripts WHERE id = ?1", params![id])?;
    Ok(())
}

// --- QUICK REPLIES ---

#[derive(Serialize, Deserialize, Debug)]
pub struct QuickReply {
    pub id: i64,
    pub label: String,
    pub content: String,
    pub icon: String,
    pub is_global: bool,
}

pub fn create_quick_reply(
    conn: &Connection,
    label: &str,
    content: &str,
    icon: &str,
    is_global: bool,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO quick_replies (label, content, icon, is_global) VALUES (?1, ?2, ?3, ?4)",
        params![label, content, icon, is_global],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_quick_replies(conn: &Connection) -> Result<Vec<QuickReply>> {
    let mut stmt = conn.prepare("SELECT id, label, content, icon, is_global FROM quick_replies")?;
    let rows = stmt.query_map([], |row| {
        Ok(QuickReply {
            id: row.get(0)?,
            label: row.get(1)?,
            content: row.get(2)?,
            icon: row.get(3).unwrap_or_default(),
            is_global: row.get(4).unwrap_or(true),
        })
    })?;
    let mut qrs = Vec::new();
    for row in rows {
        qrs.push(row?);
    }
    Ok(qrs)
}

pub fn delete_quick_reply(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM quick_replies WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_quick_reply(
    conn: &Connection,
    id: i64,
    label: &str,
    content: &str,
    icon: &str,
    is_global: bool,
) -> Result<()> {
    conn.execute(
        "UPDATE quick_replies SET label = ?1, content = ?2, icon = ?3, is_global = ?4 WHERE id = ?5",
        params![label, content, icon, is_global, id]
    )?;
    Ok(())
}

// Global Variables
pub fn get_global_variables(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM global_variables")?;
    let iter = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    let mut map = HashMap::new();
    for item in iter {
        let (k, v) = item?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn set_global_variable(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO global_variables (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_global_variable(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM global_variables WHERE key = ?1", params![key])?;
    Ok(())
}
