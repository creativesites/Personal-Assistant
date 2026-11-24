import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

/**
 * Format a stored phone number for display: "260971234567" → "+260 97 1234567".
 * Contacts store bare international digits (from the WhatsApp JID), so a
 * leading "+" is assumed when missing. Falls back to "+digits" for numbers
 * libphonenumber can't parse, and to '' for empty input.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone
  const parsed = parsePhoneNumberFromString(`+${digits}`)
  return parsed ? parsed.formatInternational() : `+${digits}`
}

/** True when a display name is just the phone number (e.g. "+260971234567"). */
export function isPhoneLikeName(name: string | null | undefined): boolean {
  return !!name && /^\+?[\d\s()-]{6,}$/.test(name.trim())
}

/**
 * Display label for a contact: the real name when there is one, otherwise the
 * formatted phone number. The API already avoids raw WhatsApp ids, returning
 * "+<digits>" or "WhatsApp contact" when there's no name.
 */
export function contactLabel(name: string | null | undefined, phone?: string | null): string {
  if (name && !isPhoneLikeName(name)) return name
  return formatPhone(phone || name) || name || 'WhatsApp contact'
}
