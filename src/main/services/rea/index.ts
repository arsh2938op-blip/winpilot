// src/main/services/rea/index.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { EvidenceCollector } from './evidence'
import type { ReaEvidenceReport, EvidenceItem, EvidenceState, EvidenceCategory } from './evidence'
import {
  analyzeFileOrBinary,
  inspectAsarArchive,
  calculateEntropy,
  detectBinaryFormat,
  hashFileStream
} from './parser'
import type { BinaryMetadata, AsarHeaderNode } from './parser'

export {
  EvidenceCollector,
  analyzeFileOrBinary,
  inspectAsarArchive,
  calculateEntropy,
  detectBinaryFormat,
  hashFileStream
}

export type {
  ReaEvidenceReport,
  EvidenceItem,
  EvidenceState,
  EvidenceCategory,
  BinaryMetadata,
  AsarHeaderNode
}

export interface WorkspaceAuditReport {
  workspacePath: string
  scannedFilesCount: number
  ipcChannels: {
    mainHandlers: Array<{ channel: string; file: string }>
    rendererInvokers: Array<{ channel: string; file: string }>
    unmatchedRendererCalls: string[]
  }
  externalDependencies: string[]
  evidence: ReaEvidenceReport
}

export interface FolderGenerationResult {
  folderPath: string
  createdFiles: string[]
  message: string
}

export interface ZipExportResult {
  zipPath: string
  sizeBytes: number
  fileCount: number
  downloadUrl?: string
  message: string
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.flame',
  'dist',
  'build',
  'out',
  '.next',
  '__pycache__',
  '.venv',
  'venv'
])

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'])

/**
 * Audit a workspace directory to map Electron IPC channels, module imports,
 * and unmatched IPC calls (useful for debugging broken bridges).
 */
export async function auditWorkspaceArchitecture(
  workspaceDir: string,
  maxFiles = 400
): Promise<WorkspaceAuditReport> {
  const root = path.resolve(workspaceDir)
  const collector = new EvidenceCollector(root)

  const mainHandlers: Array<{ channel: string; file: string }> = []
  const rendererInvokers: Array<{ channel: string; file: string }> = []
  const externalDeps = new Set<string>()
  let scannedFilesCount = 0

  async function walk(currentDir: string): Promise<void> {
    if (scannedFilesCount >= maxFiles) return
    let entries
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (scannedFilesCount >= maxFiles) break
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(path.join(currentDir, entry.name))
        }
        continue
      }

      const ext = path.extname(entry.name).toLowerCase()
      if (!CODE_EXTENSIONS.has(ext)) continue

      const fullPath = path.join(currentDir, entry.name)
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/')

      let stat
      try {
        stat = await fs.stat(fullPath)
      } catch {
        continue
      }
      // Skip files larger than 512KB during quick workspace architecture scans
      if (stat.size > 512 * 1024) continue

      scannedFilesCount++
      let content: string
      try {
        content = await fs.readFile(fullPath, 'utf8')
      } catch {
        continue
      }

      // 1. Detect Electron Main IPC handlers (ipcMain.handle / ipcMain.on)
      const mainRe = /\bipcMain\.(?:handle|on)\s*\(\s*['"`]([^'"`]+)['"`]/g
      for (const match of content.matchAll(mainRe)) {
        const channel = match[1]
        mainHandlers.push({ channel, file: relPath })
        collector.addSeen('ipc-channel', 'ipcMain Handler', channel, relPath)
      }

      // 2. Detect Renderer IPC calls (ipcRenderer.invoke / ipcRenderer.send)
      const rendererRe = /\bipcRenderer\.(?:invoke|send)\s*\(\s*['"`]([^'"`]+)['"`]/g
      for (const match of content.matchAll(rendererRe)) {
        const channel = match[1]
        rendererInvokers.push({ channel, file: relPath })
        collector.addSeen('ipc-channel', 'ipcRenderer Call', channel, relPath)
      }

      // 3. Detect external package imports
      const importRe = /\b(?:import\s+[^'"]*from\s+|require\s*\(\s*)['"`]([^.'"`][^'"`]*)['"`]/g
      for (const match of content.matchAll(importRe)) {
        const pkg = match[1].startsWith('@')
          ? match[1].split('/').slice(0, 2).join('/')
          : match[1].split('/')[0]
        externalDeps.add(pkg)
      }
    }
  }

  await walk(root)

  const registeredSet = new Set(mainHandlers.map((h) => h.channel))
  const unmatchedRendererCalls = Array.from(
    new Set(
      rendererInvokers
        .map((r) => r.channel)
        .filter((channel) => !registeredSet.has(channel))
    )
  )

  for (const missingChannel of unmatchedRendererCalls) {
    collector.addInferred(
      'ipc-channel',
      'Unmatched Renderer IPC Call (No matching ipcMain handler found)',
      missingChannel,
      'workspace-ipc-graph',
      0.88,
      'Renderer invokes this channel, but no corresponding ipcMain.handle/on was seen in scanned files.'
    )
  }

  return {
    workspacePath: root,
    scannedFilesCount,
    ipcChannels: {
      mainHandlers,
      rendererInvokers,
      unmatchedRendererCalls
    },
    externalDependencies: Array.from(externalDeps).sort(),
    evidence: collector.buildReport()
  }
}

/**
 * Task-mode folder generator: Creates directories and files in a workspace.
 */
export async function generateFolderStructure(
  baseDir: string,
  structure: {
    folderName: string
    files?: Record<string, string> // relativeFilePath -> fileContent
    subFolders?: string[]
  }
): Promise<FolderGenerationResult> {
  const targetDir = path.resolve(baseDir, structure.folderName)
  await fs.mkdir(targetDir, { recursive: true })

  if (structure.subFolders) {
    for (const sub of structure.subFolders) {
      await fs.mkdir(path.join(targetDir, sub), { recursive: true })
    }
  }

  const createdFiles: string[] = []
  if (structure.files) {
    for (const [relPath, content] of Object.entries(structure.files)) {
      const filePath = path.join(targetDir, relPath)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, 'utf8')
      createdFiles.push(relPath)
    }
  }

  return {
    folderPath: targetDir,
    createdFiles,
    message: `Generated folder "${path.basename(targetDir)}" with ${createdFiles.length} files at ${targetDir}`
  }
}

/**
 * Task-mode ZIP packager: Packages a directory or selected files into a downloadable/exportable ZIP archive.
 */
export async function exportToZip(
  sourcePath: string,
  outputZipPath?: string
): Promise<ZipExportResult> {
  const resolvedSource = path.resolve(sourcePath)
  const stat = await fs.stat(resolvedSource)

  const outZip = outputZipPath
    ? path.resolve(outputZipPath)
    : path.join(
        path.dirname(resolvedSource),
        `${path.basename(resolvedSource, path.extname(resolvedSource))}-export.zip`
      )

  const zip = new AdmZip()
  if (stat.isDirectory()) {
    zip.addLocalFolder(resolvedSource)
  } else {
    zip.addLocalFile(resolvedSource)
  }

  await zip.writeZipPromise(outZip)
  const zipStat = await fs.stat(outZip)
  const fileCount = zip.getEntries().length

  return {
    zipPath: outZip,
    sizeBytes: zipStat.size,
    fileCount,
    message: `Exported ZIP archive "${path.basename(outZip)}" (${(zipStat.size / 1024).toFixed(1)} KB, ${fileCount} entries) to ${outZip}`
  }
}

/**
 * Prepares a structured prompt containing REA Tri-State Evidence
 * so OpenCode, Flame, or Gemini can code without hallucinations.
 */
export function buildReaCodingTaskPrompt(
  task: string,
  targetPath: string,
  evidence: ReaEvidenceReport
): string {
  const seen = evidence.findings.filter((f) => f.state === 'SEEN')
  const inf = evidence.findings.filter((f) => f.state === 'INFERRED')
  const unk = evidence.findings.filter((f) => f.state === 'UNKNOWN')

  return [
    `TASK: ${task}`,
    `Target: ${targetPath}`,
    '',
    '=== REA TRI-STATE VERIFIED CONTEXT ===',
    `Verified Findings (SEEN - 100% Confident):`,
    seen.length
      ? seen.map((s) => `• [${s.category}] ${s.label}: ${s.value} (${s.location})`).join('\n')
      : '• None',
    '',
    `Pattern Findings (INFERRED - Verify before relying):`,
    inf.length
      ? inf.map((i) => `• [${i.category}] ${i.label}: ${i.value} (${i.location})`).join('\n')
      : '• None',
    '',
    `Unresolved References (UNKNOWN):`,
    unk.length
      ? unk.map((u) => `• [${u.category}] ${u.label}: ${u.value} (${u.location})`).join('\n')
      : '• None',
    '',
    '=== INSTRUCTIONS FOR CODER ===',
    '1. Use only the verified SEEN evidence when declaring imports and calling IPC channels.',
    '2. Double-check any INFERRED patterns before modifying existing code.',
    '3. Do not assume UNKNOWN references exist locally without checking.',
    '4. Make your code changes minimal and testable.'
  ].join('\n')
}
