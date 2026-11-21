#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const BLENDER_CANDIDATES = [
  process.env.BLENDER_PATH,
  "D:\\Apps\\Blender\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
  "/Applications/Blender.app/Contents/MacOS/Blender",
  "blender"
].filter(Boolean);

function findBlenderExe() {
  for (const candidate of BLENDER_CANDIDATES) {
    if (candidate === "blender") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function runBlenderPython(pythonCode, timeoutMs = 120000) {
  const blenderExe = findBlenderExe();
  if (!blenderExe) {
    throw new Error("Blender executable not found. Set BLENDER_PATH environment variable.");
  }
  const tmpScript = path.join(os.tmpdir(), `uno_blender_mcp_${Date.now()}.py`);
  fs.writeFileSync(tmpScript, pythonCode, "utf8");
  try {
    const { stdout, stderr } = await execFileAsync(
      blenderExe,
      ["--background", "--python", tmpScript],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 10 }
    );
    return { blenderExe, stdout: stdout || "", stderr: stderr || "" };
  } finally {
    try { fs.unlinkSync(tmpScript); } catch {}
  }
}

const server = new McpServer({
  name: "uno-blender-mcp",
  version: "1.0.0"
});

// 1. blender_status
server.tool(
  "blender_status",
  "Check Blender installation, version, and available render engines (EEVEE / Cycles).",
  {},
  async () => {
    const exe = findBlenderExe();
    if (!exe) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Blender executable not found. Set BLENDER_PATH." }, null, 2) }]
      };
    }
    const { stdout } = await execFileAsync(exe, ["--version"], { timeout: 15000 });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          blenderPath: exe,
          version: stdout.trim().split("\n")[0],
          mode: "Headless Background (Zero-UI)"
        }, null, 2)
      }]
    };
  }
);

// 2. blender_run_python
server.tool(
  "blender_run_python",
  "Execute custom Blender Python (bpy) script in headless mode.",
  {
    code: z.string().describe("Python script using bpy to execute inside Blender"),
    timeoutMs: z.number().optional().default(120000).describe("Execution timeout in milliseconds")
  },
  async ({ code, timeoutMs }) => {
    const res = await runBlenderPython(code, timeoutMs);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          blenderPath: res.blenderExe,
          stdout: res.stdout.slice(-3000),
          stderr: res.stderr.slice(-1500)
        }, null, 2)
      }]
    };
  }
);

// 3. blender_create_studio_scene
server.tool(
  "blender_create_studio_scene",
  "Create a 3D studio scene with 3-point lighting, camera, optional 3D text or primitive object, and save .blend or render image.",
  {
    objectType: z.enum(["CUBE", "SPHERE", "TORUS", "TEXT"]).default("TEXT").describe("Main object type"),
    textContent: z.string().optional().default("U-NO 3D").describe("Text string if objectType is TEXT"),
    renderImagePath: z.string().optional().describe("Optional output PNG path to render immediately"),
    saveBlendPath: z.string().optional().describe("Optional output .blend file path"),
    engine: z.enum(["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"]).default("BLENDER_EEVEE_NEXT").describe("Render engine"),
    resolutionX: z.number().default(1080),
    resolutionY: z.number().default(1080)
  },
  async ({ objectType, textContent, renderImagePath, saveBlendPath, engine, resolutionX, resolutionY }) => {
    const safeText = (textContent || "U-NO 3D").replace(/"/g, '\\"');
    const py = `
import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "${engine}"
scene.render.resolution_x = ${resolutionX}
scene.render.resolution_y = ${resolutionY}

# World dark studio
world = bpy.data.worlds.new("StudioWorld")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.03, 0.035, 0.05, 1.0)
    bg.inputs[1].default_value = 1.0

# Create main object
obj_type = "${objectType}"
if obj_type == "CUBE":
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
elif obj_type == "SPHERE":
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.1, location=(0, 0, 1.1))
elif obj_type == "TORUS":
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.35, location=(0, 0, 1.0))
else:
    bpy.ops.object.text_add(location=(0, 0, 0.8), rotation=(math.radians(90), 0, 0))
    txt = bpy.context.active_object
    txt.data.body = "${safeText}"
    txt.data.align_x = 'CENTER'
    txt.data.extrude = 0.15
    txt.data.bevel_depth = 0.02

main_obj = bpy.context.active_object
mat = bpy.data.materials.new("HeroMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.15, 0.65, 1.0, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.7
    bsdf.inputs["Roughness"].default_value = 0.25
main_obj.data.materials.append(mat)

# 3-Point Lighting
def add_light(name, loc, energy, color=(1,1,1)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.active_object
    l.name = name
    l.data.energy = energy
    l.data.color = color
    l.data.size = 3.0
    direction = main_obj.location - l.location
    l.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

add_light("KeyLight", (4, -4, 5), 400, (1.0, 0.95, 0.9))
add_light("FillLight", (-4, -3, 3), 180, (0.6, 0.8, 1.0))
add_light("RimLight", (0, 4, 4), 300, (0.3, 0.7, 1.0))

# Camera
bpy.ops.object.camera_add(location=(0, -6.5, 2.2))
cam = bpy.context.active_object
direction = main_obj.location - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam

${saveBlendPath ? `bpy.ops.wm.save_as_mainfile(filepath=r"${saveBlendPath}")` : ""}
${renderImagePath ? `scene.render.filepath = r"${renderImagePath}"\nbpy.ops.render.render(write_still=True)` : ""}
print("STUDIO_SCENE_READY")
`;
    const res = await runBlenderPython(py, 180000);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          objectType,
          saveBlendPath: saveBlendPath || null,
          renderImagePath: renderImagePath || null,
          stdoutTail: res.stdout.trim().split("\n").slice(-5)
        }, null, 2)
      }]
    };
  }
);

// 4. blender_render_turntable
server.tool(
  "blender_render_turntable",
  "Render a 360-degree turntable MP4 video of a .blend or 3D model (.glb/.gltf/.obj/.fbx).",
  {
    inputPath: z.string().describe("Path to .blend, .glb, .gltf, .obj, or .fbx file"),
    outputMp4Path: z.string().describe("Output MP4 file path"),
    frames: z.number().default(72).describe("Total frames for 360 rotation (72 frames @ 24fps = 3 sec)"),
    fps: z.number().default(24),
    resolutionX: z.number().default(1080),
    resolutionY: z.number().default(1920)
  },
  async ({ inputPath, outputMp4Path, frames, fps, resolutionX, resolutionY }) => {
    const ext = path.extname(inputPath).toLowerCase();
    let loadSnippet = "";
    if (ext === ".blend") {
      loadSnippet = `bpy.ops.wm.open_mainfile(filepath=r"${inputPath}")`;
    } else if (ext === ".glb" || ext === ".gltf") {
      loadSnippet = `bpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.import_scene.gltf(filepath=r"${inputPath}")`;
    } else if (ext === ".obj") {
      loadSnippet = `bpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.wm.obj_import(filepath=r"${inputPath}")`;
    } else if (ext === ".fbx") {
      loadSnippet = `bpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.import_scene.fbx(filepath=r"${inputPath}")`;
    } else {
      throw new Error(`Unsupported 3D file extension: ${ext}`);
    }

    const py = `
import bpy, math
${loadSnippet}
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = ${frames}
scene.render.fps = ${fps}
scene.render.resolution_x = ${resolutionX}
scene.render.resolution_y = ${resolutionY}
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.filepath = r"${outputMp4Path}"

# Pivot empty for 360 rotation
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
pivot = bpy.context.active_object
if not scene.camera:
    bpy.ops.object.camera_add(location=(0, -6, 2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(75), 0, 0)
    scene.camera = cam
else:
    cam = scene.camera
cam.parent = pivot

pivot.rotation_euler = (0, 0, 0)
pivot.keyframe_insert(data_path="rotation_euler", frame=1)
pivot.rotation_euler = (0, 0, math.radians(360))
pivot.keyframe_insert(data_path="rotation_euler", frame=${frames} + 1)

bpy.ops.render.render(animation=True)
print("TURNTABLE_RENDER_DONE")
`;
    const res = await runBlenderPython(py, 300000);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: true,
          outputMp4Path,
          frames,
          fps,
          stdoutTail: res.stdout.trim().split("\n").slice(-5)
        }, null, 2)
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
