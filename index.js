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

    const verifySuperAdminOrAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);
      if (user?.role !== "sadmin" && user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "You are nor Admin or Super Admin" });
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
    // Get all users
    app.get("/users", verifyJWT, verifySuperAdminOrAdmin, async (req, res) => {
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

    // Get users by role
    app.get(
      "/users/byRole",
      verifyJWT,
      verifySuperAdminOrAdmin,
      async (req, res) => {
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
      }
    );

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

    // Approve Admin by super admin
    app.patch(
      "/user/:id",
      verifyJWT,
      verifySuperAdminOrAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedStatus = req.query.status;
        const result = await users.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: updatedStatus } }
        );
        res.send(result);
      }
    );

    //Teams
    const teams = database.collection("teams");

    // add teams to db
    app.post("/teams", async (req, res) => {
      const data = req.body;
      console.log(data);
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
