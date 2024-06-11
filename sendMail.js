const nodemailer = require("nodemailer");

module.exports = sendMail = async (to, text) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "Reachoutpro.ai@gmail.com",
      pass: "nksguyptztdywcti",
    },
  });

  const mailOptions = {
    from: "Reachoutpro.ai@gmail.com",
    to: ["mohammadjahid0007@gmail.com"],
    subject: "Payment request",
    text: text,
    // attachments: [fileData],
  };

  try {
    const result = await transporter.sendMail(mailOptions);

    return result;
  } catch (error) {
    console.log("Something went wrong while sending mail", error);
  }
};
