use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Find the node binary by checking common installation paths
fn find_node_binary() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = vec![
        "/opt/homebrew/bin/node".to_string(),
        "/usr/local/bin/node".to_string(),
        format!("{}/.nvm/current/bin/node", home),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    let output = Command::new("/usr/bin/which")
        .arg("node")
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    Err("Node.js not found. Install Node.js to use the agent sidecar.".to_string())
}

/// Find the claude binary (kept for check_claude_installed)
fn find_claude_binary() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = vec![
        format!("{}/.local/bin/claude", home),
        format!("{}/.cargo/bin/claude", home),
        "/usr/local/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    let output = Command::new("/usr/bin/which")
        .arg("claude")
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    Err("Claude CLI not found. Install it from https://claude.com/claude-code".to_string())
}

/// Resolve the sidecar script path (dev: relative to Cargo manifest)
fn find_sidecar_script() -> Result<String, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let sidecar_path = std::path::Path::new(manifest_dir)
        .join("../sidecar/dist/agent-bridge.js");

    if sidecar_path.exists() {
        Ok(sidecar_path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve sidecar path: {}", e))?
            .to_string_lossy()
            .to_string())
    } else {
        Err(format!(
            "Sidecar script not found at {:?}. Run `npm run build` in sidecar/.",
            sidecar_path
        ))
    }
}

/// Build the user's shell PATH by sourcing their profile
fn get_shell_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();

    let output = Command::new("/bin/zsh")
        .args(["-l", "-c", "echo $PATH"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }

    format!(
        "{}/.local/bin:{}/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        home, home
    )
}

// Track active agent process
static AGENT_PID: Mutex<Option<u32>> = Mutex::new(None);
static AGENT_STDIN: Mutex<Option<ChildStdin>> = Mutex::new(None);

#[tauri::command]
pub fn run_agent(
    app: AppHandle,
    prompt: String,
    cwd: String,
    session_id: Option<String>,
    permission_mode: Option<String>,
) -> Result<(), String> {
    let node_path = find_node_binary()?;
    let sidecar_path = find_sidecar_script()?;
    let shell_path = get_shell_path();

    std::thread::spawn(move || {
        let result = Command::new(&node_path)
            .arg(&sidecar_path)
            .current_dir(&cwd)
            .env("PATH", &shell_path)
            // Prevent "nested session" detection when launched from a Claude Code terminal
            .env_remove("CLAUDECODE")
            .env_remove("CLAUDE_CODE_ENTRY_POINT")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match result {
            Ok(child) => child,
            Err(e) => {
                let _ = app.emit("agent-error", format!("Failed to start sidecar: {}", e));
                let _ = app.emit("agent-done", ());
                return;
            }
        };

        let pid = child.id();
        *AGENT_PID.lock().unwrap() = Some(pid);

        // Take stdin and store it globally for send_to_agent
        let mut stdin = child.stdin.take().unwrap();

        // Send the start command
        let start_cmd = serde_json::json!({
            "type": "start",
            "prompt": prompt,
            "cwd": cwd,
            "sessionId": session_id,
            "permissionMode": permission_mode.unwrap_or_else(|| "default".to_string()),
        });

        if let Err(e) = writeln!(stdin, "{}", start_cmd) {
            let _ = app.emit("agent-error", format!("Failed to send start command: {}", e));
            let _ = app.emit("agent-done", ());
            return;
        }
        let _ = stdin.flush();

        // Store stdin globally so send_to_agent can use it
        *AGENT_STDIN.lock().unwrap() = Some(stdin);

        // Read stderr on a separate thread
        let stderr_handle = {
            let app_clone = app.clone();
            let stderr = child.stderr.take();
            std::thread::spawn(move || {
                if let Some(stderr) = stderr {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(text) = line {
                            if !text.trim().is_empty() {
                                let _ = app_clone.emit("agent-stderr", &text);
                            }
                        }
                    }
                }
            })
        };

        // Stream stdout — each line is a JSON event from the sidecar
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        if !text.trim().is_empty() {
                            let _ = app.emit("agent-event", &text);
                        }
                    }
                    Err(_) => break,
                }
            }
        }

        let _ = stderr_handle.join();
        let _ = child.wait();

        *AGENT_PID.lock().unwrap() = None;
        *AGENT_STDIN.lock().unwrap() = None;
        let _ = app.emit("agent-done", ());
    });

    Ok(())
}

/// Send a JSON message to the active sidecar's stdin
/// Used for permission_response, ask_user_response
#[tauri::command]
pub fn send_to_agent(message: String) -> Result<(), String> {
    let mut guard = AGENT_STDIN.lock().unwrap();
    match guard.as_mut() {
        Some(stdin) => {
            writeln!(stdin, "{}", message).map_err(|e| format!("Write error: {}", e))?;
            stdin.flush().map_err(|e| format!("Flush error: {}", e))?;
            Ok(())
        }
        None => Err("No active agent".to_string()),
    }
}

#[tauri::command]
pub fn abort_agent() -> Result<(), String> {
    // Send abort command via stdin first (graceful)
    {
        let mut guard = AGENT_STDIN.lock().unwrap();
        if let Some(ref mut stdin) = *guard {
            let _ = writeln!(stdin, r#"{{"type":"abort"}}"#);
            let _ = stdin.flush();
        }
    }

    // SIGTERM as backup
    if let Some(pid) = AGENT_PID.lock().unwrap().take() {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn check_claude_installed() -> Result<String, String> {
    find_claude_binary()
}

#[tauri::command]
pub fn run_shell(
    app: AppHandle,
    command: String,
    cwd: String,
) -> Result<(), String> {
    let shell_path = get_shell_path();

    std::thread::spawn(move || {
        let result = Command::new("/bin/zsh")
            .args(["-l", "-c", &command])
            .current_dir(&cwd)
            .env("PATH", &shell_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match result {
            Ok(child) => child,
            Err(e) => {
                let _ = app.emit("shell-output", format!("Error: {}", e));
                let _ = app.emit("shell-done", ());
                return;
            }
        };

        let stderr_handle = {
            let app_clone = app.clone();
            let stderr = child.stderr.take();
            std::thread::spawn(move || {
                if let Some(stderr) = stderr {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(text) = line {
                            let _ = app_clone.emit("shell-output", &text);
                        }
                    }
                }
            })
        };

        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(text) = line {
                    let _ = app.emit("shell-output", &text);
                }
            }
        }

        let _ = stderr_handle.join();
        let _ = child.wait();
        let _ = app.emit("shell-done", ());
    });

    Ok(())
}
