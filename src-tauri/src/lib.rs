use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

mod gameplay;

struct DesktopState {
    close_to_tray: AtomicBool,
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, DesktopState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(DesktopState {
            close_to_tray: AtomicBool::new(true),
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init());
    #[cfg(not(feature = "store"))]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            gameplay::get_gameplay_snapshot,
            gameplay::get_gameplay_status,
            gameplay::get_gameplay_drilldown,
            gameplay::set_game_log_path,
            gameplay::auto_detect_game_log,
            gameplay::rescan_game_logs
        ])
        .setup(|app| {
            let gameplay_state = gameplay::initialize(app.handle())?;
            app.manage(gameplay_state);
            let open = MenuItem::with_id(app, "open", "Open SC Companion", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &refresh, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("SC Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "refresh" => {
                        let _ = app.emit("tray-refresh", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if std::env::args().any(|argument| argument == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<DesktopState>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running SC Companion");
}
