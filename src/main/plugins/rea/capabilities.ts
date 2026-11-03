/**
 * REA Capabilities — Reverse Engineering & Architecture Evidence Engine.
 *
 * Exposes capabilities for Task Mode and all models (Flame, OpenCode, Gemini):
 *   - rea.inspectFile      – Analyze binary headers, strings, endpoints, entropy
 *   - rea.inspectAsar      – Electron ASAR in-place archive header inspection
 *   - rea.auditWorkspace   – Map IPC channels, unmatched handlers, and dependencies
 *   - rea.generateFolder   – Generate folder scaffolds and seed files
 *   - rea.exportZip        – Package folders/files into downloadable ZIP format
 *   - rea.codeOnEvidence   – Feed REA evidence directly to OpenCode for guided coding
 */

import path from 'node:path'
import { registerCapability, type CapabilityResult } from '../../flameCore/capabilities'
import { emitAgentActivity } from '../../utils/broadcast'
import {
  analyzeFileOrBinary,
  inspectAsarArchive,
  auditWorkspaceArchitecture,
  generateFolderStructure,
  exportToZip,
  buildReaCodingTaskPrompt
} from '../../services/rea'
import { getCurrentProject } from '../../services/project/store'
import { runTaskMode } from '../../services/coder/nativeCoder'

// ---------------------------------------------------------------------------
// Standalone Executors (available to API, IPC, and Task Mode)
// ---------------------------------------------------------------------------

export async function executeReaInspectFile(
  filePath: string,
  requestId?: string
): Promise<CapabilityResult> {
  const target = filePath.trim()
  if (!target) return { success: false, message: 'File path is required.' }

  try {
    emitAgentActivity(requestId, `[REA] Inspecting: ${path.basename(target)}`)
    const result = await analyzeFileOrBinary(target)
    emitAgentActivity(requestId, `[REA] Inspection complete (${result.evidence.summary.totalFindings} findings)`)

    const m = result.metadata
    const lines: string[] = [
      `## REA Inspection: \`${m.fileName}\``,
      `- **Format:** ${m.format} (${m.architectureHint})`,
      `- **Size:** ${(m.sizeBytes / 1024).toFixed(1)} KB`,
      `- **SHA-256:** \`${m.sha256}\``,
      `- **Shannon Entropy:** **${m.shannonEntropy}/8.0** ${m.isPackedLikely ? '⚠️ (High entropy: packed / encrypted)' : '✅ (Normal density)'}`,
      `- **Extracted Strings:** ${m.extractedStringsCount}`,
      '',
      `### Evidence Summary: ${result.evidence.summary.seenCount} SEEN | ${result.evidence.summary.inferredCount} INFERRED | ${result.evidence.summary.unknownCount} UNKNOWN`,
      ''
    ]

    const findings = result.evidence.findings
    if (findings.length) {
      lines.push('### Key Findings')
      for (const item of findings.slice(0, 25)) {
        const flag = item.state === 'SEEN' ? '✅ SEEN' : item.state === 'INFERRED' ? '🔍 INF' : '❓ UNK'
        lines.push(`- **[${flag} · ${item.category}]** ${item.label}: \`${item.value}\` _(${item.location})_`)
      }
      if (findings.length > 25) {
        lines.push(`_…and ${findings.length - 25} more items_`)
      }
    }

    return { success: true, message: lines.join('\n') }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] Inspection failed')
    return {
      success: false,
      message: `REA file inspection failed for "${target}": ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export async function executeReaInspectAsar(
  asarPath: string,
  requestId?: string
): Promise<CapabilityResult> {
  const target = asarPath.trim()
  if (!target) return { success: false, message: 'ASAR file path is required.' }

  try {
    emitAgentActivity(requestId, `[REA] Inspecting ASAR: ${path.basename(target)}`)
    const result = await inspectAsarArchive(target)
    emitAgentActivity(requestId, `[REA] ASAR parsed (${result.totalEntries} entries)`)

    const lines: string[] = [
      `## Electron ASAR Analysis: \`${path.basename(target)}\``,
      `- **Total files in package:** ${result.totalEntries}`,
      `- **Key entries flagged:** ${result.evidence.summary.totalFindings}`,
      '',
      '### Packaged Files (Sample)',
      result.entries.slice(0, 30).map((e) => `- \`${e}\``).join('\n'),
      result.entries.length > 30 ? `_…and ${result.entries.length - 30} more entries_` : ''
    ]

    const keyFindings = result.evidence.findings
    if (keyFindings.length) {
      lines.push('', '### Sensitive / Executable Entries in ASAR')
      for (const item of keyFindings) {
        lines.push(`- **${item.label}:** \`${item.value}\` (${item.location})`)
      }
    }

    return { success: true, message: lines.join('\n') }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] ASAR inspection failed')
    return {
      success: false,
      message: `ASAR inspection failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export async function executeReaAuditWorkspace(
  workspaceDir?: string,
  requestId?: string
): Promise<CapabilityResult> {
  let target = workspaceDir?.trim()
  if (!target) {
    const project = await getCurrentProject()
    target = project.path || process.cwd()
  }

  try {
    emitAgentActivity(requestId, `[REA] Auditing workspace architecture: ${path.basename(target)}`)
    const report = await auditWorkspaceArchitecture(target)
    emitAgentActivity(requestId, `[REA] Workspace audit complete (${report.scannedFilesCount} files)`)

    const ipc = report.ipcChannels
    const lines: string[] = [
      `## Workspace Architecture Audit: \`${path.basename(report.workspacePath)}\``,
      `- **Scanned files:** ${report.scannedFilesCount}`,
      `- **ipcMain handlers:** ${ipc.mainHandlers.length}`,
      `- **ipcRenderer calls:** ${ipc.rendererInvokers.length}`,
      `- **Unmatched IPC calls:** ${ipc.unmatchedRendererCalls.length ? `⚠️ ${ipc.unmatchedRendererCalls.length} missing bridges` : '✅ All bridged'}`,
      `- **External dependencies:** ${report.externalDependencies.length}`,
      ''
    ]

    if (ipc.unmatchedRendererCalls.length) {
      lines.push('### ⚠️ Unmatched IPC Calls (Renderer invokes, but Main does not handle)')
      for (const channel of ipc.unmatchedRendererCalls) {
        lines.push(`- Channel \`${channel}\` (no matching ipcMain.handle/on found)`)
      }
      lines.push('')
    }

    if (ipc.mainHandlers.length) {
      lines.push('### Registered ipcMain Handlers')
      for (const h of ipc.mainHandlers.slice(0, 20)) {
        lines.push(`- \`${h.channel}\` — _${h.file}_`)
      }
      if (ipc.mainHandlers.length > 20) lines.push(`_…and ${ipc.mainHandlers.length - 20} more_`)
      lines.push('')
    }

    if (report.externalDependencies.length) {
      lines.push('### External Dependencies')
      lines.push(report.externalDependencies.slice(0, 25).map((d) => `\`${d}\``).join(', '))
      if (report.externalDependencies.length > 25) lines.push(`_…and ${report.externalDependencies.length - 25} more_`)
    }

    return { success: true, message: lines.join('\n') }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] Workspace audit failed')
    return {
      success: false,
      message: `Workspace audit failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export async function executeReaGenerateFolder(
  args: {
    folderName: string
    baseDir?: string
    files?: Record<string, string>
    subFolders?: string[]
  },
  requestId?: string
): Promise<CapabilityResult> {
  const folderName = args.folderName?.trim()
  if (!folderName) return { success: false, message: 'folderName is required.' }

  let baseDir = args.baseDir?.trim()
  if (!baseDir) {
    const project = await getCurrentProject()
    baseDir = project.path || process.cwd()
  }

  try {
    emitAgentActivity(requestId, `[REA] Generating folder structure: ${folderName}`)
    const result = await generateFolderStructure(baseDir, {
      folderName,
      files: args.files,
      subFolders: args.subFolders
    })
    emitAgentActivity(requestId, `[REA] Folder generated (${result.createdFiles.length} files)`)

    return {
      success: true,
      message: `📁 **Folder Generated Successfully**\n- **Path:** \`${result.folderPath}\`\n- **Files created:** ${result.createdFiles.length}\n${result.createdFiles.map((f) => `  • ${f}`).join('\n')}`
    }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] Folder generation failed')
    return {
      success: false,
      message: `Folder generation failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export async function executeReaExportZip(
  args: {
    sourcePath: string
    outputZipPath?: string
  },
  requestId?: string
): Promise<CapabilityResult> {
  const source = args.sourcePath?.trim()
  if (!source) return { success: false, message: 'sourcePath is required.' }

  try {
    emitAgentActivity(requestId, `[REA] Exporting ZIP archive for: ${path.basename(source)}`)
    const result = await exportToZip(source, args.outputZipPath)
    emitAgentActivity(requestId, `[REA] Archive exported (${(result.sizeBytes / 1024).toFixed(1)} KB)`)

    return {
      success: true,
      message: `📦 **Downloadable ZIP Archive Created**\n- **Archive File:** \`${result.zipPath}\`\n- **Size:** ${(result.sizeBytes / 1024).toFixed(1)} KB\n- **Entries:** ${result.fileCount} files\n\nReady for export / download.`
    }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] ZIP export failed')
    return {
      success: false,
      message: `ZIP export failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export async function executeReaCodeOnEvidence(
  args: {
    task: string
    targetPath?: string
    workspaceDir?: string
  },
  requestId?: string
): Promise<CapabilityResult> {
  const task = args.task?.trim()
  if (!task) return { success: false, message: 'task description is required.' }

  const project = await getCurrentProject()
  const workspace = args.workspaceDir?.trim() || project.path || process.cwd()
  const target = args.targetPath?.trim() || workspace

  try {
    emitAgentActivity(requestId, `[REA] Gathering Tri-State Evidence for task`)
    let evidence
    try {
      const stat = await (await import('node:fs/promises')).stat(target)
      if (stat.isDirectory()) {
        const audit = await auditWorkspaceArchitecture(target, 200)
        evidence = audit.evidence
      } else {
        const analysis = await analyzeFileOrBinary(target)
        evidence = analysis.evidence
      }
    } catch {
      // If target file doesn't exist yet, run workspace audit as baseline
      const audit = await auditWorkspaceArchitecture(workspace, 200)
      evidence = audit.evidence
    }

    const taskPrompt = buildReaCodingTaskPrompt(task, target, evidence)
    emitAgentActivity(requestId, `[REA] Enriched prompt prepared with verified findings`)

    // In Task mode: OpenCode or native coder handles the edit with REA context
    emitAgentActivity(requestId, `[OpenCode] Coding on REA evidence...`)
    const runResult = await runTaskMode(taskPrompt, workspace, { requestId, openDiff: true })

    return {
      success: runResult.status === 'applied' || runResult.status === 'noop' || runResult.status === 'answered',
      message: `### REA-Guided Code Task: ${runResult.status.toUpperCase()}\n\n${runResult.summary}\n\n${runResult.answer || ''}`
    }
  } catch (err) {
    emitAgentActivity(requestId, '[REA] REA-guided coding failed')
    return {
      success: false,
      message: `REA code task failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

// ---------------------------------------------------------------------------
// Capability Registration for FlameCore
// ---------------------------------------------------------------------------
export function registerReaCapabilities(): void {
  registerCapability({
    id: 'rea.inspectFile',
    label: 'REA File & Binary Inspection',
    description:
      'Analyze a file, bundle, or binary header using the REA Tri-State Evidence Engine (SEEN, INFERRED, UNKNOWN). Returns format, Shannon entropy, IPC channels, and embedded endpoints.',
    run: async (args) => {
      const filePath = String(args.filePath || args.path || '').trim()
      const requestId = args.requestId as string | undefined
      return executeReaInspectFile(filePath, requestId)
    }
  })

  registerCapability({
    id: 'rea.inspectAsar',
    label: 'REA Electron ASAR Archive Inspection',
    description:
      'Read an Electron .asar archive header in-place without extracting to disk. Lists packaged files, preload scripts, and native modules.',
    run: async (args) => {
      const asarPath = String(args.asarPath || args.path || '').trim()
      const requestId = args.requestId as string | undefined
      return executeReaInspectAsar(asarPath, requestId)
    }
  })

  registerCapability({
    id: 'rea.auditWorkspace',
    label: 'REA Workspace Architecture Audit',
    description:
      'Scan a project workspace to map Electron ipcMain handlers, ipcRenderer calls, unmatched IPC bridges, and external dependencies.',
    run: async (args) => {
      const workspaceDir = String(args.workspaceDir || args.path || '').trim()
      const requestId = args.requestId as string | undefined
      return executeReaAuditWorkspace(workspaceDir, requestId)
    }
  })

  registerCapability({
    id: 'rea.generateFolder',
    label: 'REA Task Mode Folder Generator',
    description:
      'Generates folder hierarchies and seed files in the workspace in Task mode for Flame and OpenCode.',
    run: async (args) => {
      const folderName = String(args.folderName || args.name || '').trim()
      const baseDir = args.baseDir as string | undefined
      const files = args.files as Record<string, string> | undefined
      const subFolders = args.subFolders as string[] | undefined
      const requestId = args.requestId as string | undefined
      return executeReaGenerateFolder({ folderName, baseDir, files, subFolders }, requestId)
    }
  })

  registerCapability({
    id: 'rea.exportZip',
    label: 'REA Exportable ZIP Archive Generator',
    description:
      'Packages a workspace folder or output assets into a downloadable/exportable ZIP archive.',
    run: async (args) => {
      const sourcePath = String(args.sourcePath || args.path || '').trim()
      const outputZipPath = args.outputZipPath as string | undefined
      const requestId = args.requestId as string | undefined
      return executeReaExportZip({ sourcePath, outputZipPath }, requestId)
    }
  })

  registerCapability({
    id: 'rea.codeOnEvidence',
    label: 'REA-Guided OpenCode Task',
    description:
      'Feeds verified Tri-State Evidence (SEEN, INFERRED, UNKNOWN) directly to OpenCode or Flame in Task mode for hallucination-free coding.',
    run: async (args) => {
      const task = String(args.task || args.instruction || '').trim()
      const targetPath = args.targetPath as string | undefined
      const workspaceDir = args.workspaceDir as string | undefined
      const requestId = args.requestId as string | undefined
      return executeReaCodeOnEvidence({ task, targetPath, workspaceDir }, requestId)
    }
  })
}
