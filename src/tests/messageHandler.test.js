/* eslint-disable no-undef */
const userService = require("../services/userService");
const chatService = require("../services/chatService");
const messageService = require("../services/messageService");

jest.mock("../services/userService");
jest.mock("../services/chatService");
jest.mock("../services/messageService");
jest.mock("../services/groupService");
jest.mock("../services/channelService");
jest.mock("../utils/firebaseMessaging");
jest.mock("../eventHandlers/utils/groupMessageHandlers");
jest.mock("../eventHandlers/utils/utilsFunc");
// Factory-mock the AI classes so the ML library is never loaded in tests.
jest.mock("../classes/AIModelFactory", () => jest.fn());
jest.mock("../classes/AIInferenceContext", () => jest.fn());

const {
  sendMessage,
  updateMessageViewres,
} = require("../eventHandlers/chat/message");
const {logThenEmit} = require("../eventHandlers/utils/utilsFunc");

const contact = (contactId, status) => ({contactId, blockDetails: {status}});

describe("sendMessage block enforcement (P4)", () => {
  let socket;
  let io;
  let callback;

  beforeEach(() => {
    jest.resetAllMocks();
    socket = {userId: "me", user: {name: "Me"}, emit: jest.fn()};
    io = {to: jest.fn().mockReturnValue({emit: jest.fn()})};
    callback = jest.fn();
    chatService.getBasicChatById.mockResolvedValue({
      isGroup: false,
      isChannel: false,
    });
    chatService.getChatParticipants.mockResolvedValue([
      {userId: "me"},
      {userId: "other"},
    ]);
  });

  it("rejects a 1:1 message when the sender has blocked the recipient", async () => {
    userService.getUserById.mockImplementation((id) =>
      id === "me"
        ? Promise.resolve({_id: "me", contacts: [contact("other", "blocked")]})
        : Promise.resolve({_id: "other", contacts: []})
    );

    await sendMessage({io, socket})({chatId: "c1"}, callback);

    expect(callback).toHaveBeenCalledWith({
      status: "error",
      message: "Cannot send message. User is blocked.",
    });
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });

  it("rejects a 1:1 message when the recipient has blocked the sender", async () => {
    userService.getUserById.mockImplementation((id) =>
      id === "me"
        ? Promise.resolve({_id: "me", contacts: []})
        : Promise.resolve({_id: "other", contacts: [contact("me", "blocked")]})
    );

    await sendMessage({io, socket})({chatId: "c1"}, callback);

    expect(callback).toHaveBeenCalledWith({
      status: "error",
      message: "Cannot send message. User is blocked.",
    });
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });
});

describe("updateMessageViewres read-receipts gate (P5)", () => {
  let socket;
  let io;

  beforeEach(() => {
    jest.resetAllMocks();
    socket = {userId: "me", emit: jest.fn()};
    io = {to: jest.fn().mockReturnValue({emit: jest.fn()})};
    chatService.updateUserSeen.mockResolvedValue();
  });

  it("records and emits 'seen' when the viewer has read receipts enabled", async () => {
    userService.getUserById.mockResolvedValue({_id: "me", readReceipts: true});
    messageService.updateChatViewers.mockResolvedValue({
      senderId: {_id: "sender"},
    });

    await updateMessageViewres({io, socket})({chatId: "c1", messageId: "m1"});

    expect(messageService.updateChatViewers).toHaveBeenCalled();
    expect(logThenEmit).toHaveBeenCalled();
  });

  it("suppresses 'seen' (no record, no emit) when read receipts are disabled", async () => {
    userService.getUserById.mockResolvedValue({_id: "me", readReceipts: false});

    await updateMessageViewres({io, socket})({chatId: "c1", messageId: "m1"});

    // The viewer's own unread count is still cleared...
    expect(chatService.updateUserSeen).toHaveBeenCalledWith("c1", "me");
    // ...but nothing is recorded or emitted to the sender.
    expect(messageService.updateChatViewers).not.toHaveBeenCalled();
    expect(logThenEmit).not.toHaveBeenCalled();
  });
});
