import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PgVector } from "@mastra/pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { and, like, or, gte, lte, sql } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

const vectorStore = new PgVector({
  connectionString,
});

const pool = new Pool({
  connectionString,
});
const db = drizzle(pool, { schema });

// Helper function for querying videos with metadata filters
const queryVideos = async (filters?: {
  titleContains?: string;
  summaryContains?: string;
  speakerContains?: string;
  topicContains?: string;
  tags?: string[];
  speakers?: string[];
  topics?: string[];
  dateFrom?: string;
  dateTo?: string;
}) => {
  const conditions = [];

  if (filters?.titleContains) {
    conditions.push(
      like(sql`metadata->>'title'`, `%${filters.titleContains}%`)
    );
  }

  if (filters?.summaryContains) {
    conditions.push(
      like(sql`metadata->>'summary'`, `%${filters.summaryContains}%`)
    );
  }

  if (filters?.speakerContains) {
    conditions.push(
      like(sql`metadata->'speakers'::text`, `%${filters.speakerContains}%`)
    );
  }

  if (filters?.topicContains) {
    conditions.push(
      like(sql`metadata->'keyTopics'::text`, `%${filters.topicContains}%`)
    );
  }

  if (filters?.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(
      (tag) => sql`metadata->'tags' @> ${JSON.stringify([tag])}`
    );
    conditions.push(or(...tagConditions));
  }

  if (filters?.speakers && filters.speakers.length > 0) {
    const speakerConditions = filters.speakers.map(
      (speaker) => sql`metadata->'speakers' @> ${JSON.stringify([speaker])}`
    );
    conditions.push(or(...speakerConditions));
  }

  if (filters?.topics && filters.topics.length > 0) {
    const topicConditions = filters.topics.map(
      (topic) => sql`metadata->'keyTopics' @> ${JSON.stringify([topic])}`
    );
    conditions.push(or(...topicConditions));
  }

  if (filters?.dateFrom) {
    conditions.push(gte(schema.videos.createdAt, new Date(filters.dateFrom)));
  }

  if (filters?.dateTo) {
    conditions.push(lte(schema.videos.createdAt, new Date(filters.dateTo)));
  }

  const result = await db
    .select()
    .from(schema.videos)
    .where(and(...conditions))
    .orderBy(schema.videos.createdAt);

  return (
    result?.map((row) => {
      const metadata = (row.metadata as Record<string, unknown>) || {};
      return {
        id: row.id,
        fullTranscript: row.fullTranscript,
        metadata,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // Extract commonly used fields for convenience
        title: metadata.title,
        summary: metadata.summary,
        speakers: metadata.speakers || [],
        keyTopics: metadata.keyTopics || [],
        actionItems: metadata.actionItems || [],
        tags: metadata.tags || [],
        duration: metadata.duration,
      };
    }) || []
  );
};

const unifiedSearch = async ({
  query,
  filter,
  topK = 10,
  mode = "auto",
}: {
  query?: string;
  filter?: {
    content?: string;
    speakers?: string[];
    topics?: string[];
    tags?: string[];
    speakerContains?: string;
    topicContains?: string;
    titleContains?: string;
    summaryContains?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  topK?: number;
  mode?: "auto" | "semantic" | "metadata";
}) => {
  console.log(
    `Unified search - Query: "${query}", Filter:`,
    filter,
    `Mode: ${mode}`
  );

  // Determine search mode intelligently
  let searchMode = mode;
  if (mode === "auto") {
    if (query?.trim()) {
      searchMode = "semantic"; // Has query text -> semantic search
    } else {
      searchMode = "metadata"; // No query -> just browse by metadata
    }
  }

  // Step 1: Get matching video IDs if we have metadata filters
  let videoIds: string[] | undefined;

  if (filter && Object.keys(filter).some((key) => key !== "content")) {
    const videos = await queryVideos({
      titleContains: filter.titleContains,
      summaryContains: filter.summaryContains,
      speakerContains: filter.speakerContains,
      topicContains: filter.topicContains,
      tags: filter.tags,
      speakers: filter.speakers,
      topics: filter.topics,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });

    videoIds = videos.map((v) => v.id);
    console.log(`Found ${videoIds.length} videos matching metadata filters`);

    if (videoIds.length === 0) {
      return { results: [], videos: [], mode: searchMode };
    }

    // If mode is metadata-only, return video info instead of chunks
    if (searchMode === "metadata") {
      return {
        results: [],
        videos: videos.map((v) => ({
          id: v.id,
          title: v.title,
          summary: v.summary,
          speakers: v.speakers,
          keyTopics: v.keyTopics,
          tags: v.tags,
          createdAt: v.createdAt,
        })),
        mode: searchMode,
      };
    }
  }

  // Step 2: For semantic search, perform vector search
  if (searchMode === "semantic" && query) {
    const pgFilter: Record<string, string | object> = {};

    // Restrict to filtered video IDs if we have them
    if (videoIds) {
      pgFilter.videoId = { $in: videoIds };
    }

    // Content-based filtering on chunks
    if (filter?.content) {
      pgFilter.content = { $regex: filter.content, $options: "i" };
    }

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    const results = await vectorStore.query({
      indexName: "video_chunks",
      queryVector: embedding,
      topK,
      filter: pgFilter,
      includeVector: false,
    });

    console.log(
      `Retrieved ${results.length} chunk results from vector search.`
    );
    return { results, videos: [], mode: searchMode };
  }

  // Fallback for edge cases
  return { results: [], videos: [], mode: searchMode };
};

export const videoSearchTool = createTool({
  id: "video-search",
  description:
    "Universal video search tool. Can perform semantic search for content (when query provided) or browse videos by metadata (when only filters provided). Automatically chooses the best approach.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query for semantic content search. Leave empty to browse by metadata only."
      ),
    filter: z
      .object({
        content: z
          .string()
          .optional()
          .describe("Filter chunks containing specific content"),
        speakers: z
          .array(z.string())
          .optional()
          .describe("Filter by exact speaker names (e.g., ['Dan Abramov'])"),
        topics: z
          .array(z.string())
          .optional()
          .describe(
            "Filter by exact topic names (e.g., ['React', 'TypeScript'])"
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter by exact tags (e.g., ['tutorial', 'beginner'])"),
        speakerContains: z
          .string()
          .optional()
          .describe(
            "Search for partial speaker names (e.g., 'Dan' to find 'Dan Abramov')"
          ),
        topicContains: z
          .string()
          .optional()
          .describe(
            "Search for partial topic names (e.g., 'React' to find 'React Hooks')"
          ),
        titleContains: z
          .string()
          .optional()
          .describe("Search within video titles"),
        summaryContains: z
          .string()
          .optional()
          .describe("Search within video summaries"),
        dateFrom: z
          .string()
          .optional()
          .describe("Filter videos created from this date (ISO 8601 format)"),
        dateTo: z
          .string()
          .optional()
          .describe("Filter videos created up to this date (ISO 8601 format)"),
      })
      .optional()
      .describe(
        "Filter criteria. Can be used alone for browsing or with query for filtered search."
      ),
    topK: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return (for semantic search)"),
  }),
  execute: async ({ context }) => {
    return unifiedSearch(context);
  },
});

export { queryVideos };
