fn main() {
    // Attempt to load .env file from the workspace root
    let env_path = std::path::Path::new("..").join(".env");
    
    // Tell Cargo to recompile if .env changes
    println!("cargo:rerun-if-changed=../.env");

    if let Ok(iter) = dotenvy::from_path_iter(&env_path) {
        for (key, val) in iter.flatten() {
            // Pass the variable to the rustc compiler for option_env! to work
            println!("cargo:rustc-env={}={}", key, val);
        }
    }

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        println!("cargo:rustc-link-lib=msvcprt");
    }

    tauri_build::build()
}
