/* eslint-disable no-undef */
const storyService = require("../services/storyService");
const Story = require("../models/story");
const User = require("../models/user");
const {generateSignedUrl} = require("../middlewares/AWS");

jest.mock("../models/story");
jest.mock("../models/user");
jest.mock("../middlewares/AWS");

describe("Story Service - getStoriesOfContacts", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("attaches author + viewer profiles using a single batched query", async () => {
    // 1) contacts lookup
    const populate = jest
      .fn()
      .mockResolvedValue({contacts: [{contactId: {_id: "author1"}}]});
    User.findById.mockReturnValue({populate});

    // 2) aggregation: one author bucket, one story, viewed by "viewer1"
    Story.aggregate.mockResolvedValue([
      {
        _id: "author1",
        stories: [
          {
            _id: "s1",
            mediaKey: "key1",
            viewers: {
              viewer1: {viewerId: "viewer1", viewedAt: new Date()},
            },
          },
        ],
      },
    ]);

    // 3) single batched profile fetch for BOTH author and viewer
    const profiles = [
      {
        _id: "author1",
        email: "a@x.com",
        picture: "a.jpg",
        screenName: "A",
        username: "author",
      },
      {
        _id: "viewer1",
        email: "v@x.com",
        picture: "v.jpg",
        screenName: "V",
        username: "viewer",
      },
    ];
    const select = jest.fn().mockResolvedValue(profiles);
    User.find.mockReturnValue({select});

    generateSignedUrl.mockResolvedValue("https://signed/key1");

    const result = await storyService.getStoriesOfContacts("me", 1, 10);

    // Author + viewer fetched together in ONE query
    expect(User.find).toHaveBeenCalledTimes(1);
    expect(User.find).toHaveBeenCalledWith({
      _id: {$in: ["author1", "viewer1"]},
    });
    expect(select).toHaveBeenCalledWith("email picture screenName username");

    // Author profile attached (no _id, matching old getBasicProfileInfo shape)
    expect(result[0].profile).toEqual({
      email: "a@x.com",
      picture: "a.jpg",
      screenName: "A",
      username: "author",
    });
    // Signed media URL attached, mediaKey cleared
    expect(result[0].stories[0].media).toBe("https://signed/key1");
    expect(result[0].stories[0].mediaKey).toBeUndefined();
    // Viewer profile attached
    expect(result[0].stories[0].viewers.viewer1.profile).toEqual({
      email: "v@x.com",
      picture: "v.jpg",
      screenName: "V",
      username: "viewer",
    });
  });
});
