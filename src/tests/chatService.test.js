/* eslint-disable no-undef */
const chatService = require("../services/chatService");
const Chat = require("../models/chat");

jest.mock("../models/chat");

describe("Chat Service - getChannelChats", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("Should fetch all channel chats in a single $in query with a projection", async () => {
    const channelIds = ["c1", "c2"];
    const chats = [
      {_id: "chat1", channelId: "c1"},
      {_id: "chat2", channelId: "c2"},
    ];
    const select = jest.fn().mockReturnValue(chats);
    Chat.find.mockReturnValue({select});

    const result = await chatService.getChannelChats(channelIds);

    expect(result).toEqual(chats);
    expect(Chat.find).toHaveBeenCalledTimes(1);
    expect(Chat.find).toHaveBeenCalledWith({
      channelId: {$in: channelIds},
      isChannel: true,
      deleted: {$ne: true},
    });
    expect(select).toHaveBeenCalledWith("_id channelId");
  });
});
