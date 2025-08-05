import ytdl, { type videoFormat } from "@distube/ytdl-core";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@deepgram/sdk";
import { openai } from "@ai-sdk/openai";
import { generateObject, embedMany } from "ai";
import { PgVector } from "@mastra/pg";
import { Pool } from "pg";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import type { Video, NewVideo, NewChunk } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// Schema for extracting structured data from video transcript
const videoDataSchema = z.object({
  summary: z.string().describe("A comprehensive summary of the video content"),
  keyTopics: z
    .array(z.string())
    .describe("Main topics or themes discussed in the video"),
  speakers: z
    .array(z.string())
    .describe("Identified speakers or participants in the video")
    .nullable(),
  actionItems: z
    .array(z.string())
    .describe("Any action items, recommendations, or conclusions mentioned")
    .nullable(),
  tags: z
    .array(z.string())
    .describe("Relevant tags or categories for the video content"),
});

const defaultKeywords = [
  "AI",
  "Mastra",
  "RAG",
  "Agent",
  "Shane",
  "Abhi",
  "Shreeda",
  "MCP",
  "vNext",
  "Netlify",
  "Vercel",
  "Cloudflare",
];

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

// Function to check if video already exists in database
const checkVideoExists = async ({
  videoId,
}: {
  videoId: string;
}): Promise<{ exists: boolean; videoRecord?: Video }> => {
  try {
    console.log(`Checking if video ${videoId} already exists...`);

    // Check if video exists
    const result = await db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId));

    if (result && result.length > 0) {
      console.log(`Video ${videoId} already exists in database`);
      const record = result[0];
      const metadata = (record.metadata as any) || {}; // JSONB is already parsed
      return {
        exists: true,
        videoRecord: {
          id: record.id,
          fullTranscript: record.fullTranscript,
          metadata,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      };
    }

    console.log(`Video ${videoId} not found, proceeding with processing`);
    return { exists: false };
  } catch (error) {
    console.error("Error checking video existence:", error);
    // If there's an error checking, assume it doesn't exist and continue
    return { exists: false };
  }
};

const downloadVideo = async ({
  videoId,
}: {
  videoId: string;
}): Promise<{ videoFileName: string }> => {
  console.log(`Downloading video with ID: ${videoId}`);

  const outputDir = "./video/";

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    ytdl
      .getInfo(videoUrl)
      .then((info) => {
        const title = info.videoDetails.title
          .replace(/[^\w\s-]/g, "") // Remove special characters
          .replace(/\s+/g, "_"); // Replace spaces with underscores

        // Find the best audio-only format
        const audioFormats = info.formats.filter(
          (format: videoFormat) => format.hasAudio && !format.hasVideo
        );

        if (audioFormats.length === 0) {
          throw new Error("No audio-only formats available for this video");
        }

        // Sort by bitrate to get highest quality
        const bestAudioFormat = audioFormats.sort(
          (a: videoFormat, b: videoFormat) =>
            (b.audioBitrate || 0) - (a.audioBitrate || 0)
        )[0];

        // Use the container from the best format or default to webm
        const container = bestAudioFormat.container || "webm";
        const fileName = `${title}_${videoId}.${container}`;
        const filePath = path.join(outputDir, fileName);

        console.log(
          `Downloading audio (${bestAudioFormat.audioBitrate}kbps ${container}): ${title}`
        );

        // Create audio stream using the specific format
        const audioStream = ytdl(videoUrl, {
          filter: "audioonly",
          quality: "highestaudio",
        });

        const writeStream = fs.createWriteStream(filePath);

        // Track progress
        let downloadedBytes = 0;
        const contentLength = parseInt(
          info.formats.find((f: videoFormat) => f.hasAudio && !f.hasVideo)
            ?.contentLength || "0"
        );

        audioStream.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (contentLength > 0) {
            const percent = ((downloadedBytes / contentLength) * 100).toFixed(
              1
            );
            console.log(`${percent}% downloaded`);
          }
        });

        audioStream.on("error", (error: Error) => {
          console.error("Download error:", error);
          reject(error);
        });

        writeStream.on("error", (error: Error) => {
          console.error("Write error:", error);
          reject(error);
        });

        writeStream.on("finish", () => {
          console.log(`Downloaded ${fileName}`);
          resolve({
            videoFileName: filePath,
          });
        });

        // Pipe the audio stream to file
        audioStream.pipe(writeStream);
      })
      .catch((error) => {
        console.error("Error getting video info:", error);
        reject(error);
      });
  });
};

const getTranscript = async ({
  videoFileName,
  keywords,
}: {
  videoFileName: string;
  keywords?: string[];
}): Promise<{
  transcript: string;
  transcriptFileName: string;
  videoFileDeleted: boolean;
}> => {
  const deepgram = createClient(process.env.DG_API_KEY);

  const options = {
    punctuate: true,
    keywords: keywords,
  };

  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    fs.createReadStream(videoFileName),
    options
  );

  if (
    !result ||
    !result.results ||
    !result.results.channels[0]?.alternatives[0]
  ) {
    throw new Error("No transcription results found");
  }

  const transcript = result.results.channels[0].alternatives[0].transcript;

  // Save transcript to text file in the output folder
  const outputDir = "./transcription/";
  const baseFileName = path.basename(
    videoFileName,
    path.extname(videoFileName)
  );
  const transcriptFileName = path.join(
    outputDir,
    `${baseFileName}_transcript.txt`
  );

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(transcriptFileName, transcript, "utf8");
  console.log(`Transcript saved to: ${transcriptFileName}`);

  // delete the video file after transcription
  fs.unlinkSync(videoFileName);
  const videoFileDeleted = true;

  return {
    transcript,
    transcriptFileName,
    videoFileDeleted,
  };
};

// Function to chunk text into smaller pieces for embedding
const chunkText = (
  text: string,
  chunkSize: number = 1000,
  overlap: number = 100
): string[] => {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);

    // Ensure we don't cut words in half
    if (end < text.length) {
      const lastSpaceIndex = chunk.lastIndexOf(" ");
      if (lastSpaceIndex > 0) {
        chunks.push(chunk.slice(0, lastSpaceIndex));
        start += lastSpaceIndex + 1 - overlap;
      } else {
        chunks.push(chunk);
        start += chunkSize - overlap;
      }
    } else {
      chunks.push(chunk);
      break;
    }
  }

  return chunks;
};

// Function to extract structured data from transcript using AI
const extractVideoData = async ({
  transcript,
  videoId,
}: {
  transcript: string;
  videoId: string;
}): Promise<{
  extractedData: z.infer<typeof videoDataSchema>;
  videoId: string;
}> => {
  try {
    console.log("Extracting structured data from transcript using AI...");

    const { object } = await generateObject({
      model: openai("o3-mini"),
      schema: videoDataSchema,
      prompt: `Analyze this video transcript and extract structured information. Be thorough and accurate:

Transcript: ${transcript}

Please extract:
- A descriptive title for the video content
- A comprehensive summary (2-3 sentences)
- Main topics or themes discussed
- Any speakers or participants mentioned
- Action items, recommendations, or conclusions
- Relevant tags or categories
- Any duration or time references mentioned`,
    });

    return {
      extractedData: object,
      videoId,
    };
  } catch (error) {
    console.error("Error extracting video data:", error);
    throw new Error(
      `Data extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

// Function to chunk and embed transcript for RAG
const chunkAndEmbedTranscript = async ({
  transcript,
  transcriptFileName,
  videoId,
  extractedData,
}: {
  transcript: string;
  transcriptFileName: string;
  videoId: string;
  extractedData: z.infer<typeof videoDataSchema>;
}): Promise<{
  chunksCreated: number;
  embeddingsGenerated: number;
  videoRecord: NewVideo;
  chunkRecords: NewChunk[];
}> => {
  try {
    console.log("Chunking transcript and generating embeddings...");

    // Create chunks from the transcript
    const chunks = chunkText(transcript, 500, 100);
    console.log(`Created ${chunks.length} chunks`);

    // Create video record with all extracted data in metadata JSON
    const videoRecord = {
      id: videoId,
      transcriptFileName,
      fullTranscript: transcript,
      metadata: {
        summary: extractedData.summary,
        speakers: extractedData.speakers,
        keyTopics: extractedData.keyTopics,
        actionItems: extractedData.actionItems,
        tags: extractedData.tags,
        // Processing metadata
        chunkCount: chunks.length,
        chunkSize: 500,
        overlap: 100,
        embeddingModel: "text-embedding-3-small",
        dataExtractionModel: "o3-mini",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate embeddings using AI SDK
    console.log("Generating embeddings for chunks...");

    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: chunks,
    });

    // Create chunk records with actual embeddings
    const chunkRecords = chunks.map((chunk, index) => ({
      id: `${videoId}_chunk_${index}`,
      videoId,
      data: {
        chunkIndex: index,
        content: chunk,
        embedding: embeddings[index],
        metadata: {
          chunkIndex: index,
          totalChunks: chunks.length,
          topics: extractedData.keyTopics,
        },
      },
      createdAt: new Date(),
    }));

    // Store in database and vector store
    console.log("Storing video record and chunks in database...");

    // Store video record in regular database
    await db
      .insert(schema.videos)
      .values(videoRecord)
      .onConflictDoUpdate({
        target: schema.videos.id,
        set: {
          fullTranscript: videoRecord.fullTranscript,
          metadata: videoRecord.metadata,
          updatedAt: new Date(),
        },
      });

    // Store chunk records in regular database
    for (const chunk of chunkRecords) {
      await db.insert(schema.chunks).values(chunk).onConflictDoNothing();
    }

    // Create vector index if it doesn't exist
    try {
      await vectorStore.createIndex({
        indexName: "video_chunks",
        dimension: 1536, // text-embedding-3-small dimension
      });
    } catch (error) {
      // Index might already exist, that's okay
      if (error instanceof Error && error.message.includes("already exists")) {
        // Ignore index already exists error
      } else {
        throw error; // Rethrow other errors
      }
      console.log("Vector index might already exist, continuing...");
    }

    // Store embeddings in vector database
    await vectorStore.upsert({
      indexName: "video_chunks",
      vectors: embeddings,
      metadata: chunkRecords.map((chunk) => ({
        chunkId: chunk.id,
        videoId: chunk.videoId,
        content: chunk.data.content,
      })),
      ids: chunkRecords.map((chunk) => chunk.id),
    });

    console.log(
      `Successfully processed ${chunks.length} chunks for video ${videoId}`
    );

    return {
      chunksCreated: chunks.length,
      embeddingsGenerated: chunks.length, // Would be actual count
      videoRecord,
      chunkRecords,
    };
  } catch (error) {
    console.error("Error chunking and embedding transcript:", error);
    throw new Error(
      `Chunking and embedding failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

const checkVideoStep = createStep({
  id: "check-video",
  description: "Checks if the video has already been processed",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to check"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  execute: async ({ inputData }) => {
    const result = await checkVideoExists(inputData);
    return {
      videoId: inputData.videoId,
      exists: result.exists,
      videoRecord: result.videoRecord,
      keywords: inputData.keywords,
    };
  },
});

const downloadVideoStep = createStep({
  id: "download-video",
  description: "Downloads a YouTube video by its ID (skips if already exists)",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to download"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    videoFileName: z
      .string()
      .optional()
      .describe("The path to the downloaded video file"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, skip download
    if (inputData.exists) {
      console.log(
        `Video ${inputData.videoId} already exists, skipping download`
      );
      return {
        videoId: inputData.videoId,
        exists: true,
        videoRecord: inputData.videoRecord,
        keywords: inputData.keywords,
      };
    }

    // Otherwise, download the video
    const result = await downloadVideo({ videoId: inputData.videoId });
    return {
      ...result,
      videoId: inputData.videoId,
      exists: false,
      keywords: inputData.keywords,
    };
  },
});

const getTranscriptStep = createStep({
  id: "get-transcript",
  description:
    "Gets the transcript of a downloaded YouTube video (skips if already exists)",
  inputSchema: z.object({
    videoFileName: z
      .string()
      .optional()
      .describe("The path to the downloaded video file"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The transcribed text from the video"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, return existing data
    if (inputData.exists && inputData.videoRecord) {
      console.log(
        `Video ${inputData.videoId} already exists, using existing transcript`
      );
      return {
        transcript: inputData.videoRecord.fullTranscript,
        transcriptFileName: inputData.videoRecord.transcriptFileName,
        videoFileDeleted: true, // Assume it was deleted previously
        videoId: inputData.videoId,
        exists: true,
        videoRecord: inputData.videoRecord,
      };
    }

    // Otherwise, transcribe the video
    if (!inputData.videoFileName) {
      throw new Error("Video file name is required for transcription");
    }

    const result = await getTranscript({
      videoFileName: inputData.videoFileName,
      keywords: inputData.keywords,
    });
    return {
      ...result,
      videoId: inputData.videoId,
      exists: false,
    };
  },
});

const extractDataStep = createStep({
  id: "extract-data",
  description:
    "Extracts structured data from the video transcript using AI (skips if already exists)",
  inputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, return existing extracted data
    if (inputData.exists && inputData.videoRecord) {
      console.log(
        `Video ${inputData.videoId} already exists, using existing extracted data`
      );
      const extractedData = {
        title: inputData.videoRecord.title,
        summary: inputData.videoRecord.summary,
        keyTopics: inputData.videoRecord.keyTopics, // Already parsed
        speakers: inputData.videoRecord.speakers, // Already parsed
        actionItems: inputData.videoRecord.actionItems || [], // From metadata
        tags: inputData.videoRecord.tags, // Already parsed
        duration: inputData.videoRecord.duration,
      };

      return {
        transcript: inputData.transcript,
        transcriptFileName: inputData.transcriptFileName,
        videoFileDeleted: inputData.videoFileDeleted,
        extractedData,
        videoId: inputData.videoId,
        exists: true,
      };
    }

    // Otherwise, extract new data
    const result = await extractVideoData({
      transcript: inputData.transcript,
      videoId: inputData.videoId,
    });
    return {
      transcript: inputData.transcript,
      transcriptFileName: inputData.transcriptFileName,
      videoFileDeleted: inputData.videoFileDeleted,
      ...result,
      exists: false,
    };
  },
});

const chunkAndEmbedStep = createStep({
  id: "chunk-and-embed",
  description:
    "Chunks the transcript and generates embeddings for RAG (skips if already exists)",
  inputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    chunksCreated: z.number().describe("Number of chunks created"),
    embeddingsGenerated: z.number().describe("Number of embeddings generated"),
    videoRecord: z.any().describe("The video record stored in database"),
    chunkRecords: z
      .array(z.any())
      .describe("The chunk records stored in database"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, get existing chunk count
    if (inputData.exists) {
      console.log(
        `Video ${inputData.videoId} already exists, retrieving existing chunks`
      );

      // Get existing chunks count
      const chunksResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.chunks)
        .where(eq(schema.chunks.videoId, inputData.videoId));
      const chunksCount = chunksResult[0].count;

      // Get existing chunks
      const chunkRecords = await db
        .select()
        .from(schema.chunks)
        .where(eq(schema.chunks.videoId, inputData.videoId))
        .orderBy(sql`(data->>'chunkIndex')::int`);

      // Get existing video record
      const videoResult = await db
        .select()
        .from(schema.videos)
        .where(eq(schema.videos.id, inputData.videoId));
      const videoRecord = videoResult[0];

      return {
        transcript: inputData.transcript,
        transcriptFileName: inputData.transcriptFileName,
        videoFileDeleted: true, // Assume it was deleted previously
        extractedData: inputData.extractedData,
        chunksCreated: chunksCount,
        embeddingsGenerated: chunksCount,
        videoRecord,
        chunkRecords: chunkRecords || [],
      };
    }

    // Otherwise, process the transcript normally
    const result = await chunkAndEmbedTranscript(inputData);
    return {
      transcript: inputData.transcript,
      transcriptFileName: inputData.transcriptFileName,
      videoFileDeleted: inputData.videoFileDeleted,
      extractedData: inputData.extractedData,
      ...result,
    };
  },
});

const transcriptWorkflow = createWorkflow({
  id: "transcript-workflow",
  description:
    "Downloads a YouTube video, transcribes it, extracts structured data, and creates embeddings for RAG",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to transcribe"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The transcribed text from the video"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    chunksCreated: z.number().describe("Number of chunks created"),
    embeddingsGenerated: z.number().describe("Number of embeddings generated"),
    videoRecord: z.any().describe("The video record stored in database"),
    chunkRecords: z
      .array(z.any())
      .describe("The chunk records stored in database"),
  }),
})
  .then(checkVideoStep)
  .then(downloadVideoStep)
  .then(getTranscriptStep)
  .then(extractDataStep)
  .then(chunkAndEmbedStep);

transcriptWorkflow.commit();

export { transcriptWorkflow };
