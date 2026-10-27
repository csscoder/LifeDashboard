import { describe, expect, it } from 'vitest'
import { bindingLine } from '../app/widgets/secret-binding'

describe('bindingLine', () => {
  it('describes a header binding with its original header name', () => {
    expect(bindingLine({ key: 'apiKey', title: 'Key', bind: { origin: 'https://a.example', header: 'Authorization', prefix: 'Bearer ' } }))
      .toBe('Secret «Key» is sent to https://a.example (header Authorization)')
  })

  it('describes a query binding with its original parameter name', () => {
    expect(bindingLine({ key: 'apiKey', title: 'Key', bind: { origin: 'https://a.example', query: 'apikey' } }))
      .toBe('Secret «Key» is sent to https://a.example (parameter apikey)')
  })
})
