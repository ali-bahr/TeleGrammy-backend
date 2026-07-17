/**
 * Privacy visibility helpers.
 *
 * These operate on an already-loaded target user document (or plain object) that
 * includes its `contacts` array and the relevant visibility setting. A contact
 * entry has a `contactId` and a `blockDetails.status` of "blocked"/"not_blocked".
 *
 * Visibility settings use the existing enum values: "EveryOne" | "Contacts" | "Nobody".
 */

const idEquals = (a, b) => {
  if (a === undefined || a === null || b === undefined || b === null) {
    return false;
  }
  return a.toString() === b.toString();
};

/**
 * True when `requesterId` is present in the target user's contacts.
 */
const isContact = (targetUser, requesterId) => {
  if (!targetUser || !Array.isArray(targetUser.contacts)) return false;
  return targetUser.contacts.some((contact) =>
    idEquals(contact.contactId, requesterId)
  );
};

/**
 * True when the target user has blocked the requester.
 */
const isBlockedBy = (targetUser, requesterId) => {
  if (!targetUser || !Array.isArray(targetUser.contacts)) return false;
  return targetUser.contacts.some(
    (contact) =>
      idEquals(contact.contactId, requesterId) &&
      contact.blockDetails &&
      contact.blockDetails.status === "blocked"
  );
};

/**
 * Decide whether `requesterId` may see an attribute of `targetUser` given the
 * target's chosen `setting`. A user can always see their own data, and a blocked
 * requester can never see anything.
 */
const canView = (targetUser, requesterId, setting) => {
  if (targetUser && idEquals(targetUser._id, requesterId)) return true;
  if (isBlockedBy(targetUser, requesterId)) return false;

  switch (setting) {
    case "Nobody":
      return false;
    case "Contacts":
      return isContact(targetUser, requesterId);
    case "EveryOne":
      return true;
    default:
      // Unknown/undefined setting falls back to the model default ("EveryOne").
      return true;
  }
};

module.exports = {isContact, isBlockedBy, canView};
