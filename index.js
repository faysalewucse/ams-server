const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { verifyJWT } = require("./middleware/verifyJWT");

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
  const token = jwt.sign(user, process.env.JWT_SECRET_KEY, { expiresIn: "1h" });
  res.send({ token });
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

    // Get users by role
    app.get("/users/byRole", verifyJWT, async (req, res) => {
      try {
        const roleToFind = req.query.role || ""; // Get the role from query parameters or use an empty string if not provided
        const cursor = users.find({ role: roleToFind });
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching users by role:", error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching users by role." });
      }
    });

    // get athlete for coach
    // app.get("/users/athlete", verifyJWT, verifySuperAdminOrAdmin, verifyCoach, async (req, res) => {
    //   const query = req.query.role;
    //   const result = await users.find({ role: query }).toArray();
    //   res.send(result);
    // });

    app.get("/users/:userEmail", async (req, res) => {
      const email = req.params.userEmail;
      const result = await users.findOne({ email: email });
      res.send(result);
    });

    app.post("/user", async (req, res) => {
      const user = req.body;

      const existingUser = await users.findOne({ email: user.email });
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this email already exists" });
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
      "/users/assignTeam/:coachEmail",
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

    // Update admin status by super admin
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

    // show team data to all coach page
    app.get("/coach-teams",async (req, res) => {
      try {
        const coaches = await users
          .aggregate([
            {
              $match: { role: "coach" },
            },
            {
              $lookup: {
                from: "teams",
                localField: "email",
                foreignField: "coaches",
                as: "teams",
              },
            },
            {
              $project: {
                _id: 0, // Exclude the _id field
                email: 1, // Include the "email" field
                teamNames: "$teams.teamName", // Include the "teams" array
              },
            },
          ])
          .toArray();
        res.send(coaches);
      } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
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
