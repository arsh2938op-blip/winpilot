/**
 * Parses winget's column-aligned text tables (used by both `winget list`
 * and `winget search`) into structured rows.
 *
 * Why this approach: winget doesn't offer a JSON output mode, only
 * human-readable tables where columns are aligned with padding spaces.
 * The reliable way to parse this is to find where each column *starts* on
 * the header line, then slice every data row at those same positions —
 * rather than splitting on whitespace, which breaks for names/ids that
 * contain spaces.
 */
export function parseWingetTable(rawOutput: string): Record<string, string>[] {
  const lines = rawOutput
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFFFD/g, '').trimEnd())
    .filter((line) => line.length > 0)

  // Find the header line: the first line containing at least "Name" and "Id".
  const headerIndex = lines.findIndex((line) => line.includes('Name') && line.includes('Id'))
  if (headerIndex === -1) return []

  const headerLine = lines[headerIndex]
  // The line right after the header is a row of dashes ("----- ---- ...")
  // separating header from data — skip it.
  const dataStart = headerIndex + 2

  // Find each column's starting character index from the header line.
  const columnNames = ['Name', 'Id', 'Version', 'Match', 'Available', 'Source']
  const columns = columnNames
    .map((name) => ({ name, start: headerLine.indexOf(name) }))
    .filter((col) => col.start !== -1)
    .sort((a, b) => a.start - b.start)

  const rows: Record<string, string>[] = []

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().length === 0) continue

    const row: Record<string, string> = {}
    for (let c = 0; c < columns.length; c++) {
      const { name, start } = columns[c]
      const end = c + 1 < columns.length ? columns[c + 1].start : line.length
      row[name] = line.slice(start, end).trim()
    }
    if (row.Name) rows.push(row)
  }

  return rows
}