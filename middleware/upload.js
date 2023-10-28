const multer = require("multer");
const path = require("path");

// Create a storage engine using Multer
const storage = multer.diskStorage({
  destination: "uploads/", // The folder where uploaded files will be stored
  filename: (req, file, cb) => {
    // Define the file name and extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, uniqueSuffix + fileExtension);
  },
});

// Define file filter to only accept specific file types
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = [".jpg", ".jpeg", ".png", ".pdf"];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidFileType = allowedFileTypes.includes(fileExtension);

  if (isValidFileType) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPG, JPEG, PNG, and PDF files are allowed."
      ),
      false
    );
  }
};

// Initialize Multer with the storage and file filter
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

module.exports = upload;
