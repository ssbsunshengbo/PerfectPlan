use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_positioner::{Position, WindowExt};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

const DATABASE_CONNECTION: &str = "sqlite:perfectplan.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_schema",
        sql: include_str!("../migrations/0001_initial_schema.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_CONNECTION, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_today_panel,
            open_main_from_tray,
            open_quick_add_from_tray,
            open_task_from_tray
        ])
        .setup(|app| {
            let show_today = MenuItemBuilder::with_id("show-today", "显示今日计划").build(app)?;
            let open_main = MenuItemBuilder::with_id("open-main", "打开 PerfectPlan").build(app)?;
            let quick_add = MenuItemBuilder::with_id("quick-add", "新建任务").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "彻底退出").build(app)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_today, &open_main, &quick_add, &separator, &quit])
                .build()?;

            TrayIconBuilder::with_id("perfectplan-tray")
                .icon(app.default_window_icon().expect("missing app icon").clone())
                .tooltip("PerfectPlan · 今日计划")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show-today" => show_tray_window(app),
                    "open-main" => show_main_window(app),
                    "quick-add" => {
                        show_main_window(app);
                        let _ = app.emit("tray-open-quick-add", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_tray_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_tray_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("tray") {
        // Move in Rust while the tray click rectangle is still available. This
        // avoids relying on a webview IPC permission or a delayed JS listener.
        let _ = window.move_window_constrained(Position::TrayCenter);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("tray-show-today", ());
    }
}

fn toggle_tray_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("tray") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_tray_window(app);
        }
    }
}

#[tauri::command]
fn hide_today_panel(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("tray")
        .ok_or_else(|| "找不到今日面板窗口。".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_main_from_tray(app: tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口。".to_string())?;
    main.unminimize().map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    hide_today_panel(app)
}

#[tauri::command]
fn open_quick_add_from_tray(app: tauri::AppHandle) -> Result<(), String> {
    open_main_from_tray(app.clone())?;
    app.emit("tray-open-quick-add", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_task_from_tray(app: tauri::AppHandle, task_id: String) -> Result<(), String> {
    open_main_from_tray(app.clone())?;
    app.emit("tray-open-task", task_id)
        .map_err(|error| error.to_string())
}
