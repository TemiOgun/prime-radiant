# Prime Radiant

A desktop app that visualizes project architecture spatially and lets developers direct AI coding agents from that visual canvas.

## What It Does

**Open any project** and Prime Radiant scans the codebase, parses imports, classifies environment variables, and renders an interactive force-directed graph:

- **Module nodes** — directories with file counts, connected by weighted import edges
- **Service nodes** — external dependencies (databases, caches, auth providers, APIs) detected from `.env` files, color-coded by category
- **The Radiant** — an animated starburst that represents the AI agent. It moves to the file it's reading, pulses when it's thinking, glows when it's writing.
- **Drill-down** — double-click a module to see its files, color-coded by type. Escape to zoom back out.

Chat with the agent from the terminal panel. Prompts go to the Claude CLI running as a Rust subprocess. The Radiant moves through the architecture in real-time as the agent reads, writes, and thinks. When the agent modifies files, the scanner re-runs and the canvas updates.

## Philosophy

Visual-agent-first development. Instead of reading terminal output to understand what an agent is doing, you watch it move through your architecture. Built with multi-agent coordination as a first-class concern — multiple agents working across a codebase should be visible, directed, and comprehensible from a single spatial canvas.

## Architecture

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Frontend | React 19, TypeScript, Vite 7 |
| Canvas | PixiJS v8, pixi-viewport |
| Layout | d3-force |
| State | Zustand |
| Backend | Rust |
| Agent | Claude CLI subprocess |

## Getting Started

### Prerequisites

- **Node.js 22+**
- **Rust** (latest stable)
- **Claude CLI** installed and authenticated (for agent features)

### Development

```bash
npm install
npm run tauri:dev
```

### Build

```bash
npm run tauri:build
```
