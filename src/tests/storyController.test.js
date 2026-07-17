/* eslint-disable no-undef */
const storyController = require("../controllers/userProfile/story");
const userService = require("../services/userService");
const AppError = require("../errors/appError");

jest.mock("../services/userService");
jest.mock("../services/storyService");

const contact = (contactId, status = "not_blocked") => ({
  contactId,
  blockDetails: {status},
});

describe("story inContacts middleware (P3 stories visibility)", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.resetAllMocks();
    req = {user: {id: "requester"}, params: {userId: "owner"}};
    res = {};
    next = jest.fn();
  });

  it("allows any requester when storiesVisibility is EveryOne", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "owner",
      storiesVisibility: "EveryOne",
      contacts: [],
    });

    await storyController.inContacts(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("denies a non-contact when storiesVisibility is Contacts", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "owner",
      storiesVisibility: "Contacts",
      contacts: [],
    });

    await storyController.inContacts(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it("allows a contact when storiesVisibility is Contacts", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "owner",
      storiesVisibility: "Contacts",
      contacts: [contact("requester")],
    });

    await storyController.inContacts(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("denies a blocked requester even when storiesVisibility is EveryOne", async () => {
    userService.getUserById.mockResolvedValue({
      _id: "owner",
      storiesVisibility: "EveryOne",
      contacts: [contact("requester", "blocked")],
    });

    await storyController.inContacts(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });
});
