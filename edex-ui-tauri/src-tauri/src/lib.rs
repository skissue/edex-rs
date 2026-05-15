use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size, State};

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
    version_history_file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapConfig {
    paths: EdexPaths,
    settings: Value,
    shortcuts: Value,
    last_window_state: Value,
    version_history: Value,
    flags: BootFlags,
    metadata: AppMetadata,
    terminal_launch: TerminalLaunchConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootFlags {
    nointro_override: bool,
    nocursor_override: bool,
    args: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppMetadata {
    version: String,
    package_name: String,
    product_name: String,
    identifier: String,
    platform: String,
    arch: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalLaunchConfig {
    shell: String,
    shell_args: String,
    cwd: String,
    env: HashMap<String, String>,
    port: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    index: usize,
    name: Option<String>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    scale_factor: f64,
    primary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowStateInfo {
    fullscreen: bool,
    maximized: bool,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    platform: String,
    arch: String,
    is_arch_linux: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowSizeRequest {
    width: f64,
    height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnTerminalRequest {
    settings: Value,
    cols: Option<u16>,
    rows: Option<u16>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalSessionInfo {
    id: u32,
    pid: Option<u32>,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalDataEvent {
    id: u32,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
    id: u32,
    code: u32,
    signal: Option<String>,
}

#[derive(Default)]
struct BackendState {
    theme_override: Mutex<Option<String>>,
    keyboard_override: Mutex<Option<String>>,
}

#[derive(Default)]
struct TerminalManager {
    next_id: AtomicU32,
    sessions: Mutex<HashMap<u32, TerminalSession>>,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
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

fn write_json(path: &Path, value: &Value) -> Result<Value, String> {
    let content = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| format!("failed to write {}: {err}", path.display()))?;
    read_json(path)
}

fn read_json_if_exists(path: &Path, default_value: Value) -> Result<Value, String> {
    if path.exists() {
        read_json(path)
    } else {
        Ok(default_value)
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn app_metadata(_app: &AppHandle) -> AppMetadata {
    AppMetadata {
        version: env!("CARGO_PKG_VERSION").to_string(),
        package_name: env!("CARGO_PKG_NAME").to_string(),
        product_name: "eDEX-UI".to_string(),
        identifier: "com.edex.ui".to_string(),
        platform: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
    }
}

fn boot_flags() -> BootFlags {
    let args = env::args().collect::<Vec<_>>();

    BootFlags {
        nointro_override: args.iter().any(|arg| arg == "--nointro"),
        nocursor_override: args.iter().any(|arg| arg == "--nocursor"),
        args,
    }
}

fn update_version_history(path: &Path, version: &str) -> Result<Value, String> {
    let mut history = read_json_if_exists(path, json!({}))?;
    let now = now_millis();

    if !history.is_object() {
        history = json!({});
    }

    let versions = history
        .as_object_mut()
        .ok_or_else(|| "version history must be a JSON object".to_string())?;

    match versions.get_mut(version) {
        Some(entry) if entry.is_object() => {
            if let Some(entry) = entry.as_object_mut() {
                entry.insert("lastSeen".to_string(), json!(now));
            }
        }
        _ => {
            versions.insert(
                version.to_string(),
                json!({
                    "firstSeen": now,
                    "lastSeen": now
                }),
            );
        }
    }

    write_json(path, &history)
}

fn settings_paths(app: &AppHandle) -> Result<(EdexPaths, PathBuf), String> {
    let settings_dir = config_dir(app)?;
    let themes_dir = settings_dir.join("themes");
    let keyboards_dir = settings_dir.join("keyboards");
    let fonts_dir = settings_dir.join("fonts");
    let settings_file = settings_dir.join("settings.json");
    let shortcuts_file = settings_dir.join("shortcuts.json");
    let last_window_state_file = settings_dir.join("lastWindowState.json");
    let version_history_file = settings_dir.join("versions_log.json");

    Ok((
        EdexPaths {
            settings_dir: path_to_string(&settings_dir),
            themes_dir: path_to_string(&themes_dir),
            keyboards_dir: path_to_string(&keyboards_dir),
            fonts_dir: path_to_string(&fonts_dir),
            settings_file: path_to_string(&settings_file),
            shortcuts_file: path_to_string(&shortcuts_file),
            last_window_state_file: path_to_string(&last_window_state_file),
            version_history_file: path_to_string(&version_history_file),
        },
        settings_dir,
    ))
}

fn json_path(paths: &EdexPaths, name: &str) -> Result<PathBuf, String> {
    match name {
        "settings" => Ok(PathBuf::from(&paths.settings_file)),
        "shortcuts" => Ok(PathBuf::from(&paths.shortcuts_file)),
        "last_window_state" => Ok(PathBuf::from(&paths.last_window_state_file)),
        "version_history" => Ok(PathBuf::from(&paths.version_history_file)),
        other => Err(format!("unknown JSON path key: {other}")),
    }
}

fn list_json_files(dir: &Path) -> Result<Vec<String>, String> {
    let mut files = fs::read_dir(dir)
        .map_err(|err| format!("failed to read {}: {err}", dir.display()))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_string_lossy() != "json" {
                return None;
            }
            Some(path.file_stem()?.to_string_lossy().into_owned())
        })
        .collect::<Vec<_>>();

    files.sort();
    Ok(files)
}

fn named_json_from_dir(dir: &Path, name: &str) -> Result<Value, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("invalid file name".to_string());
    }

    read_json(&dir.join(format!("{name}.json")))
}

fn path_is_executable(path: &Path) -> bool {
    path.is_file()
}

fn resolve_shell(shell: &str) -> Result<String, String> {
    let shell_path = Path::new(shell);
    let has_separator = shell.contains('/') || shell.contains('\\');

    if shell_path.is_absolute() || has_separator {
        if path_is_executable(shell_path) {
            return Ok(path_to_string(shell_path));
        }
        return Err(format!("configured shell does not exist: {shell}"));
    }

    let path_var = env::var_os("PATH").ok_or_else(|| "PATH is not set".to_string())?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(shell);
        if path_is_executable(&candidate) {
            return Ok(path_to_string(&candidate));
        }

        #[cfg(windows)]
        {
            let candidate = dir.join(format!("{shell}.exe"));
            if path_is_executable(&candidate) {
                return Ok(path_to_string(&candidate));
            }
        }
    }

    Err(format!("could not resolve shell on PATH: {shell}"))
}

fn env_overrides_from_settings(settings: &Value) -> HashMap<String, String> {
    let mut overrides = HashMap::new();

    if let Some(env_value) = settings.get("env") {
        if let Some(object) = env_value.as_object() {
            for (key, value) in object {
                if let Some(value) = value.as_str() {
                    overrides.insert(key.clone(), value.to_string());
                }
            }
        }
    }

    overrides
}

fn prepare_terminal_launch(
    settings: &Value,
    metadata: &AppMetadata,
) -> Result<TerminalLaunchConfig, String> {
    let shell =
        settings
            .get("shell")
            .and_then(Value::as_str)
            .unwrap_or(if cfg!(target_os = "windows") {
                "powershell.exe"
            } else {
                "bash"
            });
    let resolved_shell = resolve_shell(shell)?;

    let cwd = settings
        .get("cwd")
        .and_then(Value::as_str)
        .ok_or_else(|| "settings.cwd must be a string".to_string())?;
    if !Path::new(cwd).exists() {
        return Err(format!("configured cwd path does not exist: {cwd}"));
    }

    let mut env_vars = env::vars().collect::<HashMap<_, _>>();
    env_vars.remove("http_proxy");
    env_vars.remove("https_proxy");
    env_vars.insert("TERM".to_string(), "xterm-256color".to_string());
    env_vars.insert("COLORTERM".to_string(), "truecolor".to_string());
    env_vars.insert("TERM_PROGRAM".to_string(), "eDEX-UI".to_string());
    env_vars.insert("TERM_PROGRAM_VERSION".to_string(), metadata.version.clone());
    env_vars.extend(env_overrides_from_settings(settings));

    let port = settings
        .get("port")
        .and_then(Value::as_u64)
        .unwrap_or(3000)
        .try_into()
        .map_err(|_| "settings.port must fit in u16".to_string())?;

    Ok(TerminalLaunchConfig {
        shell: resolved_shell,
        shell_args: settings
            .get("shellArgs")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        cwd: cwd.to_string(),
        env: env_vars,
        port,
    })
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
    let metadata = app_metadata(app);
    let flags = boot_flags();
    let (paths, settings_dir) = settings_paths(app)?;
    let themes_dir = PathBuf::from(&paths.themes_dir);
    let keyboards_dir = PathBuf::from(&paths.keyboards_dir);
    let fonts_dir = PathBuf::from(&paths.fonts_dir);
    let settings_file = PathBuf::from(&paths.settings_file);
    let shortcuts_file = PathBuf::from(&paths.shortcuts_file);
    let last_window_state_file = PathBuf::from(&paths.last_window_state_file);
    let version_history_file = PathBuf::from(&paths.version_history_file);

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

    let settings = read_json(&settings_file)?;
    let version_history = update_version_history(&version_history_file, &metadata.version)?;
    let terminal_launch = prepare_terminal_launch(&settings, &metadata)?;

    Ok(BootstrapConfig {
        paths,
        settings,
        shortcuts: read_json(&shortcuts_file)?,
        last_window_state: read_json(&last_window_state_file)?,
        version_history,
        flags,
        metadata,
        terminal_launch,
    })
}

#[tauri::command]
fn get_bootstrap_config(app: AppHandle) -> Result<BootstrapConfig, String> {
    ensure_default_config(&app)
}

#[tauri::command]
fn get_app_metadata(app: AppHandle) -> AppMetadata {
    app_metadata(&app)
}

#[tauri::command]
fn get_boot_flags() -> BootFlags {
    boot_flags()
}

#[tauri::command]
fn log_message(level: String, content: String) {
    match level.as_str() {
        "error" | "fatal" => eprintln!("[{level}] {content}"),
        "warn" | "warning" => eprintln!("[warn] {content}"),
        "debug" => println!("[debug] {content}"),
        "info" | "note" | "success" | "pending" | "complete" | "watch" | "start" => {
            println!("[{level}] {content}")
        }
        _ => println!("[log] {content}"),
    }
}

#[tauri::command]
fn list_themes(app: AppHandle) -> Result<Vec<String>, String> {
    let (paths, _) = settings_paths(&app)?;
    list_json_files(Path::new(&paths.themes_dir))
}

#[tauri::command]
fn list_keyboard_layouts(app: AppHandle) -> Result<Vec<String>, String> {
    let (paths, _) = settings_paths(&app)?;
    list_json_files(Path::new(&paths.keyboards_dir))
}

#[tauri::command]
fn read_theme(app: AppHandle, name: String) -> Result<Value, String> {
    let (paths, _) = settings_paths(&app)?;
    named_json_from_dir(Path::new(&paths.themes_dir), &name)
}

#[tauri::command]
fn read_keyboard_layout(app: AppHandle, name: String) -> Result<Value, String> {
    let (paths, _) = settings_paths(&app)?;
    named_json_from_dir(Path::new(&paths.keyboards_dir), &name)
}

#[tauri::command]
fn write_settings(app: AppHandle, settings: Value) -> Result<BootstrapConfig, String> {
    let (paths, _) = settings_paths(&app)?;
    write_json(&json_path(&paths, "settings")?, &settings)?;
    ensure_default_config(&app)
}

#[tauri::command]
fn write_last_window_state(app: AppHandle, last_window_state: Value) -> Result<Value, String> {
    let (paths, _) = settings_paths(&app)?;
    write_json(&json_path(&paths, "last_window_state")?, &last_window_state)
}

#[tauri::command]
fn get_theme_override(state: State<'_, BackendState>) -> Result<Option<String>, String> {
    state
        .theme_override
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "theme override state is poisoned".to_string())
}

#[tauri::command]
fn set_theme_override(state: State<'_, BackendState>, theme: Option<String>) -> Result<(), String> {
    *state
        .theme_override
        .lock()
        .map_err(|_| "theme override state is poisoned".to_string())? = theme;
    Ok(())
}

#[tauri::command]
fn get_keyboard_override(state: State<'_, BackendState>) -> Result<Option<String>, String> {
    state
        .keyboard_override
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "keyboard override state is poisoned".to_string())
}

#[tauri::command]
fn set_keyboard_override(
    state: State<'_, BackendState>,
    layout: Option<String>,
) -> Result<(), String> {
    *state
        .keyboard_override
        .lock()
        .map_err(|_| "keyboard override state is poisoned".to_string())? = layout;
    Ok(())
}

#[tauri::command]
fn prepare_terminal_environment(
    app: AppHandle,
    settings: Value,
) -> Result<TerminalLaunchConfig, String> {
    let metadata = app_metadata(&app);
    prepare_terminal_launch(&settings, &metadata)
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn monitor_to_info(index: usize, monitor: &tauri::window::Monitor, primary: bool) -> MonitorInfo {
    let size = monitor.size();
    let position = monitor.position();
    let work_area = monitor.work_area();

    MonitorInfo {
        index,
        name: monitor.name().cloned(),
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        work_x: work_area.position.x,
        work_y: work_area.position.y,
        work_width: work_area.size.width,
        work_height: work_area.size.height,
        scale_factor: monitor.scale_factor(),
        primary,
    }
}

#[tauri::command]
fn get_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|err| format!("failed to list monitors: {err}"))?;
    let primary = app
        .primary_monitor()
        .map_err(|err| format!("failed to get primary monitor: {err}"))?;

    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let is_primary = primary.as_ref().is_some_and(|primary| {
                primary.name() == monitor.name() && primary.position() == monitor.position()
            });
            monitor_to_info(index, monitor, is_primary)
        })
        .collect())
}

#[tauri::command]
fn get_window_state(app: AppHandle) -> Result<WindowStateInfo, String> {
    let window = main_window(&app)?;
    let size = window
        .inner_size()
        .map_err(|err| format!("failed to get window size: {err}"))?;

    Ok(WindowStateInfo {
        fullscreen: window
            .is_fullscreen()
            .map_err(|err| format!("failed to get fullscreen state: {err}"))?,
        maximized: window
            .is_maximized()
            .map_err(|err| format!("failed to get maximized state: {err}"))?,
        width: size.width,
        height: size.height,
    })
}

#[tauri::command]
fn focus_main_window(app: AppHandle) -> Result<(), String> {
    main_window(&app)?
        .set_focus()
        .map_err(|err| format!("failed to focus window: {err}"))
}

#[tauri::command]
fn set_fullscreen(app: AppHandle, fullscreen: bool) -> Result<WindowStateInfo, String> {
    main_window(&app)?
        .set_fullscreen(fullscreen)
        .map_err(|err| format!("failed to set fullscreen: {err}"))?;
    get_window_state(app)
}

#[tauri::command]
fn toggle_fullscreen(app: AppHandle) -> Result<WindowStateInfo, String> {
    let window = main_window(&app)?;
    let fullscreen = window
        .is_fullscreen()
        .map_err(|err| format!("failed to get fullscreen state: {err}"))?;
    window
        .set_fullscreen(!fullscreen)
        .map_err(|err| format!("failed to toggle fullscreen: {err}"))?;
    get_window_state(app)
}

#[tauri::command]
fn set_window_size(app: AppHandle, size: WindowSizeRequest) -> Result<WindowStateInfo, String> {
    main_window(&app)?
        .set_size(Size::Logical(LogicalSize::new(size.width, size.height)))
        .map_err(|err| format!("failed to resize window: {err}"))?;
    get_window_state(app)
}

#[tauri::command]
fn apply_window_settings(app: AppHandle, settings: Value) -> Result<WindowStateInfo, String> {
    let force_fullscreen = settings
        .get("forceFullscreen")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let allow_windowed = settings
        .get("allowWindowed")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let window = main_window(&app)?;
    window
        .show()
        .map_err(|err| format!("failed to show window: {err}"))?;

    if force_fullscreen || !allow_windowed {
        window
            .set_fullscreen(true)
            .map_err(|err| format!("failed to apply fullscreen setting: {err}"))?;
    }

    get_window_state(app)
}

#[tauri::command]
fn open_devtools(_app: AppHandle) -> Result<(), String> {
    Err("opening devtools requires the Tauri devtools feature; command is registered but disabled in this build".to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle, exit_code: Option<i32>) {
    app.exit(exit_code.unwrap_or(0));
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default();
    PlatformInfo {
        platform: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        is_arch_linux: cfg!(target_os = "linux") && os_release.to_lowercase().contains("arch"),
    }
}

#[tauri::command]
fn system_information_call(method: String, args: Vec<Value>) -> Result<Value, String> {
    Err(format!(
        "system information method '{method}' is not implemented in the Rust backend yet ({} args)",
        args.len()
    ))
}

#[tauri::command]
fn spawn_terminal(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    request: SpawnTerminalRequest,
) -> Result<TerminalSessionInfo, String> {
    let metadata = app_metadata(&app);
    let launch = prepare_terminal_launch(&request.settings, &metadata)?;
    let cols = request.cols.unwrap_or(80).max(1);
    let rows = request.rows.unwrap_or(24).max(1);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("failed to open PTY: {err}"))?;

    let mut command = CommandBuilder::new(&launch.shell);
    command.env_clear();
    for (key, value) in &launch.env {
        command.env(key, value);
    }
    command.cwd(&launch.cwd);

    for arg in terminal_shell_args(&launch)? {
        command.arg(arg);
    }

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| format!("failed to spawn terminal shell: {err}"))?;
    let pid = child.process_id();
    let killer = child.clone_killer();
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| format!("failed to open PTY reader: {err}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| format!("failed to open PTY writer: {err}"))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let session = TerminalSession {
        master: pair.master,
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
    };
    state
        .sessions
        .lock()
        .map_err(|_| "terminal session state is poisoned".to_string())?
        .insert(id, session);

    let read_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(len) => {
                    let data = String::from_utf8_lossy(&buffer[..len]).to_string();
                    let _ = read_app.emit("terminal:data", TerminalDataEvent { id, data });
                }
                Err(err) => {
                    eprintln!("[terminal] failed to read PTY session {id}: {err}");
                    break;
                }
            }
        }
    });

    let wait_app = app.clone();
    thread::spawn(move || match child.wait() {
        Ok(status) => {
            wait_app
                .state::<TerminalManager>()
                .sessions
                .lock()
                .map(|mut sessions| sessions.remove(&id))
                .ok();
            let _ = wait_app.emit(
                "terminal:exit",
                TerminalExitEvent {
                    id,
                    code: status.exit_code(),
                    signal: status.signal().map(ToString::to_string),
                },
            );
        }
        Err(err) => {
            eprintln!("[terminal] failed waiting for PTY session {id}: {err}");
            wait_app
                .state::<TerminalManager>()
                .sessions
                .lock()
                .map(|mut sessions| sessions.remove(&id))
                .ok();
        }
    });

    Ok(TerminalSessionInfo {
        id,
        pid,
        shell: launch.shell,
        cwd: launch.cwd,
        cols,
        rows,
    })
}

#[tauri::command]
fn write_terminal(state: State<'_, TerminalManager>, id: u32, data: String) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "terminal session state is poisoned".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("terminal session {id} does not exist"))?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| format!("terminal session {id} writer is poisoned"))?;
    writer
        .write_all(data.as_bytes())
        .map_err(|err| format!("failed to write to terminal session {id}: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("failed to flush terminal session {id}: {err}"))
}

#[tauri::command]
fn resize_terminal(
    state: State<'_, TerminalManager>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "terminal session state is poisoned".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("terminal session {id} does not exist"))?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("failed to resize terminal session {id}: {err}"))
}

#[tauri::command]
fn kill_terminal(state: State<'_, TerminalManager>, id: u32) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "terminal session state is poisoned".to_string())?
        .remove(&id)
        .ok_or_else(|| format!("terminal session {id} does not exist"))?;
    let result = session
        .killer
        .lock()
        .map_err(|_| format!("terminal session {id} killer is poisoned"))?
        .kill()
        .map_err(|err| format!("failed to kill terminal session {id}: {err}"));
    result
}

fn terminal_shell_args(launch: &TerminalLaunchConfig) -> Result<Vec<String>, String> {
    if !launch.shell_args.trim().is_empty() {
        return shell_words::split(&launch.shell_args)
            .map_err(|err| format!("failed to parse shellArgs: {err}"));
    }

    if cfg!(target_os = "windows") {
        Ok(Vec::new())
    } else {
        Ok(vec!["--login".to_string()])
    }
}

fn apply_startup_window_settings(
    app: &AppHandle,
    bootstrap: &BootstrapConfig,
) -> Result<(), String> {
    let window = main_window(app)?;
    let allow_windowed = bootstrap
        .settings
        .get("allowWindowed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let force_fullscreen = bootstrap
        .settings
        .get("forceFullscreen")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let last_use_fullscreen = bootstrap
        .last_window_state
        .get("useFullscreen")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    window
        .set_resizable(allow_windowed)
        .map_err(|err| format!("failed to apply resizable setting: {err}"))?;
    window
        .set_decorations(allow_windowed)
        .map_err(|err| format!("failed to apply window frame setting: {err}"))?;
    window
        .set_fullscreen(force_fullscreen || last_use_fullscreen)
        .map_err(|err| format!("failed to apply fullscreen setting: {err}"))?;
    window
        .show()
        .map_err(|err| format!("failed to show window: {err}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .manage(TerminalManager::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let bootstrap = ensure_default_config(app.handle()).map_err(|err| {
                Box::<dyn std::error::Error>::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    err,
                ))
            })?;
            apply_startup_window_settings(app.handle(), &bootstrap).map_err(|err| {
                Box::<dyn std::error::Error>::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    err,
                ))
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_config,
            get_app_metadata,
            get_boot_flags,
            log_message,
            list_themes,
            list_keyboard_layouts,
            read_theme,
            read_keyboard_layout,
            write_settings,
            write_last_window_state,
            get_theme_override,
            set_theme_override,
            get_keyboard_override,
            set_keyboard_override,
            prepare_terminal_environment,
            get_monitors,
            get_window_state,
            focus_main_window,
            set_fullscreen,
            toggle_fullscreen,
            set_window_size,
            apply_window_settings,
            open_devtools,
            quit_app,
            restart_app,
            get_platform_info,
            system_information_call,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
