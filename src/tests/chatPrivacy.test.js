/* eslint-disable no-undef */
const chatController = require("../controllers/chat/chat");
const chatService = require("../services/chatService");
const userService = require("../services/userService");
const messageService = require("../services/messageService");

jest.mock("../services/chatService");
jest.mock("../services/userService");
jest.mock("../services/messageService");
jest.mock("../services/groupService");

const buildChat = (otherLastSeen = "OTHER_LS") => ({
  _id: "chat1",
  isGroup: false,
  isChannel: false,
  participants: [
    {userId: {_id: "me", lastSeen: "MY_LS"}, joinedAt: new Date(), role: "Member"},
    {
      userId: {_id: "other", username: "other", lastSeen: otherLastSeen},
      joinedAt: new Date(),
      role: "Member",
    },
  ],
  lastMessage: null,
});

const run = async (otherUserSettings) => {
  chatService.getChatById.mockResolvedValue(buildChat());
  userService.getUserById.mockResolvedValue(otherUserSettings);
  messageService.fetchChatMessages.mockResolvedValue([]);
  messageService.countChatMessages.mockResolvedValue(0);

  const req = {params: {id: "chat1"}, query: {}, user: {id: "me"}};
  const json = jest.fn();
  const res = {status: jest.fn().mockReturnValue({json}), json};
  const next = jest.fn();
  await chatController.getChatById(req, res, next);

  const other = json.mock.calls[0][0].chat.participants[1];
  return other.userId.lastSeen;
};

describe("getChatById last-seen visibility (P6)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("keeps lastSeen when the other user's visibility is EveryOne", async () => {
    const lastSeen = await run({
      _id: "other",
      lastSeenVisibility: "EveryOne",
      contacts: [],
    });
    expect(lastSeen).toBe("OTHER_LS");
  });

  it("nulls lastSeen for a non-contact when visibility is Contacts", async () => {
    const lastSeen = await run({
      _id: "other",
      lastSeenVisibility: "Contacts",
      contacts: [],
    });
    expect(lastSeen).toBeNull();
  });

  it("nulls lastSeen for a blocked requester even under EveryOne", async () => {
    const lastSeen = await run({
      _id: "other",
      lastSeenVisibility: "EveryOne",
      contacts: [{contactId: "me", blockDetails: {status: "blocked"}}],
    });
    expect(lastSeen).toBeNull();
  });
});
