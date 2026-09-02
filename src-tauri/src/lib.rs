use tauri_plugin_sql::{Migration, MigrationKind};
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
        let _ = window.show();
        let _ = window.set_focus();
        // The positioner receives the native tray event above. Notify the webview
        // only after it becomes visible so it can place itself beside that event.
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
