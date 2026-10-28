export function numberFormatOptions(integer: boolean): Intl.NumberFormatOptions {
  return integer ? { useGrouping: false, maximumFractionDigits: 0 } : { useGrouping: false, maximumSignificantDigits: 17 }
}
