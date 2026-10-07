const crypto = require("crypto");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/emailService");

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// Generate cryptographically secure 6-digit OTP
const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

// Guards against non-string input (e.g. {"email": {"$ne": null}} NoSQL injection)
const isString = (v) => typeof v === "string";

const sendOtpEmail = (user, otp) =>
  sendEmail({
    email: user.email,
    subject: "Email Verification OTP - MailGen AI",
    message: `Your OTP for verification is: ${otp}\n\nThis OTP is valid for 10 minutes.`,
  });

const registerUserController = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!isString(name) || !isString(email) || !isString(password) || !name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    if (cleanName.length < 2) {
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters long" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    let user = await User.findOne({ email: cleanEmail });

    if (user && user.isVerified) {
      return res
        .status(400)
        .json({ message: "Email already registered. Please try logging in." });
    }

    if (user) {
      // Unverified account from an earlier attempt: let them re-register
      // instead of being locked out forever.
      user.name = cleanName;
      user.password = password; // re-hashed by pre-save hook
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      user.otpAttempts = 0;
      await user.save();
    } else {
      user = await User.create({
        name: cleanName,
        email: cleanEmail,
        password,
        otp,
        otpExpiry,
      });
    }

    try {
      await sendOtpEmail(user, otp);
    } catch (error) {
      // Only delete if this account was never verified (always true here)
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        message: "Failed to send verification email. Please try again.",
      });
    }

    res.status(201).json({
      message: "User registered successfully. Please verify OTP sent to your email.",
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!isString(email) || !isString(otp) || !email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }
    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: "No OTP pending. Please request a new one." });
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: "Too many failed attempts. Please request a new OTP." });
    }
    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const submitted = Buffer.from(otp.trim());
    const stored = Buffer.from(user.otp);
    const matches =
      submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);

    if (!matches) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    await user.save();

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
      message: "Email verified successfully!",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: "OTP verification failed" });
  }
};

const resendOTPController = async (req, res) => {
  try {
    const { email } = req.body;
    if (!isString(email) || !email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    // Same response whether or not the user exists (avoids account enumeration)
    const genericResponse = { message: "If the account exists, a new OTP has been sent." };

    if (!user || user.isVerified) {
      return res.status(200).json(genericResponse);
    }

    // Cooldown: otpExpiry - TTL = time the last OTP was issued
    if (user.otpExpiry) {
      const issuedAt = user.otpExpiry.getTime() - OTP_TTL_MS;
      if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
        return res
          .status(429)
          .json({ message: "Please wait a minute before requesting another OTP." });
      }
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.otpAttempts = 0;
    await user.save();

    try {
      await sendOtpEmail(user, otp);
    } catch (error) {
      return res.status(500).json({ message: "Failed to send verification email. Please try again." });
    }

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Failed to resend OTP" });
  }
};

const loginUserController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isString(email) || !isString(password) || !email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Checked AFTER the password so unverified status isn't leaked to strangers
    if (!user.isVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your email first.",
        needsVerification: true,
        email: user.email,
      });
    }

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
      message: "Login successful!",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
};

module.exports = {
  registerUserController,
  loginUserController,
  verifyOTPController,
  resendOTPController,
};
