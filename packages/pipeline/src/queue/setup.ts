import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

const defaultOpts: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
};

function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: getRedisConnection(),
    ...defaultOpts,
  });
}

export const intakeQueue = createQueue("intake");
export const analysisQueue = createQueue("analysis");
export const scriptingQueue = createQueue("scripting");
export const generationQueue = createQueue("generation");
export const qcQueue = createQueue("qc");
export const assemblyQueue = createQueue("assembly");
export const deliveryQueue = createQueue("delivery");

export type IntakeJobData = {
  propertyId: string;
  photoFileUrls: string[];
};

export type AnalysisJobData = {
  propertyId: string;
};

export type ScriptingJobData = {
  propertyId: string;
};

export type GenerationJobData = {
  propertyId: string;
  sceneId: string;
};

export type QCJobData = {
  propertyId: string;
  sceneId: string;
};

export type AssemblyJobData = {
  propertyId: string;
};

export type DeliveryJobData = {
  propertyId: string;
};
