/* eslint-disable no-undef */
const messageService = require("../services/messageService");
const Message = require("../models/message");
const Chat = require("../models/chat");

jest.mock("../models/message");
jest.mock("../models/chat");

describe("Message Service - read receipts (single bulk update)", () => {
  const viewerId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("updateChatViewers updates all messages up to the timestamp in ONE bulk query", async () => {
    const ts = new Date("2024-01-01T00:00:00Z");
    const target = {_id: "m1", timestamp: ts};
    Message.findById.mockResolvedValue(target);
    Chat.findById.mockResolvedValue({participants: [{}, {}]});
    Message.updateMany.mockResolvedValue({modifiedCount: 3});

    const result = await messageService.updateChatViewers(
      "chat1",
      "m1",
      viewerId
    );

    // Returns the (reloaded) target message
    expect(result).toBe(target);
    // A single bulk update covers every message up to the timestamp.
    expect(Message.updateMany).toHaveBeenCalledTimes(1);
    expect(Message.find).not.toHaveBeenCalled();

    const [filter, pipeline] = Message.updateMany.mock.calls[0];
    expect(filter).toEqual({chatId: "chat1", timestamp: {$lte: ts}});
    expect(Array.isArray(pipeline)).toBe(true);
    // First stage unions the viewer into the existing array.
    expect(pipeline[0].$set.viewers.$setUnion[0]).toEqual({
      $ifNull: ["$viewers", []],
    });
    // Second stage promotes to "seen"
    expect(pipeline[1].$set.status.$cond[1]).toBe("seen");
  });

  test("updateChatViewers throws when the chat is missing and issues no update", async () => {
    Message.findById.mockResolvedValue({_id: "m1", timestamp: new Date()});
    Chat.findById.mockResolvedValue(null);

    await expect(
      messageService.updateChatViewers("chat1", "m1", viewerId)
    ).rejects.toThrow("Chat not found");
    expect(Message.updateMany).not.toHaveBeenCalled();
  });

  test("updateMessageRecivers updates all messages up to the timestamp in ONE bulk query", async () => {
    const ts = new Date("2024-01-01T00:00:00Z");
    const target = {_id: "m1", timestamp: ts};
    Message.findById.mockResolvedValue(target);
    Chat.findById.mockResolvedValue({participants: [{}, {}, {}]});
    Message.updateMany.mockResolvedValue({modifiedCount: 5});

    const result = await messageService.updateMessageRecivers(
      "chat1",
      "m1",
      viewerId
    );

    expect(result).toBe(target);
    expect(Message.updateMany).toHaveBeenCalledTimes(1);
    expect(Message.find).not.toHaveBeenCalled();

    const [filter, pipeline] = Message.updateMany.mock.calls[0];
    expect(filter).toEqual({chatId: "chat1", timestamp: {$lte: ts}});
    expect(pipeline[0].$set.recievers.$setUnion[0]).toEqual({
      $ifNull: ["$recievers", []],
    });
    // Second stage promotes to "delivered"
    expect(pipeline[1].$set.status.$cond[1]).toBe("delivered");
  });
});
