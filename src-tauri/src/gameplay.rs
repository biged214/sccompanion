use chrono::{DateTime, Utc};
use regex::Regex;
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map};
use std::{
    collections::VecDeque,
    env,
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_EVENT_LINE: usize = 4_000;
const DEFAULT_EVENT_LIMIT: u32 = 100;

#[derive(Clone)]
pub struct GameplayState {
    db_path: PathBuf,
    runtime: Arc<Mutex<TrackerRuntime>>,
}

#[derive(Default)]
struct TrackerRuntime {
    log_path: Option<PathBuf>,
    current_session_id: Option<i64>,
    monitoring: bool,
    indexing: bool,
    indexed_sessions: u64,
    queued_backups: usize,
    last_event_at: Option<String>,
    last_error: Option<String>,
    rescan_requested: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStatus {
    available: bool,
    monitoring: bool,
    indexing: bool,
    log_path: Option<String>,
    channel: Option<String>,
    current_session_id: Option<i64>,
    indexed_sessions: u64,
    queued_backups: usize,
    last_event_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameplaySnapshot {
    fetched_at: String,
    status: TrackerStatus,
    summary: GameplaySummary,
    category_counts: Vec<CategoryCount>,
    sessions: Vec<GameSession>,
    events: Vec<GameEvent>,
    total_matching_events: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameplaySummary {
    total_sessions: u64,
    total_events: u64,
    gameplay_events: u64,
    credits_earned: f64,
    credits_spent: f64,
    missions_completed: u64,
    purchases: u64,
    cargo_actions: u64,
    locations_visited: u64,
    disconnects: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    category: String,
    count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    id: i64,
    channel: String,
    build: Option<String>,
    started_at: String,
    ended_at: Option<String>,
    event_count: u64,
    source_name: String,
    imported: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameEvent {
    id: i64,
    session_id: i64,
    occurred_at: String,
    severity: String,
    category: String,
    event_type: String,
    title: String,
    summary: String,
    details: serde_json::Value,
    raw_sanitized: String,
    amount: Option<f64>,
    quantity: Option<f64>,
    location: Option<String>,
    item: Option<String>,
    mission_id: Option<String>,
    objective_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrilldownGroup {
    key: String,
    label: String,
    context: Option<String>,
    count: u64,
    amount: f64,
    last_seen: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameplayDrilldown {
    metric: String,
    title: String,
    description: String,
    total_records: u64,
    total_amount: f64,
    groups: Vec<DrilldownGroup>,
    events: Vec<GameEvent>,
}

struct ParsedEvent {
    occurred_at: String,
    severity: String,
    category: String,
    event_type: String,
    title: String,
    summary: String,
    details_json: String,
    raw_sanitized: String,
    amount: Option<f64>,
    quantity: Option<f64>,
    location: Option<String>,
    item: Option<String>,
    mission_id: Option<String>,
    objective_id: Option<String>,
    ends_session: bool,
}

pub fn initialize(app: &AppHandle) -> Result<GameplayState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let db_path = data_dir.join("gameplay.sqlite3");
    initialize_database(&db_path)?;
    let configured_path = load_configured_path(&db_path).ok().flatten();
    let state = GameplayState {
        db_path,
        runtime: Arc::new(Mutex::new(TrackerRuntime {
            log_path: configured_path,
            ..TrackerRuntime::default()
        })),
    };
    refresh_runtime_counts(&state);
    start_monitor(app.clone(), state.clone());
    Ok(state)
}

#[tauri::command]
pub async fn get_gameplay_snapshot(
    state: State<'_, GameplayState>,
    session_id: Option<i64>,
    category: Option<String>,
    search: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<GameplaySnapshot, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        query_snapshot(
            &state,
            session_id,
            category.filter(|value| value != "all"),
            search.filter(|value| !value.trim().is_empty()),
            offset.unwrap_or(0),
            limit.unwrap_or(DEFAULT_EVENT_LIMIT).clamp(1, 500),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_gameplay_status(state: State<'_, GameplayState>) -> TrackerStatus {
    tracker_status(&state)
}

#[tauri::command]
pub async fn get_gameplay_drilldown(
    state: State<'_, GameplayState>,
    metric: String,
    session_id: Option<i64>,
    group_key: Option<String>,
    limit: Option<u32>,
) -> Result<GameplayDrilldown, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        query_drilldown(
            &state,
            &metric,
            session_id,
            group_key.as_deref(),
            limit.unwrap_or(DEFAULT_EVENT_LIMIT).clamp(1, 500),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn set_game_log_path(state: State<'_, GameplayState>, path: String) -> Result<(), String> {
    let normalized = normalize_log_path(PathBuf::from(path.trim()))?;
    save_configured_path(&state.db_path, &normalized)?;
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "Tracker state is unavailable.".to_string())?;
    runtime.log_path = Some(normalized);
    runtime.rescan_requested = true;
    runtime.last_error = None;
    Ok(())
}

#[tauri::command]
pub fn auto_detect_game_log(state: State<'_, GameplayState>) -> Result<Option<String>, String> {
    let detected = discover_game_log();
    if let Some(path) = &detected {
        save_configured_path(&state.db_path, path)?;
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "Tracker state is unavailable.".to_string())?;
        runtime.log_path = Some(path.clone());
        runtime.rescan_requested = true;
        runtime.last_error = None;
    }
    Ok(detected.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn rescan_game_logs(state: State<'_, GameplayState>) -> Result<(), String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "Tracker state is unavailable.".to_string())?;
    runtime.rescan_requested = true;
    Ok(())
}

fn initialize_database(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS settings (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS game_sessions (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               source_key TEXT NOT NULL UNIQUE,
               source_path TEXT NOT NULL,
               source_name TEXT NOT NULL,
               channel TEXT NOT NULL,
               build TEXT,
               started_at TEXT NOT NULL,
               ended_at TEXT,
               imported INTEGER NOT NULL DEFAULT 0,
               last_offset INTEGER NOT NULL DEFAULT 0,
               line_count INTEGER NOT NULL DEFAULT 0,
               event_count INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS game_events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
               occurred_at TEXT NOT NULL,
               severity TEXT NOT NULL,
               category TEXT NOT NULL,
               event_type TEXT NOT NULL,
               title TEXT NOT NULL,
               summary TEXT NOT NULL,
               details_json TEXT NOT NULL,
               raw_sanitized TEXT NOT NULL,
               amount REAL,
               quantity REAL,
               location TEXT,
               item TEXT,
               mission_id TEXT,
               objective_id TEXT
             );
             CREATE INDEX IF NOT EXISTS idx_game_events_session_time ON game_events(session_id, occurred_at DESC);
             CREATE INDEX IF NOT EXISTS idx_game_events_category_time ON game_events(category, occurred_at DESC);
             CREATE INDEX IF NOT EXISTS idx_game_events_type ON game_events(event_type);
             CREATE INDEX IF NOT EXISTS idx_game_sessions_started ON game_sessions(started_at DESC);",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn start_monitor(app: AppHandle, state: GameplayState) {
    thread::spawn(move || {
        let mut tracked_path: Option<PathBuf> = None;
        let mut backup_queue = VecDeque::new();
        let mut last_backup_scan = Instant::now() - Duration::from_secs(120);
        let mut last_ui_emit = Instant::now() - Duration::from_secs(10);

        loop {
            let requested_path = state
                .runtime
                .lock()
                .ok()
                .and_then(|runtime| runtime.log_path.clone());
            let log_path = requested_path
                .filter(|path| path.exists())
                .or_else(discover_game_log);

            if log_path != tracked_path {
                tracked_path = log_path.clone();
                backup_queue.clear();
                last_backup_scan = Instant::now() - Duration::from_secs(120);
                if let Ok(mut runtime) = state.runtime.lock() {
                    runtime.log_path = log_path.clone();
                    runtime.current_session_id = None;
                    runtime.monitoring = log_path.is_some();
                    runtime.last_error = None;
                }
            }

            let rescan = state
                .runtime
                .lock()
                .map(|mut runtime| {
                    let requested = runtime.rescan_requested;
                    runtime.rescan_requested = false;
                    requested
                })
                .unwrap_or(false);

            if let Some(path) = &log_path {
                match process_live_log(&state, path) {
                    Ok(inserted) if inserted > 0 => {
                        refresh_runtime_counts(&state);
                        if last_ui_emit.elapsed() >= Duration::from_secs(3) {
                            let _ = app.emit("gameplay-updated", inserted);
                            last_ui_emit = Instant::now();
                        }
                    }
                    Ok(_) => {}
                    Err(error) => set_runtime_error(&state, error),
                }

                if rescan
                    || backup_queue.is_empty()
                        && last_backup_scan.elapsed() >= Duration::from_secs(60)
                {
                    backup_queue =
                        unimported_backup_logs(&state, discover_backup_logs(path)).into();
                    last_backup_scan = Instant::now();
                    if let Ok(mut runtime) = state.runtime.lock() {
                        runtime.indexing = !backup_queue.is_empty();
                        runtime.queued_backups = backup_queue.len();
                    }
                }

                if let Some(backup) = backup_queue.pop_front() {
                    match import_backup_log(&state, &backup) {
                        Ok(imported) => {
                            if let Ok(mut runtime) = state.runtime.lock() {
                                runtime.queued_backups = backup_queue.len();
                                runtime.indexing = !backup_queue.is_empty();
                            }
                            if imported {
                                refresh_runtime_counts(&state);
                                if last_ui_emit.elapsed() >= Duration::from_secs(3)
                                    || backup_queue.is_empty()
                                {
                                    let _ = app.emit("gameplay-updated", 0_u64);
                                    last_ui_emit = Instant::now();
                                }
                            }
                        }
                        Err(error) => set_runtime_error(&state, error),
                    }
                }
            } else if let Ok(mut runtime) = state.runtime.lock() {
                runtime.monitoring = false;
                runtime.last_error = Some("Star Citizen Game.log was not found. Use Auto-detect or enter the LIVE/PTU folder path.".to_string());
            }

            thread::sleep(Duration::from_millis(if backup_queue.is_empty() {
                1_000
            } else {
                100
            }));
        }
    });
}

fn process_live_log(state: &GameplayState, path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let first_timestamp = first_timestamp(path).unwrap_or_else(|| modified_timestamp(&metadata));
    let source_key = format!("live:{}:{}", path.to_string_lossy(), first_timestamp);
    let channel = channel_for_path(path);
    let source_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Game.log");
    let mut connection = Connection::open(&state.db_path).map_err(|error| error.to_string())?;
    let existing = connection
        .query_row(
            "SELECT id, last_offset, ended_at FROM game_sessions WHERE source_key = ?1",
            params![source_key],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, u64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let (session_id, offset, ended_at) = if let Some(existing) = existing {
        existing
    } else {
        connection
            .execute(
                "INSERT INTO game_sessions (source_key, source_path, source_name, channel, build, started_at, imported, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
                params![source_key, path.to_string_lossy(), source_name, channel, detect_build(path), first_timestamp, now()],
            )
            .map_err(|error| error.to_string())?;
        (connection.last_insert_rowid(), 0, None)
    };

    if ended_at.is_some() {
        if let Ok(mut runtime) = state.runtime.lock() {
            runtime.current_session_id = None;
            runtime.monitoring = true;
        }
        return Ok(0);
    }
    if let Ok(mut runtime) = state.runtime.lock() {
        runtime.current_session_id = Some(session_id);
        runtime.monitoring = true;
    }
    if metadata.len() <= offset {
        return Ok(0);
    }

    let result = ingest_file(&mut connection, path, session_id, offset)?;
    if result.ends_session {
        connection
            .execute(
                "UPDATE game_sessions SET ended_at = COALESCE(?1, started_at) WHERE id = ?2",
                params![result.last_timestamp, session_id],
            )
            .map_err(|error| error.to_string())?;
        if let Ok(mut runtime) = state.runtime.lock() {
            runtime.current_session_id = None;
        }
    }
    if result.inserted > 0 {
        if let Ok(mut runtime) = state.runtime.lock() {
            runtime.last_event_at = result.last_timestamp;
        }
    }
    Ok(result.inserted)
}

fn import_backup_log(state: &GameplayState, path: &Path) -> Result<bool, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = modified_timestamp(&metadata);
    let source_key = backup_source_key(path, &metadata);
    let mut connection = Connection::open(&state.db_path).map_err(|error| error.to_string())?;
    let exists = connection
        .query_row(
            "SELECT 1 FROM game_sessions WHERE source_key = ?1",
            params![source_key],
            |_| Ok(()),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();
    if exists {
        return Ok(false);
    }

    let started_at = first_timestamp(path).unwrap_or_else(|| modified.clone());
    let source_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Archived Game.log");
    connection
        .execute(
            "INSERT INTO game_sessions (source_key, source_path, source_name, channel, build, started_at, imported, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
            params![source_key, path.to_string_lossy(), source_name, channel_for_path(path), detect_build(path), started_at, now()],
        )
        .map_err(|error| error.to_string())?;
    let session_id = connection.last_insert_rowid();
    let result = ingest_file(&mut connection, path, session_id, 0)?;
    connection
        .execute(
            "UPDATE game_sessions SET ended_at = COALESCE(?1, started_at) WHERE id = ?2",
            params![result.last_timestamp, session_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(true)
}

struct IngestResult {
    inserted: u64,
    last_timestamp: Option<String>,
    ends_session: bool,
}

fn ingest_file(
    connection: &mut Connection,
    path: &Path,
    session_id: i64,
    offset: u64,
) -> Result<IngestResult, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO game_events (
               session_id, occurred_at, severity, category, event_type, title, summary, details_json,
               raw_sanitized, amount, quantity, location, item, mission_id, objective_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .map_err(|error| error.to_string())?;
    let mut current_offset = offset;
    let mut inserted = 0_u64;
    let mut lines = 0_u64;
    let mut last_timestamp = None;
    let mut ends_session = false;

    loop {
        let mut line = String::new();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;
        if bytes == 0 || !line.ends_with('\n') {
            break;
        }
        current_offset += bytes as u64;
        lines += 1;
        if let Some(event) = parse_event(line.trim_end_matches(['\r', '\n'])) {
            last_timestamp = Some(event.occurred_at.clone());
            ends_session |= event.ends_session;
            statement
                .execute(params![
                    session_id,
                    event.occurred_at,
                    event.severity,
                    event.category,
                    event.event_type,
                    event.title,
                    event.summary,
                    event.details_json,
                    event.raw_sanitized,
                    event.amount,
                    event.quantity,
                    event.location,
                    event.item,
                    event.mission_id,
                    event.objective_id
                ])
                .map_err(|error| error.to_string())?;
            inserted += 1;
        }
    }
    drop(statement);
    transaction
        .execute(
            "UPDATE game_sessions
             SET last_offset = ?1, line_count = line_count + ?2, event_count = event_count + ?3
             WHERE id = ?4",
            params![current_offset, lines, inserted, session_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(IngestResult {
        inserted,
        last_timestamp,
        ends_session,
    })
}

fn parse_event(line: &str) -> Option<ParsedEvent> {
    if line.trim().is_empty() {
        return None;
    }
    let event_type = event_tag(line);
    let lower = line.to_ascii_lowercase();
    let critical_untagged = lower.contains("fatal error")
        || lower.contains("crash")
        || lower.contains("out of system memory")
        || lower.contains("connection lost")
        || lower.contains("disconnect");
    if event_type.is_none() && !critical_untagged {
        return None;
    }

    let event_type = event_type.unwrap_or_else(|| "Diagnostic".to_string());
    let category = classify_event(&event_type, &lower).to_string();
    let mut details = generic_details(line);
    let mission_id = detail_value(&details, &["MissionId", "mission_id", "missionId"]);
    let objective_id = detail_value(&details, &["ObjectiveId", "objective_id", "objectiveId"]);
    let item = detail_value(
        &details,
        &["itemName", "item", "commodityName", "resourceName"],
    );
    let location = detail_value(
        &details,
        &["Location", "location", "LandingArea", "shopName"],
    );
    let quantity = numeric_detail(&details, &["quantity", "unitAmount", "Entities"]);
    let mut amount = numeric_detail(&details, &["client_price", "price", "payout", "amount"]);
    let mut normalized_type = event_type.clone();

    if lower.contains("contract accepted") {
        normalized_type = "contract_accepted".to_string();
    } else if lower.contains("award") && lower.contains("auec") {
        normalized_type = "mission_reward".to_string();
        amount = awarded_amount(line).or(amount);
    } else if event_type.contains("ObjectiveComplete") {
        normalized_type = "objective_completed".to_string();
    } else if event_type.contains("MissionEnded") && lower.contains("completed") {
        normalized_type = "mission_completed".to_string();
    } else if event_type.contains("SendShopBuyRequest") {
        normalized_type = "item_purchase".to_string();
    } else if event_type.contains("SendShopSellRequest") {
        normalized_type = "item_sale".to_string();
    } else if event_type.contains("SendCommodityBuyRequest") {
        normalized_type = "commodity_purchase".to_string();
    } else if event_type.contains("SendCommoditySellRequest") {
        normalized_type = "commodity_sale".to_string();
    } else if event_type == "RequestLocationInventory" {
        normalized_type = "location_inventory".to_string();
    } else if event_type.contains("SystemQuit") {
        normalized_type = "session_ended".to_string();
    }

    if let Some(value) = &mission_id {
        details.insert("missionId".to_string(), json!(value));
    }
    let raw_sanitized = sanitize_line(line);
    let summary = summarize_line(&raw_sanitized, &event_type);
    let title = event_title(&normalized_type, &event_type, line, item.as_deref());
    Some(ParsedEvent {
        occurred_at: timestamp_from_line(line).unwrap_or_else(now),
        severity: severity_from_line(line),
        category,
        event_type: normalized_type,
        title,
        summary,
        details_json: serde_json::Value::Object(details).to_string(),
        raw_sanitized: truncate(&raw_sanitized, MAX_EVENT_LINE),
        amount,
        quantity,
        location,
        item,
        mission_id,
        objective_id,
        ends_session: event_type.contains("SystemQuit"),
    })
}

fn classify_event(event_type: &str, lower: &str) -> &'static str {
    let event = event_type.to_ascii_lowercase();
    if event.contains("mission")
        || event.contains("objective")
        || event.contains("shudevent_onnotification")
    {
        "Missions"
    } else if event.contains("shop")
        || event.contains("commodityuiprovider")
        || lower.contains("auec")
    {
        "Commerce"
    } else if event == "requestlocationinventory" {
        "Location"
    } else if event.contains("inventory")
        || event.contains("freightelevator")
        || event.contains("warehouse")
        || lower.contains("cargo")
    {
        "Cargo"
    } else if event.contains("vehicle")
        || event.contains("docking")
        || event.contains("landing")
        || event.contains("quantum")
        || lower.contains("hangar")
    {
        "Vehicles"
    } else if event.contains("kill")
        || event.contains("death")
        || lower.contains("destructionlevel")
    {
        "Combat"
    } else if event.contains("login")
        || event.contains("channel")
        || event.contains("session")
        || event.contains("disconnect")
        || event.contains("systemquit")
    {
        "Connection"
    } else if event.contains("social") || event.contains("friend") || lower.contains("party") {
        "Social"
    } else if event.contains("stall")
        || lower.contains("fatal error")
        || lower.contains("crash")
        || lower.contains("memory")
        || lower.contains("error")
    {
        "Diagnostics"
    } else {
        "Other"
    }
}

fn generic_details(line: &str) -> Map<String, serde_json::Value> {
    let mut details = Map::new();
    for captures in bracket_field_regex().captures_iter(line) {
        let key = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let value = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        if !key.is_empty() {
            details.insert(key.to_string(), json!(sanitize_field(key, value)));
        }
    }
    details
}

fn event_title(normalized_type: &str, raw_type: &str, line: &str, item: Option<&str>) -> String {
    match normalized_type {
        "contract_accepted" => {
            quoted_message(line).unwrap_or_else(|| "Contract accepted".to_string())
        }
        "mission_reward" => {
            quoted_message(line).unwrap_or_else(|| "Mission reward received".to_string())
        }
        "mission_completed" => "Mission completed".to_string(),
        "objective_completed" => "Objective completed".to_string(),
        "item_purchase" => format!("Purchased {}", item.unwrap_or("item")),
        "item_sale" => format!("Sold {}", item.unwrap_or("item")),
        "commodity_purchase" => "Commodity purchase".to_string(),
        "commodity_sale" => "Commodity sale".to_string(),
        "location_inventory" => "Location inventory accessed".to_string(),
        "session_ended" => "Game session ended".to_string(),
        _ if raw_type == "SHUDEvent_OnNotification" => {
            quoted_message(line).unwrap_or_else(|| "Game notification".to_string())
        }
        _ => humanize(raw_type),
    }
}

fn event_tag(line: &str) -> Option<String> {
    event_tag_regex()
        .captures(line)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

fn timestamp_from_line(line: &str) -> Option<String> {
    timestamp_regex()
        .captures(line)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

fn severity_from_line(line: &str) -> String {
    severity_regex()
        .captures(line)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| "Info".to_string())
}

fn quoted_message(line: &str) -> Option<String> {
    quoted_regex()
        .captures(line)
        .and_then(|captures| captures.get(1))
        .map(|value| truncate(value.as_str().trim(), 180))
}

fn awarded_amount(line: &str) -> Option<f64> {
    award_regex()
        .captures(line)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().replace(',', "").parse::<f64>().ok())
}

fn detail_value(details: &Map<String, serde_json::Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        details
            .get(*key)
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty() && *value != "[redacted]")
            .map(ToString::to_string)
    })
}

fn numeric_detail(details: &Map<String, serde_json::Value>, keys: &[&str]) -> Option<f64> {
    detail_value(details, keys).and_then(|value| {
        value
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .replace(',', "")
            .parse::<f64>()
            .ok()
    })
}

fn sanitize_field(key: &str, value: &str) -> String {
    let lower = key.to_ascii_lowercase();
    if lower.contains("session")
        || lower.contains("account")
        || lower.contains("player")
        || lower.contains("token")
        || lower.contains("auth")
        || lower.contains("email")
    {
        "[redacted]".to_string()
    } else {
        truncate(value, 500)
    }
}

fn sanitize_line(line: &str) -> String {
    let mut sanitized = sensitive_field_regex()
        .replace_all(line, "$1[redacted]")
        .into_owned();
    sanitized = auth_token_regex()
        .replace_all(&sanitized, "$1[redacted]")
        .into_owned();
    truncate(&sanitized, MAX_EVENT_LINE)
}

fn summarize_line(line: &str, event_type: &str) -> String {
    let mut summary = line.to_string();
    if let Some(position) = summary.find(&format!("<{}>", event_type)) {
        summary = summary[position + event_type.len() + 2..]
            .trim()
            .to_string();
    }
    if let Some(position) = summary.rfind(" [Team_") {
        summary.truncate(position);
    }
    truncate(summary.trim(), 500)
}

fn humanize(value: &str) -> String {
    let cleaned = value.rsplit("::").next().unwrap_or(value).replace('_', " ");
    let mut output = String::new();
    let mut previous_lower = false;
    for character in cleaned.chars() {
        if character.is_uppercase() && previous_lower {
            output.push(' ');
        }
        output.push(character);
        previous_lower = character.is_lowercase();
    }
    output.trim().to_string()
}

fn query_snapshot(
    state: &GameplayState,
    session_id: Option<i64>,
    category: Option<String>,
    search: Option<String>,
    offset: u32,
    limit: u32,
) -> Result<GameplaySnapshot, String> {
    let connection = Connection::open(&state.db_path).map_err(|error| error.to_string())?;
    let session_filter = session_id
        .map(|id| format!("session_id = {}", id))
        .unwrap_or_else(|| "1 = 1".to_string());
    let session_count_expression = session_id
        .map(|_| "1")
        .unwrap_or("(SELECT COUNT(*) FROM game_sessions)");
    let summary = connection
        .query_row(
            &format!(
                "SELECT
                   {},
                   COUNT(*),
                   COALESCE(SUM(CASE WHEN category NOT IN ('Other', 'Diagnostics') THEN 1 ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN event_type IN ('mission_reward', 'item_sale', 'commodity_sale') THEN amount ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN event_type IN ('item_purchase', 'commodity_purchase') THEN amount ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN event_type = 'mission_completed' THEN 1 ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN event_type IN ('item_purchase', 'commodity_purchase') THEN 1 ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN category = 'Cargo' THEN 1 ELSE 0 END), 0),
                   COUNT(DISTINCT CASE WHEN location IS NOT NULL AND location <> '' THEN location END),
                   COALESCE(SUM(CASE WHEN event_type LIKE '%disconnect%' OR summary LIKE '%Connection lost%' THEN 1 ELSE 0 END), 0)
                 FROM game_events WHERE {}",
                session_count_expression, session_filter
            ),
            [],
            |row| {
                Ok(GameplaySummary {
                    total_sessions: row.get(0)?,
                    total_events: row.get(1)?,
                    gameplay_events: row.get(2)?,
                    credits_earned: row.get(3)?,
                    credits_spent: row.get(4)?,
                    missions_completed: row.get(5)?,
                    purchases: row.get(6)?,
                    cargo_actions: row.get(7)?,
                    locations_visited: row.get(8)?,
                    disconnects: row.get(9)?,
                })
            },
        )
        .map_err(|error| error.to_string())?;

    let mut category_statement = connection
        .prepare(&format!("SELECT category, COUNT(*) FROM game_events WHERE {} GROUP BY category ORDER BY COUNT(*) DESC", session_filter))
        .map_err(|error| error.to_string())?;
    let category_counts = category_statement
        .query_map([], |row| {
            Ok(CategoryCount {
                category: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut sessions_statement = connection
        .prepare(
            "SELECT id, channel, build, started_at, ended_at, event_count, source_name, imported
             FROM game_sessions ORDER BY started_at DESC LIMIT 250",
        )
        .map_err(|error| error.to_string())?;
    let sessions = sessions_statement
        .query_map([], |row| {
            Ok(GameSession {
                id: row.get(0)?,
                channel: row.get(1)?,
                build: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                event_count: row.get(5)?,
                source_name: row.get(6)?,
                imported: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let (where_clause, values) = event_filters(session_id, category, search);
    let total_matching_events = connection
        .query_row(
            &format!("SELECT COUNT(*) FROM game_events {}", where_clause),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let events = query_events(&connection, &where_clause, values, limit, offset)?;

    Ok(GameplaySnapshot {
        fetched_at: now(),
        status: tracker_status(state),
        summary,
        category_counts,
        sessions,
        events,
        total_matching_events,
    })
}

fn query_drilldown(
    state: &GameplayState,
    metric: &str,
    session_id: Option<i64>,
    group_key: Option<&str>,
    limit: u32,
) -> Result<GameplayDrilldown, String> {
    let connection = Connection::open(&state.db_path).map_err(|error| error.to_string())?;
    if metric == "sessions" {
        if let Some(key) = group_key {
            let selected_session_id = key
                .parse::<i64>()
                .map_err(|_| "Invalid session activity selection.".to_string())?;
            if session_id.is_some_and(|scope_id| scope_id != selected_session_id) {
                return Err("The selected session is outside the current scope.".to_string());
            }
            let values = vec![Value::Integer(selected_session_id)];
            let (total_records, total_amount) = connection
                .query_row(
                    "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM game_events WHERE session_id = ?1",
                    params_from_iter(values.iter()),
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|error| error.to_string())?;
            let events = query_events(&connection, "WHERE session_id = ?1", values, limit, 0)?;
            return Ok(GameplayDrilldown {
                metric: metric.to_string(),
                title: "Session activity".to_string(),
                description: "Every captured event from the selected session, newest first."
                    .to_string(),
                total_records,
                total_amount,
                groups: Vec::new(),
                events,
            });
        }
        let scope = session_id
            .map(|id| format!("WHERE id = {}", id))
            .unwrap_or_default();
        let total_records = connection
            .query_row(
                &format!("SELECT COUNT(*) FROM game_sessions {}", scope),
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let mut statement = connection
            .prepare(&format!(
                "SELECT CAST(id AS TEXT), channel || CASE WHEN build IS NULL OR build = '' THEN '' ELSE ' · ' || build END,
                        started_at, event_count, 0.0, ended_at
                 FROM game_sessions {} ORDER BY started_at DESC LIMIT 250",
                scope
            ))
            .map_err(|error| error.to_string())?;
        let groups = statement
            .query_map([], |row| {
                Ok(DrilldownGroup {
                    key: row.get(0)?,
                    label: row.get(1)?,
                    context: row.get(2)?,
                    count: row.get(3)?,
                    amount: row.get(4)?,
                    last_seen: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        return Ok(GameplayDrilldown {
            metric: metric.to_string(),
            title: "Captured sessions".to_string(),
            description: "Every indexed play session, including channel, build, start time, duration, and captured event count.".to_string(),
            total_records,
            total_amount: 0.0,
            groups,
            events: Vec::new(),
        });
    }

    let (title, description, filter, group, context) = match metric {
        "gameplayEvents" => (
            "Gameplay events",
            "All classified activity except diagnostic and unclassified records, grouped by category.",
            "category NOT IN ('Other', 'Diagnostics')",
            "category",
            "NULL",
        ),
        "creditsEarned" => (
            "Credits earned",
            "Mission rewards and recorded item or commodity sales, with individual values and references when available.",
            "event_type IN ('mission_reward', 'item_sale', 'commodity_sale') AND amount IS NOT NULL",
            "COALESCE(mission_id, item, title, event_type)",
            "MAX(title)",
        ),
        "creditsSpent" => (
            "Credits spent",
            "Recorded item and commodity purchases, grouped by item with the latest known shop or location.",
            "event_type IN ('item_purchase', 'commodity_purchase') AND amount IS NOT NULL",
            "COALESCE(item, event_type)",
            "MAX(location)",
        ),
        "missionsCompleted" => (
            "Completed missions",
            "Mission completion records grouped by mission identifier or the best available log title.",
            "event_type = 'mission_completed'",
            "COALESCE(mission_id, title, event_type)",
            "MAX(title)",
        ),
        "purchases" => (
            "Purchases",
            "Every recorded item and commodity purchase, including quantity, price, item, and location when logged.",
            "event_type IN ('item_purchase', 'commodity_purchase')",
            "COALESCE(item, event_type)",
            "MAX(location)",
        ),
        "cargoActions" => (
            "Cargo actions",
            "Cargo, freight elevator, warehouse, and inventory activity grouped by the original event type.",
            "category = 'Cargo'",
            "event_type",
            "MAX(location)",
        ),
        "locationsVisited" => (
            "Known locations",
            "Every named location found in captured events, with activity count, categories, and most recent occurrence.",
            "location IS NOT NULL AND location <> ''",
            "location",
            "GROUP_CONCAT(DISTINCT category)",
        ),
        _ => return Err("Unknown gameplay detail metric.".to_string()),
    };
    let scope = session_id
        .map(|id| format!(" AND session_id = {}", id))
        .unwrap_or_default();
    let where_expression = format!("{}{}", filter, scope);
    if let Some(key) = group_key {
        let selected_where = format!("{} AND {} = ?1", where_expression, group);
        let values = vec![Value::Text(key.to_string())];
        let (total_records, total_amount) = connection
            .query_row(
                &format!(
                    "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM game_events WHERE {}",
                    selected_where
                ),
                params_from_iter(values.iter()),
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        let events = query_events(
            &connection,
            &format!("WHERE {}", selected_where),
            values,
            limit,
            0,
        )?;
        return Ok(GameplayDrilldown {
            metric: metric.to_string(),
            title: key.to_string(),
            description: "Matching captured events for the selected activity, newest first."
                .to_string(),
            total_records,
            total_amount,
            groups: Vec::new(),
            events,
        });
    }
    let (total_records, total_amount) = connection
        .query_row(
            &format!(
                "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM game_events WHERE {}",
                where_expression
            ),
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let mut group_statement = connection
        .prepare(&format!(
            "SELECT {}, {}, COUNT(*), COALESCE(SUM(amount), 0), MAX(occurred_at)
             FROM game_events WHERE {} GROUP BY {} ORDER BY MAX(occurred_at) DESC, {} ASC LIMIT 100",
            group, context, where_expression, group, group
        ))
        .map_err(|error| error.to_string())?;
    let groups = group_statement
        .query_map([], |row| {
            let label: String = row.get(0)?;
            Ok(DrilldownGroup {
                key: label.clone(),
                label,
                context: row.get(1)?,
                count: row.get(2)?,
                amount: row.get(3)?,
                last_seen: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let events = query_events(
        &connection,
        &format!("WHERE {}", where_expression),
        Vec::new(),
        limit,
        0,
    )?;
    Ok(GameplayDrilldown {
        metric: metric.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        total_records,
        total_amount,
        groups,
        events,
    })
}

fn query_events(
    connection: &Connection,
    where_clause: &str,
    mut values: Vec<Value>,
    limit: u32,
    offset: u32,
) -> Result<Vec<GameEvent>, String> {
    values.push(Value::Integer(limit as i64));
    values.push(Value::Integer(offset as i64));
    let mut statement = connection
        .prepare(&format!(
            "SELECT id, session_id, occurred_at, severity, category, event_type, title, summary, details_json,
                    raw_sanitized, amount, quantity, location, item, mission_id, objective_id
             FROM game_events {} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?",
            where_clause
        ))
        .map_err(|error| error.to_string())?;
    let events = statement
        .query_map(params_from_iter(values.iter()), |row| {
            let details: String = row.get(8)?;
            Ok(GameEvent {
                id: row.get(0)?,
                session_id: row.get(1)?,
                occurred_at: row.get(2)?,
                severity: row.get(3)?,
                category: row.get(4)?,
                event_type: row.get(5)?,
                title: row.get(6)?,
                summary: row.get(7)?,
                details: serde_json::from_str(&details).unwrap_or_else(|_| json!({})),
                raw_sanitized: row.get(9)?,
                amount: row.get(10)?,
                quantity: row.get(11)?,
                location: row.get(12)?,
                item: row.get(13)?,
                mission_id: row.get(14)?,
                objective_id: row.get(15)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(events)
}

fn event_filters(
    session_id: Option<i64>,
    category: Option<String>,
    search: Option<String>,
) -> (String, Vec<Value>) {
    let mut clauses = Vec::new();
    let mut values = Vec::new();
    if let Some(id) = session_id {
        clauses.push("session_id = ?".to_string());
        values.push(Value::Integer(id));
    }
    if let Some(category) = category {
        clauses.push("category = ?".to_string());
        values.push(Value::Text(category));
    }
    if let Some(search) = search {
        clauses.push("(title LIKE ? OR summary LIKE ? OR event_type LIKE ? OR item LIKE ? OR location LIKE ? OR details_json LIKE ? OR raw_sanitized LIKE ?)".to_string());
        let pattern = format!("%{}%", search.trim());
        for _ in 0..7 {
            values.push(Value::Text(pattern.clone()));
        }
    }
    let clause = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    (clause, values)
}

fn tracker_status(state: &GameplayState) -> TrackerStatus {
    let runtime = state.runtime.lock().ok();
    let log_path = runtime.as_ref().and_then(|value| value.log_path.clone());
    TrackerStatus {
        available: log_path.as_ref().is_some_and(|path| path.exists()),
        monitoring: runtime.as_ref().is_some_and(|value| value.monitoring),
        indexing: runtime.as_ref().is_some_and(|value| value.indexing),
        channel: log_path.as_deref().map(channel_for_path),
        log_path: log_path.map(|path| path.to_string_lossy().into_owned()),
        current_session_id: runtime.as_ref().and_then(|value| value.current_session_id),
        indexed_sessions: runtime
            .as_ref()
            .map(|value| value.indexed_sessions)
            .unwrap_or(0),
        queued_backups: runtime
            .as_ref()
            .map(|value| value.queued_backups)
            .unwrap_or(0),
        last_event_at: runtime
            .as_ref()
            .and_then(|value| value.last_event_at.clone()),
        last_error: runtime.as_ref().and_then(|value| value.last_error.clone()),
    }
}

fn refresh_runtime_counts(state: &GameplayState) {
    let count = Connection::open(&state.db_path)
        .and_then(|connection| {
            connection.query_row("SELECT COUNT(*) FROM game_sessions", [], |row| {
                row.get::<_, u64>(0)
            })
        })
        .unwrap_or(0);
    if let Ok(mut runtime) = state.runtime.lock() {
        runtime.indexed_sessions = count;
    }
}

fn set_runtime_error(state: &GameplayState, error: String) {
    if let Ok(mut runtime) = state.runtime.lock() {
        runtime.last_error = Some(error);
    }
}

fn discover_game_log() -> Option<PathBuf> {
    let mut roots = Vec::new();
    if let Some(program_files) = env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(program_files));
    }
    for drive in ['C', 'D', 'E', 'F', 'G'] {
        roots.push(PathBuf::from(format!("{}:\\Program Files", drive)));
        roots.push(PathBuf::from(format!("{}:\\", drive)));
    }
    let channels = ["LIVE", "PTU", "EPTU", "HOTFIX", "TECH-PREVIEW"];
    let mut candidates = Vec::new();
    for root in roots {
        for channel in channels {
            for relative in [
                PathBuf::from("Roberts Space Industries")
                    .join("StarCitizen")
                    .join(channel)
                    .join("Game.log"),
                PathBuf::from("RSI")
                    .join("StarCitizen")
                    .join(channel)
                    .join("Game.log"),
                PathBuf::from("StarCitizen").join(channel).join("Game.log"),
            ] {
                let candidate = root.join(relative);
                if candidate.exists() {
                    candidates.push(candidate);
                }
            }
        }
    }
    candidates.into_iter().max_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    })
}

fn discover_backup_logs(game_log: &Path) -> Vec<PathBuf> {
    let mut files = game_log
        .parent()
        .map(|parent| parent.join("logbackups"))
        .and_then(|folder| fs::read_dir(folder).ok())
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("log"))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    files.reverse();
    files
}

fn unimported_backup_logs(state: &GameplayState, files: Vec<PathBuf>) -> Vec<PathBuf> {
    let Ok(connection) = Connection::open(&state.db_path) else {
        return files;
    };
    files
        .into_iter()
        .filter(|path| {
            let Ok(metadata) = fs::metadata(path) else {
                return false;
            };
            let source_key = backup_source_key(path, &metadata);
            !connection
                .query_row(
                    "SELECT 1 FROM game_sessions WHERE source_key = ?1",
                    params![source_key],
                    |_| Ok(()),
                )
                .optional()
                .ok()
                .flatten()
                .is_some()
        })
        .collect()
}

fn backup_source_key(path: &Path, metadata: &fs::Metadata) -> String {
    format!(
        "backup:{}:{}:{}",
        path.to_string_lossy(),
        metadata.len(),
        modified_timestamp(metadata)
    )
}

fn normalize_log_path(mut path: PathBuf) -> Result<PathBuf, String> {
    if path.is_dir() {
        path = path.join("Game.log");
    }
    if !path.exists() || !path.is_file() {
        return Err("The selected path does not contain a readable Game.log file.".to_string());
    }
    Ok(path)
}

fn load_configured_path(db_path: &Path) -> Result<Option<PathBuf>, String> {
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'game_log_path'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map(|value| value.map(PathBuf::from))
        .map_err(|error| error.to_string())
}

fn save_configured_path(db_path: &Path, path: &Path) -> Result<(), String> {
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO settings (key, value) VALUES ('game_log_path', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![path.to_string_lossy()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn first_timestamp(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(250).flatten() {
        if let Some(timestamp) = timestamp_from_line(&line) {
            return Some(timestamp);
        }
    }
    None
}

fn detect_build(path: &Path) -> Option<String> {
    let filename = path.file_name()?.to_string_lossy();
    build_regex()
        .captures(&filename)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

fn channel_for_path(path: &Path) -> String {
    let parent = path.parent();
    let channel_path = if parent
        .and_then(|value| value.file_name())
        .is_some_and(|name| name == "logbackups")
    {
        parent.and_then(|value| value.parent())
    } else {
        parent
    };
    channel_path
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

fn modified_timestamp(metadata: &fs::Metadata) -> String {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| {
            DateTime::<Utc>::from_timestamp(duration.as_secs() as i64, duration.subsec_nanos())
        })
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(now)
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn truncate(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    value
        .chars()
        .take(max.saturating_sub(3))
        .collect::<String>()
        + "..."
}

fn event_tag_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| {
        Regex::new(r"^<[^>]+>\s*(?:\[[^\]]+\]\s*)?<([A-Za-z][A-Za-z0-9_:.-]+)>").unwrap()
    })
}

fn timestamp_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"^<([^>]+)>").unwrap())
}

fn severity_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"^<[^>]+>\s*\[([^\]]+)\]").unwrap())
}

fn bracket_field_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"([A-Za-z][A-Za-z0-9_]*)\[([^\]]*)\]").unwrap())
}

fn quoted_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r#"Added notification \"([^\"]+)"#).unwrap())
}

fn award_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"(?i)Awarded\s+([0-9,.]+)\s+aUEC").unwrap())
}

fn build_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"Build\((\d+)\)").unwrap())
}

fn sensitive_field_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| {
        Regex::new(r"(?i)(sessionId|accountId|accountName|playerId|playerName|player)\[[^\]]*\]")
            .unwrap()
    })
}

fn auth_token_regex() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| {
        Regex::new(r"(?i)(auth(?:entication)?[_ -]?(?:token)?[=: ]+)[^\s,;]+").unwrap()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shop_purchase() {
        let line = "<2026-08-28T22:33:16.390Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> Sending - player[123] shopName[SCShop_Test] client_price[115330.000000] itemName[ANVL_Turret] quantity[1]";
        let event = parse_event(line).unwrap();
        assert_eq!(event.event_type, "item_purchase");
        assert_eq!(event.category, "Commerce");
        assert_eq!(event.amount, Some(115330.0));
        assert_eq!(event.item.as_deref(), Some("ANVL_Turret"));
        assert!(event.raw_sanitized.contains("player[redacted]"));
    }

    #[test]
    fn parses_mission_reward() {
        let line = "<2026-08-30T21:47:21.385Z> [Notice] <SHUDEvent_OnNotification> Added notification \"Awarded 243500 aUEC: \" [45] to queue. MissionId:[abc]";
        let event = parse_event(line).unwrap();
        assert_eq!(event.event_type, "mission_reward");
        assert_eq!(event.amount, Some(243500.0));
    }

    #[test]
    fn preserves_unknown_tagged_events() {
        let event =
            parse_event("<2026-08-30T21:47:21.385Z> [Notice] <FutureGameplayEvent> Value[42]")
                .unwrap();
        assert_eq!(event.category, "Other");
        assert_eq!(event.event_type, "FutureGameplayEvent");
    }

    #[test]
    fn ingests_and_deduplicates_incremental_offsets() {
        let folder = env::temp_dir().join(format!("sc-companion-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        let db_path = folder.join("gameplay.sqlite3");
        let log_path = folder.join("Game.log");
        fs::write(
            &log_path,
            concat!(
                "<2026-08-30T21:47:20.000Z> [Notice] <LoginCompleted> player[123]\n",
                "<2026-08-30T21:47:21.000Z> [Notice] <FutureGameplayEvent> Value[42]\n",
                "<2026-08-30T21:47:21.250Z> [Notice] <RequestLocationInventory> Location[Lorville]\n",
                "<2026-08-30T21:47:21.500Z> [Notice] <RequestLocationInventory> Location[Area18]\n",
                "an untagged engine line that should not be stored\n",
                "<2026-08-30T21:47:22.000Z> [Notice] <SystemQuit> cause[0]\n"
            ),
        )
        .unwrap();
        initialize_database(&db_path).unwrap();
        let mut connection = Connection::open(&db_path).unwrap();
        connection
            .execute(
                "INSERT INTO game_sessions (source_key, source_path, source_name, channel, started_at, created_at)
                 VALUES ('test', ?1, 'Game.log', 'LIVE', '2026-08-30T21:47:20.000Z', ?2)",
                params![log_path.to_string_lossy(), now()],
            )
            .unwrap();
        let session_id = connection.last_insert_rowid();
        let first = ingest_file(&mut connection, &log_path, session_id, 0).unwrap();
        assert_eq!(first.inserted, 5);
        assert!(first.ends_session);
        let offset: u64 = connection
            .query_row(
                "SELECT last_offset FROM game_sessions WHERE id = ?1",
                params![session_id],
                |row| row.get(0),
            )
            .unwrap();
        let second = ingest_file(&mut connection, &log_path, session_id, offset).unwrap();
        assert_eq!(second.inserted, 0);
        let count: u64 = connection
            .query_row("SELECT COUNT(*) FROM game_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 5);
        drop(connection);
        let state = GameplayState {
            db_path: db_path.clone(),
            runtime: Arc::new(Mutex::new(TrackerRuntime::default())),
        };
        let locations = query_drilldown(&state, "locationsVisited", None, None, 100).unwrap();
        assert_eq!(locations.total_records, 2);
        assert_eq!(locations.groups[0].label, "Area18");
        assert_eq!(locations.groups[1].label, "Lorville");
        assert_eq!(locations.events.len(), 2);
        assert!(locations.events[0].occurred_at > locations.events[1].occurred_at);
        let area18 =
            query_drilldown(&state, "locationsVisited", None, Some("Area18"), 100).unwrap();
        assert_eq!(area18.total_records, 1);
        assert_eq!(area18.events[0].location.as_deref(), Some("Area18"));
        let sessions = query_drilldown(&state, "sessions", None, None, 100).unwrap();
        assert_eq!(sessions.total_records, 1);
        assert_eq!(sessions.groups[0].count, 5);
        let session_events =
            query_drilldown(&state, "sessions", None, Some(&sessions.groups[0].key), 100).unwrap();
        assert_eq!(session_events.total_records, 5);
        for metric in [
            "gameplayEvents",
            "creditsEarned",
            "creditsSpent",
            "missionsCompleted",
            "purchases",
            "cargoActions",
        ] {
            assert!(query_drilldown(&state, metric, None, None, 100).is_ok());
        }
        let _ = fs::remove_dir_all(folder);
    }
}
