const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minLength: 3,
    maxLength: 40,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  profileName: { type: String },
  bio: { type: String, maxLength: 150 },
  accountStatus: {
    type: String,
    enum: ["active", "disable", "suspended"],
    default: "active",
  },
  isVerified: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  gender: {
    type: String,
    enum: ["male", "female", "non-binary", "prefer not to say"],
  },
  refreshToken: { type: String },
  phoneNumber: { type: String, trim: true },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

const User = mongoose.model("User", userSchema);
module.exports = User;
