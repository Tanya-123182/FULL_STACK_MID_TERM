import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { loginSchema } from '../validation/authValidation.js';

export const login = async (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors.map(err => err.message).join(', ');
    return res.status(400).json({ error: errorDetails });
  }

  const { email, password } = parseResult.data;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive. Please contact your administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
    const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        email: user.email
      },
      secret,
      { expiresIn }
    );

    return res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

export const getMe = async (req, res) => {
  return res.status(200).json({ user: req.user });
};

export const candidateTest = async (req, res) => {
  return res.status(200).json({
    message: 'Candidate access authorized',
    user: req.user
  });
};

export const proctorTest = async (req, res) => {
  return res.status(200).json({
    message: 'Proctor access authorized',
    user: req.user
  });
};

export const adminTest = async (req, res) => {
  return res.status(200).json({
    message: 'Admin access authorized',
    user: req.user
  });
};

export const listUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('_id name email role');
    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
};
