const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ADMIN logs in with email + password. CANDIDATE logs in with email + accessCode
// (generated on CSV import). sessionNonce changes on every login, so only the
// latest login stays valid (stops account sharing across two devices).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true, maxlength: 20 },
    role: { type: String, enum: ['ADMIN', 'CANDIDATE'], default: 'CANDIDATE', index: true },
    passwordHash: { type: String, select: false },
    // Stored retrievable on purpose so admins can re-export credentials. Admin-only, never sent to candidates.
    accessCode: { type: String, select: false },
    sessionNonce: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // extra CSV columns (payment id, school, class...)
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 11);
userSchema.methods.checkPassword = function checkPassword(plain) {
  return this.passwordHash ? bcrypt.compare(plain, this.passwordHash) : false;
};

module.exports = mongoose.model('User', userSchema);
