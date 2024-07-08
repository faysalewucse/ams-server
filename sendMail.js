const nodemailer = require("nodemailer");

module.exports = sendMail = async (to, subject,text) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "Reachoutpro.ai@gmail.com",
      pass: "fhtkcqbdluziedjm",
    },
  });

  const mailOptions = {
    from: "Reachoutpro.ai@gmail.com",
    to: to,
    subject: subject,
    html: text,
    // attachments: [fileData],
  };

  try {
    const result = await transporter.sendMail(mailOptions);

    return result;
  } catch (error) {
    console.log("Something went wrong while sending mail", error);
  }
};
