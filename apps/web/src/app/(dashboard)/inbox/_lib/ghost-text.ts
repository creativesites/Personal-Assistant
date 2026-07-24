/**
 * Ghost Text Completion Predictor
 * Provides lightweight inline sentence completions based on common relationship messaging patterns
 */

const COMMON_COMPLETIONS: Record<string, string[]> = {
  'thanks': [' for reaching out! How can I assist you today?', ' for your patience! I am looking into this right away.'],
  'thank you': [' for your update! I will review and get back to you shortly.', ' for choosing us! Let me know if you need anything else.'],
  'hi': [' there! Great to hear from you.', '! How can I help you today?'],
  'hello': ['! Hope you are having a productive week.', '! Thanks for connecting.'],
  'i have': [' attached the quotation for your review.', ' updated your account details.'],
  'please find': [' the invoice attached below.', ' our proposal for your review.'],
  'let me know': [' if you have any questions or if you would like to schedule a call.', ' when you are available for a brief catch-up.'],
  'sure': [', I will send that over right away.', ', happy to assist with this!'],
  'sounds good': [', let us touch base tomorrow afternoon.', '! Looking forward to working together.'],
  'i will': [' follow up with our operations team and update you soon.', ' send you a meeting invite shortly.'],
  'can we': [' schedule a quick 15-minute call to discuss details?', ' confirm the delivery address before processing?'],
}

export function predictGhostText(input: string, context?: { contactName?: string; isGroup?: boolean }): string {
  if (!input || input.trim().length < 2) return ''

  const lower = input.trim().toLowerCase()

  for (const [prefix, completions] of Object.entries(COMMON_COMPLETIONS)) {
    if (lower === prefix || lower.endsWith(' ' + prefix)) {
      const option = completions[0]
      if (option) {
        if (context?.contactName && option.includes('there!')) {
          return ` ${context.contactName}! ${option.split('there! ')[1] || ''}`
        }
        return option
      }
    } else if (prefix.startsWith(lower) && prefix.length > lower.length) {
      const remainingPrefix = prefix.slice(lower.length)
      const option = completions[0]
      return remainingPrefix + option
    }
  }

  return ''
}
