/* eslint-disable no-undef */
const {isContact, isBlockedBy, canView} = require("../utils/visibility");

const makeUser = ({id, contacts = []} = {}) => ({_id: id, contacts});
const contact = (contactId, status = "not_blocked") => ({
  contactId,
  blockDetails: {status},
});

describe("visibility helpers", () => {
  describe("isContact", () => {
    it("is true when the requester is in the target's contacts", () => {
      expect(isContact(makeUser({id: "t", contacts: [contact("r")]}), "r")).toBe(
        true
      );
    });
    it("is false when the requester is not a contact", () => {
      expect(isContact(makeUser({id: "t", contacts: [contact("x")]}), "r")).toBe(
        false
      );
    });
    it("is false when contacts are missing", () => {
      expect(isContact({_id: "t"}, "r")).toBe(false);
    });
  });

  describe("isBlockedBy", () => {
    it("is true when the target has blocked the requester", () => {
      expect(
        isBlockedBy(makeUser({id: "t", contacts: [contact("r", "blocked")]}), "r")
      ).toBe(true);
    });
    it("is false when the contact exists but is not blocked", () => {
      expect(
        isBlockedBy(makeUser({id: "t", contacts: [contact("r")]}), "r")
      ).toBe(false);
    });
  });

  describe("canView", () => {
    it("always allows a user to view their own data", () => {
      expect(canView(makeUser({id: "me"}), "me", "Nobody")).toBe(true);
    });
    it("denies everyone else under Nobody", () => {
      expect(canView(makeUser({id: "t", contacts: [contact("r")]}), "r", "Nobody")).toBe(
        false
      );
    });
    it("allows a non-contact under EveryOne", () => {
      expect(canView(makeUser({id: "t"}), "r", "EveryOne")).toBe(true);
    });
    it("allows a contact under Contacts", () => {
      expect(
        canView(makeUser({id: "t", contacts: [contact("r")]}), "r", "Contacts")
      ).toBe(true);
    });
    it("denies a non-contact under Contacts", () => {
      expect(
        canView(makeUser({id: "t", contacts: [contact("x")]}), "r", "Contacts")
      ).toBe(false);
    });
    it("denies a blocked requester even under EveryOne", () => {
      expect(
        canView(makeUser({id: "t", contacts: [contact("r", "blocked")]}), "r", "EveryOne")
      ).toBe(false);
    });
    it("denies a blocked requester even if they are a contact", () => {
      expect(
        canView(makeUser({id: "t", contacts: [contact("r", "blocked")]}), "r", "Contacts")
      ).toBe(false);
    });
    it("defaults to visible for an unknown/undefined setting", () => {
      expect(canView(makeUser({id: "t"}), "r", undefined)).toBe(true);
    });
  });
});
