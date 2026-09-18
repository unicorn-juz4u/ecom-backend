const validator = require('validator');

/**
 * Validates and normalizes customer email
 * @param {any} rawEmail 
 * @returns {{ valid: boolean, email?: string, error?: string }}
 */
function validateEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = rawEmail.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email cannot be empty' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }

  if (!validator.isEmail(trimmed)) {
    return { valid: false, error: 'Invalid email address format' };
  }

  // Normalize email (lowercase and sanitized)
  const normalized = validator.normalizeEmail(trimmed, {
    gmail_remove_dots: false,
    all_lowercase: true,
  }) || trimmed.toLowerCase();

  return { valid: true, email: normalized };
}

/**
 * Validates non-empty string fields
 */
function validateString(value, maxLength = 255) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}

module.exports = {
  validateEmail,
  validateString,
};
