const express = require("express");
const authController = require("../controllers/authController");
const router = express.Router();

// Register new user
router.post("/register", authController.registerUserController);

// Login a user
router.post("/login", authController.loginUserController);

// Verify OTP
router.post("/verify-otp", authController.verifyOTPController);

// Resend OTP
router.post("/resend-otp", authController.resendOTPController);

module.exports = router;
