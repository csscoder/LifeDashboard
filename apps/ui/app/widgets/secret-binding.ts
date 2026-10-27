import type { BoundSecret } from '@lifedashboard/contracts/widget-secrets'

export function bindingLine(secret: BoundSecret): string {
  const { title, bind } = secret
  const target = 'header' in bind ? `header ${bind.header}` : `parameter ${bind.query}`
  return `Secret «${title}» is sent to ${bind.origin} (${target})`
}
