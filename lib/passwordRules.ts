export function isRegistrationPasswordValid(password: string): boolean {
  return Array.from(password).length >= 6
}
