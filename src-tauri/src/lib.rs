//! MettisTool — työpöytäsovelluksen taustalogiikka.
//!
//! Arkkitehtuuri: käyttöliittymä (React) ei sisällä yhtään turvallisuuspäätöstä.
//! Kaikki tunnistautuminen, oikeustarkistukset, tietokanta ja salaisuudet ovat
//! tässä Rust-kerroksessa, johon frontend pääsee vain määriteltyjen komentojen kautta.

pub mod audit;
pub mod auth;
pub mod backup;
pub mod commands;
pub mod db;
pub mod discord;
pub mod email;
pub mod error;
pub mod rbac;
pub mod secrets;
pub mod settings;
pub mod state;
pub mod util;

use state::AppState;
use std::sync::OnceLock;
use tauri::{Manager, WindowEvent};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

pub fn app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.get().cloned()
}

fn init_logging() {
    let level = std::env::var("METTISTOOL_LOG").unwrap_or_else(|_| "info".into());
    let filter = match level.to_lowercase().as_str() {
        "trace" => log::LevelFilter::Trace,
        "debug" => log::LevelFilter::Debug,
        "warn" => log::LevelFilter::Warn,
        "error" => log::LevelFilter::Error,
        _ => log::LevelFilter::Info,
    };
    let _ = log::set_boxed_logger(Box::new(SimpleLogger)).map(|()| log::set_max_level(filter));
}

struct SimpleLogger;

impl log::Log for SimpleLogger {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            let ts = chrono::Local::now().format("%H:%M:%S");
            eprintln!("[{ts}] {:<5} {}", record.level(), record.args());
        }
    }
    fn flush(&self) {}
}

/// Taustasiivous: vanhentuneet istunnot, tokenit ja kutsurajoitukset.
fn spawn_maintenance(db: std::sync::Arc<db::Db>) {
    std::thread::spawn(move || loop {
        auth::session::cleanup(&db);
        let _ = auth::tokens::cleanup(&db);
        auth::ratelimit::cleanup(&db);
        std::thread::sleep(std::time::Duration::from_secs(3_600));
    });
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Avaa MettisTool", true, None::<&str>)?;
    let logout = MenuItem::with_id(app, "logout", "Kirjaudu ulos", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Lopeta", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &separator, &logout, &quit])?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
        tray.on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "logout" => {
                let state = app.state::<AppState>();
                let _ = auth::logout(&state);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = tauri::Emitter::emit(app, "session-ended", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });
        tray.on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        });
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(any(windows, target_os = "macos"))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = APP_HANDLE.set(handle.clone());

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("mettistool.db");

            let database = db::Db::open(&db_path).map_err(|e| {
                log::error!("tietokantaa ei voitu avata: {e}");
                std::io::Error::new(std::io::ErrorKind::Other, "tietokantavirhe")
            })?;

            let state = AppState::new(database);
            let db_arc = state.db.clone();
            app.manage(state);

            spawn_maintenance(db_arc.clone());

            // Automaattinen varmuuskopio käynnistyksessä (enintään kerran vuorokaudessa).
            if settings::get_bool(&db_arc, settings::AUTO_BACKUP) {
                let last: i64 = db_arc
                    .with(|c| {
                        Ok(c.query_row(
                            "SELECT IFNULL(MAX(created_at), 0) FROM backups WHERE kind = 'AUTO'",
                            [],
                            |r| r.get(0),
                        )?)
                    })
                    .unwrap_or(0);
                if util::now() - last > 86_400 {
                    let dir = data_dir.clone();
                    let db2 = db_arc.clone();
                    std::thread::spawn(move || {
                        if let Err(e) = backup::create(&db2, &dir, "AUTO", None) {
                            log::warn!("automaattinen varmuuskopio epäonnistui: {e}");
                        }
                    });
                }
            }

            if let Err(e) = setup_tray(&handle) {
                log::warn!("ilmaisinalueen kuvaketta ei voitu alustaa: {e}");
            }

            audit::log(
                &db_arc,
                audit::Event::new("APP_STARTED", audit::CAT_SYSTEM)
                    .meta(serde_json::json!({ "version": util::app_version() })),
            );

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if settings::get_bool(&state.db, settings::MINIMIZE_TO_TRAY) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Tunnistautuminen
            commands::auth::app_status,
            commands::auth::setup_owner,
            commands::auth::register,
            commands::auth::login,
            commands::auth::login_two_factor,
            commands::auth::logout,
            commands::auth::restore_session,
            commands::auth::current_session,
            commands::auth::verify_email,
            commands::auth::resend_verification,
            commands::auth::request_password_reset,
            commands::auth::reset_password,
            commands::auth::accept_invite,
            commands::auth::password_policy,
            commands::auth::password_strength,
            commands::auth::google_begin,
            commands::auth::google_poll,
            commands::auth::google_cancel,
            commands::auth::google_unlink,
            commands::auth::login_methods,
            commands::auth::forget_remembered_session,
            // Oma tili
            commands::account::account_profile,
            commands::account::update_preferences,
            commands::account::change_password,
            commands::account::change_email,
            commands::account::change_username,
            commands::account::two_factor_begin,
            commands::account::two_factor_enable,
            commands::account::two_factor_disable,
            commands::account::two_factor_recovery_codes,
            commands::account::two_factor_status,
            commands::account::account_sessions,
            commands::account::revoke_session,
            commands::account::revoke_other_sessions,
            commands::account::export_my_data,
            commands::account::delete_my_account,
            // Hallinta
            commands::admin::admin_stats,
            commands::admin::list_users,
            commands::admin::get_user,
            commands::admin::admin_create_user,
            commands::admin::set_user_role,
            commands::admin::set_user_status,
            commands::admin::set_user_lock,
            commands::admin::verify_user_email,
            commands::admin::admin_send_verification,
            commands::admin::admin_reset_password,
            commands::admin::force_password_change,
            commands::admin::revoke_user_sessions,
            commands::admin::delete_user,
            commands::admin::list_permissions,
            commands::admin::set_user_permission,
            commands::admin::audit_list,
            commands::admin::audit_export,
            commands::admin::audit_prune,
            commands::admin::email_status,
            commands::admin::email_configure,
            commands::admin::email_clear_key,
            commands::admin::email_test,
            commands::admin::discord_status,
            commands::admin::discord_configure,
            commands::admin::discord_clear,
            commands::admin::discord_test,
            commands::admin::google_status,
            commands::admin::google_configure,
            commands::admin::google_clear,
            commands::admin::get_settings,
            commands::admin::set_setting,
            commands::admin::system_info,
            commands::admin::backup_list,
            commands::admin::backup_create,
            commands::admin::backup_restore,
            commands::admin::database_stats,
            // Työkalut
            commands::tools::tool_state_get,
            commands::tools::tool_state_set,
            commands::tools::tool_state_delete,
            commands::tools::tool_state_all,
            commands::tools::tool_used,
            commands::tools::tool_set_favorite,
            commands::tools::tool_usage,
            commands::tools::tool_usage_clear,
            // Järjestelmä
            commands::system::app_ready,
            commands::system::window_minimize_to_tray,
            commands::system::open_data_folder,
            commands::system::notifications_list,
            commands::system::notifications_mark_read,
            commands::system::check_updates,
            commands::system::set_autostart,
            commands::system::autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("MettisToolin käynnistys epäonnistui");
}
