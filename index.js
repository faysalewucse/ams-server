const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { verifyJWT } = require("./middleware/verifyJWT");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { Server } = require("socket.io");
// const upload = require("./middleware/upload");
const multer = require("multer");
const sendMail = require("./sendMail");
const { oid } = require("mongo-oid");
const cloudinary = require("cloudinary").v2;
const storage = multer.diskStorage({});
const stripe = require("stripe")(
  "sk_test_51OQ16rFd3jBtA0ChSF8R9j0LkJIGspNDvSlPFQlW6PvANqX08W6RuEsZ9NDq802aw2QIUsHnW0ZbVvMENdAD54CN00zbqNErkK"
);

const crypto = require("crypto");

const cron = require("node-cron");

const upload = multer({ storage });

require("dotenv").config();

var allowlist = [
  "https://overtimeam.com",
  "overtimeam.com",
  "http://localhost:3000",
];
const corsOptionsDelegate = function (req, callback) {
  let corsOptions = {
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  };
  if (allowlist.indexOf(req.header("Origin")) !== -1) {
    corsOptions = { ...corsOptions, origin: true }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { ...corsOptions, origin: false }; // disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};

const app = express();
app.use(cors(corsOptionsDelegate));

const port = process.env.PORT || 5003;

const server = app.listen(port, () => {
  console.log(`AMS Server listening on port ${port}`);
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`User connected ${socket.id}`);

  socket.on("chatMessage", (message) => {
    console.log(`Received chat message: ${message}`);
    io.emit("chatMessage", message);
  });
});

app.get("/", (req, res) => {
  res.send("AMS Server is running.");
});
// 2 Year
// bp8hmRR2

// 1year
// IPEayMb5

const uri = process.env.MONGODB_URL;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

client.connect().catch((err) => console.log(err));

const database = client.db("overtimeDB");
const users = database.collection("users");
const teams = database.collection("teams");
const events = database.collection("events");
const tasks = database.collection("tasks");
const notifications = database.collection("notifications");
const messages = database.collection("messages");
const plans = database.collection("plans");
const trips = database.collection("trips");
const customForms = database.collection("customForms");
const filledCustomForms = database.collection("filledCustomForms");
const medicalInformations = database.collection("medicalInformations");
const performances = database.collection("performances");
const formLibrary = database.collection("formLibrary");
const filledForms = database.collection("filledForms");
const prices = database.collection("prices");
const stripeAccount = database.collection("stripeAccount");
const invitedUsers = database.collection("invitedUsers");
const teamRoster = database.collection("teamRoster");
const inventory = database.collection("inventory");
const reservations = database.collection("reservations");
const venues = database.collection("venues");

app.post(
  "/webhooks",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];
    console.log("sig", sig);
    let event;

    //NOTE: Must change signature for production
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        // "whsec_e0957a7622d216ee38c42a2f42543b2f7b3d175dd6288d9069c13ea3f8752ff5"
        "whsec_ezrXVONiAHziw4ND9IHRC5C0NflZFfsl"
      );
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log("event.type", event.type);

    switch (event.type) {
      case "checkout.session.completed":
        const checkoutSessionCompleted = event.data.object;

        console.log(checkoutSessionCompleted);

        // const paymentIntent = await stripe.paymentIntents.retrieve(
        //   checkoutSessionCompleted.payment_intent
        // );

        // console.log({ paymentIntent });

        // const metadata = JSON.parse(checkoutSessionCompleted.metadata);

        console.log("metadata: ", checkoutSessionCompleted.metadata);

        const metadata = checkoutSessionCompleted.metadata;

        const userEmail = checkoutSessionCompleted.customer_email;
        const customer_id = checkoutSessionCompleted.customer;

        if (checkoutSessionCompleted.metadata.productType === "prices") {
          try {
            const res = await teams.updateOne(
              {
                _id: new ObjectId(metadata.teamId),
                "products.productId": metadata.productId,
                "products.sessions.athleteEmail": userEmail,
              },
              {
                $set: {
                  "products.$[productElem].sessions.$[sessionElem].paid": true,
                  "products.$[productElem].sessions.$[sessionElem].paidDate":
                    new Date(),
                },
              },
              {
                arrayFilters: [
                  { "productElem.productId": metadata.productId },
                  { "sessionElem.athleteEmail": userEmail },
                ],
              }
            );
            console.log(res);
          } catch (error) {
            console.log(error);
          }
        }

        const amount_total = checkoutSessionCompleted.amount_total / 100;

        if (checkoutSessionCompleted.mode === "subscription") {
          const result = await users.updateOne(
            { email: userEmail },
            {
              $set: {
                amount_paid: amount_total,
                customer_id: customer_id || "",
                isSubscribed: true,
              },
            }
          );

          console.log({ checkoutSessionCompleted, result });
        }

        break;

      // case "customer.subscription.created": {
      //   console.log(event.type.data.object.status);
      //   if (subscription.status === "active") {
      //     const checkoutSessionCompleted = event.data.object;

      //     const paymentIntent = await stripe.paymentIntents.retrieve(
      //       checkoutSessionCompleted.payment_intent
      //     );

      //     console.log({ paymentIntent });

      //     const userEmaill = checkoutSessionCompleted.customer_email;
      //     const customer_id = checkoutSessionCompleted.customer;

      //     const amount_total = checkoutSessionCompleted.amount_total / 100;

      //     //FIXME:won't be fired if the user email is not in database
      //     const result = await users.updateOne(
      //       { email: userEmaill },
      //       {
      //         $set: {
      //           amount_paid: amount_total,
      //           customer_id: customer_id || "",
      //           isSubscribed: true,
      //         },
      //       }
      //     );

      //     console.log({ checkoutSessionCompleted, result });
      //   }
      //   break;
      // }
      // case "invoice.payment_succeeded":
      //   const invoicePaymentSucceeded = event.data.object;

      //   console.log({ invoicePaymentSucceeded });

      //   break;

      // case "invoice.payment_failed":
      //   const invoicePaymentFailed = event.data.object;

      //   console.log({ invoicePaymentFailed });

      //   break;

      // case "customer.subscription.deleted":
      //   const subscriptionDeleted = event.data.object;
      //   console.log({ subscriptionDeleted });

      // case "payment_intent.succeeded":
      //   const paymentIntentSucceeded = event.data.object;
      //   console.log({ paymentIntentSucceeded });

      //   break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    response.send();
  }
);

app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { priceId, metadata } = req.body;

  let discountRate =
    metadata.productName === "1 year"
      ? 10
      : metadata.productName === "2 Year"
        ? 20
        : 0;

  let coupon;

  if (metadata.productName !== "monthly") {
    coupon = await stripe.coupons.create({
      percent_off: discountRate,
      duration: "once",
    });
  }

  // let coupon = "";
  // if (metadata.productName === "1 year") {
  //   coupon = "IPEayMb5";
  // } else if (metadata.productName === "2 Year") {
  //   coupon = "bp8hmRR2";
  // }

  try {
    const sessionConfig = {
      payment_method_types: ["card"],

      line_items: [
        {
          price: priceId,
          quantity: metadata.teams,
        },
      ],
      mode: "subscription",
      customer_email: metadata.email,
      allow_promotion_codes: true,
      success_url: "https://overtimeam.com/dashboard",
      cancel_url: "https://overtimeam.com/payment",
      metadata: metadata || {},
    };

    if (
      metadata.productName === "1 year" ||
      metadata.productName === "2 Year"
    ) {
      sessionConfig.discounts = [{ coupon: coupon.id }];
    }

    if (metadata.customer_id) {
      sessionConfig.customer = metadata.customer_id;

      delete sessionConfig.customer_email;
    }
    sessionConfig.mode = "subscription";

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send("Internal Server Error");
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const verifySuperAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);
      if (user?.role !== "sadmin") {
        return res
          .status(403)
          .send({ error: true, message: "You are not Super Admin" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);

      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "You are not an Admin" });
      }
      next();
    };

    const verifyAdminOrCoach = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);

      if (user?.role !== "admin" && user?.role !== "coach") {
        return res
          .status(403)
          .send({ error: true, message: "You are not an Admin or Coach" });
      }
      next();
    };

    const verifyCoach = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };

      const user = await users.findOne(query);
      if (user?.role !== "coach" && user?.role !== "sub_coach") {
        return res
          .status(403)
          .send({ error: true, message: "You are not a Coach/Sub Coach" });
      }
      next();
    };

    // Create product in Stripe
    const createStripeProduct = async (productName, price) => {
      try {
        const product = await stripe.products.create({
          name: productName,
          images: [
            "https://cdn.pixabay.com/photo/2021/03/19/13/40/online-6107598_1280.png",
          ],
        });

        console.log({ product });

        const priceObject = await stripe.prices.create({
          product: product.id,
          unit_amount: price * 100, // Stripe expects the amount in cents
          currency: "usd",
        });
        return priceObject;
      } catch (error) {
        console.error("Error creating product in Stripe:", error);
        throw error;
      }
    };

    // API endpoint to create a product
    app.post("/api/prices", async (req, res) => {
      try {
        const { productName, price, addedBy } = req.body;

        // Insert product into MongoDB
        const product = {
          productName,
          price: parseFloat(price),
          addedBy,
        };

        const stripeProduct = await createStripeProduct(productName, price);
        //FIXME: Property 'priceId' may not exist
        product.priceId = stripeProduct.id;

        const result = await prices.insertOne(product);

        res.status(201).json(result);
      } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.post("/transfer", async (req, res) => {
      try {
        const fee = await stripe.applicationFees.create({
          amount: Math.round(yourFee * 100), // Convert amount to cents
          currency: "usd",
          // charge: session.payment_intent,
        });
        res.json(fee);
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    app.get("/api/prices/:adminEmail", async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        const pricesData = await prices.find({ addedBy: adminEmail }).toArray();

        res.json(pricesData);
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    const calcFee = (amount, fee, fixedFee) => {
      const price = parseFloat(amount);

      const stripeFeePercentage = 0.029;
      const stripeFixedFee = 0.3;
      const platformFeePercentage = fee / 100;
      const platformFixedFee = fixedFee;

      const stripeFee = price * stripeFeePercentage + stripeFixedFee;
      const platformFee = price * platformFeePercentage + platformFixedFee;

      return {
        stripeFee,
        platformFee,
      };
    };

    //NOTE: Running Task abdurrahman

    app.post("/api/prices/assign", async (req, res) => {
      try {
        const { productName, teamId, priceId, stripeAccountId } = req.body;

        const baseAmountRaw = await stripe.prices.retrieve(priceId);
        const baseAmount = parseFloat(baseAmountRaw.unit_amount / 100);

        const teamData = await teams.findOne({ _id: new ObjectId(teamId) });
        const athletes = teamData?.athletes || [];
        const athleteEmails = athletes.map((athlete) => athlete.athleteEmail);

        let fee = calcFee(baseAmount, 0.6, 0.19);
        const { stripeFee, platformFee } = fee;
        const totalFee = parseFloat((stripeFee + platformFee).toFixed(2));

        const sessionPromises = athleteEmails.map(async (athleteEmail) => {
          try {
            const roundedFee = parseInt((totalFee * 100).toFixed(2));

            const total = parseInt(((baseAmount + totalFee) * 100).toFixed(2));

            const session = await stripe.checkout.sessions.create({
              payment_method_types: ["card"],
              line_items: [
                {
                  price_data: {
                    currency: "usd",
                    product_data: { name: productName },
                    unit_amount: total,
                  },
                  quantity: 1,
                },
              ],
              payment_intent_data: {
                application_fee_amount: roundedFee,
                transfer_data: { destination: stripeAccountId },
              },
              mode: "payment",
              customer_email: athleteEmail,
              metadata: {
                productType: "prices",
                teamId: teamId,
                productId: priceId,
                base_amount: baseAmount,
                stripe_fee: stripeFee,
                platform_fee: platformFee,
              },
              // success_url: "http://localhost:3000/dashboard",
              // cancel_url: "http://localhost:3000",

              success_url: "https://overtimeam.com/dashboard",
              cancel_url: "https://overtimeam.com",
            });

            const checkoutUrl = session.url;
            return { checkoutUrl, athleteEmail, paid: false };
          } catch (error) {
            console.log(error);
            return null;
          }
        });

        const sessions = (await Promise.all(sessionPromises)).filter(Boolean);
        console.log("sessions", sessions);

        const products = {
          productId: priceId,
          productName,
          price: baseAmount + totalFee,
          sessions: sessions,
        };

        console.log("products : ", products);

        // Batch database operations
        await Promise.all([
          teams.updateOne(
            { _id: new ObjectId(teamId) },
            { $push: { products } },
            { upsert: true }
          ),
          prices.updateOne(
            { priceId },
            {
              $push: {
                team: {
                  teamId,
                  teamName: teamData.teamName,
                },
              },
            }
          ),
        ]);

        // Send emails asynchronously
        sessions.forEach(({ athleteEmail, checkoutUrl }) => {
          const subject = "Payment Request";
          const mailText = `<p>
  Hi there,<br><br>

  You are required to pay for <strong>${productName}</strong> ($${products.price}) by team <strong>${teamData.teamName}</strong>.<br><br>

  Please make your payment using this secure link:<br>
  <a href="${checkoutUrl}" target="_blank">${checkoutUrl}</a><br><br>

  You can also make this payment from your dashboard.<br><br>
  
  Thank you!<br>
  OverTime Athletic Management
</p> `;

          sendMail(athleteEmail, subject, mailText).catch(console.error);
        });

        res.status(200).json({ message: "Price assigned successfully" });
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.post("/stripe/connect/:adminId", async (req, res) => {
      try {
        const { adminId } = req.params;
        console.log("admin id", adminId);
        let account;
        let accountLink;

        const existingAccount = await stripeAccount.findOne({
          adminId: adminId,
        });

        console.log(existingAccount);

        console.log("req query", req.query);

        if (
          req.query.onBoarding === "true" &&
          req.query.accountId !== undefined &&
          existingAccount
        ) {
          console.log("req is in 1st condition: seller is in return url");
          // const accountId = req?.query?.accountId;
          const accountId = existingAccount.accountId;
          try {
            console.log("I am on try block");
            const accountDetails = await stripe.accounts.retrieve(
              `${accountId}`
            );

            console.log("charges enabled", accountDetails.charges_enabled);

            if (accountDetails.charges_enabled === true) {
              console.log("charges enabled", accountDetails.charges_enabled);
              await stripeAccount.updateOne(
                { _id: existingAccount._id },
                {
                  $set: {
                    connected: true,
                  },
                },
                {
                  upsert: true,
                }
              );

              return res.json({
                code: 200,
                message: "stripe connected ",
              });
            } else {
              console.log("again checking for charge enable ...........");
              const accountDetails = await stripe.accounts.retrieve(
                `${accountId}`
              );

              console.log("charges enabled", accountDetails.charges_enabled);

              if (accountDetails.charges_enabled !== true) {
                console.log("creating link again... no charge enables");

                accountLink = await stripe.accountLinks.create({
                  account: existingAccount.accountId,
                  // refresh_url: `http://localhost:3000/dashboard/stripe?accountId=${existingAccount.accountId}`,
                  // return_url: `http://localhost:3000/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,

                  refresh_url: `https://overtimeam.com/dashboard/stripe?accountId=${existingAccount.accountId}`,
                  return_url: `https://overtimeam.com/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,
                  type: "account_onboarding",
                });

                return res.json({
                  url: accountLink.url,
                });
              } else {
                await stripeAccount.updateOne(
                  { _id: existingAccount._id },
                  {
                    $set: {
                      connected: true,
                    },
                  },
                  {
                    upsert: true,
                  }
                );

                return res.json({
                  code: 200,
                  message: "stripe connected ",
                });
              }
            }
          } catch (err) {
            console.log("err in first condition", err.message);
          }
        } else if (existingAccount) {
          console.log("Existing account section");
          const accountId = existingAccount.accountId;

          try {
            const accountDetails = await stripe.accounts.retrieve(
              `${accountId}`
            );
            if (accountDetails.charges_enabled === true) {
              console.log("charges enabled", accountDetails.charges_enabled);
              await stripeAccount.updateOne(
                { _id: existingAccount._id },
                {
                  $set: {
                    connected: true,
                  },
                },
                {
                  upsert: true,
                }
              );

              return res.json({
                code: 200,
                message: "stripe connected ",
              });
            } else {
              console.log("again checking for charge enable ...........");
              const accountDetails = await stripe.accounts.retrieve(
                `${accountId}`
              );

              console.log("charges enabled", accountDetails.charges_enabled);

              if (accountDetails.charges_enabled !== true) {
                console.log("creating link again... no charge enables");

                accountLink = await stripe.accountLinks.create({
                  account: existingAccount.accountId,
                  // refresh_url: `http://localhost:3000/dashboard/stripe?accountId=${existingAccount.accountId}`,
                  // return_url: `http://localhost:3000/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,

                  refresh_url: `https://overtimeam.com/dashboard/stripe?accountId=${existingAccount.accountId}`,
                  return_url: `https://overtimeam.com/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,
                  type: "account_onboarding",
                });

                return res.json(accountLink.url);
              } else {
                await stripeAccount.updateOne(
                  { _id: existingAccount._id },
                  {
                    $set: {
                      connected: true,
                    },
                  },
                  {
                    upsert: true,
                  }
                );

                return res.json({
                  code: 200,
                  message: "stripe connected ",
                });
              }
            }
          } catch (error) { }
        } else if (!req.query.onBoarding && req.query.accountId !== undefined) {
          console.log("req is in 2nd condition: seller is in refresh url");

          try {
            accountLink = await stripe.accountLinks.create({
              account: existingAccount.accountId,
              // refresh_url: `http://localhost:3000/dashboard/stripe?accountId=${existingAccount.accountId}`,
              // return_url: `http://localhost:3000/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,

              refresh_url: `https://overtimeam.com/dashboard/stripe?accountId=${existingAccount.accountId}`,
              return_url: `https://overtimeam.com/dashboard/stripe?onBoarding=true&accountId=${existingAccount.accountId}`,
              type: "account_onboarding",
            });
          } catch (err) {
            console.log(err.message);
          }
        } else {
          console.log("account initiated: seller is in first stage");

          // console.log(req)

          account = await stripe.accounts.create({
            type: "express",
          });

          accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `https://overtimeam.com/dashboard/stripe?accountId=${account.id}`,
            return_url: `https://overtimeam.com/dashboard/stripe?onBoarding=true&accountId=${account.id}`,

            // refresh_url: `http://localhost:3000/dashboard/stripe?accountId=${account.id}`,
            // return_url: `http://localhost:3000/dashboard/stripe?onBoarding=true&accountId=${account.id}`,
            type: "account_onboarding",
          });

          console.log("account link", accountLink.url);

          await stripeAccount.updateOne(
            { _id: new ObjectId(oid()) },
            {
              $set: {
                accountId: account.id,
                adminId: adminId,
              },
            },
            {
              upsert: true,
            }
          );
        }

        // console.log("account", account);

        res.json(accountLink.url);
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get(
      "/stripeConnect/:adminId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const adminId = req.params.adminId;

          const data = await stripeAccount.findOne({
            adminId: adminId,
          });

          res.json(data);
        } catch (error) {
          throw error;
        }
      }
    );

    app.get("/stripe/connect/login/:accountId", async (req, res) => {
      try {
        const accountId = req.params.accountId;

        const account = await stripe.accounts.createLoginLink(`${accountId}`);

        if (account.url)
          return res.json({
            url: account.url,
          });

        return res.json(account);
      } catch (error) {
        console.log(error);
      }
    });

    // all coaches including sub coaches
    app.get("/users/coaches/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        console.log(adminEmail);
        const coaches = await users
          .find({
            role: { $in: ["coach", "sub_coach"] },
            adminEmail: adminEmail,
          })
          .toArray();

        res.json(coaches);
      } catch (error) {
        console.error("Error fetching coach or sub_coach users:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching users." });
      }
    });

    //NOTE:Athlete invite
    app.post(
      "/inviteatheletes",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        try {
          const body = req.body;

          const bodyData = { ...body };

          console.log({ bodyData });

          const invited = await invitedUsers.insertOne(bodyData);

          const token = invited.insertedId;

          // const link = `http://localhost:3000/register?token=${invited.insertedId}`;
          const link = `https://overtimeam.com/register?token=${invited.insertedId}`;

          const subject = "Invitation";

          const mailText = bodyData.lessThan18
            ? `<p>
      Dear <strong>${bodyData.parentFirstName}</strong> ,<br><br>
      You have been invited to join overtimeam as Parent by ${bodyData.invitedBy.role} <strong>${bodyData.invitedBy.name} </strong> for the following athlete : <strong>${bodyData.athleteFirstName} ${bodyData.athleteLastName}</strong>(${bodyData.athleteEmail}) <br>
      Please use this registration link to sign up :<br>
      <a href="${link}" target="_blank">${link}</a><br><br>
      Thank you!<br>
      OverTime Athletic Management
    </p>`
            : `<p>
  Dear <strong>${bodyData.athleteFirstName} ${bodyData.athleteLastName}</strong>,<br><br>

  Congratulations, you've been invited by the ${bodyData.invitedBy.role} <strong>${bodyData.invitedBy.name}</strong> to tryout for <strong>${bodyData.teamName}</strong>. The tryout will be held on <strong>${bodyData.tryOutStartDate}</strong>.  

  Please use this registration link to sign up:<br>
  <a href="${link}" target="_blank">${link}</a><br><br>

  For any additional info, please reach out to the Team Coach at <a href="mailto:${bodyData.coach}" target="_blank">${bodyData.coach}</a><br><br>

  Thank you!<br>

  ${bodyData.organization} <br><br>

  Powered by Overtime Athletic Management
</p>`;
          const recipientEmail = bodyData.lessThan18
            ? bodyData.parentEmail
            : bodyData.athleteEmail;

          try {
            const resMail = await sendMail(recipientEmail, subject, mailText);
            console.log("Mail sent successfully", resMail);
          } catch (mailError) {
            console.error("Error sending mail", mailError);
            return res.status(500).send({
              error: "An error occurred while sending the invitation email.",
            });
          }

          res.status(200).send(token);
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .send({ error: "An error occurred while creating invitations." });
        }
      }
    );

    app.get("/invitedUsers/:token", async (req, res) => {
      try {
        const id = req.params.token;
        console.log({ id });
        const result = await invitedUsers.findOne({ _id: new ObjectId(id) });
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching invited users:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching invited users." });
      }
    });

    app.post("/jwt", (req, res) => {
      const user = req.body;
      console.log("useruseruser", req.body);
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Get all users for super admin
    app.get("/users", verifyJWT, async (req, res) => {
      try {
        const cursor = users.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching users." });
      }
    });

    app.get("/user/:email", verifyJWT, async (req, res) => {
      try {
        const result = await users.findOne({ email: req.params.email });
        res.send(result);
      } catch (error) {
        console.error("Error fetching user:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching user." });
      }
    });
    app.get("/user-exist/:email", async (req, res) => {
      try {
        const result = await users.findOne({ email: req.params.email });
        res.send(result);
      } catch (error) {
        console.error("Error fetching user:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching user." });
      }
    });

    app.get("/user/byId/:userId", verifyJWT, async (req, res) => {
      try {
        const result = await users.findOne({
          _id: new ObjectId(req.params.userId),
        });
        res.send(result);
      } catch (error) {
        console.error("Error fetching user:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching user." });
      }
    });

    // get all the organizations for super admin
    app.get("/organizations", verifyJWT, verifySuperAdmin, async (req, res) => {
      try {
        const pipeline = [
          {
            $match: {
              role: "admin",
            },
          },
          {
            $project: {
              _id: 1,
              organization: 1,
              adminEmail: "$email",
              adminName: { $concat: ["$firstName", " ", "$lastName"] },
            },
          },
        ];
        const result = await users.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send("An error has occurred while fetching organizations");
      }
    });

    app.patch("/users/change-profile-pic/:email", async (req, res) => {
      try {
        const userEmail = req.params.email;
        const { url: newPhotoURL } = req.body;

        const result = await users.updateOne(
          { email: userEmail },
          { $set: { photoURL: newPhotoURL } }
        );
        res.send(result);
      } catch (error) {
        return res
          .status(500)
          .json({ error: "Failed to update user photoURL" });
      }
    });

    // Get all users for admin
    app.get(
      "/users/coach-sub_coach-athlete-parents/:adminEmail",
      verifyJWT,
      async (req, res) => {
        try {
          const adminEmail = req.params.adminEmail;

          const cursor = users.find({
            role: { $in: ["coach", "sub_coach", "athlete", "parents"] },
            adminEmail: adminEmail,
          });
          const result = await cursor.toArray();

          res.send(result);
        } catch (error) {
          console.error("Error fetching users:", error);
          res
            .status(500)
            .send({ error: "An error occurred while fetching users." });
        }
      }
    );

    // get all users for coach
    app.get(
      "/users/athlete-parents/:adminEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        try {
          const adminEmail = req.params.adminEmail;
          const role = req.query.role;

          console.log(role);

          const cursor = users.find({
            role: { $in: ["athlete", "parents"] },
            adminEmail: adminEmail,
          });
          const result = await cursor.toArray();

          res.send(result);
        } catch (error) {
          console.error("Error fetching users:", error);
          res
            .status(500)
            .send({ error: "An error occurred while fetching users." });
        }
      }
    );

    // get all users for parent
    app.get("/users/athlete/:parentsEmail", verifyJWT, async (req, res) => {
      try {
        const parentsEmail = req.params.parentsEmail;

        const cursor = users.find({
          role: { $in: ["athlete"] },
          parentsEmail: parentsEmail,
        });
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching users." });
      }
    });

    app.get("/users/byRole", verifyJWT, async (req, res) => {
      try {
        const teamCount = await teams.countDocuments();

        const roleToFind = req.query.role || "";
        const superAdmin = req.query.superAdmin || false;
        const adminEmail = req.query.adminEmail || "";
        const parentsEmail = req.query.parentsEmail || "";

        let matchWith = { role: roleToFind };
        if (!superAdmin && !parentsEmail) {
          matchWith.adminEmail = adminEmail;
        }

        if (roleToFind === "athlete" && parentsEmail) {
          matchWith.parentsEmail = parentsEmail;
          const cursor = users.find(matchWith);

          const result = await cursor.toArray();

          res.send(result);
        } else if (
          (roleToFind === "coach" ||
            roleToFind === "sub_coach" ||
            roleToFind === "athlete") &&
          teamCount !== 0
        ) {
          const coachesWithTeams = await users
            .aggregate([
              {
                $match: matchWith,
              },
              {
                $lookup: {
                  from: "teams",
                  localField: "email",
                  foreignField:
                    roleToFind === "coach" || roleToFind === "sub_coach"
                      ? "coaches"
                      : "athletes.athleteEmail",
                  as: "teams",
                },
              },

              {
                $replaceRoot: {
                  newRoot: "$$ROOT",
                },
              },
            ])
            .toArray();

          res.send(coachesWithTeams);
        } else {
          const cursor = users.find(matchWith);

          const result = await cursor.toArray();

          res.send(result);
        }
      } catch (error) {
        console.error("Error fetching users by role:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching users by role." });
      }
    });

    app.get("/admins/:secretKey", async (req, res) => {
      const secretKey = req.params.secretKey;
      if (secretKey !== "tfvbhyg")
        return res.status(500).send({
          error: "An error occurred while assigning teams to coach.",
        });

      const result = await users.find({ role: "admin" }).toArray();

      res.send(result);
    });

    app.get("/admins", async (req, res) => {
      const result = await users
        .find({ role: "admin", status: "approved" })
        .toArray();

      res.send(result);
    });

    app.get("/users/:userEmail", async (req, res) => {
      console.log("userEmail", req.params.userEmail);

      const userEmail = req.params.userEmail;

      const result = await users.findOne({ email: userEmail });

      res.send(result);
    });

    //NOTE: reg user
    app.post("/user", async (req, res) => {
      const user = req.body;

      const existingUser = await users.findOne({ email: user.email });
      console.log({ existingUser });
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this Id already exists" });
      }

      const result = await users.insertOne(user);

      // if (user.role === "athlete") {
      //   const teamId = user.reqTeamId;

      //   const athlete = {
      //     athleteEmail: user.email,
      //     athleteName: user.fullName,
      //     position: "",
      //     scholarship: "Not Offered",
      //   };

      //   const team = await teams.findOneAndUpdate(
      //     {
      //       _id: new ObjectId(teamId),
      //     },
      //     {
      //       $push: { athletes: athlete },
      //     },
      //     { returnDocument: "after" }
      //   );

      //   // const athleteData = {
      //   //   athleteEmail: user.email,
      //   //   athleteName: user.fullName,
      //   //   scholarship: "Not Offered",
      //   // };

      //   // const roster = await teamRoster.findOneAndUpdate(
      //   //   { teamId: new ObjectId(teamId) },
      //   //   { $push: { athletes: athleteData } },
      //   //   { returnDocument: "after" }
      //   // );

      //   console.log({ roster, teams });
      // }

      if (user.regType === "Invited") {
        await invitedUsers.findOneAndUpdate(
          {
            _id: new ObjectId(user.inviteId),
          },
          {
            $set: {
              status: "accepted",
            },
          },
          {
            upsert: true,
          }
        );
      }

      res.send(result);
    });

    app.patch(
      "/update-athlete-stage/:teamId",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        try {
          const athleteData = req.body.athleteData; // Rename to a more generic name
          const newTryoutStage = req.body.stage;
          console.log({ newTryoutStage });
          const teamId = req.params.teamId;

          // Step 1: Retrieve the current list of athletes
          const team = await teams.findOne({
            _id: new ObjectId(teamId),
          });
          if (!team) {
            return res.status(500).send("Team not found");
          }

          // Determine if athleteData is an array of emails or objects with email and scholarship

          // Extract emails and create a map for scholarship data if provided
          const athleteEmails = athleteData.map((item) => item.athleteEmail);

          const scholarshipMap = athleteData.reduce((map, item) => {
            map[item.athleteEmail] = item.scholarship;
            return map;
          }, {});

          // Step 2: Filter the athletes to only include those whose emails are in athleteEmails

          const filteredAthletes = team.athletes.filter((athlete) =>
            athleteEmails.includes(athlete.athleteEmail)
          );

          const deletedAthletes = team.athletes.filter(
            (athlete) => !athleteEmails.includes(athlete.athleteEmail)
          );

          const deletedAthletesEmails = deletedAthletes.map(
            (athlete) => athlete.athleteEmail
          );

          console.log({ deletedAthletesEmails });

          const updateUser = await users.updateMany(
            {
              email: { $in: deletedAthletesEmails },
            },
            {
              $pull: {
                teamIds: teamId,
              },
            }
          );

          // Step 3: Update the scholarship (if provided) for the filtered athletes
          const updatedAthletes = filteredAthletes.map((athlete) => ({
            ...athlete,
            ...(scholarshipMap[athlete.athleteEmail] && {
              scholarship: scholarshipMap[athlete.athleteEmail],
            }),
          }));

          // Step 4: Update the document to set the filtered and updated list of athletes and the new tryoutStage

          await teams.findOneAndUpdate(
            {
              _id: new ObjectId(teamId),
            },
            { $set: { athletes: updatedAthletes } },
            { returnDocument: "after" }
          );

          await teamRoster.updateOne({ teamId: new ObjectId(teamId) }, [
            {
              $set: {
                tryoutStage: newTryoutStage,
              },
            },
          ]);

          console.log({ updatedAthletes });

          await Promise.all(
            updatedAthletes.map(async (athlete) => {
              const mailText = `<p>
                Dear <strong>${athlete.athleteName}</strong> ,<br><br>
                You have been selected for Round ${newTryoutStage} Tryout Stage for team ${team.teamName}

              <br> 
              <strong>Scholarhsip Status: </strong> ${athlete.scholarship}  <br> <br>

                Thank you!<br>
                OverTime Athletic Management
              </p>`;

              const recipientEmail = athlete.athleteEmail;
              const subject = "Roster Update";

              try {
                const resMail = await sendMail(
                  recipientEmail,
                  subject,
                  mailText
                );
                console.log("Mail sent successfully", resMail);
              } catch (mailError) {
                console.error("Error sending mail", mailError);
                return res.status(500).send({
                  message:
                    "An error occurred while sending the invitation email.",
                });
              }
            })
          );

          res.status(200).json({
            message: "Updated Successfully",
          });
        } catch (error) {
          console.log(error);
          res.status(500).json({
            message: error.message,
          });
        }
      }
    );

    // change user role
    app.patch(
      "/changeUserRole/:userEmail",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const userEmail = req.params.userEmail;
        const newRole = req.query.role;

        const result = await users.updateOne(
          { email: userEmail },
          { $set: { role: newRole } }
        );

        res.send(result);
      }
    );

    // change sub coach title
    app.patch(
      "/change-title/:userEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        const userEmail = req.params.userEmail;
        const newTitle = req.query.newTitle;

        const result = await users.updateOne(
          { email: userEmail },
          { $set: { title: newTitle } }
        );

        res.send(result);
      }
    );

    // update user profile
    app.patch("/updateProfile/:userEmail", async (req, res) => {
      const email = req.params.userEmail;
      const data = req.body;
      try {
        const result = await users.updateOne({ email: email }, { $set: data });
        res.send(result);
      } catch (error) {
        res.status(500).send("an error occurred");
      }
    });

    // delete user
    app.delete("/deleteUser/:userEmail", verifyJWT, async (req, res) => { });

    app.patch("/coach/assignTeam/:coachEmail", verifyJWT, async (req, res) => {
      const coachEmail = req.params.coachEmail;
      const teamIds = req.body;

      try {
        const existingUser = await users.findOne({
          email: coachEmail,
        });

        if (!existingUser) {
          return res.status(500).json({ message: "User Not Found" });
        }

        const existingTeamIds = existingUser.teamIds || [];
        const newTeamIds = Array.from(
          new Set([...existingTeamIds, ...teamIds])
        );

        console.log({ newTeamIds });
        // Convert teamIds from an array of strings to an array of ObjectIds
        const teamObjectIds = teamIds.map((teamId) => new ObjectId(teamId));

        // Update the teams collection to push the coach's email
        const result = await teams.updateMany(
          { _id: { $in: teamObjectIds } }, // Match teams by their IDs
          { $push: { coaches: coachEmail } } // Push coachEmail to the coaches array
        );

        const userUpdate = await users.updateOne(
          {
            email: coachEmail,
          },
          {
            $set: {
              teamIds: newTeamIds,
            },
          },
          {
            upsert: true,
          }
        );

        res.send(result);
      } catch (error) {
        console.error("Error assigning teams to coach:", error);
        res.status(500).send({
          error: "An error occurred while assigning teams to coach.",
        });
      }
    });

    //NOTE:assign team
    app.patch(
      "/athlete/assignTeam/:athleteEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        const athleteEmail = req.params.athleteEmail;
        const teamIds = req.body;

        try {
          const existingUser = await users.findOne({
            email: athleteEmail,
          });

          if (!existingUser) {
            return res.status(500).json({ message: "User Not Found" });
          }

          const existingTeamIds = existingUser.teamIds || [];
          const newTeamIds = Array.from(
            new Set([...existingTeamIds, ...teamIds])
          );

          console.log({ newTeamIds });
          // Convert teamIds from an array of strings to an array of ObjectIds
          const teamObjectIds = teamIds.map((teamId) => new ObjectId(teamId));

          // Update the teams collection to push the coach's email
          const result = await teams.updateMany(
            { _id: { $in: teamObjectIds } }, // Match teams by their IDs
            {
              $push: {
                athletes: {
                  athleteEmail,
                  athleteName: existingUser.fullName,
                  position: "",
                  scholarship: "Not Offered",
                },
              },
            } // Push coachEmail to the coaches array
          );

          const userUpdate = await users.updateOne(
            {
              email: athleteEmail,
            },
            {
              $set: {
                teamIds: newTeamIds,
              },
            },
            {
              upsert: true,
            }
          );

          res.send(result);
        } catch (error) {
          console.error("Error assigning teams to coach:", error);
          res.status(500).send({
            error: "An error occurred while assigning teams to coach.",
          });
        }
      }
    );

    //NOTE:invte ath from ros
    app.patch(
      "/inviteRoster/assignTeam",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        const athleteData = req.body.athleteData;

        console.log({ athleteData });

        try {
          // Array to store promises for updating teams and users
          const promises = athleteData.map(async ({ athleteEmail, team }) => {
            const teamObjectId = new ObjectId(team);

            // Find the existing user
            const existingUser = await users.findOne({ email: athleteEmail });

            if (!existingUser) {
              throw new Error(`User with email ${athleteEmail} not found`);
            }

            const existingTeamIds = existingUser.teamIds || [];

            // If the team is already assigned to the athlete, skip the update
            if (!existingTeamIds.includes(team)) {
              existingTeamIds.push(team);

              // Update the user with the new team ID
              await users.updateOne(
                { email: athleteEmail },
                { $set: { teamIds: existingTeamIds } }
              );
            }

            // Add the athlete to the team's roster
            await teams.updateOne(
              { _id: teamObjectId },
              {
                $addToSet: {
                  athletes: {
                    athleteEmail,
                    athleteName: existingUser.fullName,
                    position: "", // Add other necessary fields as required
                    scholarship: "Not Offered",
                  },
                },
              },
              {
                upsert: true,
              }
            );
            await teamRoster.updateOne(
              { teamId: team, "archivedAthletes.athleteEmail": athleteEmail },
              {
                $set: {
                  "archivedAthletes.$.isInvited": true,
                },
              }
            );
          });

          // Wait for all updates to complete
          await Promise.all(promises);

          res.send({ message: "Athletes assigned to teams successfully" });
        } catch (error) {
          console.error("Error assigning athletes to teams:", error);
          res.status(500).send({
            message: "An error occurred while assigning athletes to teams.",
            details: error.message,
          });
        }
      }
    );

    app.patch(
      "/team/updateCoaches/:teamId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const teamId = req.params.teamId;
        const coachEmails = req.body;

        try {
          // Convert coachEmails from an array to an array of strings
          const coachEmailStrings = coachEmails.map((email) => String(email));

          // Update the team collection to set the coaches property
          const result = await teams.updateMany(
            { _id: new ObjectId(teamId) }, // Match the team by its ID
            { $push: { coaches: { $each: coachEmailStrings } } } // Set the coaches property to the provided coachEmails
          );

          await coachEmailStrings.map(async (coachEmail) => {
            console.log({ teamId });
            const updatedCoach = await users.updateOne(
              {
                email: coachEmail,
              },
              {
                $addToSet: {
                  teamIds: teamId,
                },
              }
            );

            console.log(updatedCoach);
          });

          res.send(result);
        } catch (error) {
          console.error("Error updating coaches for the team:", error);
          res.status(500).send({
            error: "An error occurred while updating coaches for the team.",
          });
        }
      }
    );

    app.patch("/user/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updatedStatus = req.query.status;
      const result = await users.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: updatedStatus } }
      );
      res.send(result);
    });

    app.patch("/user/update/isverified", async (req, res) => {
      const email = req.body.email;

      console.log({ email });

      const result = await users.updateOne(
        { email },
        { $set: { isVerified: true } }
      );
      res.send(result);
    });

    // get all the teams for admin with coach data also
    app.get("/teams/:adminEmail", async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        // Use aggregation to fetch teams and populate coach data
        const result = await teams
          .aggregate([
            {
              $match: {
                adminEmail: adminEmail,
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "coaches",
                foreignField: "email",
                as: "coachData",
              },
            },
            {
              $lookup: {
                from: "teamRoster",
                let: { teamId: "$_id" }, // Pass teamId as a variable to the $lookup
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$teamId", "$$teamId"] }, // Match documents where teamId is equal to the teamId in the teams collection
                          {
                            $or: [
                              { $eq: ["$isArchived", false] }, // Include documents where isArchive is false
                              { $not: { $gt: ["$isArchived", false] } }, // Include documents where isArchive is missing or not set to true
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: "rosterData",
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching teams with coach data:", error);
        res.status(500).send({
          error: "An error occurred while fetching teams with coach data.",
        });
      }
    });

    // Get all teams for super admin
    app.get("/teams", verifyJWT, async (req, res) => {
      try {
        const cursor = teams.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching teams:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching teams." });
      }
    });

    // app.get("/teams/:id", verifyJWT, async (req, res) => {
    //   try {
    //     const id = req.params.id;


    //     if (!ObjectId.isValid(id)) {
    //       return res.status(400).send({ error: "Invalid team ID format." });
    //     }


    //     const team = await teams.findOne({ _id: new ObjectId(id) });

    //     if (!team) {
    //       return res.status(404).send({ error: "Team not found." });
    //     }

    //     res.send(team);
    //   } catch (error) {
    //     console.error("Error fetching team:", error);
    //     res
    //       .status(500)
    //       .send({ error: "An error occurred while fetching the team." });
    //   }
    // });
    // get teams for specific coaches
    app.get("/teams/coach-team/:coachEmail", verifyJWT, async (req, res) => {
      try {
        const coachEmail = req.params.coachEmail;

        const result = await teams
          .aggregate([
            {
              $match: {
                coaches: { $in: [coachEmail] },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "coaches",
                foreignField: "email",
                as: "coachData",
              },
            },
            {
              $lookup: {
                from: "teamRoster",
                let: { teamId: "$_id" }, // Pass teamId as a variable to the $lookup
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$teamId", "$$teamId"] }, // Match documents where teamId is equal to the teamId in the teams collection
                          {
                            $or: [
                              { $eq: ["$isArchived", false] }, // Include documents where isArchive is false
                              { $not: { $gt: ["$isArchived", false] } }, // Include documents where isArchive is missing or not set to true
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: "rosterData",
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "An error has occurred" });
      }
    });

    //FIXME: get teams for specific athletes
    app.get(
      "/teams/athlete-team/:athleteEmail",
      verifyJWT,
      async (req, res) => {
        try {
          const athleteEmail = req.params.athleteEmail;
          const result = await teams
            .aggregate([
              {
                $match: {
                  "athletes.athleteEmail": athleteEmail,
                },
              },
              {
                $lookup: {
                  from: "teamRoster",
                  let: { teamId: "$_id" }, // Pass teamId as a variable to the $lookup
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$teamId", "$$teamId"] }, // Match documents where teamId is equal to the teamId in the teams collection
                            {
                              $or: [
                                { $eq: ["$isArchived", false] }, // Include documents where isArchive is false
                                { $not: { $gt: ["$isArchived", false] } }, // Include documents where isArchive is missing or not set to true
                              ],
                            },
                          ],
                        },
                      },
                    },
                  ],
                  as: "rosterData",
                },
              },

              {
                $addFields: {
                  athlete: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$athletes",
                          as: "a",
                          cond: {
                            $eq: ["$$a.athleteEmail", athleteEmail],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
              },

              // {
              //   $project: {
              //     athletes: 0, // Exclude the athletes array
              //     "rosterData.athletes": 0, // Exclude the athletes from rosterData
              //     rosterData: 1, // Include the rosterData
              //     athleteInfo: 1, // Include the filtered athleteInfo
              //   },
              // },
            ])
            .toArray();

          res.send(result);
        } catch (error) {
          res.status(500).send({ error: "An error has occurred" });
        }
      }
    );

    //NOTE: add teams to db
    app.post("/teams", verifyJWT, verifyAdminOrCoach, async (req, res) => {
      try {
        const data = req.body;

        const team = await teams.insertOne(data.teamData);

        const roster = data.rosterData;
        const rosterData = {
          ...roster,
          teamId: team.insertedId,
          isArchived: false,
          createdAt: new Date(),
        };

        const response = await teamRoster.insertOne(rosterData);

        res.status(200).json(response);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.patch("/update/teamRoster/:teamId", async (req, res) => {
      const { teamId } = req.params;
      const rosterData = req.body;

      try {
        const data = await teamRoster.findOneAndUpdate(
          { teamId: new ObjectId(teamId) },
          { $set: { ...rosterData } },
          { upsert: true, new: true }
        );

        res.status(200).json({
          message: "team updated",
        });
      } catch (error) {
        console.log(error);
        res
          .status(500)

          .json({ message: error.message });
      }
    });

    //NOTE:archived roster
    app.get(
      "/archived-rosters/coach/:coachEmail",
      verifyJWT,
      async (req, res) => {
        try {
          const coachEmail = req.params.coachEmail;

          const result = await teams
            .aggregate([
              {
                $match: {
                  coaches: { $in: [coachEmail] },
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "coaches",
                  foreignField: "email",
                  as: "coachData",
                },
              },
              {
                $lookup: {
                  from: "teamRoster",
                  let: { teamId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$teamId", "$$teamId"] }, // Ensure that both are of the same type
                            { $eq: ["$isArchived", true] },
                          ],
                        },
                      },
                    },
                  ],
                  as: "rosterData",
                },
              },
              {
                $match: {
                  "rosterData.0": { $exists: true }, // Ensure that only teams with archived rosters are returned
                },
              },
            ])
            .toArray();

          console.log({ rosters: result });
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: "An error has occurred" });
        }
      }
    );

    app.get(
      "/archived-rosters/admin/:adminEmail",
      verifyJWT,
      async (req, res) => {
        try {
          const adminEmail = req.params.adminEmail;

          const result = await teams
            .aggregate([
              {
                $match: {
                  adminEmail: adminEmail,
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "coaches",
                  foreignField: "email",
                  as: "coachData",
                },
              },
              {
                $lookup: {
                  from: "teamRoster",
                  let: { teamId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$teamId", "$$teamId"] }, // Ensure that both are of the same type
                            { $eq: ["$isArchived", true] },
                          ],
                        },
                      },
                    },
                  ],
                  as: "rosterData",
                },
              },
              {
                $match: {
                  "rosterData.0": { $exists: true }, // Ensure that only teams with archived rosters are returned
                },
              },
            ])
            .toArray();

          console.log({ rosters: result });
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: "An error has occurred" });
        }
      }
    );

    app.patch("/teams/team-position/:teamId", async (req, res) => {
      const { teamId } = req.params;
      const { position } = req.body;

      try {
        const updatedTeam = await teams.findOneAndUpdate(
          { _id: new ObjectId(teamId) },
          { $push: { positions: position } },
          { new: true }
        );

        if (!updatedTeam) {
          return res.status(404).json({ message: "Team not found" });
        }

        res.json(updatedTeam);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.patch("/teams/athlete-position/:teamId", async (req, res) => {
      const { teamId } = req.params;
      const { athleteEmail, position } = req.body;

      try {
        const filter = {
          _id: new ObjectId(teamId),
          "athletes.athleteEmail": athleteEmail,
        };

        const update = {
          $set: {
            "athletes.$.position": position,
          },
        };

        const result = await teams.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Team or athlete not found" });
        }

        res.json({ message: "Position updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // remove coach from a team
    app.patch(
      "/teams/coach/:coachEmail",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const coachEmail = req.params.coachEmail;
          const teamId = req.query.team;
          const result = await teams.updateOne(
            { _id: new ObjectId(teamId) },
            { $pull: { coaches: coachEmail } }
          );

          const userUpdate = await users.updateOne(
            {
              email: coachEmail,
            },
            {
              $pull: {
                teamIds: teamId,
              },
            }
          );
          res.send(result);
        } catch (error) {
          console.error(error.message);
          res.status(501).send("An error occurred!");
        }
      }
    );

    //NOTE: remove athlete from team
    app.delete(
      "/teams/athlete/:athleteEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        try {
          const athleteEmail = req.params.athleteEmail;
          const teamId = req.query.teamId;

          const existingUser = await users.findOne({
            email: athleteEmail,
          });

          if (!existingUser) {
            return res.status(500).json({ message: "User Not Found" });
          }

          const userUpdate = await users.updateOne(
            {
              email: athleteEmail,
            },
            {
              $pull: {
                teamIds: teamId,
              },
            }
          );

          const result = await teams.updateOne(
            { _id: new ObjectId(teamId) },
            {
              $pull: {
                athletes: {
                  athleteEmail: athleteEmail,
                },
              },
            }
          );

          res.send(result);
        } catch (error) {
          console.error(error.message);
          res.status(501).send("An error occurred!");
        }
      }
    );

    app.delete("/teams/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await teams.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error.message);
        res.status(500).send("An error has occurred!");
      }
    });

    // NOTE: ============ Events =========
    app.get("/events/:tId", verifyJWT, async (req, res) => {
      try {
        const tId = req.params.tId;

        const Ids = tId.split(",");

        const result = await events
          .aggregate([
            {
              $match: { teamId: { $in: Ids } },
            },
            {
              $addFields: {
                isAllTeam: { $eq: ["$teamId", "all"] }, // Add a flag to identify "all" teamId
              },
            },
            {
              $lookup: {
                from: "teams",
                let: {
                  teamId: {
                    $cond: [
                      { $eq: ["$isAllTeam", true] },
                      null,
                      { $toObjectId: "$teamId" },
                    ],
                  },
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$_id", { $ifNull: ["$$teamId", "$_id"] }] }, // Match by ObjectId if not "all"
                          { $ne: ["$teamId", "all"] }, // Skip if "all" teamId
                        ],
                      },
                    },
                  },
                ],
                as: "teamDetails",
              },
            },
            {
              $sort: { _id: -1 }, // Sort the results if needed
            },
          ])
          .toArray();

        res.json(result);
      } catch (error) {
        console.error("Error fetching events:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching events." });
      }
    });

    app.get("/admin/events/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        const result = await events
          .aggregate([
            {
              $match: { adminEmail }, // Match events by adminEmail
            },
            {
              $addFields: {
                isAllTeam: { $eq: ["$teamId", "all"] }, // Add a flag to identify "all" teamId
              },
            },
            {
              $lookup: {
                from: "teams",
                let: {
                  teamId: {
                    $cond: [
                      { $eq: ["$isAllTeam", true] },
                      null,
                      { $toObjectId: "$teamId" },
                    ],
                  },
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: ["$_id", { $ifNull: ["$$teamId", "$_id"] }],
                          }, // Match by ObjectId if not "all"
                          { $ne: ["$teamId", "all"] }, // Skip if "all" teamId
                        ],
                      },
                    },
                  },
                ],
                as: "teamDetails",
              },
            },
            {
              $sort: { _id: -1 }, // Sort the results if needed
            },
          ])
          .toArray();

        res.json(result);
      } catch (error) {
        console.error("Error fetching events:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching events." });
      }
    });

    app.post("/events", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const eventData = req.body;

        const result = await events.insertOne(eventData);

        res.json({
          message: "Event created successfully",
          eventId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating event:", error);
        res
          .status(500)
          .json({ error: "An error occurred while creating the event." });
      }
    });

    app.patch("/events/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const updatedData = req.body;
        const result = await events.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: updatedData,
          }
        );
        res.json({
          message: "Event updated successfully",
          eventId: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating event:", error);
        res
          .status(500)
          .json({ error: "An error occurred while updating the event." });
      }
    });

    app.delete("/events/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await events.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.json({
          message: "Event deleted successfully",
          eventId: result.deletedCount,
        });
      } catch (error) {
        res
          .status(500)
          .json({ error: "An error occurred while deleting the event." });
      }
    });

    app.post(
      "/event/add-participants/:eventId",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        const eventId = req.params.eventId;
        const participants = req.body;

        const result = await events.updateOne(
          { _id: new ObjectId(eventId) },
          { $set: { participants: participants } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({ message: "Participants added successfully" });
      }
    );
    //============ Planners ============
    app.get("/plans/:coachEmail", verifyJWT, async (req, res) => {
      try {
        const coachEmail = req.params.coachEmail;

        const result = await plans
          .aggregate([
            {
              $match: {
                coachEmail: coachEmail,
              },
            },
            {
              $lookup: {
                from: "tasks",
                let: { planId: "$_id" }, // Pass ObjectId directly
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: [{ $toObjectId: "$planId" }, "$$planId"] }, // Convert `planId` in `tasks` to ObjectId
                    },
                  },
                  {
                    $lookup: {
                      from: "users",
                      localField: "assigne",
                      foreignField: "email",
                      as: "coachDetails",
                    },
                  },
                ],
                as: "tasks",
              },
            },
            {
              $addFields: {
                teamIdObj: { $toObjectId: "$teamId" }, // Convert teamId to ObjectId
              },
            },
            {
              $lookup: {
                from: "teams",
                localField: "teamIdObj",
                foreignField: "_id",
                as: "teamDetails",
              },
            },
            {
              $unset: "teamIdObj", // Remove temporary field
            },
            {
              $sort: { _id: -1 },
            },
          ])
          .toArray();

        // console.log({ result })

        res.json(result);
      } catch (error) {
        console.error("Error fetching plans:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching plans." });
      }
    });


    app.post("/plans", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const planData = req.body;
        const result = await plans.insertOne(planData);
        res.json({
          message: "Plan created successfully",
          planId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating plan:", error);
        res
          .status(500)
          .json({ error: "An error occurred while creating the plan." });
      }
    });

    app.patch("/plans/:id", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const updatedData = req.body;
        const result = await plans.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: updatedData,
          }
        );
        res.json({
          message: "Plan updated successfully",
          eventId: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating plan:", error);
        res
          .status(500)
          .json({ error: "An error occurred while updating the plan." });
      }
    });

    app.delete("/plans/:id", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const result = await plans.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.json({
          message: "Plan deleted successfully",
          eventId: result.deletedCount,
        });
      } catch (error) {
        res
          .status(500)
          .json({ error: "An error occurred while deleting the plan." });
      }
    });

    // ============ Task ==============

    app.post("/task", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const taskData = req.body;
        const result = await tasks.insertOne(taskData);
        res.json({
          message: "Task Added successfully",
          planId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding task:", error);
        res
          .status(500)
          .json({ error: "An error occurred while adding task to the plan." });
      }
    });


    app.put("/task/:taskId", verifyJWT, async (req, res) => {
      try {
        const taskId = req.params.taskId;
        const updateFields = req.body;

        const taskObjectId = new ObjectId(taskId);

        const result = await tasks.updateOne(
          { _id: taskObjectId },
          { $set: updateFields }
        );



        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Task not found." });
        }

        res.json({ message: "Task updated successfully.", modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating plan:", error);
        res
          .status(500)
          .json({ error: "An error occurred while updating the plan." });
      }
    });

    //============ Trip Planners ============
    app.get("/trips/:coachEmail", verifyJWT, async (req, res) => {
      try {
        const coachEmail = req.params.coachEmail;
        const result = await trips
          .find({ coachEmail })
          .sort({ _id: -1 })
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching trips:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching trips." });
      }
    });

    app.post("/trips", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const tripData = req.body;
        const result = await trips.insertOne(tripData);
        res.json({
          message: "Trips created successfully",
          tripId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating trip:", error);
        res
          .status(500)
          .json({ error: "An error occurred while creating the trip." });
      }
    });

    app.patch("/trips/:id", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const updatedData = req.body;
        const result = await trips.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: updatedData,
          }
        );
        res.json({
          message: "Trip updated successfully",
          eventId: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating trip:", error);
        res
          .status(500)
          .json({ error: "An error occurred while updating the trip." });
      }
    });

    app.delete("/trips/:id", verifyJWT, verifyCoach, async (req, res) => {
      try {
        const result = await trips.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.json({
          message: "Trips deleted successfully",
          eventId: result.deletedCount,
        });
      } catch (error) {
        res
          .status(500)
          .json({ error: "An error occurred while deleting the trip." });
      }
    });

    // inventory
    //NOTE: add inventory
    app.post("/inventory", verifyJWT, verifyAdminOrCoach, async (req, res) => {
      try {
        const data = req.body;

        const inventoryData = {
          ...data,
          createdAt: new Date(),
        };

        const response = await inventory.insertOne(inventoryData);

        res.status(200).json(response);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // NOTE:Get all inventories
    app.get(
      "/inventory/:adminEmail",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        try {
          const adminEmail = req.params.adminEmail;

          const result = await inventory
            .aggregate([
              {
                $match: {
                  addedBy: adminEmail,
                },
              },
              {
                $addFields: {
                  assignedTeams: {
                    $map: {
                      input: "$assignedTeams",
                      as: "teamId",
                      in: { $toObjectId: "$$teamId" },
                    },
                  },
                },
              },
              {
                $lookup: {
                  from: "teams",
                  localField: "assignedTeams",
                  foreignField: "_id",
                  as: "teamData",
                },
              },
              // {
              //   $lookup: {
              //     from: "schedules",
              //     localField: "location",
              //     foreignField: "_id",
              //     as: "locationData",
              //   },
              // },
            ])
            .toArray();

          res.send(result);
        } catch (error) {
          console.error("Error fetching inventory:", error);
          res
            .status(500)
            .send({ error: "An error occurred while fetching teams." });
        }
      }
    );
    app.get(
      "/inventory/coach/:coachEmail",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        try {
          const coachEmail = req.params.coachEmail;

          const existingUser = await users.findOne({ email: coachEmail });
          const teamIds = existingUser.teamIds;

          const result = await inventory
            .aggregate([
              {
                $match: {
                  assignedTeams: { $in: teamIds },
                },
              },
              {
                $addFields: {
                  assignedTeams: {
                    $map: {
                      input: "$assignedTeams",
                      as: "teamId",
                      in: { $toObjectId: "$$teamId" },
                    },
                  },
                },
              },
              {
                $lookup: {
                  from: "teams",
                  localField: "assignedTeams",
                  foreignField: "_id",
                  as: "teamData",
                },
              },
              // {
              //   $lookup: {
              //     from: "schedules",
              //     localField: "location",
              //     foreignField: "_id",
              //     as: "locationData",
              //   },
              // },
            ])
            .toArray();

          res.send(result);
        } catch (error) {
          console.error("Error fetching teams:", error);
          res
            .status(500)
            .send({ error: "An error occurred while fetching teams." });
        }
      }
    );
    app.get("/inventory/athlete/:athleteEmail", verifyJWT, async (req, res) => {
      try {
        const athleteEmail = req.params.athleteEmail;

        const existingUser = await users.findOne({ email: athleteEmail });

        const result = await inventory
          .find({
            assignedAthletes: athleteEmail,
          })
          .toArray();

        console.log("athl", result);

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching teams:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching teams." });
      }
    });

    app.delete("/inventory/del/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await inventory.deleteOne({
          _id: new ObjectId(id),
        });

        res.status(200).send(result);
      } catch (error) {
        console.error("Error deleting inventory:", error);
        res.status(500).json("An error occurred while deleting inventory.");
      }
    });

    // NOTE: Update inventory by ID
    app.put(
      "/inventory/:id",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        const { id } = req.params;
        const updateData = req.body;

        try {
          const existingInventory = await inventory.findOne({
            _id: new ObjectId(id),
          });

          if (!existingInventory) {
            return res
              .status(500)
              .json({ message: "No existing inventory found!" });
          }

          let updateFields = {
            $set: updateData,
          };

          if (updateData.hasOwnProperty("quantity")) {
            const newQuantity = Number(updateData.quantity);
            if (newQuantity > 0) {
              updateFields.$set.status = "CheckedIn";
              updateFields.$set.CheckedInDate = new Date();
            }
          }

          // Check if the quantity becomes 0 and update status and CheckedOutDate

          const result = await inventory.findOneAndUpdate(
            { _id: new ObjectId(id) },
            updateFields,
            { returnDocument: "after" }
          );

          if (!result.value) {
            return res.status(404).send({ message: "Inventory not found" });
          }

          res.status(200).send(result.value);
        } catch (error) {
          res.status(500).send({ message: "Error updating Inventory", error });
        }
      }
    );

    app.patch(
      "/inventory/assignTeam/:id",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        const { id } = req.params;
        console.log({ id });
        const selectedTeam = req.body;
        console.log({ selectedTeam });

        try {
          const existingInventory = await inventory.findOne({
            _id: new ObjectId(id),
          });

          if (!existingInventory) {
            return res
              .status(500)
              .json({ message: "No existing inventory found!" });
          }

          // const existingTeamIds = existingInventory.assignedTo || [];
          // const newTeamIds = [...existingTeamIds, ...selectedTeam];

          const result = await inventory.findOneAndUpdate(
            { _id: new ObjectId(existingInventory._id) },
            { $addToSet: { assignedTeams: { $each: selectedTeam } } }
          );

          res.status(200).send(result);
        } catch (error) {
          res.status(500).send({ message: "Error updating Inventory", error });
        }
      }
    );

    app.patch(
      "/inventory/assignAthletes/:id",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        const { id } = req.params;
        console.log({ id });
        const selectedAthletes = req.body;
        console.log({ selectedAthletes });

        try {
          const existingInventory = await inventory.findOne({
            _id: new ObjectId(id),
          });

          if (!existingInventory) {
            return res
              .status(500)
              .json({ message: "No existing inventory found!" });
          }

          if (existingInventory.quantity < selectedAthletes.length) {
            return res.status(500).json({ message: "Inventory stocks out!" });
          }

          const newQuantity =
            Number(existingInventory.quantity) - selectedAthletes.length;
          const updateFields = {
            $addToSet: {
              assignedAthletes: { $each: selectedAthletes },
            },
            $set: {
              quantity: newQuantity,
            },
          };

          // Check if the quantity becomes 0 and update status and CheckedOutDate
          if (newQuantity === 0) {
            updateFields.$set.status = "CheckedOut";
            updateFields.$set.CheckedOutDate = new Date();
          }

          const result = await inventory.findOneAndUpdate(
            { _id: new ObjectId(existingInventory._id) },
            updateFields,
            { returnDocument: "after" } // to return the updated document
          );

          res.status(200).send(result);
        } catch (error) {
          console.error("Error updating Inventory:", error);
          res.status(500).send({ message: "Error updating Inventory", error });
        }
      }
    );

    app.patch("/inventory/removeAthlete/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      console.log({ id });
      const athleteEmail = req.body;
      console.log({ athleteEmail });

      try {
        const existingInventory = await inventory.findOne({
          _id: new ObjectId(id),
        });

        if (!existingInventory) {
          return res
            .status(500)
            .json({ message: "No existing inventory found!" });
        }

        const newQuantity = Number(existingInventory.quantity) + 1;
        const updateFields = {
          $pull: {
            assignedAthletes: athleteEmail,
          },
          $set: {
            quantity: newQuantity,
          },
        };

        // Check if the quantity becomes 0 and update status and CheckedOutDate
        if (newQuantity > 0) {
          updateFields.$set.status = "CheckedIn";
          updateFields.$set.CheckedInDate = new Date();
        }

        const result = await inventory.findOneAndUpdate(
          { _id: new ObjectId(existingInventory._id) },
          updateFields
        );

        res.status(200).send(result);
      } catch (error) {
        console.error("Error updating Inventory:", error);
        res.status(500).send({ message: "Error updating Inventory", error });
      }
    });

    app.patch(
      "/inventory/removeTeam/:id",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        const { id } = req.params;
        console.log({ id });
        const { teamId } = req.body;
        console.log(req.body);

        try {
          console.log(teamId);
          if (!teamId) {
            return res.status(500).json({ message: "No teamId found!" });
          }

          const existingInventory = await inventory.findOne({
            _id: new ObjectId(id),
          });

          if (!existingInventory) {
            return res
              .status(500)
              .json({ message: "No existing inventory found!" });
          }

          const result = await inventory.findOneAndUpdate(
            { _id: new ObjectId(existingInventory._id) },
            { $pull: { assignedTeams: teamId } },
            { returnDocument: "after" } // to return the updated document
          );

          res.status(200).send(result);
        } catch (error) {
          console.error("Error updating Inventory:", error);
          res.status(500).send({ message: "Error updating Inventory", error });
        }
      }
    );
    //venues
    app.post("/venues", verifyJWT, verifyAdminOrCoach, async (req, res) => {
      try {
        const venu = req.body;

        const data = await venues.insertOne(venu);
        res.status(200).send("Venue is saved ");
      } catch (error) {
        res.status(500).send("Something went wrong");
      }
    });

    app.get("/venues/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const { adminEmail } = req.params;

        const data = await venues.find({ adminEmail }).toArray();
        res.status(200).send(data);
      } catch (error) {
        res.status(500).send("Something went wrong");
      }
    });

    app.delete("/venues/del/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;

        const data = await venues.deleteOne({ _id: new ObjectId(id) });
        res.status(200).send(data);
      } catch (error) {
        res.status(500).send("Something went wrong");
      }
    });

    // schedules
    app.post(
      "/reservations",
      verifyJWT,
      verifyAdminOrCoach,
      async (req, res) => {
        try {
          const data = req.body;

          const scheduleData = {
            ...data,
            createdAt: new Date(),
          };

          const response = await reservations.insertOne(scheduleData);

          res.status(200).json(response);
        } catch (error) {
          res.status(500).json({ message: error.message });
        }
      }
    );

    //NOTE:reservations

    app.get("/reservations/:email", verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;

        // const result = await reservations
        //   .find({ addedBy: email })
        //   .sort({ _id: -1 })
        //   .toArray();

        const result = await reservations
          .aggregate([
            {
              $match: {
                adminEmail: email,
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "assignedTo",
                foreignField: "email",
                as: "coachData",
              },
            },
          ])
          .toArray();

        res.json(result);
      } catch (error) {
        console.error("Error fetching reservations:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching reservations." });
      }
    });

    app.delete("/reservations/del/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await reservations.deleteOne({ _id: new ObjectId(id) });

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching reservations:", error);
        res.status(500).json("An error occurred while deleting reservations.");
      }
    });

    // ============ Notifications =========
    app.get("/notifications/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        const result = await notifications
          .find({ adminEmail })
          .sort({ _id: -1 })
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching notification." });
      }
    });

    app.post("/notification", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const notificationData = req.body;

        const result = await notifications.insertOne(notificationData);

        res.json({
          message: "Notification created successfully",
          notificationId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating notification:", error);
        res.status(500).json({
          error: "An error occurred while creating the notification.",
        });
      }
    });

    // =============== Message API ===============
    app.get("/users/chat/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const cursor = users.find({
          $or: [
            { adminEmail: req.params.adminEmail },
            { email: req.params.adminEmail },
          ],
        });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching users." });
      }
    });

    app.get("/message", verifyJWT, async (req, res) => {
      const to = req.query.to;
      const from = req.query.from;

      const response = await messages
        .find({
          $or: [
            { to: to, from: from },
            { to: from, from: to },
          ],
        })
        .toArray();

      res.send(response);
    });

    app.post("/message", verifyJWT, async (req, res) => {
      const messageData = req.body;

      const response = await messages.insertOne(messageData);
      io.to(messageData.to).emit("newMessage", messageData);

      res.send(response);
    });

    // ============= Performances ===============
    app.put("/performance", verifyJWT, async (req, res) => {
      const performanceData = req.body;
      const userEmail = performanceData.userEmail;

      try {
        const existingPerformance = await performances.findOne({ userEmail });

        if (existingPerformance) {
          // Update existing performance data
          const updatedPerformance = await performances.findOneAndUpdate(
            { userEmail },
            { $set: performanceData },
            { returnOriginal: false }
          );

          res.send(updatedPerformance.value); // Sending updated document
        } else {
          // Insert new performance data
          const response = await performances.insertOne(performanceData);
          res.send(response); // Sending newly inserted document
        }
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Server Error");
      }
    });

    app.get("/performance/:userEmail", verifyJWT, async (req, res) => {
      try {
        const userEmail = req.params.userEmail;

        const result = await performances.findOne({ userEmail });
        res.json(result);
      } catch (error) {
        console.error("Error fetching performances:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching performance." });
      }
    });

    // Medical Information
    app.put(
      "/medicalInfo/allergies/:userEmail",
      verifyJWT,
      async (req, res) => {
        const allergies = req.body;
        const userEmail = req.params.userEmail;

        try {
          const updatedAllergies = await medicalInformations.findOneAndUpdate(
            { userEmail },
            { $set: { allergies } },
            { returnOriginal: false, upsert: true } // Set upsert to true for insert
          );

          res.send(updatedAllergies.value);
        } catch (error) {
          console.error("Error:", error);
          res.status(500).send("Server Error");
        }
      }
    );

    // Update pastInjuries for a specific user
    app.put(
      "/medicalInfo/pastInjuries/:userEmail",
      verifyJWT,
      async (req, res) => {
        const pastInjuries = req.body;
        const userEmail = req.params.userEmail;

        try {
          const updatedPastInjuries =
            await medicalInformations.findOneAndUpdate(
              { userEmail },
              { $set: { pastInjuries: pastInjuries } },
              { returnOriginal: false }
            );

          res.send(updatedPastInjuries.value);
        } catch (error) {
          console.error("Error:", error);
          res.status(500).send("Server Error");
        }
      }
    );

    app.get("/medicalInfo/:userEmail", verifyJWT, async (req, res) => {
      try {
        const userEmail = req.params.userEmail;

        const result = await medicalInformations.findOne({ userEmail });
        res.json(result);
      } catch (error) {
        console.error("Error fetching medical info:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching medical info." });
      }
    });

    app.get("/forms", async (req, res) => {
      try {
        const email = req.query.addedBy;
        const isArchived = req.query.isArchived;

        // Build the query based on the conditions provided
        let query;
        if (isArchived == "true" && email) {
          query = {
            "addedBy.email": email,
            $and: [{ isArchived: true }],
          };
        } else if (isArchived == "false" && email) {
          query = {
            "addedBy.email": email,
            $or: [{ isArchived: { $exists: false } }, { isArchived: false }],
          };
        } else if (email) {
          query = {
            "addedBy.email": email,
          };
        } else {
          query = {};
        }


        const result = await formLibrary.aggregate([
          { $match: query },
          {
            $addFields: {
              teamId: { $toObjectId: "$teamId" },
            },
          },
          {
            $lookup: {
              from: "teams",
              localField: "teamId",
              foreignField: "_id",
              as: "teamInfo",
            },
          },
          {
            $unwind: { path: "$teamInfo", preserveNullAndEmptyArrays: true },
          },
        ]).toArray();

        if (result.length > 0) {
          res.json(result);
        } else {
          res.status(404).json({ error: "Form not found" });
        }
      } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });


    app.patch(
      "/forms/:id",
      verifyJWT,
      // upload.single("formFile"),
      async (req, res) => {
        try {
          const formId = req.params.id;
          const { ...updateFields } = req.body;

          const result = await formLibrary.updateOne(
            { _id: new ObjectId(formId) },
            { $set: updateFields }
          );

          if (result.modifiedCount > 0) {
            res.json({ message: "Form updated successfully" });
          } else {
            res.status(404).json({ error: "Form not found" });
          }
        } catch (error) {
          console.error("Error:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    app.delete("/forms/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await formLibrary.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error.message);
        res.status(500).send("An error has occurred!");
      }
    });

    // ============ Files =============
    // POST endpoint to handle file uploads

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Forms
    // app.get("/pdf-forms/:adminEmail", verifyJWT, async (req, res) => {
    //   try {
    //     const adminEmail = req.params.adminEmail;

    //     const cursor = formLibrary.find({ adminEmail: adminEmail });
    //     const result = await cursor.toArray();
    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).json({ error: "Something went wrong" });
    //   }
    // });

    app.get("/pdf-forms/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;


        const result = await formLibrary.aggregate([
          { $match: { adminEmail: adminEmail } },
          {
            $addFields: {
              teamId: { $toObjectId: "$teamId" },
            },
          },
          {
            $lookup: {
              from: "teams",
              localField: "teamId",
              foreignField: "_id",
              as: "teamInfo",
            },
          },
        ]).toArray();

        console.log({ result })

        res.send(result); // Send the result to the client
      } catch (err) {
        console.error("Error fetching PDF forms with teams:", err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });


    // Filed Forms
    app.get("/filled-forms/:userEmail", verifyJWT, async (req, res) => {
      try {
        const userEmail = req.params.userEmail;
        const forCoach = req.query.forCoach;

        let findBy = {
          "addedBy.email": userEmail,
        };
        if (forCoach) {
          findBy = { adminEmail: userEmail };
        }

        console.log(findBy);

        // Find filled forms
        const cursor = filledForms.find(findBy);
        const filled = await cursor.toArray();

        // Aggregation pipeline for filledCustomForms
        const pipeline = [
          { $match: findBy },
          {
            $lookup: {
              from: "customForms",
              let: { formId: { $toObjectId: "$formId" } }, // Convert formId to ObjectId
              pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$formId"] } } }],
              as: "formInfo",
            },
          },
          {
            $set: {
              formInfo: { $arrayElemAt: ["$formInfo", 0] }, // Extract the first element from formInfo array
            },
          },
        ];

        const cursor2 = filledCustomForms.aggregate(pipeline);
        const filledCustom = await cursor2.toArray();

        res.send({ pdf: filled, custom: filledCustom });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    app.post(
      "/upload-file",
      verifyJWT,
      upload.single("formFile"),
      async (req, res) => {
        console.log("Bari khay");
        try {
          if (!req?.file?.path) {
            return res.status(400).json({ error: "No file uploaded" });
          }

          const cloudinaryResult = await cloudinary.uploader.upload(
            req.file.path
          );

          const formUrl = cloudinaryResult.secure_url;
          console.log(formUrl);
          res.send({ formUrl });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Something went wrong" });
        }
      }
    );

    app.post(
      "/upload-form",
      verifyJWT,
      upload.single("formFile"),
      async (req, res) => {
        try {
          if (!req?.file?.path) {
            return res.status(400).json({ error: "No file uploaded" });
          }

          const { ...bodyData } = req.body;
          const cloudinaryResult = await cloudinary.uploader.upload(
            req.file.path
          );

          const formUrl = cloudinaryResult.secure_url;
          bodyData.formFile = formUrl;
          bodyData.addedBy = JSON.parse(bodyData.addedBy);

          const result = await formLibrary.insertOne(bodyData);
          res.send(result);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Something went wrong" });
        }
      }
    );

    app.post(
      "/upload-filled-form/:formId",
      verifyJWT,
      upload.single("formFile"),
      async (req, res) => {
        try {
          if (!req?.file?.path) {
            return res.status(400).json({ error: "No file uploaded" });
          }

          const { ...bodyData } = req.body;
          const cloudinaryResult = await cloudinary.uploader.upload(
            req.file.path
          );

          const formUrl = cloudinaryResult.secure_url;
          bodyData.formFile = formUrl;
          bodyData.addedBy = JSON.parse(bodyData.addedBy);

          const formId = req.params.formId;

          const query = { formId };
          const options = { upsert: true, returnOriginal: false };

          const result = await filledForms.findOneAndUpdate(
            query,
            { $set: bodyData },
            options
          );
          res.send(result);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Something went wrong" });
        }
      }
    );

    // custom forms
    app.get("/custom-forms/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        const cursor = customForms.find({ adminEmail: adminEmail });
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    app.post("/upload-custom-form", verifyJWT, async (req, res) => {
      try {
        const formData = req.body;

        const result = await customForms.insertOne(formData);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    app.post("/upload-filled-custom-form", verifyJWT, async (req, res) => {
      try {
        const formData = req.body;

        console.log(formData);
        const result = await filledCustomForms.insertOne(formData);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    app.patch("/custom-form/:id", verifyJWT, async (req, res) => {
      try {
        const formId = req.params.id;
        const { ...updateFields } = req.body;

        const result = await customForms.updateOne(
          { _id: new ObjectId(formId) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          res.json({ message: "Form updated successfully" });
        } else {
          res.status(404).json({ error: "Form not found" });
        }
      } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.delete("/custom-form/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await customForms.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error.message);
        res.status(500).send("An error has occurred!");
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.log("Error in server", error);
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//NOTE:cron
cron.schedule("0 12 * * *", async () => {
  try {
    console.log("Running the cron job for archiving team data.");
    const currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0);

    await teamRoster.updateMany({ offSeasonStartDate: { $type: "string" } }, [
      { $set: { offSeasonStartDate: { $toDate: "$offSeasonStartDate" } } },
    ]);

    const teamRosterToArchive = await teamRoster
      .find({
        offSeasonStartDate: { $lte: currentDate },
        $or: [
          { isArchived: { $ne: true } }, // isArchive is either false or not present
          { isArchived: { $exists: false } }, // isArchive does not exist
        ],
      })
      .toArray();

    // console.log({ teamRosterToArchive });

    for (roster of teamRosterToArchive) {
      //extract team athletes
      const team = await teams.findOne({ _id: roster.teamId });
      const prevAthletes = team.athletes;

      // console.log({ team });
      // console.log({ prevAthletes });

      //update the existing roster as archived

      const updateRoster = await teamRoster.findOneAndUpdate(
        {
          _id: roster._id,
        },
        {
          $set: {
            archivedAthletes: prevAthletes,
            isArchived: true,
            archiveDate: currentDate,
          },
        }
      );

      //update team
      const teamUpdated = await teams.findOneAndUpdate(
        {
          _id: roster.teamId,
        },
        {
          $set: {
            athletes: [],
          },
        }
      );

      //create new Roster

      const newRosterData = {
        // _id: new ObjectId(oid()),
        teamId: roster.teamId,
        offSeasonEndDate: null,
        offSeasonStartDate: null,
        offerScholarships: false,
        postSeasonEndDate: null,
        postSeasonStartDate: null,
        preSeasonEndDate: null,
        preSeasonStartDate: null,
        rosterMaximumCount: 10,
        tryoutStage: 1,
        seasonEndDate: null,
        seasonStartDate: null,
        tryoutStartDate: null,
        createdAt: currentDate,
        isArchived: false,
      };

      const insertedData = await teamRoster.insertOne(newRosterData);
    }
  } catch (error) {
    console.log("error in cron", error);
  }
});
