import { createRequire } from "node:module";
import { emptyState, runMonitor, type Ports, type State, type WeeklyEvent } from "./core";

type AwsSend = { send: (command: object) => Promise<unknown> };
type AwsCommand = new (input: Record<string, unknown>) => object;
type AwsClient = new (config: Record<string, never>) => AwsSend;
type S3Get = { ETag?: string; Body?: { transformToString(): Promise<string> } };
type S3Put = { ETag?: string };

// The managed Lambda Node.js runtime supplies AWS SDK v3. The Lambda bundle itself
// has no npm runtime dependencies and does not import app/database clients.
const runtimeRequire = createRequire(__filename);

function createPorts(): Ports {
  const bucket = process.env.WHV_MONITOR_BUCKET;
  const topicArn = process.env.WHV_MONITOR_TOPIC_ARN;
  if (!bucket || !topicArn) throw new Error("monitor storage or notification topic not configured");

  const { S3Client, GetObjectCommand, PutObjectCommand } = runtimeRequire("@aws-sdk/client-s3") as {
    S3Client: AwsClient; GetObjectCommand: AwsCommand; PutObjectCommand: AwsCommand;
  };
  const { SNSClient, PublishCommand } = runtimeRequire("@aws-sdk/client-sns") as {
    SNSClient: AwsClient; PublishCommand: AwsCommand;
  };
  const s3 = new S3Client({});
  const sns = new SNSClient({});
  const object = { Bucket: bucket, Key: "monitor/state.json" };

  return {
    async load() {
      try {
        const res = await s3.send(new GetObjectCommand(object)) as S3Get;
        if (!res.Body || !res.ETag) throw new Error("incomplete baseline record");
        return { state: JSON.parse(await res.Body.transformToString()) as State, etag: res.ETag };
      } catch (err) {
        if (err instanceof Error && err.name === "NoSuchKey") return { state: emptyState() };
        throw err;
      }
    },
    async save(state, etag) {
      const res = await s3.send(new PutObjectCommand({
        ...object, ContentType: "application/json", Body: JSON.stringify(state),
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
      })) as S3Put;
      if (!res.ETag) throw new Error("state write returned no ETag");
      return res.ETag;
    },
    async notify(subject, message) {
      await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: subject, Message: message }));
    },
    fetch,
    now: () => new Date(),
  };
}

export async function handler(event: WeeklyEvent) {
  const result = await runMonitor(event, createPorts());
  console.info(JSON.stringify({ monitor: "whv-official-sources", mode: event.mode, ...result }));
  return result;
}
