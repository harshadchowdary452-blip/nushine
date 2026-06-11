export function formatIndianRupees(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)} Lakh`
  }
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  const numStr = Math.floor(abs).toString()
  const last3 = numStr.slice(-3)
  const rest = numStr.slice(0, -3)
  if (rest) {
    const groups: string[] = []
    let remaining = rest
    while (remaining.length > 0) {
      groups.unshift(remaining.slice(-2))
      remaining = remaining.slice(0, -2)
    }
    return `${sign}₹${groups.join(",")},${last3}`
  }
  return `${sign}₹${last3}`
}

export function formatIndianNumber(num: number): string {
  const abs = Math.abs(num)
  const sign = num < 0 ? "-" : ""
  const numStr = Math.floor(abs).toString()
  const last3 = numStr.slice(-3)
  const rest = numStr.slice(0, -3)
  if (rest) {
    const groups: string[] = []
    let remaining = rest
    while (remaining.length > 0) {
      groups.unshift(remaining.slice(-2))
      remaining = remaining.slice(0, -2)
    }
    return `${sign}${groups.join(",")},${last3}`
  }
  return `${sign}${last3}`
}

export function formatIndianCurrencyRange(min: number, max: number): string {
  return `${formatIndianRupees(min)} - ${formatIndianRupees(max)}`
}
