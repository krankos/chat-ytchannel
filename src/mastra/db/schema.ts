import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const videos = pgTable("videos", {
  id: text("id").primaryKey(),
  fullTranscript: text("fullTranscript"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: text("id").primaryKey(),
  videoId: text("videoId").references(() => videos.id),
  data: jsonb("data"),
  createdAt: timestamp("createdAt").defaultNow(),
});

export type Video = InferSelectModel<typeof videos>;
export type NewVideo = InferInsertModel<typeof videos>;
export type Chunk = InferSelectModel<typeof chunks>;
export type NewChunk = InferInsertModel<typeof chunks>;
