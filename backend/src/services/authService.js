const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'hmi32-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 10;

const normalizeUsername = (username) => String(username || '').trim().toLowerCase();

const createToken = (user) =>
  jwt.sign(
    { userId: String(user._id), username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

const hasAnyUsers = async () => {
  const count = await User.countUsers();
  return count > 0;
};

const isSignupAllowed = async () => !(await hasAnyUsers());

const registerUser = async (username, password) => {
  if (!(await isSignupAllowed())) {
    throw new Error('Registration is closed');
  }

  const normalized = normalizeUsername(username);
  const plainPassword = String(password || '');

  if (!normalized) {
    throw new Error('Username is required');
  }
  if (normalized.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (plainPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const existing = await User.findByUsername(normalized);
  if (existing) {
    throw new Error('Username already exists');
  }

  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  const user = await User.create({ username: normalized, passwordHash });

  const token = createToken(user);
  return {
    token,
    user: { id: String(user._id), username: user.username },
  };
};

const loginUser = async (username, password) => {
  const normalized = normalizeUsername(username);
  const plainPassword = String(password || '');

  if (!normalized || !plainPassword) {
    throw new Error('Username and password are required');
  }

  const user = await User.findByUsername(normalized);
  if (!user) {
    throw new Error('Invalid username or password');
  }

  const valid = await bcrypt.compare(plainPassword, user.password_hash);
  if (!valid) {
    throw new Error('Invalid username or password');
  }

  await User.updateLastLogin(normalized);
  const token = createToken(user);

  return {
    token,
    user: { id: String(user._id), username: user.username },
  };
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  hasAnyUsers,
  isSignupAllowed,
};
