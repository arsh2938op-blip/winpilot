// src/main/services/rea/parser.ts
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { EvidenceCollector, ReaEvidenceReport } from './evidence'

export interface BinaryMetadata {
  fileName: string
  sizeBytes: number
  sha256: string
  format:
    | 'PE (Windows EXE/DLL)'
    | 'ELF (Linux)'
    | 'Mach-O (macOS)'
    | 'WASM'
    | 'ASAR Archive'
    | 'ZIP/JAR Archive'
    | 'Text / Source'
    | 'Unknown Binary'
  architectureHint: string
  shannonEntropy: number // 0.0 - 8.0 (> 7.2 usually means packed/encrypted/compressed)
  isPackedLikely: boolean
  extractedStringsCount: number
}

export interface AsarHeaderNode {
  files?: Record<string, AsarHeaderNode>
  size?: number
  offset?: string
  executable?: boolean
}

const MAX_READ_BYTES = 4 * 1024 * 1024 // Cap memory buffer at 4MB for 8GB RAM safety

/**
 * Compute SHA-256 via stream (constant memory even on 1GB files).
 */
export async function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Calculate Shannon Entropy (0 to 8 bits/byte) to detect packed or encrypted binaries.
 */
export function calculateEntropy(buf: Buffer): number {
  if (buf.length === 0) return 0
  const freq = new Uint32Array(256)
  for (let i = 0; i < buf.length; i++) {
    freq[buf[i]]++
  }
  let entropy = 0
  const len = buf.length
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue
    const p = freq[i] / len
    entropy -= p * Math.log2(p)
  }
  return Number(entropy.toFixed(3))
}

/**
 * Detect binary header magic bytes and CPU architecture.
 */
export function detectBinaryFormat(buf: Buffer): {
  format: BinaryMetadata['format']
  arch: string
} {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    // MZ header (Windows PE)
    let arch = 'x86 / x64'
    if (buf.length >= 0x40) {
      const peOffset = buf.readUInt32LE(0x3c)
      if (peOffset + 6 <= buf.length && buf.toString('ascii', peOffset, peOffset + 2) === 'PE') {
        const machine = buf.readUInt16LE(peOffset + 4)
        if (machine === 0x8664) arch = 'x86_64 (AMD64)'
        else if (machine === 0x014c) arch = 'x86 (i386)'
        else if (machine === 0xaa64) arch = 'ARM64'
      }
    }
    return { format: 'PE (Windows EXE/DLL)', arch }
  }
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    const is64 = buf[4] === 2
    return { format: 'ELF (Linux)', arch: is64 ? '64-bit ELF' : '32-bit ELF' }
  }
  if (
    buf.length >= 4 &&
    ((buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && (buf[3] === 0xce || buf[3] === 0xcf)) ||
      (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe))
  ) {
    return { format: 'Mach-O (macOS)', arch: 'Apple Silicon / Intel Mach-O' }
  }
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d) {
    return { format: 'WASM', arch: 'WebAssembly VM' }
  }
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return { format: 'ZIP/JAR Archive', arch: 'Archive' }
  }
  if (buf.length >= 16 && buf.readUInt32LE(0) === 4) {
    return { format: 'ASAR Archive', arch: 'Electron ASAR' }
  }
  return { format: 'Text / Source', arch: 'N/A' }
}

/**
 * Extract printable ASCII strings from a binary buffer and classify endpoints/IPC/secrets.
 */
export async function analyzeFileOrBinary(
  targetPath: string
): Promise<{ metadata: BinaryMetadata; evidence: ReaEvidenceReport }> {
  const resolved = path.resolve(targetPath)
  const stat = await fs.stat(resolved)
  const collector = new EvidenceCollector(resolved)

  const handle = await fs.open(resolved, 'r')
  const readSize = Math.min(stat.size, MAX_READ_BYTES)
  const buf = Buffer.alloc(readSize)
  try {
    await handle.read(buf, 0, readSize, 0)
  } finally {
    await handle.close()
  }

  const sha256 = await hashFileStream(resolved)
  const { format, arch } = detectBinaryFormat(buf)
  const shannonEntropy = calculateEntropy(buf)
  const isPackedLikely = shannonEntropy > 7.2 && format !== 'ZIP/JAR Archive'

  collector.addSeen(
    'binary-header',
    'Detected File Format',
    `${format} (${arch}) | Entropy: ${shannonEntropy}`,
    'offset:0x0000'
  )

  if (isPackedLikely) {
    collector.addInferred(
      'suspicious-pattern',
      'High Shannon Entropy Detected',
      `Entropy ${shannonEntropy}/8.0 suggests packed, compressed, or encrypted payload`,
      'offset:0x0000',
      0.85
    )
  }

  // Extract printable ASCII sequences (>= 6 chars)
  const rawText = buf.toString('latin1')
  const asciiMatches = rawText.match(/[\x20-\x7E]{6,}/g) || []

  // Pattern matchers for URLs, Electron IPC, and common secrets/tokens
  const urlRe = /\b(?:https?|wss?):\/\/[^\s"'<>`]+/gi
  const ipcRe = /\b(?:ipcRenderer|ipcMain)\.(?:invoke|send|on|handle)\s*\(\s*['"`]([^'"`]+)['"`]/g
  const secretRe = /\b(?:AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,})\b/g
  const dynamicEvalRe = /\b(?:eval|Function)\s*\(|child_process|execSync|spawnSync/g

  const seenUrls = new Set<string>()
  for (const match of rawText.matchAll(urlRe)) {
    const url = match[0].slice(0, 200)
    if (!seenUrls.has(url) && seenUrls.size < 40) {
      seenUrls.add(url)
      collector.addSeen('network-endpoint', 'Embedded URL / Endpoint', url, `byte-offset:${match.index}`)
    }
  }

  const seenIpc = new Set<string>()
  for (const match of rawText.matchAll(ipcRe)) {
    const channel = match[1]
    if (!seenIpc.has(channel) && seenIpc.size < 40) {
      seenIpc.add(channel)
      collector.addSeen('ipc-channel', 'Electron IPC Channel', channel, `byte-offset:${match.index}`)
    }
  }

  for (const match of rawText.matchAll(secretRe)) {
    const redacted = `${match[0].slice(0, 8)}...[REDACTED]`
    collector.addInferred(
      'crypto-or-secret',
      'Potential Hardcoded API Key / Token',
      redacted,
      `byte-offset:${match.index}`,
      0.92
    )
  }

  for (const match of rawText.matchAll(dynamicEvalRe)) {
    collector.addInferred(
      'suspicious-pattern',
      'Dynamic Execution / Subprocess Hook',
      match[0],
      `byte-offset:${match.index}`,
      0.78
    )
  }

  return {
    metadata: {
      fileName: path.basename(resolved),
      sizeBytes: stat.size,
      sha256,
      format,
      architectureHint: arch,
      shannonEntropy,
      isPackedLikely,
      extractedStringsCount: asciiMatches.length
    },
    evidence: collector.buildReport()
  }
}

/**
 * Inspect an Electron .asar archive header without extracting gigabytes to disk.
 */
export async function inspectAsarArchive(
  asarPath: string,
  maxEntries = 120
): Promise<{ totalEntries: number; entries: string[]; evidence: ReaEvidenceReport }> {
  const resolved = path.resolve(asarPath)
  const collector = new EvidenceCollector(resolved)
  const handle = await fs.open(resolved, 'r')

  try {
    const prefix = Buffer.alloc(16)
    await handle.read(prefix, 0, 16, 0)
    const headerStringSize = prefix.readUInt32LE(12)

    if (headerStringSize <= 0 || headerStringSize > 20 * 1024 * 1024) {
      throw new Error('Not a valid Electron ASAR archive or header exceeds 20MB limit.')
    }

    const headerBuf = Buffer.alloc(headerStringSize)
    await handle.read(headerBuf, 0, headerStringSize, 16)
    const headerJson = JSON.parse(headerBuf.toString('utf8')) as AsarHeaderNode

    const entries: string[] = []
    const walk = (node: AsarHeaderNode, currentPath: string): void => {
      if (!node.files) return
      for (const [name, child] of Object.entries(node.files)) {
        const nextPath = currentPath ? `${currentPath}/${name}` : name
        if (child.files) {
          walk(child, nextPath)
        } else {
          entries.push(nextPath)
          if (
            name === 'package.json' ||
            name.includes('preload') ||
            name.endsWith('.node')
          ) {
            collector.addSeen(
              'asar-entry',
              child.executable ? 'Native Binary / Executable in ASAR' : 'Key Electron Entry',
              nextPath,
              `asar-offset:${child.offset || '0'} (size:${child.size || 0})`
            )
          }
        }
      }
    }

    walk(headerJson, '')
    return {
      totalEntries: entries.length,
      entries: entries.slice(0, maxEntries),
      evidence: collector.buildReport()
    }
  } finally {
    await handle.close()
  }
}
