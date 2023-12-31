exports.getAllUsers = async (req, res) => {
  try {
    const cursor = users.find();
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ error: "An error occurred while fetching users." });
  }
};

exports.getUserById = (req, res) => {
  // Logic to get user by ID
};
