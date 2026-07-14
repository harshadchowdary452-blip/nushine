import { describe, it, expect } from "vitest"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

describe("formatIndianRupees", () => {
  it("formats zero", () => {
    expect(formatIndianRupees(0)).toBe("₹0")
  })

  it("formats small amounts", () => {
    expect(formatIndianRupees(500)).toBe("₹500")
    expect(formatIndianRupees(999)).toBe("₹999")
  })

  it("formats thousands with Indian comma system", () => {
    expect(formatIndianRupees(1000)).toBe("₹1,000")
    expect(formatIndianRupees(10000)).toBe("₹10,000")
    expect(formatIndianRupees(100000)).toBe("₹1,00,000")
    expect(formatIndianRupees(1000000)).toBe("₹10,00,000")
  })

  it("formats crores with abbreviation", () => {
    expect(formatIndianRupees(10000000)).toBe("₹1.00Cr")
    expect(formatIndianRupees(12500000)).toBe("₹1.25Cr")
    expect(formatIndianRupees(100000000)).toBe("₹10.00Cr")
  })

  it("handles negative amounts", () => {
    expect(formatIndianRupees(-500)).toBe("-₹500")
    expect(formatIndianRupees(-10000000)).toBe("-₹1.00Cr")
  })
})

describe("formatIndianNumber", () => {
  it("formats zero", () => {
    expect(formatIndianNumber(0)).toBe("0")
  })

  it("formats with Indian comma system", () => {
    expect(formatIndianNumber(1000)).toBe("1,000")
    expect(formatIndianNumber(100000)).toBe("1,00,000")
    expect(formatIndianNumber(10000000)).toBe("1,00,00,000")
  })
})
