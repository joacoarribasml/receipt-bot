export function isAllowedUser(userId: string | undefined, allowedUserIds: Set<string>): boolean {
  return userId !== undefined && allowedUserIds.has(userId);
}
