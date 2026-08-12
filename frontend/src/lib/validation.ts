const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label} darf nicht leer sein.`
}

export function validateMinLength(value: string, min: number, label: string): string | null {
  if (!value) return null
  return value.length >= min ? null : `${label} muss mindestens ${min} Zeichen lang sein.`
}

export function validateMaxLength(value: string, max: number, label: string): string | null {
  return value.length <= max ? null : `${label} darf höchstens ${max} Zeichen lang sein.`
}

export function validateEmail(value: string): string | null {
  if (!value) return null
  return EMAIL_PATTERN.test(value) ? null : 'Bitte eine gültige E-Mail-Adresse eingeben.'
}
