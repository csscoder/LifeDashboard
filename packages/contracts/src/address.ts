import { BlockList, isIP } from 'node:net'

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(address, prefix, 'ipv6')

/** Addresses usable by approved DNS names; explicit literal origins are handled separately. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  if (family === 4) return !blocked.check(address, 'ipv4')
  // URL serialization normalizes expanded and dotted IPv4-mapped spellings alike.
  let normalized: string
  try {
    normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  } catch {
    return false
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized)
  if (mapped) {
    const high = Number.parseInt(mapped[1]!, 16)
    const low = Number.parseInt(mapped[2]!, 16)
    const ipv4 = `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`
    return !blocked.check(ipv4, 'ipv4')
  }
  return !blocked.check(normalized, 'ipv6')
}
