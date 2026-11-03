import { app } from 'electron'
import { spawn } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import type {
  AiNetworkGuards,
  TaskRunFileChange,
  TaskRunResult,
  TaskRunStatus
} from '@shared/types'

/**
 * File-patching guards for Task mode.
 *
 * Every native run follows the same lifecycle:
 *
 *   1. snapshot  — hashes of the whole workspace + byte copies of the files
 *                  under `.flame/task-runs/<runId>/snapshot/`
 *   2. execute   — OpenCode (HTTP or CLI) is allowed to change files
 *   3. detect    — added / modified / deleted files are diffed by hash
 *   4. validate  — protected paths, file-count cap, TS/JS AST parse, JSON
 *                  parse, and Electron boundary rules
 *   5. commit    — valid changes stay; invalid ones are restored byte-for-byte
 *
 * A kept run can be rolled back later from its snapshot, independent of
 * coder_engine.py. That is what makes Task mode safe to use on the app itself.
 */

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.flame',
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode'
])

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.md', '.txt', '.py', '.yml', '.yaml'
])

const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const MAX_SNAPSHOT_FILES = 5000
const MAX_SNAPSHOT_BYTES = 2_000_000

export interface SnapshotEntry {
  rel: string
  hash: string
  size: number
  lines: number
  backedUp: boolean
}

export interface WorkspaceSnapshot {
  root: string
  entries: Map<string, SnapshotEntry>
  warnings: string[]
  tookMs: number
}

export interface GuardViolation {
  path: string
  rule: string
  detail: string
}

export interface GuardReport {
  ok: boolean
  violations: GuardViolation[]
  warnings: string[]
}

export interface TaskRunManifest {
  runId: string
  task: string
  backend: string
  status: TaskRunStatus
  summary: string
  files: TaskRunFileChange[]
  warnings: string[]
  error?: string
  answer?: string
  startedAt: number
  finishedAt: number
  workspace: string
  snapshotPath: string
}

/* ------------------------------------------------------------------ */
/* Snapshot + change detection                                         */
/* ------------------------------------------------------------------ */

export function createRunId(): string {
  return `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

export function taskRunsRoot(projectPath: string): string {
  return path.join(projectPath, '.flame', 'task-runs')
}

export function taskRunDir(projectPath: string, runId: string): string {
  return path.join(taskRunsRoot(projectPath), runId)
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

async function walkFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walkFiles(root, abs, out)
      continue
    }
    if (!entry.isFile()) continue
    out.push(abs)
  }
  return out
}

async function hashFile(abs: string): Promise<{ hash: string; size: number; buffer: Buffer } | null> {
  try {
    const buffer = await fs.readFile(abs)
    return { hash: createHash('sha1').update(buffer).digest('hex'), size: buffer.length, buffer }
  } catch {
    return null
  }
}

export async function takeSnapshot(
  projectPath: string,
  snapshotDir: string
): Promise<WorkspaceSnapshot> {
  const started = Date.now()
  const warnings: string[] = []
  const entries = new Map<string, SnapshotEntry>()
  const files = await walkFiles(projectPath)

  if (files.length > MAX_SNAPSHOT_FILES) {
    warnings.push(`Workspace has ${files.length} files; only the first ${MAX_SNAPSHOT_FILES} were snapshotted.`)
  }

  for (const abs of files.slice(0, MAX_SNAPSHOT_FILES)) {
    const rel = toPosix(path.relative(projectPath, abs))
    const hashed = await hashFile(abs)
    if (!hashed) {
      warnings.push(`Could not read ${rel}; changes to it cannot be rolled back.`)
      continue
    }
    const backup = hashed.size <= MAX_SNAPSHOT_BYTES
    entries.set(rel, {
      rel,
      hash: hashed.hash,
      size: hashed.size,
      lines: countLines(hashed.buffer),
      backedUp: backup
    })
    if (backup) {
      const target = path.join(snapshotDir, rel)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, hashed.buffer)
    } else {
      warnings.push(`${rel} is larger than 2 MB and was not backed up.`)
    }
  }

  return { root: projectPath, entries, warnings, tookMs: Date.now() - started }
}

export async function detectChanges(
  projectPath: string,
  snapshot: WorkspaceSnapshot
): Promise<TaskRunFileChange[]> {
  const current = await walkFiles(projectPath)
  const seen = new Set<string>()
  const changes: TaskRunFileChange[] = []

  for (const abs of current) {
    const rel = toPosix(path.relative(projectPath, abs))
    seen.add(rel)
    const before = snapshot.entries.get(rel)
    const hashed = await hashFile(abs)
    if (!hashed) continue
    if (!before) {
      changes.push({ path: rel, action: 'create', added: countLines(hashed.buffer) })
    } else if (before.hash !== hashed.hash) {
      const delta = lineDelta(before, hashed.buffer)
      changes.push({ path: rel, action: 'modify', added: delta.added, removed: delta.removed })
    }
  }

  // Files that disappeared. Excluded directories were never in the snapshot,
  // so this only catches real deletions inside the guarded workspace.
  for (const [rel] of snapshot.entries) {
    if (seen.has(rel)) continue
    changes.push({ path: rel, action: 'delete' })
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

function countLines(buffer: Buffer): number {
  if (buffer.length === 0) return 0
  let lines = 1
  for (const byte of buffer) if (byte === 10) lines++
  return lines
}

function lineDelta(before: SnapshotEntry, after: Buffer): { added: number; removed: number } {
  // Cheap approximation: line-count delta. Exact diffs are shown in VS Code.
  const afterLines = countLines(after)
  return {
    added: Math.max(0, afterLines - before.lines),
    removed: Math.max(0, before.lines - afterLines)
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function globToRegExp(glob: string): RegExp {
  const placeholder = '\uE000'
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, placeholder)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(new RegExp(placeholder, 'g'), '.*')
  return new RegExp(`^${escaped}$`)
}

export function isProtected(rel: string, guards: AiNetworkGuards): string | null {
  const target = `/${toPosix(rel)}`
  for (const pattern of guards.protectedGlobs) {
    if (globToRegExp(pattern).test(target)) return pattern
  }
  return null
}

type TsModule = typeof import('typescript')

let typeScriptModule: TsModule | null | undefined

function loadTypeScript(): TsModule | null {
  if (typeScriptModule !== undefined) return typeScriptModule
  try {
    const requireFromApp = createRequire(path.join(app.getAppPath(), 'package.json'))
    typeScriptModule = requireFromApp('typescript') as TsModule
  } catch {
    typeScriptModule = null
  }
  return typeScriptModule
}

function scriptKind(ts: TsModule, filePath: string): import('typescript').ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function astError(rel: string, content: string): string | null {
  const ts = loadTypeScript()
  if (!ts) return basicSyntaxError(rel, content)

  try {
    const source = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, scriptKind(ts, rel))
    const withDiagnostics = source as unknown as { parseDiagnostics?: import('typescript').Diagnostic[] }
    const diagnostics = withDiagnostics.parseDiagnostics ?? []

    if (!diagnostics.length) {
      // Fall back to the transpiler for files whose diagnostics are hidden.
      const transpiled = ts.transpileModule(content, {
        fileName: rel,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          isolatedModules: true
        }
      })
      const errors = (transpiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
      if (!errors.length) return null
      return formatDiagnostic(ts, errors[0])
    }

    const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error)
    if (!errors.length) return null
    return formatDiagnostic(ts, errors[0])
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function formatDiagnostic(ts: TsModule, diagnostic: import('typescript').Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
  if (diagnostic.file && typeof diagnostic.start === 'number') {
    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `line ${pos.line + 1}, col ${pos.character + 1}: ${message}`
  }
  return message
}

/**
 * Balance/quote scanner used when the TypeScript compiler is not available
 * at runtime (e.g. a production build without devDependencies). It is not a
 * full parser, but it still catches truncated files and broken string/macro
 * edits before they reach disk.
 */
function basicSyntaxError(rel: string, content: string): string | null {
  const stack: string[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  let quote: string | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const next = content[i + 1]

    if (lineComment) {
      if (ch === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false
        i++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '/' && next === '/') {
      lineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      blockComment = true
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch)
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== pairs[ch]) return `unbalanced "${ch}"`
    }
  }

  if (quote) return `unterminated ${quote} string`
  if (blockComment) return 'unterminated block comment'
  if (stack.length) return `unclosed "${stack[stack.length - 1]}"`
  return null
}

function boundaryViolations(rel: string, content: string, guards: AiNetworkGuards): string[] {
  const violations: string[] = []
  const posix = toPosix(rel)
  const isRenderer = /(^|\/)src\/renderer\//.test(posix)
  const isMainOrPreload = /(^|\/)src\/(main|preload)\//.test(posix)

  const importsElectron = /from\s+['"]electron['"]|require\(\s*['"]electron['"]\s*\)/.test(content)
  const importsRenderer = /from\s+['"]@renderer\/|from\s+['"]\.\.?\/(?:\.\.\/)*renderer\//.test(content)
  const importsMain = /from\s+['"]@main\/|from\s+['"]\.\.?\/(?:\.\.\/)*main\//.test(content)

  if (isRenderer && importsElectron && !guards.allowElectronInRenderer) {
    violations.push('renderer code must use window.api, not import "electron" directly')
  }
  if (isRenderer && importsMain) {
    violations.push('renderer code must not import main-process modules')
  }
  if (isMainOrPreload && importsRenderer) {
    violations.push('main/preload code must not import renderer modules')
  }
  return violations
}

export async function validateChanges(
  projectPath: string,
  changes: TaskRunFileChange[],
  guards: AiNetworkGuards
): Promise<GuardReport> {
  const violations: GuardViolation[] = []
  const warnings: string[] = []

  if (changes.length > guards.maxFilesPerRun) {
    violations.push({
      path: '*',
      rule: 'max-files',
      detail: `the run touched ${changes.length} files (limit ${guards.maxFilesPerRun})`
    })
  }

  for (const change of changes) {
    const protectedPattern = isProtected(change.path, guards)
    if (protectedPattern) {
      violations.push({ path: change.path, rule: 'protected-path', detail: `matches protected pattern "${protectedPattern}"` })
      continue
    }

    const abs = path.join(projectPath, change.path)
    const ext = path.extname(change.path).toLowerCase()
    if (change.action === 'create' || change.action === 'modify') {
      let content: string
      try {
        content = await fs.readFile(abs, 'utf8')
      } catch {
        violations.push({ path: change.path, rule: 'unreadable', detail: 'file could not be read after the edit' })
        continue
      }

      if (guards.ast && SCRIPT_EXTENSIONS.has(ext)) {
        const error = astError(change.path, content)
        if (error) {
          violations.push({ path: change.path, rule: 'ast', detail: error })
        }
      } else if (ext === '.json') {
        try {
          JSON.parse(content)
        } catch (err) {
          violations.push({
            path: change.path,
            rule: 'ast',
            detail: err instanceof Error ? err.message : 'invalid JSON'
          })
        }
      }

      const boundary = boundaryViolations(change.path, content, guards)
      for (const detail of boundary) {
        violations.push({ path: change.path, rule: 'boundary', detail })
      }

      if (!TEXT_EXTENSIONS.has(ext) && ext !== '') {
        warnings.push(`${change.path} has an unvalidated extension (${ext}).`)
      }
    }

    if (change.action === 'delete' && /\.(ts|tsx|js|jsx|json)$/i.test(change.path)) {
      warnings.push(`${change.path} was deleted in this run.`)
    }
  }

  return { ok: violations.length === 0, violations, warnings }
}

/* ------------------------------------------------------------------ */
/* Commit / restore                                                    */
/* ------------------------------------------------------------------ */

export async function restoreChanges(
  projectPath: string,
  snapshotDir: string,
  changes: TaskRunFileChange[]
): Promise<string[]> {
  const failures: string[] = []
  for (const change of changes) {
    const abs = path.join(projectPath, change.path)
    try {
      if (change.action === 'create') {
        await fs.rm(abs, { force: true })
        continue
      }
      const backup = path.join(snapshotDir, change.path)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.copyFile(backup, abs)
    } catch (err) {
      failures.push(`${change.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return failures
}

/* ------------------------------------------------------------------ */
/* Manifests, listing, rollback, diff                                  */
/* ------------------------------------------------------------------ */

export async function writeManifest(result: TaskRunResult, manifest: TaskRunManifest, projectPath: string): Promise<void> {
  const dir = taskRunDir(projectPath, result.runId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

export async function readManifest(projectPath: string, runId: string): Promise<TaskRunManifest | null> {
  try {
    const raw = await fs.readFile(path.join(taskRunDir(projectPath, runId), 'manifest.json'), 'utf8')
    return JSON.parse(raw) as TaskRunManifest
  } catch {
    return null
  }
}

export async function listTaskRuns(projectPath: string): Promise<TaskRunManifest[]> {
  const root = taskRunsRoot(projectPath)
  let dirs: string[]
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
  const manifests: TaskRunManifest[] = []
  for (const runId of dirs) {
    const manifest = await readManifest(projectPath, runId)
    if (manifest) manifests.push(manifest)
  }
  return manifests.sort((a, b) => b.startedAt - a.startedAt)
}

function manifestToResult(manifest: TaskRunManifest): TaskRunResult {
  return {
    runId: manifest.runId,
    status: manifest.status,
    backend: manifest.backend,
    summary: manifest.summary,
    files: manifest.files,
    warnings: manifest.warnings,
    error: manifest.error,
    answer: manifest.answer,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt
  }
}

/** Restore the newest applied run (or a specific run id). */
export async function rollbackTaskRun(projectPath: string, runId?: string): Promise<TaskRunResult> {
  const runs = await listTaskRuns(projectPath)
  const manifest = runId ? runs.find((run) => run.runId === runId) : runs.find((run) => run.status === 'applied')
  if (!manifest) {
    throw new Error(runId ? `No Task-mode run "${runId}" was found.` : 'There is no applied Task-mode run to roll back.')
  }
  if (manifest.status === 'rolled_back') {
    throw new Error(`Run ${manifest.runId} was already rolled back.`)
  }

  const snapshotDir = path.join(taskRunDir(projectPath, manifest.runId), 'snapshot')
  const failures = await restoreChanges(projectPath, snapshotDir, manifest.files)
  manifest.status = failures.length ? 'failed' : 'rolled_back'
  manifest.finishedAt = Date.now()
  manifest.error = failures.length ? `Partial rollback: ${failures.join('; ')}` : undefined
  await writeManifest(manifestToResult(manifest), manifest, projectPath)
  return manifestToResult(manifest)
}

/** Open the run's changed files in VS Code's diff viewer. */
export async function openTaskDiff(projectPath: string, runId?: string): Promise<void> {
  const runs = await listTaskRuns(projectPath)
  const manifest = runId ? runs.find((run) => run.runId === runId) : runs[0]
  if (!manifest) throw new Error('There is no Task-mode run to diff yet.')

  const snapshotDir = path.join(taskRunDir(projectPath, manifest.runId), 'snapshot')
  const changed = manifest.files.filter((f) => f.action !== 'create')
  if (!changed.length) throw new Error('That run only created files; there is no before/after diff.')

  for (const change of changed.slice(0, 8)) {
    const left = path.join(snapshotDir, change.path)
    const right = path.join(projectPath, change.path)
    try {
      await fs.access(left)
    } catch {
      continue
    }
    await new Promise<void>((resolve) => {
      const command =
        process.platform === 'win32'
          ? spawn('cmd.exe', ['/d', '/s', '/c', `code --diff "${left}" "${right}"`], { windowsHide: true, stdio: 'ignore' })
          : spawn('code', ['--diff', left, right], { windowsHide: true, stdio: 'ignore' })
      command.on('error', () => resolve())
      command.on('close', () => resolve())
    })
  }
}

/* ------------------------------------------------------------------ */
/* Chat formatting                                                     */
/* ------------------------------------------------------------------ */

const ACTION_MARK: Record<TaskRunFileChange['action'], string> = {
  create: 'A',
  modify: 'M',
  delete: 'D'
}

export function formatTaskResult(result: TaskRunResult): string {
  const lines: string[] = [
    `Task ${result.runId}  [${result.status}]  via ${result.backend}`
  ]
  if (result.error) lines.push(`✗ ${result.error}`)
  else if (result.answer) lines.push(result.answer)
  else if (result.summary) lines.push(result.summary)

  if (result.files.length) {
    lines.push(...result.files.map((file) => {
      const counts = file.added || file.removed ? ` (+${file.added ?? 0} -${file.removed ?? 0})` : ''
      const check = file.check ? `  ✓ ${file.check}` : ''
      return `  ${ACTION_MARK[file.action]} ${file.path}${counts}${check}`
    }))
  } else if (result.status !== 'answered' && !result.error) {
    lines.push('  (no files changed)')
  }

  for (const warning of result.warnings) lines.push(`  ! ${warning}`)

  if (result.status === 'applied') {
    lines.push('')
    lines.push('Guarded run committed. Say "rollback" to restore the snapshots.')
  } else if (result.status === 'rolled_back') {
    lines.push('')
    lines.push('The guard rejected this run; every touched file was restored.')
  }
  return lines.join('\n').trim()
}
