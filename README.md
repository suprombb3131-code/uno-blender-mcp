# `uno-blender-mcp`

**High-Level Headless Blender MCP Server** by **U-NO AI Studio (Arun & ALISE)**

Control Blender via the **Model Context Protocol (MCP)** in **Headless Background Mode (`--background`)** — no need to keep the Blender GUI open! Built for AI agents (Claude Desktop, Cursor, Windsurf, ALISE, or any MCP client) to generate 3D studio scenes, render 360° turntable videos, and execute custom `bpy` Python scripts effortlessly.

---

## Why `uno-blender-mcp`?

Most existing Blender MCP servers require keeping a Blender UI window open and running a socket add-on, or only expose low-level mesh/axis primitives.

`uno-blender-mcp` is designed for **production-ready, zero-UI automation**:
- **Zero-UI Headless Execution**: Runs Blender directly in `--background` mode via `StdioServerTransport`.
- **High-Level Studio Presets**: Instantly spin up a dark studio environment with 3-point lighting, metallic materials, camera tracking, and 3D text/primitives in one tool call.
- **One-Shot 360° Turntable Video**: Import `.blend`, `.glb`, `.gltf`, `.obj`, or `.fbx` and render a vertical (`1080x1920`) or custom H.264 `.mp4` turntable video.
- **Full `bpy` Escape Hatch**: Run any custom Blender Python script when you need total control.
- **Cross-Platform Path Detection**: Auto-detects Blender on Windows (`D:\Apps\Blender`, `C:\Program Files\Blender Foundation\Blender 5.3 / 4.3 / 4.2`), macOS, and Linux `PATH`, or via `BLENDER_PATH`.

---

## Tools Included

| Tool | Description |
| :--- | :--- |
| `blender_status` | Check Blender executable path, version, and confirm headless mode readiness. |
| `blender_create_studio_scene` | Create a 3D studio scene (`CUBE`, `SPHERE`, `TORUS`, or `TEXT`) with 3-point area lighting, Principled BSDF material, camera, and optional `.blend` save / `.png` render (`BLENDER_EEVEE_NEXT`, `BLENDER_EEVEE`, `CYCLES`). |
| `blender_render_turntable` | Load `.blend`, `.glb`, `.gltf`, `.obj`, or `.fbx` and render a 360° camera-orbit `.mp4` (H.264) animation. |
| `blender_run_python` | Execute any custom Blender Python (`bpy`) script in headless background mode. |

---

## Requirements

- **Node.js** `>= 18`
- **Blender** `4.2+` / `4.3` / `5.3` installed on your machine

---

## Installation

```bash
git clone https://github.com/suprombb3131-code/uno-blender-mcp.git
cd uno-blender-mcp
npm install
```

Or run directly if installed globally / via `npx`:

```bash
npm start
```

---

## MCP Client Configuration

### Claude Desktop (`claude_desktop_config.json`) / Cursor / Windsurf

```json
{
  "mcpServers": {
    "uno-blender-mcp": {
      "command": "node",
      "args": ["D:/ALICE/uno-blender-mcp/index.mjs"],
      "env": {
        "BLENDER_PATH": "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe"
      }
    }
  }
}
```

> **Note:** `BLENDER_PATH` is optional if Blender is installed in one of the default locations or available in your system `PATH`.

---

## Example Prompts for AI Agents

- *"Check if Blender is ready using `blender_status`."*
- *"Create a 3D studio scene with the text `U-NO 3D` using `blender_create_studio_scene` and render it to `D:/renders/uno-logo.png`."*
- *"Render a 360-degree vertical turntable MP4 (`1080x1920`) of `D:/models/product.glb` to `D:/renders/product_360.mp4`."*
- *"Run a custom `bpy` script via `blender_run_python` to inspect all mesh objects in my scene."*

---

## License

MIT © [U-NO AI Studio](https://unoaistudio.com) (Arun & ALISE)
