const cors = require("cors");
const express = require("express");

const cookieParser = require("cookie-parser");
const logger = require("../config/logger");
const userRoutes = require("../routes/users");
const postRoutes = require("../routes/posts");
const chatRoutes = require("../routes/chats");

module.exports = function (app) {
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/user", userRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/chats", chatRoutes);

  //custom error handling middleware
  app.use((err, req, res, next) => {
    console.log("Error:", err);
    logger.error(error.message, {
      method: req.method,
      path: req.originalUrl,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  });
};
