/* eslint-disable no-undef */
const callService = require("../services/callService");
const User = require("../models/user");

jest.mock("../models/user");

describe("Call Service - appendProfilesInfo", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("fetches all participant profiles in a single query and attaches them", async () => {
    const calls = [
      {
        chatDetails: {
          isGroup: false,
          participants: [{userId: "u1"}, {userId: "u2"}],
        },
      },
      {chatDetails: {isGroup: false, participants: [{userId: "u1"}]}},
    ];
    const users = [
      {_id: "u1", username: "alice", picture: "a.jpg"},
      {_id: "u2", username: "bob", picture: "b.jpg"},
    ];
    const select = jest.fn().mockResolvedValue(users);
    User.find.mockReturnValue({select});

    const result = await callService.appendProfilesInfo(calls);

    expect(User.find).toHaveBeenCalledTimes(1);
    expect(User.find).toHaveBeenCalledWith({_id: {$in: ["u1", "u2", "u1"]}});
    expect(select).toHaveBeenCalledWith("_id username picture");

    expect(result[0].chatDetails.participants[0].profile).toEqual({
      _id: "u1",
      username: "alice",
      picture: "a.jpg",
    });
    expect(result[0].chatDetails.participants[1].profile).toEqual({
      _id: "u2",
      username: "bob",
      picture: "b.jpg",
    });
    // Same user referenced in a second call still gets its profile.
    expect(result[1].chatDetails.participants[0].profile).toEqual({
      _id: "u1",
      username: "alice",
      picture: "a.jpg",
    });
  });

  test("leaves a participant unchanged when the user is not found", async () => {
    const calls = [
      {chatDetails: {isGroup: false, participants: [{userId: "missing"}]}},
    ];
    const select = jest.fn().mockResolvedValue([]);
    User.find.mockReturnValue({select});

    const result = await callService.appendProfilesInfo(calls);

    expect(result[0].chatDetails.participants[0].profile).toBeUndefined();
  });
});
