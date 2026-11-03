// src/main/mcp/servers/computerUseServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

// ============================================================================
// Custom Windows Native Interop Script Builder
// ============================================================================

const FLAME_INTEROP_HEADER = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ("FlameDesktopInterop" -as [type])) {
  $csharpCode = @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;

  public static class FlameDesktopInterop {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, IntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@
  Add-Type -TypeDefinition $csharpCode
}
`

async function runPowerShellBlock(scriptBody: string): Promise<string> {
  const fullScript = `${FLAME_INTEROP_HEADER}\n${scriptBody}`
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', fullScript],
    { timeout: 20000, maxBuffer: 15 * 1024 * 1024 }
  )
  return stdout.trim()
}

// Emergency Fail-Safe: If user slams cursor into top-left corner (X < 5, Y < 5), abort automation
async function verifyKillswitchNotTriggered(): Promise<void> {
  const posRaw = await runPowerShellBlock(`
    $p = [System.Windows.Forms.Cursor]::Position
    Write-Output "$($p.X),$($p.Y)"
  `)
  const [curX, curY] = posRaw.split(',').map((n) => parseInt(n.trim(), 10))
  if (curX <= 4 && curY <= 4) {
    throw new Error(
      'Killswitch Triggered: Mouse cursor detected in top-left corner (0,0). Aborting Computer Use action.'
    )
  }
}

// ============================================================================
// Desktop Operations (Screen Capture, Pointer, Keyboard, Window Focus)
// ============================================================================

async function captureDesktopSnapshot(): Promise<{
  base64Jpeg: string
  filePath: string
  width: number
  height: number
  cursorX: number
  cursorY: number
  activeWindow: string
}> {
  const outPath = path.join(os.tmpdir(), `flame_vision_${Date.now()}.jpg`)
  const safeOutPath = outPath.replace(/\\/g, '\\\\')

  const psCapture = `
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 75L)
    $bmp.Save("${safeOutPath}", $jpegCodec, $encParams)

    $gfx.Dispose()
    $bmp.Dispose()

    $cursor = [System.Windows.Forms.Cursor]::Position
    $hwnd = [FlameDesktopInterop]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 256
    [void][FlameDesktopInterop]::GetWindowText($hwnd, $sb, 256)

    $meta = @{
      width = $bounds.Width
      height = $bounds.Height
      cursorX = $cursor.X
      cursorY = $cursor.Y
      activeWindow = $sb.ToString()
    }
    $meta | ConvertTo-Json -Compress
  `

  const rawJson = await runPowerShellBlock(psCapture)
  const meta = JSON.parse(rawJson)
  const imgBuffer = await fs.readFile(outPath)

  return {
    base64Jpeg: imgBuffer.toString('base64'),
    filePath: outPath,
    width: meta.width,
    height: meta.height,
    cursorX: meta.cursorX,
    cursorY: meta.cursorY,
    activeWindow: meta.activeWindow || 'Desktop'
  }
}

async function executePointerCommand(params: {
  mode: 'left_click' | 'right_click' | 'double_click' | 'move' | 'drag' | 'scroll'
  x: number
  y: number
  destX?: number
  destY?: number
  scrollTicks?: number
}): Promise<string> {
  await verifyKillswitchNotTriggered()

  const targetX = Math.max(5, Math.round(params.x))
  const targetY = Math.max(5, Math.round(params.y))
  const endX = params.destX !== undefined ? Math.max(5, Math.round(params.destX)) : targetX
  const endY = params.destY !== undefined ? Math.max(5, Math.round(params.destY)) : targetY
  const wheelDelta = (params.scrollTicks || -3) * 120

  const psPointer = `
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY})
    Start-Sleep -Milliseconds 60

    $mode = "${params.mode}"
    if ($mode -eq "left_click") {
      [FlameDesktopInterop]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
      Start-Sleep -Milliseconds 45
      [FlameDesktopInterop]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    }
    elseif ($mode -eq "double_click") {
      for ($i = 0; $i -lt 2; $i++) {
        [FlameDesktopInterop]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 35
        [FlameDesktopInterop]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 55
      }
    }
    elseif ($mode -eq "right_click") {
      [FlameDesktopInterop]::mouse_event(0x0008, 0, 0, 0, [IntPtr]::Zero)
      Start-Sleep -Milliseconds 45
      [FlameDesktopInterop]::mouse_event(0x0010, 0, 0, 0, [IntPtr]::Zero)
    }
    elseif ($mode -eq "drag") {
      [FlameDesktopInterop]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
      Start-Sleep -Milliseconds 80
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${endX}, ${endY})
      Start-Sleep -Milliseconds 80
      [FlameDesktopInterop]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    }
    elseif ($mode -eq "scroll") {
      [FlameDesktopInterop]::mouse_event(0x0800, 0, 0, ${wheelDelta}, [IntPtr]::Zero)
    }
  `

  await runPowerShellBlock(psPointer)
  return `Pointer ${params.mode} executed at (${targetX}, ${targetY}).`
}

function escapeLiteralForSendKeys(raw: string): string {
  return raw.replace(/([+^%~(){}[\]])/g, '{$1}')
}

const HOTKEY_MAP: Record<string, string> = {
  ENTER: '{ENTER}',
  TAB: '{TAB}',
  ESC: '{ESC}',
  ESCAPE: '{ESC}',
  BACKSPACE: '{BACKSPACE}',
  DELETE: '{DELETE}',
  UP: '{UP}',
  DOWN: '{DOWN}',
  LEFT: '{LEFT}',
  RIGHT: '{RIGHT}',
  SPACE: ' ',
  'CTRL+C': '^c',
  'CTRL+V': '^v',
  'CTRL+A': '^a',
  'CTRL+S': '^s',
  'CTRL+Z': '^z',
  'CTRL+SHIFT+ESC': '^+{ESC}',
  'ALT+TAB': '%{TAB}',
  'ALT+F4': '%{F4}',
  F11: '{F11}'
}

async function executeKeyboardInput(text: string, mode: 'literal' | 'hotkey', pressEnterAfter = false): Promise<string> {
  await verifyKillswitchNotTriggered()

  let sequence = ''
  if (mode === 'hotkey') {
    const upper = text.trim().toUpperCase()
    sequence = HOTKEY_MAP[upper] || text
  } else {
    sequence = escapeLiteralForSendKeys(text)
    if (pressEnterAfter) sequence += '{ENTER}'
  }

  const encodedB64 = Buffer.from(sequence, 'utf16le').toString('base64')
  const psKeys = `
    $seq = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String("${encodedB64}"))
    [System.Windows.Forms.SendKeys]::SendWait($seq)
  `
  await runPowerShellBlock(psKeys)
  return `Keyboard ${mode} input dispatched (${text}).`
}

async function focusOrListWindows(action: 'list' | 'focus', titleQuery?: string): Promise<string> {
  if (action === 'list') {
    const out = await runPowerShellBlock(`
      Get-Process | Where-Object { $_.MainWindowTitle -ne "" } |
        Select-Object Id, ProcessName, MainWindowTitle |
        ConvertTo-Json -Compress
    `)
    return out || '[]'
  }

  const safeQuery = (titleQuery || '').replace(/"/g, '')
  const out = await runPowerShellBlock(`
    $proc = Get-Process | Where-Object {
      $_.MainWindowTitle -like "*${safeQuery}*" -or $_.ProcessName -like "*${safeQuery}*"
    } | Select-Object -First 1

    if ($null -ne $proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
      [void][FlameDesktopInterop]::SetForegroundWindow($proc.MainWindowHandle)
      Write-Output "Focused window: $($proc.MainWindowTitle) (PID $($proc.Id))"
    } else {
      Write-Output "No visible window matched query: ${safeQuery}"
    }
  `)
  return out
}

// ============================================================================
// MCP Server Registration
// ============================================================================

const server = new Server(
  { name: 'flame-computer-use-mcp', version: '2.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'computer.capture_screen',
      description:
        'Capture a compressed JPEG screenshot of the primary Windows display along with screen resolution, cursor position, and active window title.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'computer.pointer_action',
      description:
        'Move the mouse cursor and perform left_click, right_click, double_click, drag, or scroll wheel actions at pixel coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['left_click', 'right_click', 'double_click', 'move', 'drag', 'scroll'],
            description: 'Mouse interaction type'
          },
          x: { type: 'number', description: 'Target X pixel coordinate' },
          y: { type: 'number', description: 'Target Y pixel coordinate' },
          destX: { type: 'number', description: 'Destination X coordinate when mode is drag' },
          destY: { type: 'number', description: 'Destination Y coordinate when mode is drag' },
          scrollTicks: {
            type: 'number',
            description: 'Scroll ticks (negative scrolls down, positive scrolls up)'
          }
        },
        required: ['mode', 'x', 'y']
      }
    },
    {
      name: 'computer.keyboard_input',
      description:
        'Type literal text into the focused UI element or trigger system hotkeys (e.g., ENTER, CTRL+C, ALT+TAB, ESC).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Literal text to type or hotkey name (e.g. CTRL+V, ENTER)' },
          mode: {
            type: 'string',
            enum: ['literal', 'hotkey'],
            description: 'Use literal for typing sentences, or hotkey for shortcuts'
          },
          pressEnterAfter: {
            type: 'boolean',
            description: 'Automatically press Enter after typing literal text'
          }
        },
        required: ['text', 'mode']
      }
    },
    {
      name: 'computer.window_control',
      description: 'List all open desktop windows with titles, or bring a specific app window to the foreground.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'focus'] },
          titleQuery: {
            type: 'string',
            description: 'Window title or process name to focus (e.g., Minecraft, Chrome, Code)'
          }
        },
        required: ['action']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'computer.capture_screen') {
    const snap = await captureDesktopSnapshot()
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              resolution: { width: snap.width, height: snap.height },
              cursor: { x: snap.cursorX, y: snap.cursorY },
              activeWindow: snap.activeWindow,
              savedFile: snap.filePath
            },
            null,
            2
          )
        },
        {
          type: 'image',
          data: snap.base64Jpeg,
          mimeType: 'image/jpeg'
        }
      ]
    }
  }

  if (name === 'computer.pointer_action') {
    const status = await executePointerCommand({
      mode: (args.mode as any) || 'left_click',
      x: Number(args.x),
      y: Number(args.y),
      destX: args.destX !== undefined ? Number(args.destX) : undefined,
      destY: args.destY !== undefined ? Number(args.destY) : undefined,
      scrollTicks: args.scrollTicks !== undefined ? Number(args.scrollTicks) : undefined
    })
    return { content: [{ type: 'text', text: status }] }
  }

  if (name === 'computer.keyboard_input') {
    const status = await executeKeyboardInput(
      String(args.text || ''),
      (args.mode as 'literal' | 'hotkey') || 'literal',
      Boolean(args.pressEnterAfter)
    )
    return { content: [{ type: 'text', text: status }] }
  }

  if (name === 'computer.window_control') {
    const result = await focusOrListWindows(
      (args.action as 'list' | 'focus') || 'list',
      args.titleQuery ? String(args.titleQuery) : undefined
    )
    return { content: [{ type: 'text', text: result }] }
  }

  throw new Error(`Unrecognized Computer Use tool: ${name}`)
})

async function boot() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

boot().catch((err) => {
  console.error('[Flame Computer Use MCP Fatal]:', err)
  process.exit(1)
})

