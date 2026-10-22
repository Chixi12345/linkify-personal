const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const sendEmail = async (to, subject, body) => {
  try {
    const params = {
      Source: process.env.AWS_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Body: {
          Text: { Data: body },
        },
        Subject: { Data: subject },
      },
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log("Email sent successfully! Message ID:", response.MessageId);
  } catch (error) {
    console.error("Amazon SES Error:", error);
  }
};

module.exports = sendEmail;
