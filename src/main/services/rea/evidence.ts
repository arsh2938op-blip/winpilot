// src/main/services/rea/evidence.ts

export type EvidenceState = 'SEEN' | 'INFERRED' | 'UNKNOWN'

export type EvidenceCategory =
  | 'binary-header'
  | 'asar-entry'
  | 'ipc-channel'
  | 'network-endpoint'
  | 'crypto-or-secret'
  | 'import-export'
  | 'suspicious-pattern'

export interface EvidenceItem {
  id: string
  state: EvidenceState
  category: EvidenceCategory
  label: string
  value: string
  location: string // e.g. "offset:0x0040" or "preload.js:line:42"
  confidence: number // 0.0 to 1.0
  note?: string
}

export interface ReaEvidenceReport {
  targetPath: string
  timestamp: string
  summary: {
    seenCount: number
    inferredCount: number
    unknownCount: number
    totalFindings: number
  }
  findings: EvidenceItem[]
}

export class EvidenceCollector {
  private items: EvidenceItem[] = []
  private counter = 0

  constructor(private readonly targetPath: string) {}

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}_${this.counter.toString().padStart(4, '0')}`
  }

  /**
   * Direct byte, header, or exact AST/token match verified in the file.
   */
  addSeen(
    category: EvidenceCategory,
    label: string,
    value: string,
    location: string,
    note?: string
  ): EvidenceItem {
    const item: EvidenceItem = {
      id: this.nextId('SEEN'),
      state: 'SEEN',
      category,
      label,
      value: value.slice(0, 500),
      location,
      confidence: 1.0,
      note
    }
    this.items.push(item)
    return item
  }

  /**
   * Heuristic or pattern-based deduction (e.g. obfuscated eval, probable API route).
   */
  addInferred(
    category: EvidenceCategory,
    label: string,
    value: string,
    location: string,
    confidence = 0.75,
    note?: string
  ): EvidenceItem {
    const item: EvidenceItem = {
      id: this.nextId('INF'),
      state: 'INFERRED',
      category,
      label,
      value: value.slice(0, 500),
      location,
      confidence: Math.max(0.1, Math.min(0.99, confidence)),
      note
    }
    this.items.push(item)
    return item
  }

  /**
   * Unresolved dynamic import, stripped symbol, or external native binding.
   */
  addUnknown(
    category: EvidenceCategory,
    label: string,
    value: string,
    location: string,
    note?: string
  ): EvidenceItem {
    const item: EvidenceItem = {
      id: this.nextId('UNK'),
      state: 'UNKNOWN',
      category,
      label,
      value: value.slice(0, 500),
      location,
      confidence: 0.0,
      note
    }
    this.items.push(item)
    return item
  }

  buildReport(): ReaEvidenceReport {
    let seenCount = 0
    let inferredCount = 0
    let unknownCount = 0

    for (const item of this.items) {
      if (item.state === 'SEEN') seenCount++
      else if (item.state === 'INFERRED') inferredCount++
      else unknownCount++
    }

    return {
      targetPath: this.targetPath,
      timestamp: new Date().toISOString(),
      summary: {
        seenCount,
        inferredCount,
        unknownCount,
        totalFindings: this.items.length
      },
      findings: this.items
    }
  }

  /**
   * Produce formatted markdown representation of findings, ready for models (OpenCode/Gemini/Flame).
   */
  toMarkdown(): string {
    const report = this.buildReport()
    const lines: string[] = [
      `### REA Tri-State Evidence Report — \`${report.targetPath}\``,
      `> Findings: **${report.summary.seenCount} SEEN** (verified) | **${report.summary.inferredCount} INFERRED** (heuristic) | **${report.summary.unknownCount} UNKNOWN** (external/unresolved)`,
      ''
    ]

    const seen = report.findings.filter((f) => f.state === 'SEEN')
    const inf = report.findings.filter((f) => f.state === 'INFERRED')
    const unk = report.findings.filter((f) => f.state === 'UNKNOWN')

    if (seen.length) {
      lines.push('#### [SEEN] Verified In-Place Evidence (100% Confident)')
      for (const item of seen) {
        lines.push(`- **[${item.category}]** ${item.label}: \`${item.value}\` _(${item.location})_`)
      }
      lines.push('')
    }

    if (inf.length) {
      lines.push('#### [INFERRED] Pattern / Heuristic Findings')
      for (const item of inf) {
        lines.push(`- **[${item.category}]** ${item.label} (${Math.round(item.confidence * 100)}% conf): \`${item.value}\` _(${item.location})_${item.note ? ` — _${item.note}_` : ''}`)
      }
      lines.push('')
    }

    if (unk.length) {
      lines.push('#### [UNKNOWN] Unresolved External References')
      for (const item of unk) {
        lines.push(`- **[${item.category}]** ${item.label}: \`${item.value}\` _(${item.location})_${item.note ? ` — _${item.note}_` : ''}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}
