use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub module_id: String,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceNode {
    pub id: String,
    pub name: String,
    pub label: String,
    pub category: String,
    pub env_vars: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleEdge {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceEdge {
    pub source: String,
    pub target: String,
    pub env_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGraph {
    pub modules: Vec<ModuleNode>,
    pub files_by_module: HashMap<String, Vec<FileNode>>,
    pub services: Vec<ServiceNode>,
    pub module_edges: Vec<ModuleEdge>,
    pub file_edges: Vec<FileEdge>,
    pub service_edges: Vec<ServiceEdge>,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", ".next", ".nuxt",
    ".svelte-kit", "target", "__pycache__", ".turbo", "coverage",
    ".primeradiant",
];

const CODE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
];

fn is_code_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| CODE_EXTENSIONS.contains(&e))
        .unwrap_or(false)
}

fn classify_file_type(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("route") || lower.contains("page") || lower.contains("endpoint") {
        "route".to_string()
    } else if lower.contains("hook") || lower.starts_with("use") {
        "hook".to_string()
    } else if lower.contains("component") || lower.ends_with(".tsx") && !lower.contains("page") {
        "component".to_string()
    } else if lower.contains("util") || lower.contains("helper") || lower.contains("lib") {
        "util".to_string()
    } else if lower.contains("model") || lower.contains("schema") || lower.contains("type") {
        "model".to_string()
    } else if lower.contains("config") || lower.contains("env") {
        "config".to_string()
    } else {
        "other".to_string()
    }
}

fn find_src_root(project_path: &Path) -> PathBuf {
    let src = project_path.join("src");
    if src.is_dir() {
        src
    } else {
        project_path.to_path_buf()
    }
}

fn discover_modules(src_root: &Path) -> Vec<(String, PathBuf)> {
    let mut modules = Vec::new();
    if let Ok(entries) = fs::read_dir(src_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !SKIP_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                    modules.push((name, path));
                }
            }
        }
    }
    modules.sort_by(|a, b| a.0.cmp(&b.0));
    modules
}

fn scan_files_in_module(module_path: &Path) -> Vec<PathBuf> {
    WalkDir::new(module_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_code_file(e.path()))
        .map(|e| e.path().to_path_buf())
        .collect()
}

fn extract_imports(content: &str) -> Vec<String> {
    let re = Regex::new(
        r#"(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))"#
    ).unwrap();

    re.captures_iter(content)
        .filter_map(|cap| {
            cap.get(1).or(cap.get(2)).map(|m| m.as_str().to_string())
        })
        .collect()
}

fn extract_env_references(content: &str) -> Vec<String> {
    let re = Regex::new(
        r#"(?:process\.env\.(\w+)|import\.meta\.env\.(\w+))"#
    ).unwrap();

    re.captures_iter(content)
        .filter_map(|cap| {
            cap.get(1).or(cap.get(2)).map(|m| m.as_str().to_string())
        })
        .collect()
}

fn resolve_import_to_module(
    import_path: &str,
    file_path: &Path,
    _src_root: &Path,
    modules: &[(String, PathBuf)],
) -> Option<String> {
    if import_path.starts_with('.') {
        // Relative import — resolve against the importing file's directory
        let dir = file_path.parent()?;
        let resolved = dir.join(import_path);
        // Normalize the path (resolve ../ etc.)
        let canonical = normalize_path(&resolved);
        // Check which module this resolved path falls into
        for (name, mod_path) in modules {
            if canonical.starts_with(mod_path) {
                return Some(name.clone());
            }
        }
        return None;
    }

    // Alias imports like @/auth/... or ~/auth/... or #/auth/...
    let cleaned = import_path
        .trim_start_matches("@/")
        .trim_start_matches("~/")
        .trim_start_matches("#/");

    // Also handle @components/... style (scoped but not path alias)
    let cleaned = if cleaned.starts_with('@') {
        // Could be a node_modules package — skip
        return None;
    } else {
        cleaned
    };

    let first_segment = cleaned.split('/').next()?;
    modules.iter()
        .find(|(name, _)| name == first_segment)
        .map(|(name, _)| name.clone())
}

/// Normalize a path by resolving `.` and `..` components without touching the filesystem
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => { components.pop(); },
            std::path::Component::CurDir => {},
            other => components.push(other),
        }
    }
    components.iter().collect()
}

// --- Env var classification ---

fn classify_env_var(name: &str, value: &str) -> (String, String) {
    // Layer 1: URL scheme
    if value.starts_with("postgres://") || value.starts_with("postgresql://") {
        return ("database".to_string(), "PostgreSQL".to_string());
    }
    if value.starts_with("mysql://") {
        return ("database".to_string(), "MySQL".to_string());
    }
    if value.starts_with("mongodb://") || value.starts_with("mongodb+srv://") {
        return ("database".to_string(), "MongoDB".to_string());
    }
    if value.starts_with("redis://") || value.starts_with("rediss://") {
        return ("cache".to_string(), "Redis".to_string());
    }
    if value.starts_with("amqp://") || value.starts_with("amqps://") {
        return ("queue".to_string(), "RabbitMQ".to_string());
    }
    if value.starts_with("smtp://") {
        return ("email".to_string(), "SMTP".to_string());
    }

    // Layer 2: Value patterns
    if value.starts_with("sk_live_") || value.starts_with("sk_test_") {
        return ("payments".to_string(), "Stripe".to_string());
    }
    if value.starts_with("pk_live_") || value.starts_with("pk_test_") {
        return ("payments".to_string(), "Stripe".to_string());
    }
    if value.starts_with("xoxb-") || value.starts_with("xoxp-") {
        return ("external_api".to_string(), "Slack".to_string());
    }
    if value.starts_with("ghp_") || value.starts_with("gho_") {
        return ("external_api".to_string(), "GitHub".to_string());
    }
    if value.starts_with("AKIA") {
        return ("storage".to_string(), "AWS".to_string());
    }

    // Layer 3: Key name heuristics
    let upper = name.to_uppercase();
    if upper.contains("DATABASE") || upper.contains("DB_") || upper.starts_with("DB_")
        || upper.contains("POSTGRES") || upper.contains("MYSQL") || upper.contains("MONGO")
        || upper.contains("SUPABASE_DB") {
        return ("database".to_string(), name.to_string());
    }
    if upper.contains("REDIS") || upper.contains("CACHE") {
        return ("cache".to_string(), name.to_string());
    }
    if upper.contains("STRIPE") {
        return ("payments".to_string(), "Stripe".to_string());
    }
    if upper.contains("SUPABASE") {
        return ("auth".to_string(), "Supabase".to_string());
    }
    if upper.contains("AUTH0") || upper.contains("CLERK") || upper.contains("NEXTAUTH") {
        return ("auth".to_string(), name.to_string());
    }
    if upper.contains("AWS") || upper.contains("S3") {
        return ("storage".to_string(), "AWS S3".to_string());
    }
    if upper.contains("SENTRY") {
        return ("monitoring".to_string(), "Sentry".to_string());
    }
    if upper.contains("DATADOG") {
        return ("monitoring".to_string(), "Datadog".to_string());
    }
    if upper.contains("SMTP") || upper.contains("SENDGRID") || upper.contains("MAILGUN")
        || upper.contains("RESEND") || upper.contains("EMAIL") {
        return ("email".to_string(), name.to_string());
    }
    if upper.contains("OPENAI") || upper.contains("ANTHROPIC") || upper.contains("CLAUDE") {
        return ("external_api".to_string(), name.to_string());
    }

    // Config vars (hidden from canvas)
    if upper == "PORT" || upper == "HOST" || upper == "NODE_ENV" || upper == "LOG_LEVEL"
        || upper == "TZ" || upper == "DEBUG" || upper.starts_with("NEXT_PUBLIC_") && !upper.contains("URL")
        && !upper.contains("KEY") {
        return ("config".to_string(), name.to_string());
    }

    // Unresolved
    ("unresolved".to_string(), name.to_string())
}

fn parse_env_file(path: &Path) -> Vec<(String, String)> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    content.lines()
        .filter(|line| !line.trim().starts_with('#') && line.contains('='))
        .filter_map(|line| {
            let mut parts = line.splitn(2, '=');
            let key = parts.next()?.trim().to_string();
            let value = parts.next().unwrap_or("").trim().trim_matches('"').trim_matches('\'').to_string();
            if key.is_empty() { None } else { Some((key, value)) }
        })
        .collect()
}

fn find_env_files(project_path: &Path) -> Vec<PathBuf> {
    let names = [".env", ".env.example", ".env.local", ".env.development", ".env.production"];
    names.iter()
        .map(|n| project_path.join(n))
        .filter(|p| p.exists())
        .collect()
}

pub fn scan(project_path: &str) -> ProjectGraph {
    let project = Path::new(project_path);
    let src_root = find_src_root(project);
    let modules_info = discover_modules(&src_root);

    let mut modules = Vec::new();
    let mut files_by_module: HashMap<String, Vec<FileNode>> = HashMap::new();
    let mut all_files: Vec<(String, PathBuf, String)> = Vec::new(); // (module_id, file_path, content)

    // Scan each module
    for (name, mod_path) in &modules_info {
        let mod_id = format!("mod-{}", name);
        let code_files = scan_files_in_module(mod_path);

        let file_nodes: Vec<FileNode> = code_files.iter()
            .map(|fp| {
                let fname = fp.file_name().unwrap_or_default().to_string_lossy().to_string();
                FileNode {
                    id: format!("file-{}", fp.display()),
                    name: fname.clone(),
                    path: fp.display().to_string(),
                    module_id: mod_id.clone(),
                    file_type: classify_file_type(&fname),
                }
            })
            .collect();

        modules.push(ModuleNode {
            id: mod_id.clone(),
            name: name.clone(),
            path: mod_path.display().to_string(),
            file_count: file_nodes.len() as u32,
        });

        // Read file contents for import analysis
        for fp in &code_files {
            if let Ok(content) = fs::read_to_string(fp) {
                all_files.push((mod_id.clone(), fp.clone(), content));
            }
        }

        files_by_module.insert(mod_id, file_nodes);
    }

    // Build module-level edges from imports
    let mut module_edge_counts: HashMap<(String, String), u32> = HashMap::new();
    let file_edges = Vec::new();

    for (mod_id, file_path, content) in &all_files {
        let imports = extract_imports(content);
        for imp in imports {
            if let Some(target_mod) = resolve_import_to_module(&imp, file_path, &src_root, &modules_info) {
                let target_mod_id = format!("mod-{}", target_mod);
                if &target_mod_id != mod_id {
                    *module_edge_counts
                        .entry((mod_id.clone(), target_mod_id))
                        .or_insert(0) += 1;
                }
            }
        }
    }

    let module_edges: Vec<ModuleEdge> = module_edge_counts
        .into_iter()
        .map(|((source, target), weight)| ModuleEdge { source, target, weight })
        .collect();

    // Parse env files and classify services
    let env_files = find_env_files(project);
    let mut env_vars: HashMap<String, String> = HashMap::new();
    for env_file in env_files {
        for (key, value) in parse_env_file(&env_file) {
            env_vars.entry(key).or_insert(value);
        }
    }

    // Load overrides
    let overrides_path = project.join(".primeradiant").join("integrations.json");
    let overrides: HashMap<String, (String, String)> = if overrides_path.exists() {
        fs::read_to_string(&overrides_path)
            .ok()
            .and_then(|content| serde_json::from_str::<HashMap<String, serde_json::Value>>(&content).ok())
            .map(|map| {
                map.into_iter()
                    .filter_map(|(key, val)| {
                        let obj = val.as_object()?;
                        let t = obj.get("type")?.as_str()?.to_string();
                        let l = obj.get("label")?.as_str()?.to_string();
                        Some((key, (t, l)))
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        HashMap::new()
    };

    // Group env vars by service
    let mut service_groups: HashMap<String, (String, String, Vec<String>)> = HashMap::new();
    for (key, value) in &env_vars {
        let (category, label) = if let Some((cat, lab)) = overrides.get(key) {
            (cat.clone(), lab.clone())
        } else {
            classify_env_var(key, value)
        };

        if category == "config" || category == "unresolved" {
            continue; // Skip config and unresolved for now
        }

        let group_key = format!("{}-{}", category, label);
        let entry = service_groups
            .entry(group_key)
            .or_insert_with(|| (category, label, Vec::new()));
        entry.2.push(key.clone());
    }

    let services: Vec<ServiceNode> = service_groups
        .into_iter()
        .map(|(_, (category, label, vars))| ServiceNode {
            id: format!("svc-{}", label.to_lowercase().replace(' ', "-")),
            name: vars.first().cloned().unwrap_or_default(),
            label,
            category,
            env_vars: vars,
        })
        .collect();

    // Find env var references in code → service edges
    let mut service_edges = Vec::new();
    let service_var_map: HashMap<&str, &str> = services.iter()
        .flat_map(|s| s.env_vars.iter().map(move |v| (v.as_str(), s.id.as_str())))
        .collect();

    for (mod_id, _, content) in &all_files {
        let refs = extract_env_references(content);
        let mut seen = HashSet::new();
        for env_ref in refs {
            if let Some(&svc_id) = service_var_map.get(env_ref.as_str()) {
                let key = format!("{}-{}-{}", mod_id, svc_id, env_ref);
                if seen.insert(key) {
                    service_edges.push(ServiceEdge {
                        source: mod_id.clone(),
                        target: svc_id.to_string(),
                        env_var: env_ref,
                    });
                }
            }
        }
    }

    ProjectGraph {
        modules,
        files_by_module,
        services,
        module_edges,
        file_edges,
        service_edges,
    }
}
