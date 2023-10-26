const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { verifyJWT } = require("./middleware/verifyJWT");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

const server = app.listen(port, () => {
  console.log(`AMS Server listening on port ${port}`);
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
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

app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
    expiresIn: "10h",
  });
  res.send({ token });
});

const uri = process.env.MONGODB_URL;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const database = client.db("overtimeDB");
    const users = database.collection("users");
    const teams = database.collection("teams");
    const events = database.collection("events");
    const notifications = database.collection("notifications");
    const messages = database.collection("messages");
    const plans = database.collection("plans");
    const trips = database.collection("trips");

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
      console.log(email);
      const query = { email: email };
      const user = await users.findOne(query);

      console.log(user);
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
      if (user?.role !== "coach") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // TODO: verify instructor remains
    // users

    // Get all users for super admin
    app.get("/users", verifyJWT, verifySuperAdmin, async (req, res) => {
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
      "/users/coach-athlete-parents/:adminEmail",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const adminEmail = req.params.adminEmail;

          const cursor = users.find({
            role: { $in: ["coach", "athlete", "parents"] },
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
    app.get(
      "/users/athlete/:parentsEmail",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    app.get("/users/byRole", verifyJWT, async (req, res) => {
      try {
        const teamCount = await teams.countDocuments();

        const roleToFind = req.query.role || "";
        const adminEmail = req.query.adminEmail || "";
        const parentsEmail = req.query.parentsEmail || "";

        let matchWith = { role: roleToFind };
        if (adminEmail !== "joseph@gmail.com" && !parentsEmail) {
          matchWith.adminEmail = adminEmail;
        }

        if (roleToFind === "athlete" && parentsEmail) {
          console.log("Here");
          matchWith.parentsEmail = parentsEmail;
          console.log({ matchWith });
          const cursor = users.find(matchWith);

          const result = await cursor.toArray();

          res.send(result);
        } else if (
          (roleToFind === "coach" || roleToFind === "athlete") &&
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
                    roleToFind === "coach"
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
      const userEmail = req.params.userEmail;
      const result = await users.findOne({ email: userEmail });
      res.send(result);
    });

    app.post("/user", async (req, res) => {
      const user = req.body;

      const existingUser = await users.findOne({ email: user.email });
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this Id already exists" });
      }

      const result = await users.insertOne(user);
      res.send(result);
    });

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

    app.patch(
      "/coach/assignTeam/:coachEmail",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

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

    // get all the teams with coach data also
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

    // // get teams for specific coaches
    // app.get("/teams/athlete-team/:coachEmail", verifyJWT, async (req, res) => {
    //   try {
    //     const coachEmail = req.params.coachEmail;
    //     const result = await teams
    //       .find({ coaches: { $in: [coachEmail] } })
    //       .toArray();
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ error: "An error has occurred" });
    //   }
    // });

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

      console.log(teamId, athleteEmail, position);
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
    app.patch(
      "/teams/athlete/:athleteEmail",
      verifyJWT,
      verifyCoach,
      async (req, res) => {
        try {
          const athleteEmail = req.params.athleteEmail;
          const teamId = req.query.team;
          const result = await teams.updateOne(
            { _id: new ObjectId(teamId) },
            { $pull: { athletes: athleteEmail } }
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
          .find({ adminEmail })
          .sort({ _id: -1 })
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching events:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching events." });
      }
    });

    app.post("/events", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const eventData = req.body;

        console.log(eventData);

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

    //============ Planners ============
    app.get("/plans/:coachEmail", verifyJWT, async (req, res) => {
      try {
        const coachEmail = req.params.coachEmail;
        const result = await plans
          .find({ coachEmail })
          .sort({ _id: -1 })
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

      // Insert the message into the MongoDB collection
      const response = await messages.insertOne(messageData);

      // Emit the message to the relevant room (e.g., based on `to` and `from`)
      io.to(messageData.to).emit("newMessage", messageData);

      console.log("HERE");
      res.send(response);
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
