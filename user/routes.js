const express = require("express");
const router = express.Router();
const userController = require("./controller");

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
// Add more routes as needed

module.exports = router;
