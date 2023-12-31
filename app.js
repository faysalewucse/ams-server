// app.js

const express = require("express");
const app = express();

// Middlewares
app.use(express.json());

// Routes
const authRoutes = require("./auth/routes");
const userRoutes = require("./user/routes");

app.use("/auth", authRoutes);
app.use("/users", userRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
