export const USERNAME_REGEX = /^[A-Za-z][A-Za-z0-9]*$/;


export const BOT_USERNAME_REGEX = /^_bot[A-Za-z0-9]+$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_REGEX.test(String(value || '').trim());
}

export function isValidBotUsername(value: string): boolean {
  return BOT_USERNAME_REGEX.test(String(value || '').trim());
}
