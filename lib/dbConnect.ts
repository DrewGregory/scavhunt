// Inspired from https://github.com/vercel/next.js/blob/939251bf65633c6b330bdcd6476e651bbc16efa2/examples/with-mongodb-mongoose/lib/dbConnect.ts

import mongoose from "mongoose";

declare global {
  var mongoose: any; // This must be a `var` and not a `let / const`
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function dbConnect() {

  if (cached.conn) {
    return cached.conn;
  }
  const MONGO_URL = process.env.MONGO_URL;

  if (!MONGO_URL) {
    console.log(MONGO_URL);
    throw new Error(
      "Please define the MONGO_URL environment variable inside .env.local",
    );
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(MONGO_URL, opts).then((mongoose) => {
      return mongoose;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}