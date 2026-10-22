const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const postUpload = require("../config/multer-upload");
const path = require("path");
const fs = require("fs/promises");
const User = require("../models/users");
const Post = require("../models/posts");

router.post("/", auth, postUpload.array("media", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No media files uploaded" });
  }
  const { caption, tags, location } = req.body;
  const media = req.files.map((file) => ({
    name: file.filename,
    mediaType: file.mimetype.startsWith("image/") ? "image" : "video",
  }));

  const newPost = new Post({
    userId: req.user._id,
    media,
    caption: caption,
    tags: tags ? tags.split(",") : [],
    location: location,
  });
  await newPost.save();
  res.status(201).json({
    success: true,
    message: "Post created successfully",
    post: newPost,
  });
});

router.get("/myposts", auth, async (req, res) => {
  let { page = 1, limit = 10 } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const posts = await Post.find({ userId: req.user._id })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const hasNextPage = posts.length === limit ? true : false;
  res.status(200).json({
    success: true,
    message: "Posts retrieved successfully",
    posts,
    page,
    limit,
    hasNextPage,
  });
});

router.get("/following", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10, cursor } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const user = await User.findById(req.user._id).select("following");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const query = {
      userId: { $in: user.following },
    };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const posts = await Post.find(query)
      .populate("userId", "_id username profileName")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextCursor =
      posts.length === limit ? posts[posts.length - 1].createdAt : null;

    const hasNextPage = posts.length === limit;

    return res.status(200).json({
      success: true,
      message: "Posts retrieved successfully",
      posts,
      page,
      limit,
      nextCursor,
      hasNextPage,
    });
  } catch (err) {
    console.error("Error retrieving following posts:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve posts",
    });
  }
});

router.delete("/:postId", auth, async (req, res) => {
  const { postId } = req.params;
  const currentUserId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  if (post.userId.toString() !== currentUserId) {
    return res.status(403).json({
      success: false,
      message: "You are not the owner of this post",
    });
  }
  post.media.forEach(async (mediaItem) => {
    const filePath = path.join(__dirname, "../uploads/posts", mediaItem.name);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error(`Error deleting file ${filePath}:`, err);
    }
  });
  await post.deleteOne();
  res.json({
    success: true,
    message: "Post deleted successfully",
  });
});

router.patch("/:postId/like", auth, async (req, res) => {
  const { postId } = req.params;
  const currentUserId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  const isLiked = post.likes.includes(currentUserId);
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    {
      $pull: isLiked ? { likes: currentUserId } : {},
      $addToSet: !isLiked ? { likes: currentUserId } : {},
    },
    { new: true },
  );
  await post.save();

  res.json({
    success: true,
    message: isLiked ? "Post unliked" : "Post liked",
    likesCount: updatedPost.likes.length,
  });
});
router.post("/:postId/comment", auth, async (req, res) => {
  const { postId } = req.params;
  const { comment } = req.body;
  const currentUserId = req.user._id;

  if (!comment || comment.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Comment cannot be empty",
    });
  }

  const newComment = {
    userId: currentUserId,
    comment: comment,
  };

  const post = await Post.findByIdAndUpdate(
    postId,
    { $push: { comments: newComment } },
    { new: true },
  );

  res.status(201).json({
    success: true,
    message: "Comment added successfully",
    comment: post.comments[post.comments.length - 1],
  });
});

router.post("/:postId/comment/:commentId/reply", auth, async (req, res) => {
  const { postId, commentId } = req.params;
  const { reply } = req.body;
  const currentUserId = req.user._id;

  if (!reply || reply.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Reply cannot be empty",
    });
  }

  const newReply = {
    userId: currentUserId,
    reply: reply,
  };

  const post = await Post.findOneAndUpdate(
    { _id: postId, "comments._id": commentId },
    {
      $push: {
        "comments.$.replies": newReply,
      },
    },
    { new: true },
  );

  const comment = post.comments.id(commentId);
  res.status(201).json({
    success: true,
    message: "Reply added successfully",
    reply: comment.replies[comment.replies.length - 1],
  });
});

router.delete("/:postId/comment/:commentId", auth, async (req, res) => {
  const { postId, commentId } = req.params;
  const currentUserId = req.user._id;

  const post = await Post.findOneAndUpdate(
    {
      _id: postId,
      comments: {
        $elemMatch: {
          _id: commentId,
          userId: currentUserId,
        },
      },
    },
    {
      $pull: {
        comments: { _id: commentId },
      },
    },
    { new: true },
  );

  if (!post) {
    return res.status(404).json({
      success: false,
      message:
        "Post or comment not found, or you are not authorized to delete it",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Comment and its replies deleted successfully",
  });
});

module.exports = router;
