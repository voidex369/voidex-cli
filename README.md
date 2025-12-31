# 🏴‍☠️ VoidEx CLI

**VoidEx CLI** is a terminal-based Sovereign Agent designed for high-performance system interaction, security research, and autonomous task execution. Built with **React** and **Ink**, it provides a sleek, modern interface for orchestrating Large Language Models through OpenRouter.

![GitHub](https://img.shields.io/github/license/voidex369/voidex-cli)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green)
![React](https://img.shields.io/badge/UI-React%20Ink-blue)

---

## 🔥 Key Features

- **Sovereign Execution Engine**: An autonomous reasoning loop that analyzes, executes, and heals itself.
- **Unified Interface**: Modern terminal layout with real-time streaming and status spinners.
- **Extensive Toolbelt**: Native capabilities for Shell, File I/O, Web Fetching, and Knowledge persistence.
- **Smart Windowing**: Handles massive terminal outputs efficiently using a virtualized message window.
- **Non-TTY Optimization**: Clean logging for file redirection—no more visual loops or terminal artifacts in your `.txt` outputs.
- **Checkpoint System**: Save and resume entire AI sessions seamlessly.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 20.0.0 or higher.
- **npm**: Standard Node package manager.
- **OpenRouter API Key**: Get yours at [openrouter.ai/keys](https://openrouter.ai/keys).

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/voidex369/voidex-cli.git
   cd voidex-cli
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run the application**
   ```bash
   node dist/cli.js
   ```

---

## 🔑 Authentication

To start using the sovereign capabilities, you need to configure your OpenRouter API Key:

1. Launch the app: `node dist/cli.js`
2. Type `/auth` inside the application.
3. Paste your API key (it should look like `sk-or-v1-...`).
4. Press **Enter** to save securely to your local configuration.

---

## 🛠 Command Reference

The CLI support several interactive commands for configuration and management:

| Command | Description |
| :--- | :--- |
| `/help` | Display the comprehensive command menu. |
| `/auth` | Update your OpenRouter API Key. |
| `/model` | Toggle between available LLM models (includes Uncensored models). |
| `/stats` | View real-time system performance (CPU, RAM, Uptime). |
| `/tools` | List all available capabilities for the Sovereign Agent. |
| `/chat save [id]` | Export your current session timeline. |
| `/chat list` | View archived conversation checkpoints. |
| `/chat resume [id]` | Hot-load a previously saved session. |
| `/forget` | Reset the current conversation context. |
| `/exit` | Gracefully shut down the application. |

---

## 🧠 Sovereign Tool Matrix

The agent isn't just a chatbot; it's a system operator. Below are the tools it uses to interact with your environment:

| Tool | Capability |
| :--- | :--- |
| `run_shell_command` | Executes any bash/cmd command directly on your OS. |
| `read_file` / `write_file` | Precise file manipulation and analysis. |
| `glob` | Find files matching complex patterns recursively. |
| `search_file_content` | Native grep-like search across your project. |
| `web_fetch` | Scrape and analyze real-time data from the web. |
| `save_memory` | Permanently store learned info in the Sovereign Brain. |
| `delegate_to_agent` | Strategic sub-thinking for complex multi-step goals. |

---

## 🏗 Technology Stack

- **Framework**: [React](https://reactjs.org/) with [Ink](https://github.com/vadimdemedes/ink) for TUI components.
- **Validation**: [Zod](https://zod.dev/) for robust configuration schema.
- **API**: [OpenAI SDK](https://github.com/openai/openai-node) (Configured for OpenRouter).
- **Styling**: Pastel-rich color palettes with dynamic layout management.

---

## 🛡 Disclaimer

*VoidEx CLI is a powerful tool. Use it responsibly. The author is not responsible for any data loss or damage caused by autonomous commands executed in Sovereign mode.*

---

**Developed with ❤️ by [VoidEx](https://t.me/voidex369)**
