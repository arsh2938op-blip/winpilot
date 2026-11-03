// src/main/plugins/osint/capabilities.ts
import { registerCapability } from '../../flameCore/capabilities'
import { emitAgentActivity } from '../../utils/broadcast'
import {
  runFullDomainRecon,
  runIpRecon,
  parsePhoneMetadata,
  checkPublicIdentity
} from '../../services/osint'

export interface OsintExecutionResult {
  success: boolean
  message: string
  data?: unknown
}

// ---------------------------------------------------------------------------
// 1. Standalone Executors (used by Chat Mode & Fast Paths)
// ---------------------------------------------------------------------------

export async function executeDomainOsint(
  rawDomain: string,
  requestId?: string
): Promise<OsintExecutionResult> {
  const domain = String(rawDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]

  if (!domain) {
    return { success: false, message: 'Domain name is required (e.g. example.com).' }
  }

  try {
    emitAgentActivity(requestId, `[OSINT] Starting domain scan: ${domain}`)
    const report = await runFullDomainRecon(domain)
    emitAgentActivity(requestId, `[OSINT] Domain scan complete — ${report.subdomains.length} CT subdomains found`)

    const lines: string[] = [
      `## 🌐 Domain OSINT — ${report.domain}`,
      `> Scanned at ${report.timestamp}`,
      '',
      '### DNS Records',
      `- **A:** ${report.dns.a.join(', ') || 'none'}`,
      `- **AAAA:** ${report.dns.aaaa.join(', ') || 'none'}`,
      `- **NS:** ${report.dns.ns.join(', ') || 'none'}`,
      `- **MX:** ${report.dns.mx.map((r) => `${r.exchange} (prio ${r.priority})`).join(', ') || 'none'}`,
      `- **TXT records:** ${report.dns.txt.length}`,
      '',
      '### Email Security Audit (SPF & DMARC)',
      `- **Security Score:** **${report.emailSecurity.securityScore}/100**`,
      `- **SPF Present:** ${report.emailSecurity.hasSpf ? '✅ Yes' : '❌ Missing'}`,
      report.emailSecurity.spfRecord ? `  \`${report.emailSecurity.spfRecord}\`` : '',
      `- **DMARC Present:** ${report.emailSecurity.hasDmarc ? '✅ Yes' : '❌ Missing'} (policy: \`${report.emailSecurity.dmarcPolicy}\`)`,
      report.emailSecurity.dmarcRecord ? `  \`${report.emailSecurity.dmarcRecord}\`` : '',
      ...(report.emailSecurity.warnings.length
        ? ['- **Warnings:**', ...report.emailSecurity.warnings.map((w) => `  ⚠️ ${w}`)]
        : [])
    ].filter(Boolean)

    if (report.httpAudit) {
      lines.push(
        '',
        '### HTTP Security & Stack',
        `- **Status:** \`${report.httpAudit.statusCode}\``,
        `- **CDN:** ${report.httpAudit.cdnProvider || 'None detected'}`,
        `- **Server:** ${report.httpAudit.server || 'Hidden'}`,
        `- **Powered By:** ${report.httpAudit.poweredBy || 'Hidden'}`,
        `- **Missing Security Headers:** ${report.httpAudit.missingHeaders.join(', ') || 'None (all present ✅)'}`
      )
    }

    if (report.tls) {
      lines.push(
        '',
        '### TLS Certificate',
        `- **Valid Until:** ${report.tls.validTo} (${report.tls.daysRemaining} days remaining)`,
        `- **Issuer:** ${typeof report.tls.issuer === 'object' ? (report.tls.issuer as any).CN || JSON.stringify(report.tls.issuer) : String(report.tls.issuer)}`,
        `- **SHA-256 Fingerprint:** \`${report.tls.fingerprint256}\``,
        `- **SANs:** ${report.tls.subjectAltNames.length} names`
      )
    }

    if (report.crawlDiscovery.robotsTxtPresent || report.crawlDiscovery.securityTxtPresent) {
      lines.push(
        '',
        '### Crawl & Security Discovery',
        `- **robots.txt:** ${report.crawlDiscovery.robotsTxtPresent ? '✅ Present' : 'Not found'}`,
        `- **security.txt:** ${report.crawlDiscovery.securityTxtPresent ? '✅ Present' : 'Not found'}`
      )
      if (report.crawlDiscovery.securityContacts.length) {
        lines.push(`- **Security Contacts:** ${report.crawlDiscovery.securityContacts.join(', ')}`)
      }
    }

    if (report.subdomains.length) {
      lines.push(
        '',
        `### Discovered Subdomains (${report.subdomains.length})`,
        report.subdomains.slice(0, 30).map((s) => `- \`${s}\``).join('\n'),
        report.subdomains.length > 30 ? `_…and ${report.subdomains.length - 30} more_` : ''
      )
    }

    return { success: true, message: lines.join('\n'), data: report }
  } catch (err) {
    return { success: false, message: `Domain OSINT failed for "${domain}": ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function executeIpOsint(
  rawIp: string,
  requestId?: string
): Promise<OsintExecutionResult> {
  try {
    emitAgentActivity(requestId, `[OSINT] Querying IP: ${rawIp}`)
    const report = await runIpRecon(rawIp)
    emitAgentActivity(requestId, `[OSINT] IP query complete`)

    const lines = [
      `## 📍 IP OSINT — ${report.ip} (${report.version})`,
      '',
      '### Geolocation & Network',
      `- **Organization:** ${report.geoAndAsn.org || 'Unknown'}`,
      `- **ISP:** ${report.geoAndAsn.isp || 'Unknown'}`,
      `- **ASN:** ${report.geoAndAsn.asn ? `AS${report.geoAndAsn.asn}` : 'Unknown'}`,
      `- **Location:** ${[report.geoAndAsn.city, report.geoAndAsn.region, report.geoAndAsn.country].filter(Boolean).join(', ') || 'Unknown'}`,
      `- **Timezone:** ${report.geoAndAsn.timezone || 'Unknown'}`,
      `- **Coordinates:** ${report.geoAndAsn.latitude !== null && report.geoAndAsn.longitude !== null ? `${report.geoAndAsn.latitude}, ${report.geoAndAsn.longitude}` : 'Unknown'}`,
      '',
      '### DNS & RDAP',
      `- **Reverse DNS:** ${report.reverseDns.join(', ') || 'None'}`,
      `- **RDAP Network:** ${report.rdap.name || 'Unknown'} (\`${report.rdap.cidr || 'N/A'}\`)`,
      `- **RDAP Handle:** ${report.rdap.handle || 'N/A'}`
    ]

    return { success: true, message: lines.join('\n'), data: report }
  } catch (err) {
    return { success: false, message: `IP recon failed for "${rawIp}": ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function executePhoneOsint(
  phone: string,
  requestId?: string
): OsintExecutionResult {
  emitAgentActivity(requestId, `[OSINT] Parsing phone format: ${phone}`)
  const report = parsePhoneMetadata(phone)
  const lines = [
    `## 📞 Phone Metadata — ${report.e164}`,
    `- **Valid E.164:** ${report.isValidE164 ? '✅ Yes' : '⚠️ No'}`,
    `- **Country:** ${report.countryName || 'Unknown'}`,
    `- **Country Dialing Code:** ${report.countryCode || 'Unknown'}`,
    `- **National Number:** ${report.nationalNumber}`,
    `- **Timezone Hint:** ${report.TimezoneHint || 'N/A'}`
  ]
  return { success: true, message: lines.join('\n'), data: report }
}

export async function executeIdentityOsint(
  input: string,
  requestId?: string
): Promise<OsintExecutionResult> {
  try {
    emitAgentActivity(requestId, `[OSINT] Checking public identity: ${input}`)
    const report = await checkPublicIdentity(input)
    const lines = [`## 👤 Public Identity Footprint — ${report.input} (${report.type})`, '']
    if (report.type === 'email') {
      lines.push(
        `- **MD5 Hash:** \`${report.md5Hash}\``,
        `- **Gravatar Profile:** ${report.gravatarExists ? '✅ Active profile found' : 'None detected'}`
      )
      if (report.gravatarAvatarUrl) {
        lines.push(`- **Avatar:** ${report.gravatarAvatarUrl}`)
      }
    } else {
      if (report.githubProfile?.exists) {
        lines.push(
          `- **GitHub Developer:** ✅ Active profile found`,
          `- **Name:** ${report.githubProfile.name || 'N/A'}`,
          `- **Bio:** ${report.githubProfile.bio || 'N/A'}`,
          `- **Public Repositories:** ${report.githubProfile.publicRepos}`,
          `- **Profile URL:** ${report.githubProfile.profileUrl || 'N/A'}`
        )
      } else {
        lines.push('- **GitHub Profile:** Not found or rate-limited')
      }
    }
    return { success: true, message: lines.join('\n'), data: report }
  } catch (err) {
    return { success: false, message: `Identity check failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ---------------------------------------------------------------------------
// 2. FlameCore Capabilities Registration
// ---------------------------------------------------------------------------

export function registerOsintCapabilities(): void {
  registerCapability({
    name: 'osint.domainRecon',
    description:
      'Run a full passive OSINT audit on a domain: DNS records (A, AAAA, MX, NS, TXT, CNAME), SPF/DMARC email spoofing audit, live TLS certificate + SANs, crt.sh subdomains, HTTP security headers, CDN detection, and robots.txt/security.txt discovery.',
    parameters: {
      domain: {
        type: 'string',
        description: 'Target domain name (e.g., example.com)',
        required: true
      }
    },
    execute: async (args) => {
      const domain = String(args.domain || '').trim()
      if (!domain) {
        return { success: false, message: 'A valid domain parameter is required.' }
      }
      const report = await runFullDomainRecon(domain)
      return {
        success: true,
        message: `Completed OSINT recon for ${report.domain}: ${report.subdomains.length} subdomains, Email Security Score ${report.emailSecurity.securityScore}/100, CDN: ${report.httpAudit?.cdnProvider || 'None detected'}.`,
        data: report
      }
    }
  })

  registerCapability({
    name: 'osint.ipRecon',
    description:
      'Inspect an IPv4 or IPv6 address for reverse DNS PTR records, ASN, ISP, geolocation, and RDAP network registration block.',
    parameters: {
      ip: {
        type: 'string',
        description: 'Target IPv4 or IPv6 address (e.g., 1.1.1.1)',
        required: true
      }
    },
    execute: async (args) => {
      const ip = String(args.ip || '').trim()
      if (!ip) {
        return { success: false, message: 'An IP address parameter is required.' }
      }
      const report = await runIpRecon(ip)
      return {
        success: true,
        message: `IP ${report.ip} (${report.geoAndAsn.org || 'Unknown Org'}, ASN ${report.geoAndAsn.asn || 'N/A'}) located in ${report.geoAndAsn.city || 'Unknown'}, ${report.geoAndAsn.country || 'Unknown'}.`,
        data: report
      }
    }
  })

  registerCapability({
    name: 'osint.phoneMetadata',
    description:
      'Validate a phone number against ITU-T E.164 formatting rules and extract its country dialing code, region, and timezone hint.',
    parameters: {
      phone: {
        type: 'string',
        description: 'Phone number with country code (e.g., +919876543210)',
        required: true
      }
    },
    execute: async (args) => {
      const phone = String(args.phone || '').trim()
      if (!phone) {
        return { success: false, message: 'A phone number is required.' }
      }
      const report = parsePhoneMetadata(phone)
      return {
        success: true,
        message: `Parsed ${report.e164} (${report.countryName || 'Unknown Region'}, Valid E.164: ${report.isValidE164}).`,
        data: report
      }
    }
  })

  registerCapability({
    name: 'osint.identityCheck',
    description:
      'Check a public email address for an active Gravatar MD5 profile, or check a username for a public GitHub developer profile.',
    parameters: {
      input: {
        type: 'string',
        description: 'Public email address or developer username',
        required: true
      }
    },
    execute: async (args) => {
      const input = String(args.input || '').trim()
      if (!input) {
        return { success: false, message: 'An email or username parameter is required.' }
      }
      const report = await checkPublicIdentity(input)
      return {
        success: true,
        message: `Checked public identity footprint for ${report.input} (${report.type}).`,
        data: report
      }
    }
  })
}
