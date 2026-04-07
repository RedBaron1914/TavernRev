use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Securely loaded at compile time
pub const GDRIVE_CLIENT_ID: &str = match option_env!("TAVERNREV_GDRIVE_ID") {
    Some(val) => val,
    None => "MISSING_KEY",
};
pub const GDRIVE_CLIENT_SECRET: &str = match option_env!("TAVERNREV_GDRIVE_SECRET") {
    Some(val) => val,
    None => "",
};
pub const REDIRECT_URI: &str = "http://localhost:1234";

#[derive(Debug, Serialize, Deserialize)]
pub struct GDriveTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GDriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "modifiedTime")]
    pub modified_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GDriveFileList {
    files: Vec<GDriveFile>,
}

pub fn build_auth_url(challenge: &str) -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256",
        GDRIVE_CLIENT_ID,
        REDIRECT_URI,
        challenge
    )
}

pub async fn exchange_code_for_token(code: &str, verifier: &str) -> Result<GDriveTokenResponse, String> {
    let client = Client::new();
    let mut params = HashMap::new();
    params.insert("code", code);
    params.insert("grant_type", "authorization_code");
    params.insert("client_id", GDRIVE_CLIENT_ID);
    params.insert("client_secret", GDRIVE_CLIENT_SECRET);
    params.insert("code_verifier", verifier);
    params.insert("redirect_uri", REDIRECT_URI);

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let token_data: GDriveTokenResponse = res.json().await.map_err(|e| e.to_string())?;
        Ok(token_data)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("GDrive Auth Error: {}", err))
    }
}

pub async fn refresh_access_token(refresh_token: &str) -> Result<GDriveTokenResponse, String> {
    let client = Client::new();
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("refresh_token", refresh_token);
    params.insert("client_id", GDRIVE_CLIENT_ID);
    params.insert("client_secret", GDRIVE_CLIENT_SECRET);

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let token_data: GDriveTokenResponse = res.json().await.map_err(|e| e.to_string())?;
        Ok(token_data)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("GDrive Refresh Error: {}", err))
    }
}

// Search for a file/folder by name and parent
pub async fn find_file_id(token: &str, name: &str, parent_id: Option<&str>, is_folder: bool) -> Result<Option<GDriveFile>, String> {
    let client = Client::new();
    
    let mime_query = if is_folder { "mimeType = 'application/vnd.google-apps.folder'" } else { "mimeType != 'application/vnd.google-apps.folder'" };
    let parent_query = if let Some(pid) = parent_id { format!(" and '{}' in parents", pid) } else { " and 'root' in parents".to_string() };
    
    let query = format!("name = '{}' and {} and trashed = false{}", name, mime_query, parent_query);

    let res = client.get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("q", query.as_str()), ("fields", "files(id, name, modifiedTime)")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let list: GDriveFileList = res.json().await.map_err(|e| e.to_string())?;
        Ok(list.files.into_iter().next())
    } else {
        Err(format!("GDrive Find Error: {}", res.text().await.unwrap_or_default()))
    }
}

pub async fn get_or_create_folder(token: &str, name: &str, parent_id: Option<&str>) -> Result<String, String> {
    if let Ok(Some(folder)) = find_file_id(token, name, parent_id, true).await {
        return Ok(folder.id);
    }

    // Create folder
    let client = Client::new();
    let mut body = serde_json::json!({
        "name": name,
        "mimeType": "application/vnd.google-apps.folder"
    });
    
    if let Some(pid) = parent_id {
        body["parents"] = serde_json::json!([pid]);
    }

    let res = client.post("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let file: GDriveFile = res.json().await.map_err(|e| e.to_string())?;
        Ok(file.id)
    } else {
        Err(format!("GDrive Create Folder Error: {}", res.text().await.unwrap_or_default()))
    }
}

pub async fn list_folder(token: &str, folder_id: &str) -> Result<Vec<GDriveFile>, String> {
    let client = Client::new();
    let query = format!("'{}' in parents and trashed = false", folder_id);

    let res = client.get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("q", query.as_str()), ("fields", "files(id, name, modifiedTime)"), ("pageSize", "1000")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let list: GDriveFileList = res.json().await.map_err(|e| e.to_string())?;
        Ok(list.files)
    } else {
        Err(format!("GDrive List Error: {}", res.text().await.unwrap_or_default()))
    }
}

pub async fn upload_file(token: &str, name: &str, parent_id: &str, content: Vec<u8>, existing_file_id: Option<&str>) -> Result<(), String> {
    let client = Client::new();
    
    let url = if let Some(fid) = existing_file_id {
        format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media", fid)
    } else {
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart".to_string()
    };

    if existing_file_id.is_some() {
        // Simple media update
        let res = client.patch(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/octet-stream")
            .body(content)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() { return Ok(()); }
        Err(format!("GDrive Update Error: {}", res.text().await.unwrap_or_default()))
    } else {
        // Multipart creation (metadata + content)
        let metadata = serde_json::json!({
            "name": name,
            "parents": [parent_id]
        });
        
        let boundary = "foo_bar_baz";
        let mut body_payload = Vec::new();
        
        body_payload.extend_from_slice(format!("--{}
Content-Type: application/json; charset=UTF-8

", boundary).as_bytes());
        body_payload.extend_from_slice(metadata.to_string().as_bytes());
        body_payload.extend_from_slice(format!("
--{}
Content-Type: application/octet-stream

", boundary).as_bytes());
        body_payload.extend_from_slice(&content);
        body_payload.extend_from_slice(format!("
--{}--
", boundary).as_bytes());

        let res = client.post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", format!("multipart/related; boundary={}", boundary))
            .body(body_payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() { return Ok(()); }
        Err(format!("GDrive Upload Error: {}", res.text().await.unwrap_or_default()))
    }
}

pub async fn download_file(token: &str, file_id: &str) -> Result<Vec<u8>, String> {
    let client = Client::new();
    let url = format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id);

    let res = client.get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    } else {
        Err(format!("GDrive Download Error: {}", res.text().await.unwrap_or_default()))
    }
}
