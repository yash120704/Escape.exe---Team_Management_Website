export const REQUIRED_EMAIL_DOMAIN = 'vitstudent.ac.in';

export function isAllowedEmailDomain(email: string | null | undefined) {
  return Boolean(email?.trim().toLowerCase().endsWith(`@${REQUIRED_EMAIL_DOMAIN}`));
}
