export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidPassword(value: string): boolean {
  return PASSWORD_REGEX.test(String(value || '').trim());
}
