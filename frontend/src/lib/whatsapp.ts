export function generateWhatsAppLink(phone: string, message?: string): string {
  const clean = phone.replace(/[\s\-+]/g, "")
  const num = clean.startsWith("91") || clean.startsWith("1") ? clean : "91" + clean
  return message
    ? `https://wa.me/${num}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${num}`
}

export function generateWebWhatsAppLink(phone: string, message?: string): string {
  const clean = phone.replace(/[\s\-+]/g, "")
  const num = clean.startsWith("91") || clean.startsWith("1") ? clean : "91" + clean
  return message
    ? `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${num}`
}

export function openWhatsApp(phone: string, message?: string) {
  const link = generateWhatsAppLink(phone, message)
  window.open(link, "_blank")
}
