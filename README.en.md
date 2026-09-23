<div align="center">

<img src="assets/logo.png" width="128" height="128" alt="MettisTool">

# MettisTool

**Professional Utility Suite**

221 tools · 13 modules · 12 languages · everything stays on your machine

[![Version](https://img.shields.io/badge/version-1.0.0-E8323C?style=for-the-badge&labelColor=12151B)](https://github.com/santsi0/MettisTool-desktop/releases/latest)
[![Platforms](https://img.shields.io/badge/Windows%20·%20macOS%20·%20Linux-E8EAF0?style=for-the-badge&labelColor=12151B)](#download)
[![License](https://img.shields.io/badge/license-MIT-7F8592?style=for-the-badge&labelColor=12151B)](LICENSE)

[![Build](https://github.com/santsi0/MettisTool-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/santsi0/MettisTool-desktop/actions/workflows/build.yml)

[Suomi](README.md) · **English**

</div>

---

An installable desktop application that puts more than two hundred everyday tools
behind a single search box — calculators, converters, hashes, text utilities,
network math and developer helpers. It ships with real user management, roles, a
complete audit log and an admin panel.

Data lives in a local SQLite database on your own machine. Nothing is sent over
the network unless an individual tool genuinely needs it — and when it does, it
says so.

> The tool names and the text inside each tool are in Finnish. Everything else —
> sign-in, the app shell, account, settings and the admin panel — follows the
> language you pick, in any of 12 languages.

---

## Download

| Operating system | File | Notes |
| --- | --- | --- |
| **Windows** 10 (1809) or newer, 64-bit | [MettisTool-Setup.exe](https://github.com/santsi0/MettisTool-desktop/releases/latest/download/MettisTool-Setup.exe) | Per-user install, no administrator rights needed |
| **macOS** 10.15 or newer | [MettisTool.dmg](https://github.com/santsi0/MettisTool-desktop/releases/latest/download/MettisTool.dmg) | Universal — Apple Silicon and Intel |
| **Linux** any distribution | [MettisTool.AppImage](https://github.com/santsi0/MettisTool-desktop/releases/latest/download/MettisTool.AppImage) | `chmod +x` and run |
| **Debian · Ubuntu** | [MettisTool.deb](https://github.com/santsi0/MettisTool-desktop/releases/latest/download/MettisTool.deb) | `sudo apt install ./MettisTool.deb` |

### The app is not code-signed

A certificate costs hundreds of euros a year and there isn't one here. Your
operating system will point that out the first time:

| | What you see | What you do |
| --- | --- | --- |
| **Windows** | SmartScreen warning | *More info → Run anyway* |
| **macOS** | "Developer cannot be verified" | In Finder, *Ctrl-click → Open*, or run `xattr -cr /Applications/MettisTool.app` |
| **Linux** | nothing | `chmod +x MettisTool.AppImage` |

If you would rather not trust a binary, [build it yourself](#building-it-yourself)
from source.

---

## First launch

The app asks you to create an **owner account (OWNER)**.

- The owner account can be created **only** at this point. After that, only
  another owner can grant the role — not by registering, and not by an admin.
- The owner sees the whole admin panel and can create other users.

Other users can register themselves if registration is enabled, or an admin can
create the account and send an invitation.

---

## Tools

| Module | Examples |
| --- | --- |
| **Calculators** | percentages, loans, VAT, unit conversions, statistics |
| **Developer** | JSON, Base64, JWT, regex, UUID, cron, diff |
| **Text** | transforms, analysis, cleanup, word count |
| **Images** | compression, conversion, cropping, EXIF, colour picking |
| **Files** | hashes, conversions, inspection |
| **Security** | passwords, hashes, TOTP, breach check |
| **Web** | URL, DNS, headers, robots.txt, sitemap |
| **Design** | colours, gradients, shadows, CSS |
| **Data** | CSV, JSON, tables, statistics |
| **Time** | time zones, timers, dates |
| **Productivity** | notes, tasks, pomodoro |
| **Network** | IP, ports, subnets, number bases |
| **Engineering** | physics, electricity, mechanics |

The tools run **entirely locally**. Four of them optionally call a public API —
exchange rates, DNS lookup, your own IP address, and a password breach check using
k-anonymity. Those state their network requirement clearly, and the other 217 work
offline.

---

## Features

### User management

- Email and password, optional **Google sign-in**
- **Two-factor authentication** (TOTP) with recovery codes
- Roles **USER · MODERATOR · ADMIN · OWNER** plus 12 fine-grained permissions
- Session management: see your own sessions and revoke them
- Password reset and email verification with single-use codes

### Admin panel

An overview with statistics and 14-day charts, user management, admin accounts,
security settings, an audit log with search and CSV export, email settings,
Discord logging, system information and backups.

### Everything else

- Themes: dark, darker, light or follow the system — and five accent colours
- 12 interface languages
- Tray icon, launch at login, notifications
- Update check against GitHub Releases — never an automatic install

---

## Security

| Area | Implementation |
| --- | --- |
| **Passwords** | Argon2id (m = 19 MiB, t = 2, p = 1) with a random salt. Never in plaintext, never logged, never sent to Discord. |
| **Sign-in** | Constant-time comparison, dummy verification for unknown accounts, attempt limiting and account lockout. |
| **Sessions** | The token is generated randomly and stored as a **SHA-256 hash**. The raw token never crosses IPC to the frontend. |
| **"Remember me"** | A long-lived token lives only in the operating system's encrypted credential store. |
| **Codes** | Verification, reset and invite codes are cryptographically random, single-use, expiring, and hashed in the database. |
| **2FA** | TOTP (RFC 6238). The secret sits in the credential store; recovery codes are Argon2 hashes. |
| **Secrets** | The Resend key, Google credentials and Discord webhook live only in the credential store. The UI shows a masked form only. |
| **Permissions** | Always enforced in the service layer. OWNER cannot be obtained by registering; only an owner can grant it. The last owner cannot be removed. |
| **Database** | Every query is parameterised. No string concatenation into SQL. |
| **Auditing** | Every security and administrative event is recorded. Passwords, hashes, tokens and keys are filtered out automatically. |
| **Discord** | Optional and asynchronous. The message passes through the same filter — secrets are never sent. |
| **Network** | The content security policy allows four named endpoints. Everything else is blocked at the engine level. |
| **Google** | Authorization Code + PKCE with a local loopback callback. **The app never asks for or stores a Google password.** |

**The governing principle:** the interface makes no security decisions. The
frontend shows and hides things for usability, but every command re-checks the
session, role, account status and permissions against the database on the Rust
side. Manipulating the frontend grants nothing.

If you find a security issue, open an Issue — please do not attach real
credentials or log files.

---

## Secrets in the OS credential store

| Platform | Store |
| --- | --- |
| Windows | Credential Manager (DPAPI-protected) |
| macOS | Keychain |
| Linux | Secret Service — GNOME Keyring or KWallet |

> **Linux:** if your desktop has no Secret Service, secrets cannot be stored. The
> app still works; "remember me" and API keys simply will not survive a restart.
> Most desktop distributions ship one.

---

## Email, Google and Discord

All three are **optional**. Without them the app works fully, but:

- without email, verification and reset codes cannot be sent
  (an admin can verify the account and set a password manually),
- without Google credentials, Google sign-in does not appear on the sign-in screen,
- without a webhook, Discord logging is off.

You configure them inside the app: **Admin → Email / Security / Discord**. The
values go into the credential store. `.env.example` documents the alternative
environment variables for development.

### Codes by email, not links

A desktop app has no server for a browser to return to. That is why verification,
reset and invite messages contain a **code** you type into the app. The code is
single-use and expires.

---

## Where your data lives

| Platform | Folder |
| --- | --- |
| Windows | `%APPDATA%\fi.mettistool.desktop\` |
| macOS | `~/Library/Application Support/fi.mettistool.desktop/` |
| Linux | `~/.local/share/fi.mettistool.desktop/` |

You can open it straight from the app: **Settings → Data folder → Open data folder**.

- An automatic backup runs at most once a day at startup. You can turn it off in
  the admin panel.
- Manual backups live under **Admin → System**.
- Restoring is an owner-only action. A safety copy of the current data is taken
  automatically before a restore.
- Uninstalling does not delete the database. Remove the folder by hand if you want
  everything gone.

---

## Building it yourself

### Option 1 — GitHub Actions (recommended)

The repository ships a workflow that builds all three platforms and requires
nothing installed on your side.

1. Push the code to your own repository. The workflow is
   `.github/workflows/build.yml`. If you received the project without the
   `.github` folder, create it and copy the contents of `build-workflow.yml.txt`.
2. Open **Actions → Rakenna sovellus → Run workflow**.
3. After roughly 15–25 minutes the installers are under *Artifacts*. Artifacts
   expire in 30 days and always download as a zip — that is GitHub's behaviour,
   not something the workflow controls.

Pushing a version tag publishes the installers to the Releases page, where they
download as-is:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Option 2 — your own machine

You need [Node.js 20+](https://nodejs.org/) and [Rust](https://rustup.rs/), plus
the platform toolchain:

| Platform | Also required |
| --- | --- |
| Windows | [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with the *Desktop development with C++* workload; WebView2 (built into Windows 11) |
| macOS | Xcode Command Line Tools: `xcode-select --install` |
| Linux | `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libdbus-1-dev libssl-dev patchelf build-essential` |

```bash
npm install
npm run start        # development mode with hot reload
npm run build:app    # builds an installer for your own platform
```

The finished package lands in `src-tauri/target/release/bundle/`.

Other commands:

```bash
npm run typecheck    # TypeScript check
cargo fmt --check    # Rust formatting (inside src-tauri)
cargo clippy         # Rust lint
```

---

## Architecture

```
MettisTool
├── src/                 React 18 + TypeScript 5.7 + Vite 6
│   ├── api/             typed IPC layer (mirrors the Rust commands 1:1)
│   ├── i18n/            translation system + 12 language files
│   ├── screens/         sign-in, home, account, settings, admin
│   ├── shell/           top bar, sidebar, app shell
│   ├── state/           session, theme, routing, toasts, tools
│   ├── tools/           tool engine loading and types
│   └── ui/              interface primitives and icons
├── public/tools/        the tool engine and 221 tools (vanilla JS)
└── src-tauri/           Rust backend, 88 IPC commands
    ├── nsis/            Finnish strings for the Windows installer
    ├── src/auth/        passwords, sessions, tokens, TOTP, OAuth, rate limits
    ├── src/commands/    IPC commands
    ├── src/db/          SQLite, migrations, models
    └── src/*.rs         RBAC, auditing, email, Discord, backups
```

The tool engine is a separate layer: it gets its own storage only (the
`tool_state` table, per user) and never sees the session, tokens or secrets.

---

## Troubleshooting

<details>
<summary><strong>The app will not start, or the window stays black</strong></summary>

**Windows:** WebView2 is missing. Install it from Microsoft (*Evergreen Standalone Installer*).
**Linux:** `libwebkit2gtk-4.1` is missing. Install it from your package manager.
</details>

<details>
<summary><strong>I forgot the owner password and email is not configured</strong></summary>

Close the app, move the database (`mettistool.db`) out of the data folder above,
and start the app again — first-run setup begins from scratch. Your old data
stays in the file you moved.
</details>

<details>
<summary><strong>Emails are not being sent</strong></summary>

Check **Admin → Email**: the API key, the sender address (the domain must be
verified in Resend), and the last error message.
</details>

<details>
<summary><strong>Google sign-in fails</strong></summary>

Make sure the OAuth client is of type *Desktop app*. The browser opens separately;
the app never asks for a Google password.
</details>

<details>
<summary><strong>I want to see what the app is doing</strong></summary>

Start it from a terminal with a log level:

```powershell
$env:METTISTOOL_LOG="debug"; .\MettisTool.exe        # Windows
```

```bash
METTISTOOL_LOG=debug ./MettisTool.AppImage           # Linux
METTISTOOL_LOG=debug /Applications/MettisTool.app/Contents/MacOS/MettisTool
```
</details>

---

## License

[MIT](LICENSE) © 2026 MettisTool

<div align="center">

Built with [Tauri](https://tauri.app), [React](https://react.dev) and [Rust](https://www.rust-lang.org).

</div>
