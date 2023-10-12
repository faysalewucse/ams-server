const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { verifyJWT } = require("./middleware/verifyJWT");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

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

    // Get all users for admin
    app.get(
      "/users/coach-athlete-parents",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const cursor = users.find({
            role: { $in: ["coach", "athlete", "parents"] },
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

    app.get("/users/byRole", async (req, res) => {
      try {
        const roleToFind = req.query.role || "";
        const adminEmail = req.query.adminEmail || ""; // Get the role from query parameters or use an empty string if not provided

        if (roleToFind === "coach") {
          // If the requested role is "coach," perform aggregation to fetch coaches with team details
          const coachesWithTeams = await users
            .aggregate([
              {
                $match: { role: "coach", adminEmail: adminEmail },
              },
              {
                $lookup: {
                  from: "teams", // Assuming the teams are in the "teams" collection
                  localField: "email",
                  foreignField: "coaches",
                  as: "teams",
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  email: 1,
                  role: 1,
                  status: 1,
                  teams: 1,
                },
              },
            ])
            .toArray();

          res.send(coachesWithTeams);
        } else {
          // If the requested role is not "coach," simply fetch users by role
          const cursor = users.find({ role: roleToFind });
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

    //Teams
    const teams = database.collection("teams");

    // get all the teams with coach data also
    app.get("/teams/:adminEmail", verifyJWT, verifyAdmin, async (req, res) => {
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
                from: "users", // Assuming the coaches are in the "users" collection
                localField: "coaches", // Field in the current collection (teams) to match
                foreignField: "email", // Field in the "users" collection to match
                as: "coachData", // Alias for the coach data
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

    // add teams to db
    app.post("/teams", verifyJWT, verifyAdmin, async (req, res) => {
      const data = req.body;
      const result = await teams.insertOne(data);
      res.send(result);
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

app.listen(port, () => {
  console.log(`AMS Server listening on port ${port}`);
});
