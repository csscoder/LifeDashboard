import { describe, expect, it } from 'vitest'
import { isPublicAddress } from '../src/address.ts'

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1', '127.255.255.255', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0',
    '0.1.2.3', '224.0.0.1', '239.255.255.255', '::1', '::', 'fd00::1', 'fc00::1',
    'fe80::1', 'febf::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1', '', 'not-an-address',
  ])('rejects non-public or invalid address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808', '::ffff:0:808:808', '172.15.255.255', '172.32.0.1', '100.128.0.1'])('accepts public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })
})
