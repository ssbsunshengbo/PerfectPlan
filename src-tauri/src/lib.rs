use tauri_plugin_sql::{Migration, MigrationKind};

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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_CONNECTION, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
