use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkstationInfo {
    pub workstation_name: String,
    pub hardware_id: String,
    pub os_info: String,
}

#[tauri::command]
fn get_workstation_info() -> Result<WorkstationInfo, String> {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "ZEC-WORKSTATION-1".to_string());

    let user = std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string());
    let hardware_id = format!("HW-{}-{}", hostname, user);

    Ok(WorkstationInfo {
        workstation_name: hostname,
        hardware_id,
        os_info: std::env::consts::OS.to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_workstation_info])
        .run(tauri::generate_context!())
        .expect("error while running ZEC Portal Tauri application");
}
