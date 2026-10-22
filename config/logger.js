require("winston-mongodb");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({ level: "debug" }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),

    new winston.transports.MongoDB({
      db: process.env.DB,
      level: "error",
    }),
  ],
});

//catch unhandled sychronous errors that were not caught by try/catch blocks
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

//catch unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

module.exports = logger;
