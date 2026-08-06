import mongoose from "mongoose";
import { config } from "./index.js";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log("Connected to MongoDB");
}
