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

const upload = multer({ storage });

require("dotenv").config();

const app = express();
app.use(cors());

//TODO: Changed the server port to 5002 from 5000
const port = process.env.PORT || 5000;

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

client.connect();

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

app.post(
  "/webhooks",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        "whsec_e0957a7622d216ee38c42a2f42543b2f7b3d175dd6288d9069c13ea3f8752ff5"
        // "whsec_zOd7n9tv2VRMzfHMPAU06EH93xor1RUC"
      );
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log("event.type", event.type);

    switch (event.type) {
      case "checkout.session.completed":
        const checkoutSessionCompleted = event.data.object;

        const paymentIntent = await stripe.paymentIntents.retrieve(
          checkoutSessionCompleted.payment_intent
        );

        console.log({ paymentIntent });

        const userEmaill = checkoutSessionCompleted.customer_email;
        const customer_id = checkoutSessionCompleted.customer;

        const amount_total = checkoutSessionCompleted.amount_total / 100;

        const result = await users.updateOne(
          { email: userEmaill },
          {
            $set: {
              amount_paid: amount_total,
              customer_id: customer_id || "",
              isSubscribed: true,
            },
          }
        );

        console.log({ checkoutSessionCompleted, result });

        break;

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
    app.get("/api/prices", async (req, res) => {
      try {
        const pricesData = await prices.find().toArray();
        res.json(pricesData);
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.post("/api/prices/assign", async (req, res) => {
      try {
        const { productName, teamId, priceId, price } = req.body;

        console.log(productName, teamId, priceId, price);

        const teamData = await teams.findOne({ _id: new ObjectId(teamId) });

        const athletes = teamData?.athletes;

        const athleteEmails = athletes.map((athlete) => athlete.athleteEmail);

        console.log({ athleteEmails });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],

          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: 123,
          },
          mode: "payment",
          success_url: "https://overtimeam.com/dashboard",
          cancel_url: "https://overtimeam.com",
        });

        const checkoutUrl = session.url;

        const sendAthleteMail = await sendMail(athleteEmails, checkoutUrl);

        // if (!sendAthleteMail) {
        //   throw new Error("Something went wrong while assigning!");
        // }

        res.status(200).json({ message: "Price assigned successfully" });
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    //NOTE: Running Task abdurrahman
    app.post("/stripe/connect/:adminId", async (req, res) => {
      try {
        const { adminId } = req.params;
        // console.log("admin id", adminId);
        let account;
        let accountLink;

        let a = false;

        if (a) {
          console.log("true");
        } else {
          account = await stripe.accounts.create({
            type: "standard",
          });
        }

        // console.log("account", account);

        accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: "http://localhost:3000/dashboard/stripe",
          return_url: "http://localhost:3000/dashboard/stripe",
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

    

        res.json(accountLink.url);
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
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

    app.post("/jwt", (req, res) => {
      const user = req.body;
      console.log("useruseruser", req.body);
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: "10m",
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

        console.log(superAdmin);

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

    app.post("/user", async (req, res) => {
      const user = req.body;

      console.log({ user });

      const existingUser = await users.findOne({ email: user.email });
      console.log({ existingUser });
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this Id already exists" });
      }

      const result = await users.insertOne(user);
      res.send(result);
    });

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
    app.delete("/deleteUser/:userEmail", verifyJWT, async (req, res) => {});

    app.patch("/coach/assignTeam/:coachEmail", verifyJWT, async (req, res) => {
      const coachEmail = req.params.coachEmail;
      const teamIds = req.body;

      try {
        // Convert teamIds from an array of strings to an array of ObjectIds
        const teamObjectIds = teamIds.map((teamId) => new ObjectId(teamId));

        // Update the teams collection to push the coach's email
        const result = await teams.updateMany(
          { _id: { $in: teamObjectIds } }, // Match teams by their IDs
          { $push: { coaches: coachEmail } } // Push coachEmail to the coaches array
        );

        res.send(result);
      } catch (error) {
        console.error("Error assigning teams to coach:", error);
        res.status(500).send({
          error: "An error occurred while assigning teams to coach.",
        });
      }
    });

    app.patch(
      "/athlete/assignTeam/:athleteEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        const athleteEmail = req.params.athleteEmail;
        const teamIds = req.body;

        try {
          // Convert teamIds from an array of strings to an array of ObjectIds
          const teamObjectIds = teamIds.map((teamId) => new ObjectId(teamId));

          // Update the teams collection to push the coach's email
          const result = await teams.updateMany(
            { _id: { $in: teamObjectIds } }, // Match teams by their IDs
            { $push: { athletes: { athleteEmail, position: "" } } } // Push coachEmail to the coaches array
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

    app.get("/teams/:adminEmail", verifyJWT, async (req, res) => {
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

    // get teams for specific coaches
    app.get("/teams/coach-team/:coachEmail", verifyJWT, async (req, res) => {
      try {
        const coachEmail = req.params.coachEmail;

        const result = await teams
          .find({ coaches: { $in: [coachEmail] } })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "An error has occurred" });
      }
    });

    // get teams for specific athletes
    app.get(
      "/teams/athlete-team/:athleteEmail",
      verifyJWT,
      async (req, res) => {
        try {
          const athleteEmail = req.params.athleteEmail;
          const result = await teams
            .find({
              athletes: {
                $elemMatch: { athleteEmail: athleteEmail },
              },
            })
            .toArray();

          res.send(result);
        } catch (error) {
          res.status(500).send({ error: "An error has occurred" });
        }
      }
    );

    // add teams to db
    app.post("/teams", verifyJWT, verifyAdminOrCoach, async (req, res) => {
      const data = req.body;
      const result = await teams.insertOne(data);
      res.send(result);
    });

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
          res.send(result);
        } catch (error) {
          console.error(error.message);
          res.status(501).send("An error occurred!");
        }
      }
    );

    // remove athlete from team
    app.delete(
      "/teams/athlete/:athleteEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        try {
          const athleteEmail = req.params.athleteEmail;
          const teamId = req.query.teamId;

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

    // ============ Events =========
    app.get("/events/:adminEmail", verifyJWT, async (req, res) => {
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
                let: { planId: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$planId", "$$planId"] },
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

        const result = await formLibrary.find(query).toArray();

        if (result) {
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
    app.get("/pdf-forms/:adminEmail", verifyJWT, async (req, res) => {
      try {
        const adminEmail = req.params.adminEmail;

        const cursor = formLibrary.find({ adminEmail: adminEmail });
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
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
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
