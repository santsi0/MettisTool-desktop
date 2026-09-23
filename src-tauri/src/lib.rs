//! MettisTool — työpöytäsovelluksen taustalogiikka.
//!
//! Arkkitehtuuri: käyttöliittymä (React) ei sisällä yhtään turvallisuuspäätöstä.
//! Kaikki tunnistautuminen, oikeustarkistukset, tietokanta ja salaisuudet ovat
//! tässä Rust-kerroksessa, johon frontend pääsee vain määriteltyjen komentojen kautta.

pub mod cloud;
pub mod commands;
pub mod error;
pub mod secrets;
pub mod state;
pub mod supabase;
pub mod toolstore;
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
    let _ = log::set_logger(&LOGGER).map(|()| log::set_max_level(filter));
}

struct SimpleLogger;

// Staattinen instanssi: log::set_logger ei vaadi alloc-ominaisuutta eikä varaa muistia.
static LOGGER: SimpleLogger = SimpleLogger;

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
                let cloud = state.cloud.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = cloud.sign_out().await;
                });
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

    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
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

            // Paikallinen tietokanta sisältää vain työkalujen oman datan.
            // Tilit, roolit ja audit-loki ovat Supabasessa.
            let tools =
                toolstore::ToolStore::open(&data_dir.join("mettistool-tools.db")).map_err(|e| {
                    log::error!("työkalutietokantaa ei voitu avata: {e}");
                    std::io::Error::other("tietokantavirhe")
                })?;

            let cloud = cloud::Cloud::new().map_err(|e| {
                log::error!("pilviasiakasta ei voitu luoda: {e}");
                std::io::Error::other("verkkovirhe")
            })?;

            app.manage(AppState::new(cloud, tools));

            if let Err(e) = setup_tray(&handle) {
                log::warn!("ilmaisinalueen kuvaketta ei voitu alustaa: {e}");
            }

            log::info!("MettisTool {} kaynnistyi", util::app_version());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Sulkeminen piilottaa ikkunan ilmaisinalueelle; lopetus tapahtuu
                // ilmaisinalueen valikosta.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Tunnistautuminen
            commands::auth::app_status,
            commands::auth::register,
            commands::auth::verify_email,
            commands::auth::resend_verification,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::restore_session,
            commands::auth::current_session,
            commands::auth::forget_remembered_session,
            commands::auth::request_password_reset,
            commands::auth::reset_password,
            commands::auth::password_policy,
            commands::auth::password_strength,
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
            commands::system::check_updates,
            commands::system::set_autostart,
            commands::system::autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("MettisToolin käynnistys epäonnistui");
}
