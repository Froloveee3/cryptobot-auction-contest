export const USERNAME_REGEX = /^[A-Za-z][A-Za-z0-9]*$/;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export const isValidUsername = (value: string): boolean => USERNAME_REGEX.test(String(value || '').trim());
export const isValidPassword = (value: string): boolean => PASSWORD_REGEX.test(String(value || '').trim());
