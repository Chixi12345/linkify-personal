const mongoose = require("mongoose");
const logger = require("../config/logger");

module.exports = function () {
  mongoose
    .connect(process.env.DB)
    .then(() => {
      console.log("Connected to MongoDB...");
    })
    .catch((err) => {
      logger.error("Failed to connect to MongoDB:", err);
      logger.on("finish", () => {
        process.exit(1);
      });
      logger.end();
    });
};
