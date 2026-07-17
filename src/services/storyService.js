const Story = require("../models/story");
const User = require("../models/user");
const {generateSignedUrl} = require("../middlewares/AWS");

exports.create = async (data) => {
  const {userId, content, mediaKey, mediaType} = data;
  return Story.create({userId, content, mediaKey, mediaType});
};

exports.getStoriesByUserId = async (userId) => {
  return Story.find({userId, expiresAt: {$gte: Date.now()}}).sort({
    expiresAt: -1,
  });
};
exports.getStoryById = async (id) => {
  return Story.findOne({_id: id, expiresAt: {$gt: Date.now()}});
};

exports.getStoriesOfContacts = async (id, page, limit) => {
  const {contacts} = await User.findById(id).populate("contacts.contactId");
  const contactIds = contacts.map((contact) => contact.contactId._id);

  const docs = await Story.aggregate([
    {
      $match: {userId: {$in: contactIds}, expiresAt: {$gte: new Date()}},
    },

    {
      $sort: {expiresAt: -1},
    },
    {
      $group: {
        _id: "$userId", // Group by userId
        stories: {$push: "$$ROOT"}, // Include full story data in an array for each user
      },
    },
    {
      $skip: (page - 1) * limit,
    },
    {
      $limit: limit,
    },
  ]);

  // Fetch every profile (story authors + all viewers) in a single query.
  const profileIds = [];
  docs.forEach((user) => {
    profileIds.push(user._id);
    (user.stories || []).forEach((story) => {
      if (story.viewers) {
        Object.values(story.viewers).forEach((viewer) => {
          profileIds.push(viewer.viewerId);
        });
      }
    });
  });

  const profileDocs = await User.find({_id: {$in: profileIds}}).select(
    "email picture screenName username"
  );
  const profilesById = new Map(
    profileDocs.map((profile) => [
      profile._id.toString(),
      {
        email: profile.email,
        picture: profile.picture,
        screenName: profile.screenName,
        username: profile.username,
      },
    ])
  );
  const getProfile = (profileId) =>
    profilesById.get(profileId.toString()) || null;

  await Promise.all(
    docs.map(async (user) => {
      user.profile = getProfile(user._id);
      await Promise.all(
        user.stories.map(async (story) => {
          try {
            if (story.mediaKey)
              story.media = await generateSignedUrl(story.mediaKey, 15 * 60);
          } catch (err) {
            console.error(`Error generating url for story ${story._id}:`, err);
            story.media = null;
          }
          story.mediaKey = undefined;
          if (story.viewers) {
            Object.values(story.viewers).forEach((obj) => {
              obj.profile = getProfile(obj.viewerId);
            });
          }
        })
      );
    })
  );

  return docs;
};
exports.deleteStoryById = async (id) => {
  return Story.findByIdAndDelete(id);
};

exports.updateStoryViewers = async (storyId, userId) => {
  return Story.findByIdAndUpdate(
    storyId,
    {
      $set: {
        [`viewers.${userId}`]: {
          viewedAt: new Date(),
          viewerId: userId,
        },
      },
    },
    {new: true, runValidators: true}
  );
};
