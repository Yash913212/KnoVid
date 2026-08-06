import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  salt: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  setPassword(password: string): void;
  validatePassword(password: string): boolean;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

UserSchema.methods.setPassword = function (this: IUser, password: string) {
  this.salt = crypto.randomBytes(16).toString("hex");
  this.passwordHash = crypto
    .pbkdf2Sync(password, this.salt, 1000, 64, "sha512")
    .toString("hex");
};

UserSchema.methods.validatePassword = function (this: IUser, password: string): boolean {
  const hash = crypto
    .pbkdf2Sync(password, this.salt, 1000, 64, "sha512")
    .toString("hex");
  return this.passwordHash === hash;
};

export const User = mongoose.model<IUser>("User", UserSchema);
