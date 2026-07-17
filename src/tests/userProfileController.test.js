/* eslint-disable no-undef */
const userProfileController = require("../controllers/userProfile/userProfile");
const userService = require("../services/userService");

jest.mock("../services/userService");
jest.mock("../utils/mailingServcies");

const contact = (contactId, status = "not_blocked") => ({
  contactId,
  blockDetails: {status},
});

const runGetBasicProfile = async (
  requesterId = "requester",
  targetId = "target"
) => {
  const req = {params: {id: targetId}, user: {id: requesterId}};
  const json = jest.fn();
  const res = {status: jest.fn().mockReturnValue({json}), json};
  const next = jest.fn();
  await userProfileController.getBasicUserProfileInfo(req, res, next);
  return {json, next};
};

describe("getBasicUserProfileInfo (P2 profile-picture visibility)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns the picture when profilePictureVisibility is EveryOne", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "target",
      email: "t@x.com",
      picture: "pic.jpg",
      screenName: "T",
      username: "target",
      profilePictureVisibility: "EveryOne",
      contacts: [],
    });

    const {json} = await runGetBasicProfile();

    const payload = json.mock.calls[0][0];
    expect(payload.data.profile.picture).toBe("pic.jpg");
    expect(payload.data.profile.username).toBe("target");
  });

  it("nulls the picture for a non-contact when Contacts-only", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "target",
      email: "t@x.com",
      picture: "pic.jpg",
      screenName: "T",
      username: "target",
      profilePictureVisibility: "Contacts",
      contacts: [],
    });

    const {json} = await runGetBasicProfile();

    const payload = json.mock.calls[0][0];
    expect(payload.data.profile.picture).toBeNull();
    expect(payload.data.profile.username).toBe("target"); // other fields still returned
  });

  it("returns the picture for a contact when Contacts-only", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "target",
      picture: "pic.jpg",
      username: "target",
      profilePictureVisibility: "Contacts",
      contacts: [contact("requester")],
    });

    const {json} = await runGetBasicProfile();
    expect(json.mock.calls[0][0].data.profile.picture).toBe("pic.jpg");
  });

  it("nulls the picture for a blocked requester", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "target",
      picture: "pic.jpg",
      username: "target",
      profilePictureVisibility: "EveryOne",
      contacts: [contact("requester", "blocked")],
    });

    const {json} = await runGetBasicProfile();
    expect(json.mock.calls[0][0].data.profile.picture).toBeNull();
  });

  it("responds with 404 when the target user is not found", async () => {
    userService.getUserById.mockResolvedValue(null);

    const {next} = await runGetBasicProfile();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});
