use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const THEMES: &[(&str, &str)] = &[
    (
        "apollo-notype.json",
        include_str!("../../src/assets/themes/apollo-notype.json"),
    ),
    (
        "apollo.json",
        include_str!("../../src/assets/themes/apollo.json"),
    ),
    (
        "blade.json",
        include_str!("../../src/assets/themes/blade.json"),
    ),
    (
        "chalkboard-ligatures.json",
        include_str!("../../src/assets/themes/chalkboard-ligatures.json"),
    ),
    (
        "chalkboard-notype.json",
        include_str!("../../src/assets/themes/chalkboard-notype.json"),
    ),
    (
        "chalkboard.json",
        include_str!("../../src/assets/themes/chalkboard.json"),
    ),
    (
        "cyborg-focus.json",
        include_str!("../../src/assets/themes/cyborg-focus.json"),
    ),
    (
        "cyborg.json",
        include_str!("../../src/assets/themes/cyborg.json"),
    ),
    (
        "interstellar.json",
        include_str!("../../src/assets/themes/interstellar.json"),
    ),
    (
        "matrix.json",
        include_str!("../../src/assets/themes/matrix.json"),
    ),
    (
        "navy-disrupted.json",
        include_str!("../../src/assets/themes/navy-disrupted.json"),
    ),
    (
        "navy-notype.json",
        include_str!("../../src/assets/themes/navy-notype.json"),
    ),
    (
        "navy.json",
        include_str!("../../src/assets/themes/navy.json"),
    ),
    (
        "nord.json",
        include_str!("../../src/assets/themes/nord.json"),
    ),
    ("red.json", include_str!("../../src/assets/themes/red.json")),
    (
        "tron-colorfilter.json",
        include_str!("../../src/assets/themes/tron-colorfilter.json"),
    ),
    (
        "tron-disrupted.json",
        include_str!("../../src/assets/themes/tron-disrupted.json"),
    ),
    (
        "tron-fulltype.json",
        include_str!("../../src/assets/themes/tron-fulltype.json"),
    ),
    (
        "tron-notype.json",
        include_str!("../../src/assets/themes/tron-notype.json"),
    ),
    (
        "tron-typeleft.json",
        include_str!("../../src/assets/themes/tron-typeleft.json"),
    ),
    (
        "tron.json",
        include_str!("../../src/assets/themes/tron.json"),
    ),
];

const KEYBOARD_LAYOUTS: &[(&str, &str)] = &[
    (
        "da-DK.json",
        include_str!("../../src/assets/kb_layouts/da-DK.json"),
    ),
    (
        "de-DE.json",
        include_str!("../../src/assets/kb_layouts/de-DE.json"),
    ),
    (
        "en-COLEMAK.json",
        include_str!("../../src/assets/kb_layouts/en-COLEMAK.json"),
    ),
    (
        "en-DVORAK.json",
        include_str!("../../src/assets/kb_layouts/en-DVORAK.json"),
    ),
    (
        "en-GB.json",
        include_str!("../../src/assets/kb_layouts/en-GB.json"),
    ),
    (
        "en-NORMAN.json",
        include_str!("../../src/assets/kb_layouts/en-NORMAN.json"),
    ),
    (
        "en-US.json",
        include_str!("../../src/assets/kb_layouts/en-US.json"),
    ),
    (
        "en-WORKMAN.json",
        include_str!("../../src/assets/kb_layouts/en-WORKMAN.json"),
    ),
    (
        "es-ES.json",
        include_str!("../../src/assets/kb_layouts/es-ES.json"),
    ),
    (
        "es-LAT.json",
        include_str!("../../src/assets/kb_layouts/es-LAT.json"),
    ),
    (
        "fr-BEPO.json",
        include_str!("../../src/assets/kb_layouts/fr-BEPO.json"),
    ),
    (
        "fr-FR.json",
        include_str!("../../src/assets/kb_layouts/fr-FR.json"),
    ),
    (
        "hu-HU.json",
        include_str!("../../src/assets/kb_layouts/hu-HU.json"),
    ),
    (
        "it-IT.json",
        include_str!("../../src/assets/kb_layouts/it-IT.json"),
    ),
    (
        "nl-BE.json",
        include_str!("../../src/assets/kb_layouts/nl-BE.json"),
    ),
    (
        "pt-BR.json",
        include_str!("../../src/assets/kb_layouts/pt-BR.json"),
    ),
    (
        "sv-SE.json",
        include_str!("../../src/assets/kb_layouts/sv-SE.json"),
    ),
    (
        "tr-TR-F.json",
        include_str!("../../src/assets/kb_layouts/tr-TR-F.json"),
    ),
    (
        "tr-TR-Q.json",
        include_str!("../../src/assets/kb_layouts/tr-TR-Q.json"),
    ),
];
const FONT_UNITED_SANS_MEDIUM: &[u8] =
    include_bytes!("../../src/assets/fonts/united_sans_medium.woff2");
const FONT_UNITED_SANS_LIGHT: &[u8] =
    include_bytes!("../../src/assets/fonts/united_sans_light.woff2");
const FONT_FIRA_MONO: &[u8] = include_bytes!("../../src/assets/fonts/fira_mono.woff2");
const FONT_FIRA_CODE: &[u8] = include_bytes!("../../src/assets/fonts/fira_code.woff2");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EdexPaths {
    settings_dir: String,
    themes_dir: String,
    keyboards_dir: String,
    fonts_dir: String,
    settings_file: String,
    shortcuts_file: String,
    last_window_state_file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapConfig {
    paths: EdexPaths,
    settings: Value,
    shortcuts: Value,
    last_window_state: Value,
}

fn default_settings(config_dir: &Path) -> Value {
    json!({
        "shell": if cfg!(target_os = "windows") { "powershell.exe" } else { "bash" },
        "shellArgs": "",
        "cwd": config_dir,
        "keyboard": "en-US",
        "theme": "tron",
        "termFontSize": 15,
        "audio": true,
        "audioVolume": 1.0,
        "disableFeedbackAudio": false,
        "clockHours": 24,
        "pingAddr": "1.1.1.1",
        "port": 3000,
        "nointro": false,
        "nocursor": false,
        "forceFullscreen": true,
        "allowWindowed": false,
        "excludeThreadsFromToplist": true,
        "hideDotfiles": false,
        "fsListView": false,
        "experimentalGlobeFeatures": false,
        "experimentalFeatures": false
    })
}

fn default_shortcuts() -> Value {
    json!([
        { "type": "app", "trigger": "Ctrl+Shift+C", "action": "COPY", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+V", "action": "PASTE", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Tab", "action": "NEXT_TAB", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+Tab", "action": "PREVIOUS_TAB", "enabled": true },
        { "type": "app", "trigger": "Ctrl+X", "action": "TAB_X", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+S", "action": "SETTINGS", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+K", "action": "SHORTCUTS", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+F", "action": "FUZZY_SEARCH", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+L", "action": "FS_LIST_VIEW", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+H", "action": "FS_DOTFILES", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+P", "action": "KB_PASSMODE", "enabled": true },
        { "type": "app", "trigger": "Ctrl+Shift+I", "action": "DEV_DEBUG", "enabled": false },
        { "type": "app", "trigger": "Ctrl+Shift+F5", "action": "DEV_RELOAD", "enabled": true },
        { "type": "shell", "trigger": "Ctrl+Shift+Alt+Space", "action": "neofetch", "linebreak": true, "enabled": false }
    ])
}

fn default_last_window_state() -> Value {
    json!({
        "useFullscreen": true
    })
}

fn write_json_if_missing(path: &Path, value: &Value) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    let content = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn write_str_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    fs::write(path, content).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn write_bytes_if_missing(path: &Path, content: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    fs::write(path, content).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|err| format!("failed to parse {}: {err}", path.display()))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("failed to resolve app config directory: {err}"))
}

fn ensure_default_config(app: &AppHandle) -> Result<BootstrapConfig, String> {
    let settings_dir = config_dir(app)?;
    let themes_dir = settings_dir.join("themes");
    let keyboards_dir = settings_dir.join("keyboards");
    let fonts_dir = settings_dir.join("fonts");
    let settings_file = settings_dir.join("settings.json");
    let shortcuts_file = settings_dir.join("shortcuts.json");
    let last_window_state_file = settings_dir.join("lastWindowState.json");

    fs::create_dir_all(&themes_dir)
        .map_err(|err| format!("failed to create {}: {err}", themes_dir.display()))?;
    fs::create_dir_all(&keyboards_dir)
        .map_err(|err| format!("failed to create {}: {err}", keyboards_dir.display()))?;
    fs::create_dir_all(&fonts_dir)
        .map_err(|err| format!("failed to create {}: {err}", fonts_dir.display()))?;

    write_json_if_missing(&settings_file, &default_settings(&settings_dir))?;
    write_json_if_missing(&shortcuts_file, &default_shortcuts())?;
    write_json_if_missing(&last_window_state_file, &default_last_window_state())?;

    for (file_name, content) in THEMES {
        write_str_if_missing(&themes_dir.join(file_name), content)?;
    }
    for (file_name, content) in KEYBOARD_LAYOUTS {
        write_str_if_missing(&keyboards_dir.join(file_name), content)?;
    }
    write_bytes_if_missing(
        &fonts_dir.join("united_sans_medium.woff2"),
        FONT_UNITED_SANS_MEDIUM,
    )?;
    write_bytes_if_missing(
        &fonts_dir.join("united_sans_light.woff2"),
        FONT_UNITED_SANS_LIGHT,
    )?;
    write_bytes_if_missing(&fonts_dir.join("fira_mono.woff2"), FONT_FIRA_MONO)?;
    write_bytes_if_missing(&fonts_dir.join("fira_code.woff2"), FONT_FIRA_CODE)?;

    Ok(BootstrapConfig {
        paths: EdexPaths {
            settings_dir: path_to_string(&settings_dir),
            themes_dir: path_to_string(&themes_dir),
            keyboards_dir: path_to_string(&keyboards_dir),
            fonts_dir: path_to_string(&fonts_dir),
            settings_file: path_to_string(&settings_file),
            shortcuts_file: path_to_string(&shortcuts_file),
            last_window_state_file: path_to_string(&last_window_state_file),
        },
        settings: read_json(&settings_file)?,
        shortcuts: read_json(&shortcuts_file)?,
        last_window_state: read_json(&last_window_state_file)?,
    })
}

#[tauri::command]
fn get_bootstrap_config(app: AppHandle) -> Result<BootstrapConfig, String> {
    ensure_default_config(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            ensure_default_config(app.handle()).map_err(|err| {
                Box::<dyn std::error::Error>::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    err,
                ))
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_bootstrap_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
