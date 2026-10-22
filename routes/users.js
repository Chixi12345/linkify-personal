const express = require("express");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const sendEmail = require("../config/amazon-ses");
const { sendSMTPEmail } = require("../config/smtp");
const router = express.Router();
const bcrypt = require("bcrypt");
const User = require("../models/users");

router.post("/", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }

  const user = await User.findOne({
    $or: [{ username: username }, { email: email }],
  });

  if (user) {
    return res.status(400).json({
      message:
        user.username === username
          ? "Username already exists"
          : "Email already exists",
      success: false,
    });
  }

  const hashedPass = await bcrypt.hash(password, 10);

  const newUser = new User({ username, email, password: hashedPass });
  await newUser.save();

  const { accessToken, refreshToken } = generateTokens({
    _id: newUser._id,
    username: newUser.username,
  });
  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);

  newUser.refreshToken = newHashedRefreshToken;
  await newUser.save();

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // Set to true in production
    sameSite: "none", // Set to "strict" or "lax" in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.status(201).json(accessToken);
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({
      message: "Invalid credentials",
      success: false,
    });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({
      message: "Invalid credentials",
      success: false,
    });
  }

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: user.username,
  });
  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);

  user.refreshToken = newHashedRefreshToken;
  await user.save();

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // Set to true in production
    sameSite: "none", // Set to "strict" or "lax" in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.json(accessToken);
});

router.post("/refresh", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;

  if (!userRefreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (err) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  const user = await User.findById(decodedUser._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);
  if (!isValid) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: user.username,
  });
  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);

  user.refreshToken = newHashedRefreshToken;
  await user.save();

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // Set to true in production
    sameSite: "none", // Set to "strict" or "lax" in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.json(accessToken);
});

router.post("/logout", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;

  if (!userRefreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (err) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  const user = await User.findById(decodedUser._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.refreshToken = null;
  await user.save();

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: false, // Set to true in production
    sameSite: "none", // Set to "strict" or "lax" in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.json({ message: "Logged out successfully" });
});

router.get("/", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json(user);
});

router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  let user = await User.findOne({ email });
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "This email is not found" });
  }
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  const resetToken = jwt.sign(
    { _id: user._id },
    process.env.RESET_PASSWORD_KEY,
    { expiresIn: "1h" },
  );

  //send email using this token
  const subject = "Password Reset Request";
  const body = `You requested a password reset. Click the link below to reset your password:\n\nhttp://localhost:3000/reset-password?token=${resetToken}\n\nIf you did not request this, please ignore this email.`;
  // sendEmail(user.email, subject, body);
  sendSMTPEmail(user.email, subject, body);
  res.status(200).json({
    success: true,
    message: "Password reset link has been sent to your email",
    resetToken,
  });
  user.resetToken = resetToken;
  user.resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
  await user.save();
});

router.post("/reset-password", async (req, res) => {
  const { resetToken, newPassword } = req.body;

  //Step 1: Verify the reset token

  const decodedUser = jwt.verify(resetToken, process.env.RESET_PASSWORD_KEY);
  let user = await User.findById(decodedUser._id);
  if (
    !user ||
    user.resetToken !== resetToken ||
    user.resetTokenExpiry <= Date.now()
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired token" });
  }
  //Step 2: if token is verified, find the user by ID and update the password

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = null;
  user.resetTokenExpiry = null;
  await user.save();

  res.status(200).json({ success: true, message: "Password has been reset" });
});

router.post("/:userId/follow", auth, async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user._id;

  if (userId === currentUserId) {
    return res
      .status(400)
      .json({ success: false, message: "You cannot follow yourself" });
  }

  const userToFollow = await User.findById(userId);
  const currentUser = await User.findById(currentUserId);

  if (!userToFollow || !currentUser) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  if (userToFollow.isPrivate) {
    // If the account is private, send a follow request
    if (userToFollow.followRequests.includes(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: "Follow request already sent. Waiting for approval.",
      });
    } else {
      userToFollow.followRequests.push(currentUserId);
      await userToFollow.save();
      return res.status(200).json({
        success: true,
        message: "Follow request sent. Waiting for approval.",
      });
    }
  } else {
    // If the account is public, follow the user directly

    if (userToFollow.followers.includes(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: "You are already following this user",
      });
    } else {
      userToFollow.followers.push(currentUserId);
      currentUser.following.push(userId);

      await userToFollow.save();
      await currentUser.save();

      return res
        .status(200)
        .json({ success: true, message: "You are now following this user" });
    }
  }
});

router.post("/reject-request/:requesterId", auth, async (req, res) => {
  const { requesterId } = req.params;
  const currentUserId = req.user._id;

  if (requesterId === currentUserId) {
    return res
      .status(400)
      .json({ success: false, message: "You cannot reject yourself" });
  }
  const requesterUser = await User.findById(requesterId);
  if (!requesterUser) {
    return res
      .status(404)
      .json({ success: false, message: "Requester not found" });
  }
  const currentUser = await User.findById(currentUserId);
  if (!currentUser) {
    return res
      .status(404)
      .json({ success: false, message: "Current user not found" });
  }
  if (!currentUser.followRequests.includes(requesterId)) {
    return res.status(400).json({
      success: false,
      message: "No follow request from this user to reject",
    });
  }

  const updatedRequests = currentUser.followRequests.filter(
    (id) => id.toString() !== requesterId,
  );
  currentUser.followRequests = updatedRequests;
  await currentUser.save();
  res.json({ success: true, message: "Follow request rejected" });
});

router.post("/accept-request/:requesterId", auth, async (req, res) => {
  const { requesterId } = req.params;
  const currentUserId = req.user._id;

  if (requesterId === currentUserId) {
    return res
      .status(400)
      .json({ success: false, message: "You cannot accept your own request" });
  }
  const requesterUser = await User.findById(requesterId);
  if (!requesterUser) {
    return res
      .status(404)
      .json({ success: false, message: "Requester not found" });
  }
  const currentUser = await User.findById(currentUserId);
  if (!currentUser) {
    return res
      .status(404)
      .json({ success: false, message: "Current user not found" });
  }
  if (!currentUser.followRequests.includes(requesterId)) {
    return res.status(400).json({
      success: false,
      message: "No follow request from this user to accept",
    });
  }

  const updatedRequests = currentUser.followRequests.filter(
    (id) => id.toString() !== requesterId,
  );
  currentUser.followRequests = updatedRequests;
  currentUser.followers.push(requesterId);
  requesterUser.following.push(currentUserId);
  await currentUser.save();
  await requesterUser.save();
  res.json({ success: true, message: "Follow request accepted" });
});

router.get("/:userId/followers", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const user = await User.findById(userId).populate(
    "followers",
    "_id username",
  );
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "Requester not found" });
  }

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) {
    return res
      .status(404)
      .json({ success: false, message: "Current user not found" });
  }
  if (currentUser.following.includes(userId) || !user.isPrivate) {
    return res.json(user.followers);
  } else {
    return res.status(403).json({
      success: false,
      message: "can't get followers of a private account you don't follow",
    });
  }
});

router.get("/:userId/following", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const user = await User.findById(userId).populate(
    "following",
    "_id username",
  );
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "Requester not found" });
  }

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) {
    return res
      .status(404)
      .json({ success: false, message: "Current user not found" });
  }
  if (currentUser.following.includes(userId) || !user.isPrivate) {
    return res.json(user.following);
  } else {
    return res.status(403).json({
      success: false,
      message: "can't get following of a private account you don't follow",
    });
  }
});

router.get("/followRequests", auth, async (req, res) => {
  const currentUserId = req.user._id;

  const currentUser = await User.findById(currentUserId).populate(
    "followRequests",
    "_id username",
  );

  if (!currentUser) {
    return res.status(404).json({
      success: false,
      message: "Current user not found",
    });
  }

  return res.json(currentUser.followRequests);
});
router.post("/:userId/unfollow", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const userToUnfollow = await User.findById(userId);
  if (!userToUnfollow) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) {
    return res
      .status(404)
      .json({ success: false, message: "Current user not found" });
  }

  if (!userToUnfollow.followers.includes(currentUserId)) {
    return res.status(400).json({
      success: false,
      message: "You are not following this user",
    });
  }

  userToUnfollow.followers = userToUnfollow.followers.filter(
    (id) => id.toString() !== currentUserId,
  );
  currentUser.following = currentUser.following.filter(
    (id) => id.toString() !== userId,
  );

  await userToUnfollow.save();
  await currentUser.save();
  res.json({ success: true, message: "You have unfollowed this user" });
});
const generateTokens = (data) => {
  const accessToken = jwt.sign(data, process.env.JWT_KEY);
  const refreshToken = jwt.sign(
    { _id: data._id },
    process.env.REFRESH_TOKEN_KEY,
    {
      expiresIn: "30d",
    },
  );
  return { accessToken, refreshToken };
};

module.exports = router;
