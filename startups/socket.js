const jwt = require("jsonwebtoken");

const Chat = require("../models/chats");
const Message = require("../models/messages");

module.exports = function (io) {
  const onlineUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error!, Token required!"));
    }
    try {
      const user = jwt.verify(token, process.env.JWT_KEY);
      socket.user = user;
      console.log("Socket user", socket.user);
      next();
    } catch (error) {
      return next(new Error("Authentication error!, Token required!"));
    }
  });
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    const userId = socket.user._id;

    socket.emit("userData", socket.user);
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);
    console.log("Online users", onlineUsers);

    socket.on("markMessagesAsDelivered", async () => {
      //Find the chat messages in which our user is available
      const chatIds = await Chat.find({
        participants: userId,
      }).distinct("_id");

      const undeliveredMessage = await Message.find({
        chatId: { $in: chatIds },
        status: "sent",
        sender: { $ne: userId },
      }).select("_id chatId sender");

      if (undeliveredMessage.length > 0) {
        await Message.updateMany(
          { _id: { $in: undeliveredMessage.map((msg) => msg._id) } },
          { $set: { status: "delivered" } },
        );
      }

      //Step 1: Group chatIds by sender

      const groupedChatIds = undeliveredMessage.reduce((acc, msg) => {
        if (!acc[msg.sender]) {
          acc[msg.sender] = new Set();
        }

        acc[msg.sender].add(msg.chatId.toString());
        return acc;
      }, {});

      //Convert Set to array
      for (const sender in groupedChatIds) {
        groupedChatIds[sender] = [...groupedChatIds[sender]];
      }

      // Send event to online users only

      for (senderId in groupedChatIds) {
        const sockets = onlineUsers.get(senderId);
        const chatIds = groupedChatIds[senderId];

        if (sockets) {
          sockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", { chatIds });
          });
        }
      }
    });

    socket.on("markMessagesAsSeen", async (chatId) => {
      const unSeenMessages = await Message.find({
        chatId: chatId,
        senderId: { $ne: userId },
        status: "delivered",
      }).select("_id senderId");

      if (unSeenMessages.length > 0) {
        await Message.updateMany(
          {
            chatId: chatId,
            senderId: { $ne: userId },
            status: "delivered",
          },
          { $set: { status: "seen" } },
        );

        const senderIds = [
          ...new Set(unSeenMessages.map((msg) => msg.senderId.toString())),
        ];

        for (const sender of senderIds) {
          const sockets = onlineUsers.get(sender);

          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messageSeen", {
                chatId: chatId,
                seenBy: userId,
              });
            });
          }
        }
      }
    });

    socket.on("joinRoom", (chatId) => {
      socket.join(chatId);
      console.log(`User ${socket.id} joined room ${chatId}`);
    });

    socket.on("typing", ({ chatId }) => {
      socket
        .to(chatId)
        .emit("showTyping", `${socket.user.username} is typing...`);
    });

    socket.on("stopTyping", ({ chatId }) => {
      socket.to(chatId).emit("hideTyping", socket.user.username);
    });
    socket.on("sendMessage", async ({ content, chatId }) => {
      const userId = socket.user._id;
      if (!content) {
        socket.emit("errorInSendMessage", "Message content is required");
        return;
      }

      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit("errorInSendMessage", "Access Denied");
        return;
      }

      if (!chat.participants.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: "You are not a participant of this chat",
        });
      }
      const recipients = chat.participants.filter(
        (id) => id.toString() !== userId,
      );

      const newMessage = new Message({
        chatId: chat._id,
        senderId: userId,
        content,
        status: onlineUsers.has(recipients[0].toString())
          ? "delivered"
          : "sent",
      });

      await newMessage.save();

      chat.lastMessage = newMessage._id;
      await chat.save();
      const populatedMessage = await Message.findById(newMessage._id).populate(
        "senderId",
        "username",
      );

      // io.emit("getMessage", data);
      io.to(chatId).emit("getMessage", populatedMessage);
    });

    socket.on("disconnect", () => {
      onlineUsers.get(userId).delete(socket.id);

      if (onlineUsers.get(userId).size === 0) {
        onlineUsers.delete(userId);
      }

      console.log("Online users", onlineUsers);
    });
  });
};
