import { Group } from '../types.ts';

/**
 * Checks if two users share at least one group collective as members/creators.
 */
export function isSharedGroupMember(
  userAId?: string,
  userBId?: string,
  groups?: Group[] | Record<string, any>
): boolean {
  if (!userAId || !userBId || userAId === userBId) return false;
  if (!groups) return false;

  const groupList: any[] = Array.isArray(groups) ? groups : Object.values(groups);
  for (const g of groupList) {
    if (!g) continue;
    const rawParticipants = g.participants;
    const participants: string[] = Array.isArray(rawParticipants)
      ? rawParticipants.map(String)
      : (rawParticipants && typeof rawParticipants === 'object' ? Object.keys(rawParticipants) : []);

    const isAIn = participants.includes(userAId) || g.creatorId === userAId;
    const isBIn = participants.includes(userBId) || g.creatorId === userBId;
    if (isAIn && isBIn) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether current user is permitted to view the target user's serial code.
 * Strict Privacy Rule:
 * 1. Self: User can always view their own serial code (to share with friends).
 * 2. Saved Contact: User has saved the target user's contact.
 * 3. Shared Group: User and target user are members of at least one common group.
 * Otherwise: HIDDEN / PRIVATE.
 */
export function canViewUserSerial(params: {
  currentUserId?: string;
  targetUserId?: string;
  isSavedContact?: boolean;
  isSharedGroup?: boolean;
}): boolean {
  const { currentUserId, targetUserId, isSavedContact, isSharedGroup } = params;
  if (!currentUserId || !targetUserId) return false;
  if (currentUserId === targetUserId) return true;
  if (isSavedContact) return true;
  if (isSharedGroup) return true;
  return false;
}

/**
 * Generates an unchangeable, random 6-digit serial code (e.g. ORB-749201).
 */
export function generateRandomSerialCode(): string {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `ORB-${randomNum}`;
}
