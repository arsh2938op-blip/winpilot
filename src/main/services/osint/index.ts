// src/main/services/osint/index.ts
import dns from 'node:dns/promises'
import tls from 'node:tls'
import net from 'node:net'
import crypto from 'node:crypto'

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface EmailSecurityAudit {
  hasSpf: boolean
  spfRecord: string | null
  hasDmarc: boolean
  dmarcRecord: string | null
  dmarcPolicy: 'none' | 'quarantine' | 'reject' | 'unknown'
  securityScore: number // 0 to 100
  warnings: string[]
}

export interface TlsCertificateInfo {
  subject: Record<string, string | string[]>
  issuer: Record<string, string | string[]>
  validFrom: string
  validTo: string
  daysRemaining: number
  serialNumber: string
  fingerprint256: string
  subjectAltNames: string[]
  protocol: string | null
}

export interface HttpSecurityAudit {
  url: string
  statusCode: number
  server: string | null
  poweredBy: string | null
  cdnProvider: string | null
  corsAllowOrigin: string | null
  securityHeaders: {
    strictTransportSecurity: boolean
    contentSecurityPolicy: boolean
    xFrameOptions: boolean
    xContentTypeOptions: boolean
    referrerPolicy: boolean
    permissionsPolicy: boolean
  }
  missingHeaders: string[]
}

export interface CrawlDiscoveryResult {
  robotsTxtPresent: boolean
  disallowedPaths: string[]
  declaredSitemaps: string[]
  securityTxtPresent: boolean
  securityContacts: string[]
}

export interface DomainIntelligenceReport {
  domain: string
  timestamp: string
  dns: {
    a: string[]
    aaaa: string[]
    mx: Array<{ exchange: string; priority: number }>
    ns: string[]
    txt: string[]
    cname: string[]
  }
  emailSecurity: EmailSecurityAudit
  tls: TlsCertificateInfo | null
  subdomains: string[]
  httpAudit: HttpSecurityAudit | null
  crawlDiscovery: CrawlDiscoveryResult
}

export interface IpIntelligenceReport {
  ip: string
  version: 'IPv4' | 'IPv6'
  reverseDns: string[]
  geoAndAsn: {
    country: string | null
    region: string | null
    city: string | null
    latitude: number | null
    longitude: number | null
    timezone: string | null
    asn: number | null
    org: string | null
    isp: string | null
  }
  rdap: {
    handle: string | null
    name: string | null
    cidr: string | null
    country: string | null
  }
}

export interface PhoneFormatReport {
  rawInput: string
  e164: string
  isValidE164: boolean
  countryCode: string | null
  countryName: string | null
  nationalNumber: string
  TimezoneHint: string | null
}

export interface PublicIdentityReport {
  input: string
  type: 'email' | 'username'
  md5Hash?: string
  gravatarExists?: boolean
  gravatarAvatarUrl?: string | null
  githubProfile?: {
    exists: boolean
    name: string | null
    bio: string | null
    publicRepos: number
    createdAt: string | null
    profileUrl: string | null
  }
}

// ============================================================================
// Helper Utilities
// ============================================================================

const DEFAULT_TIMEOUT_MS = 7500

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'FlameAGI-OSINT-Inspector/2.0',
        ...(options.headers || {})
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

// ============================================================================
// 1. DNS & Email Security Audit (SPF + DMARC)
// ============================================================================

export async function auditEmailSecurity(domain: string, txtRecords: string[]): Promise<EmailSecurityAudit> {
  const spfRecord = txtRecords.find((r) => r.toLowerCase().startsWith('v=spf1')) || null
  let dmarcRecord: string | null = null

  try {
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${domain}`)
    const flatDmarc = dmarcTxt.map((chunks) => chunks.join(''))
    dmarcRecord = flatDmarc.find((r) => r.toLowerCase().startsWith('v=dmarc1')) || null
  } catch {
    dmarcRecord = null
  }

  let dmarcPolicy: EmailSecurityAudit['dmarcPolicy'] = 'unknown'
  if (dmarcRecord) {
    const match = dmarcRecord.match(/\bp\s*=\s*(none|quarantine|reject)\b/i)
    if (match) {
      dmarcPolicy = match[1].toLowerCase() as EmailSecurityAudit['dmarcPolicy']
    }
  }

  const warnings: string[] = []
  let score = 0

  if (spfRecord) {
    score += 40
    if (spfRecord.includes('+all')) {
      warnings.push('SPF record uses "+all", which allows any server to send email on behalf of this domain.')
      score -= 30
    } else if (spfRecord.includes('?all')) {
      warnings.push('SPF record uses neutral "?all" instead of "~all" (softfail) or "-all" (hardfail).')
    }
  } else {
    warnings.push('Missing SPF record in root TXT records.')
  }

  if (dmarcRecord) {
    score += 30
    if (dmarcPolicy === 'reject') score += 30
    else if (dmarcPolicy === 'quarantine') score += 20
    else if (dmarcPolicy === 'none') {
      warnings.push('DMARC policy is set to "p=none" (monitoring only; spoofed emails are not blocked).')
      score += 5
    }
  } else {
    warnings.push('Missing _dmarc TXT record.')
  }

  return {
    hasSpf: Boolean(spfRecord),
    spfRecord,
    hasDmarc: Boolean(dmarcRecord),
    dmarcRecord,
    dmarcPolicy,
    securityScore: Math.max(0, Math.min(100, score)),
    warnings
  }
}

// ============================================================================
// 2. Live TLS Certificate & SAN Inspector
// ============================================================================

export function inspectTlsCertificate(domain: string, port = 443, timeoutMs = 5500): Promise<TlsCertificateInfo | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: domain,
        port,
        servername: domain,
        rejectUnauthorized: false
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(false)
          const protocol = socket.getProtocol()
          socket.end()

          if (!cert || Object.keys(cert).length === 0) {
            resolve(null)
            return
          }

          const validToDate = new Date(cert.valid_to)
          const daysRemaining = Math.ceil((validToDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

          const rawSan = cert.subjectaltname || ''
          const subjectAltNames = rawSan
            .split(',')
            .map((part) => part.trim().replace(/^DNS:/i, ''))
            .filter(Boolean)

          resolve({
            subject: (cert.subject as unknown as Record<string, string | string[]>) || {},
            issuer: (cert.issuer as unknown as Record<string, string | string[]>) || {},
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            serialNumber: cert.serialNumber,
            fingerprint256: cert.fingerprint256,
            subjectAltNames,
            protocol
          })
        } catch {
          socket.destroy()
          resolve(null)
        }
      }
    )

    socket.setTimeout(timeoutMs, () => {
      socket.destroy()
      resolve(null)
    })

    socket.on('error', () => {
      socket.destroy()
      resolve(null)
    })
  })
}

// ============================================================================
// 3. Certificate Transparency Subdomain Discovery (crt.sh)
// ============================================================================

export async function fetchCtSubdomains(domain: string, limit = 120): Promise<string[]> {
  try {
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`
    const res = await fetchWithTimeout(url, {}, 8500)
    if (!res.ok) return []

    const data = (await res.json()) as Array<{ name_value?: string }>
    const found = new Set<string>()

    for (const row of data) {
      if (!row.name_value) continue
      const names = row.name_value.split('\n')
      for (const n of names) {
        const clean = n.trim().toLowerCase().replace(/^\*\./, '')
        if (clean.endsWith(domain) && !clean.includes(' ')) {
          found.add(clean)
        }
      }
      if (found.size >= limit) break
    }

    return Array.from(found).sort()
  } catch {
    return []
  }
}

// ============================================================================
// 4. HTTP Security Headers, Tech Stack & CDN Fingerprinting
// ============================================================================

export async function auditHttpSecurity(domain: string): Promise<HttpSecurityAudit | null> {
  const targetUrl = `https://${domain}`
  try {
    const res = await fetchWithTimeout(targetUrl, { method: 'GET', redirect: 'follow' })
    const h = res.headers

    const server = h.get('server')
    const poweredBy = h.get('x-powered-by')
    const corsAllowOrigin = h.get('access-control-allow-origin')

    let cdnProvider: string | null = null
    if (h.has('cf-ray') || server?.toLowerCase().includes('cloudflare')) cdnProvider = 'Cloudflare'
    else if (h.has('x-vercel-id')) cdnProvider = 'Vercel'
    else if (h.has('x-amz-cf-id')) cdnProvider = 'AWS CloudFront'
    else if (h.has('x-fastly-request-id')) cdnProvider = 'Fastly'
    else if (h.has('x-akamai-transformed')) cdnProvider = 'Akamai'

    const securityHeaders = {
      strictTransportSecurity: h.has('strict-transport-security'),
      contentSecurityPolicy: h.has('content-security-policy'),
      xFrameOptions: h.has('x-frame-options'),
      xContentTypeOptions: h.has('x-content-type-options'),
      referrerPolicy: h.has('referrer-policy'),
      permissionsPolicy: h.has('permissions-policy')
    }

    const missingHeaders = Object.entries(securityHeaders)
      .filter(([, present]) => !present)
      .map(([key]) => key)

    return {
      url: res.url || targetUrl,
      statusCode: res.status,
      server,
      poweredBy,
      cdnProvider,
      corsAllowOrigin,
      securityHeaders,
      missingHeaders
    }
  } catch {
    return null
  }
}

// ============================================================================
// 5. Public Crawl Discovery (robots.txt & security.txt)
// ============================================================================

export async function inspectCrawlDiscovery(domain: string): Promise<CrawlDiscoveryResult> {
  const disallowedPaths: string[] = []
  const declaredSitemaps: string[] = []
  const securityContacts: string[] = []
  let robotsTxtPresent = false
  let securityTxtPresent = false

  const [robotsRes, secRes] = await Promise.allSettled([
    fetchWithTimeout(`https://${domain}/robots.txt`, {}, 5000),
    fetchWithTimeout(`https://${domain}/.well-known/security.txt`, {}, 5000)
  ])

  if (robotsRes.status === 'fulfilled' && robotsRes.value.ok) {
    const contentType = robotsRes.value.headers.get('content-type') || ''
    if (contentType.includes('text/plain')) {
      robotsTxtPresent = true
      const text = await robotsRes.value.text()
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (line.toLowerCase().startsWith('disallow:')) {
          const val = line.slice(9).trim()
          if (val && val !== '/' && disallowedPaths.length < 40) disallowedPaths.push(val)
        } else if (line.toLowerCase().startsWith('sitemap:')) {
          const val = line.slice(8).trim()
          if (val && declaredSitemaps.length < 15) declaredSitemaps.push(val)
        }
      }
    }
  }

  if (secRes.status === 'fulfilled' && secRes.value.ok) {
    const contentType = secRes.value.headers.get('content-type') || ''
    if (contentType.includes('text/plain')) {
      securityTxtPresent = true
      const text = await secRes.value.text()
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (line.toLowerCase().startsWith('contact:')) {
          const val = line.slice(8).trim()
          if (val && securityContacts.length < 10) securityContacts.push(val)
        }
      }
    }
  }

  return {
    robotsTxtPresent,
    disallowedPaths: Array.from(new Set(disallowedPaths)),
    declaredSitemaps: Array.from(new Set(declaredSitemaps)),
    securityTxtPresent,
    securityContacts: Array.from(new Set(securityContacts))
  }
}

// ============================================================================
// 6. Full Unified Domain Reconnaissance
// ============================================================================

export async function runFullDomainRecon(rawDomain: string): Promise<DomainIntelligenceReport> {
  const domain = normalizeDomain(rawDomain)

  const [aRes, aaaaRes, mxRes, nsRes, txtRes, cnameRes, tlsInfo, subdomains, httpAudit, crawlDiscovery] =
    await Promise.all([
      dns.resolve4(domain).catch(() => [] as string[]),
      dns.resolve6(domain).catch(() => [] as string[]),
      dns.resolveMx(domain).catch(() => [] as Array<{ exchange: string; priority: number }>),
      dns.resolveNs(domain).catch(() => [] as string[]),
      dns.resolveTxt(domain).then((r) => r.map((c) => c.join(''))).catch(() => [] as string[]),
      dns.resolveCname(domain).catch(() => [] as string[]),
      inspectTlsCertificate(domain),
      fetchCtSubdomains(domain),
      auditHttpSecurity(domain),
      inspectCrawlDiscovery(domain)
    ])

  const emailSecurity = await auditEmailSecurity(domain, txtRes)

  // Merge SANs from live TLS into subdomain list
  const mergedSubs = new Set<string>(subdomains)
  if (tlsInfo?.subjectAltNames) {
    for (const san of tlsInfo.subjectAltNames) {
      const clean = san.toLowerCase().replace(/^\*\./, '')
      if (clean.endsWith(domain)) mergedSubs.add(clean)
    }
  }

  return {
    domain,
    timestamp: new Date().toISOString(),
    dns: {
      a: aRes,
      aaaa: aaaaRes,
      mx: mxRes,
      ns: nsRes,
      txt: txtRes,
      cname: cnameRes
    },
    emailSecurity,
    tls: tlsInfo,
    subdomains: Array.from(mergedSubs).sort(),
    httpAudit,
    crawlDiscovery
  }
}

// ============================================================================
// 7. IP & ASN / RDAP Reconnaissance
// ============================================================================

export async function runIpRecon(rawIp: string): Promise<IpIntelligenceReport> {
  const ip = rawIp.trim()
  const ipVersionNum = net.isIP(ip)
  if (ipVersionNum === 0) {
    throw new Error(`Invalid IPv4 or IPv6 address: ${ip}`)
  }

  const [reverseDns, ipwhoRes, rdapRes] = await Promise.all([
    dns.reverse(ip).catch(() => [] as string[]),
    fetchWithTimeout(`https://ipwho.is/${encodeURIComponent(ip)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetchWithTimeout(`https://rdap.org/ip/${encodeURIComponent(ip)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  ])

  const geoData = (ipwhoRes || {}) as Record<string, any>
  const connData = (geoData.connection || {}) as Record<string, any>
  const tzData = (geoData.timezone || {}) as Record<string, any>
  const rdapData = (rdapRes || {}) as Record<string, any>

  let cidr: string | null = null
  if (Array.isArray(rdapData.cidr0_cidrs) && rdapData.cidr0_cidrs.length > 0) {
    const first = rdapData.cidr0_cidrs[0]
    if (first.v4prefix && first.length) cidr = `${first.v4prefix}/${first.length}`
    else if (first.v6prefix && first.length) cidr = `${first.v6prefix}/${first.length}`
  }

  return {
    ip,
    version: ipVersionNum === 4 ? 'IPv4' : 'IPv6',
    reverseDns,
    geoAndAsn: {
      country: geoData.country || null,
      region: geoData.region || null,
      city: geoData.city || null,
      latitude: typeof geoData.latitude === 'number' ? geoData.latitude : null,
      longitude: typeof geoData.longitude === 'number' ? geoData.longitude : null,
      timezone: tzData.id || null,
      asn: typeof connData.asn === 'number' ? connData.asn : null,
      org: connData.org || null,
      isp: connData.isp || null
    },
    rdap: {
      handle: rdapData.handle || null,
      name: rdapData.name || null,
      cidr,
      country: rdapData.country || null
    }
  }
}

// ============================================================================
// 8. ITU-T E.164 Phone Metadata Parser
// ============================================================================

const COUNTRY_DIAL_MAP: Array<{ prefix: string; country: string; tz: string }> = [
  { prefix: '91', country: 'India', tz: 'Asia/Kolkata (UTC+05:30)' },
  { prefix: '1', country: 'United States / Canada (NANP)', tz: 'UTC-05:00 to UTC-08:00' },
  { prefix: '44', country: 'United Kingdom', tz: 'Europe/London (UTC+00:00)' },
  { prefix: '61', country: 'Australia', tz: 'UTC+08:00 to UTC+10:00' },
  { prefix: '49', country: 'Germany', tz: 'Europe/Berlin (UTC+01:00)' },
  { prefix: '33', country: 'France', tz: 'Europe/Paris (UTC+01:00)' },
  { prefix: '81', country: 'Japan', tz: 'Asia/Tokyo (UTC+09:00)' },
  { prefix: '65', country: 'Singapore', tz: 'Asia/Singapore (UTC+08:00)' },
  { prefix: '971', country: 'United Arab Emirates', tz: 'Asia/Dubai (UTC+04:00)' },
  { prefix: '55', country: 'Brazil', tz: 'America/Sao_Paulo (UTC-03:00)' },
  { prefix: '7', country: 'Russia / Kazakhstan', tz: 'UTC+03:00 to UTC+12:00' }
]

export function parsePhoneMetadata(rawPhone: string): PhoneFormatReport {
  const digitsOnly = rawPhone.replace(/[^\d]/g, '')
  const e164 = `+${digitsOnly}`
  const isValidE164 = /^\+[1-9]\d{6,14}$/.test(e164)

  const sortedPrefixes = [...COUNTRY_DIAL_MAP].sort((a, b) => b.prefix.length - a.prefix.length)
  const matched = sortedPrefixes.find((item) => digitsOnly.startsWith(item.prefix))

  return {
    rawInput: rawPhone,
    e164,
    isValidE164,
    countryCode: matched ? `+${matched.prefix}` : null,
    countryName: matched ? matched.country : null,
    nationalNumber: matched ? digitsOnly.slice(matched.prefix.length) : digitsOnly,
    TimezoneHint: matched ? matched.tz : null
  }
}

// ============================================================================
// 9. Public Identity Footprint Check (Gravatar MD5 & Public GitHub Profile)
// ============================================================================

export async function checkPublicIdentity(input: string): Promise<PublicIdentityReport> {
  const clean = input.trim()
  const isEmail = clean.includes('@')

  if (isEmail) {
    const normalizedEmail = clean.toLowerCase()
    const md5Hash = crypto.createHash('md5').update(normalizedEmail).digest('hex')
    const gravatarUrl = `https://www.gravatar.com/avatar/${md5Hash}?d=404`

    let gravatarExists = false
    try {
      const res = await fetchWithTimeout(gravatarUrl, { method: 'HEAD' }, 4500)
      gravatarExists = res.status === 200
    } catch {
      gravatarExists = false
    }

    return {
      input: clean,
      type: 'email',
      md5Hash,
      gravatarExists,
      gravatarAvatarUrl: gravatarExists ? `https://www.gravatar.com/avatar/${md5Hash}?s=256` : null
    }
  }

  // Public GitHub Developer Profile Lookup
  try {
    const res = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(clean)}`, {}, 5000)
    if (!res.ok) {
      return {
        input: clean,
        type: 'username',
        githubProfile: {
          exists: false,
          name: null,
          bio: null,
          publicRepos: 0,
          createdAt: null,
          profileUrl: null
        }
      }
    }

    const data = (await res.json()) as Record<string, any>
    return {
      input: clean,
      type: 'username',
      githubProfile: {
        exists: true,
        name: data.name || null,
        bio: data.bio || null,
        publicRepos: typeof data.public_repos === 'number' ? data.public_repos : 0,
        createdAt: data.created_at || null,
        profileUrl: data.html_url || null
      }
    }
  } catch {
    return {
      input: clean,
      type: 'username'
    }
  }
}
