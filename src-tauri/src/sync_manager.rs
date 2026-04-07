use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};
use rand::{thread_rng, Rng};

// Securely loaded at compile time
pub const DROPBOX_APP_KEY: &str = match option_env!("TAVERNREV_DROPBOX_KEY") {
    Some(val) => val,
    None => "MISSING_KEY",
};
pub const REDIRECT_URI: &str = "http://localhost:1234";

#[derive(Debug, Serialize, Deserialize)]
pub struct DropboxTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub uid: String,
    pub account_id: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
}

/// Generates a random PKCE code verifier
pub fn generate_verifier() -> String {
    let mut rng = thread_rng();
    let chars: Vec<u8> = (0..64).map(|_| rng.sample(rand::distributions::Alphanumeric)).collect();
    String::from_utf8(chars).unwrap()
}

/// Hashes the verifier to create a code challenge
pub fn generate_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    general_purpose::URL_SAFE_NO_PAD.encode(result)
}

pub fn build_auth_url(challenge: &str) -> String {
    format!(
        "https://www.dropbox.com/oauth2/authorize?client_id={}&response_type=code&redirect_uri={}&code_challenge={}&code_challenge_method=S256&token_access_type=offline",
        DROPBOX_APP_KEY,
        REDIRECT_URI,
        challenge
    )
}

pub async fn exchange_code_for_token(code: &str, verifier: &str) -> Result<DropboxTokenResponse, String> {
    let client = Client::new();
    let params = [
        ("code", code),
        ("grant_type", "authorization_code"),
        ("client_id", DROPBOX_APP_KEY),
        ("code_verifier", verifier),
        ("redirect_uri", REDIRECT_URI),
    ];

    let res = client.post("https://api.dropboxapi.com/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let token_data: DropboxTokenResponse = res.json().await.map_err(|e| e.to_string())?;
        Ok(token_data)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Dropbox Auth Error: {}", err))
    }
}

pub async fn refresh_access_token(refresh_token: &str) -> Result<DropboxTokenResponse, String> {
    let client = Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", DROPBOX_APP_KEY),
    ];

    let res = client.post("https://api.dropboxapi.com/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let token_data: DropboxTokenResponse = res.json().await.map_err(|e| e.to_string())?;
        Ok(token_data)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Dropbox Refresh Error: {}", err))
    }
}

pub struct CloudFile {
    pub path: String,
    pub client_modified: String,
}

pub async fn upload_file(token: &str, path: &str, content: Vec<u8>, client_modified: Option<&str>) -> Result<(), String> {
    let client = Client::new();
    
    let mut arg_json = serde_json::json!({
        "path": path,
        "mode": "overwrite",
        "mute": true
    });

    if let Some(time) = client_modified {
        arg_json["client_modified"] = serde_json::Value::String(time.to_string());
    }
    
    let arg = arg_json.to_string();

    let res = client.post("https://content.dropboxapi.com/2/files/upload")
        .header("Authorization", format!("Bearer {}", token))
        .header("Dropbox-API-Arg", arg)
        .header("Content-Type", "application/octet-stream")
        .body(content)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Dropbox Upload Error: {}", err))
    }
}

pub async fn list_folder(token: &str, path: &str) -> Result<Vec<CloudFile>, String> {
    let client = Client::new();
    let body = serde_json::json!({
        "path": path,
        "recursive": false
    });

    let res = client.post("https://api.dropboxapi.com/2/files/list_folder")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        if let Some(entries) = data["entries"].as_array() {
            for entry in entries {
                if entry[".tag"] == "file" {
                    if let Some(path) = entry["path_display"].as_str() {
                        let client_modified = entry["client_modified"].as_str().unwrap_or("").to_string();
                        files.push(CloudFile {
                            path: path.to_string(),
                            client_modified,
                        });
                    }
                }
            }
        }
        Ok(files)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Dropbox List Error: {}", err))
    }
}

pub async fn download_file(token: &str, path: &str) -> Result<Vec<u8>, String> {
    let client = Client::new();
    let arg = serde_json::json!({ "path": path }).to_string();

    let res = client.post("https://content.dropboxapi.com/2/files/download")
        .header("Authorization", format!("Bearer {}", token))
        .header("Dropbox-API-Arg", arg)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Dropbox Download Error: {}", err))
    }
}


