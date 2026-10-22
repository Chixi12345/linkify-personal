const auth = require("../middleware/auth");
const router = require("express").Router();
const Chat = require("../models/chats");
const Message = require("../models/messages");

router.get("/", auth, async (req, res) => {
  const userId = req.user._id;

  const chats = await Chat.find({ participants: userId })
    .populate("participants", "_id username profileName")
    .populate({
      path: "lastMessage",
      select: "sender content createdAt",
      populate: { path: "senderId", select: "username" },
    })
    .sort({ updatedAt: -1 });
  res.json(chats);
});

router.get("/:chatId/messages", auth, async (req, res) => {
  const { chatId } = req.params;

  let { page = 1, limit = 10 } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  const messages = await Message.find({ chatId })
    .populate("senderId", "username")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const hasPreviousMessages = messages.length === limit ? true : false;
  res.status(200).json({
    success: true,
    message: "Messages retrieved successfully",
    messages,
    page,
    limit,
    hasPreviousMessages,
  });
});

router.post("/createChat", auth, async (req, res) => {
  const userId = req.user._id;
  const { receiverId } = req.body;
  if (!receiverId) {
    return res.status(400).json({
      success: false,
      message: "Receiver ID is required",
    });
  }

  let chat = await Chat.findOne({
    participants: { $all: [userId, receiverId], $size: 2 },
  });

  if (!chat) {
    chat = new Chat({
      participants: [userId, receiverId],
    });
    await chat.save();
  }

  res.status(201).json({
    success: true,
    message: "Chat created successfully",
    chat,
  });
});

router.post("/sendMessages", auth, async (req, res) => {
  const userId = req.user._id;
  const { content, chatId } = req.body;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: "Message content is required",
    });
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return res.status(404).json({
      success: false,
      message: "Chat not found",
    });
  }

  if (!chat.participants.includes(userId)) {
    return res.status(403).json({
      success: false,
      message: "You are not a participant of this chat",
    });
  }

  const newMessage = new Message({
    chatId: chat._id,
    senderId: userId,
    content,
  });

  await newMessage.save();

  chat.lastMessage = newMessage._id;
  await chat.save();
  const populatedMessage = await Message.findById(newMessage._id).populate(
    "senderId",
    "username",
  );
  res.status(201).json({
    success: true,
    message: "Message sent successfully",
    newMessage: populatedMessage,
  });
});
module.exports = router;
