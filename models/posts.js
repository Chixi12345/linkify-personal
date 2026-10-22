const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  comment: { type: String, required: true, maxLength: 500 },
  createdAt: { type: Date, default: Date.now },
  replies: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      reply: { type: String, required: true, maxLength: 500 },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});
const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    media: [
      {
        name: { type: String, required: true },
        mediaType: { type: String, enum: ["image", "video"], required: true },
      },
    ],
    caption: { type: String, maxLength: 2200 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    tags: [{ type: String }],
    location: { type: String },
    comments: [commentSchema],
  },
  { timestamps: true },
);

const Post = mongoose.model("Post", postSchema);
module.exports = Post;
