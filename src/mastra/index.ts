import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { weatherAgent } from "./agents/weather-agent";
import { agent as smitheryAgent } from "./agents/smithery-agent";
import { transcriptWorkflow } from "./workflows/transcript-workflow";
import { youtubeAgent } from "./agents/yt-agent";

export const mastra = new Mastra({
  workflows: { weatherWorkflow, transcriptWorkflow },
  agents: { weatherAgent, smitheryAgent, youtubeAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
