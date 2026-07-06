import assert from "node:assert/strict";
import test from "node:test";
import { BullMQClient } from "./bullmq-client.js";
import {
  BackgroundJob,
  type BackgroundJobConstructor,
  type BullMQJobRegistry,
} from "./utils.js";
import { resolveBullMQQueueName } from "./environment.js";

type SendEmailData = { to: string };
type SendEmailResult = { sent: boolean };
type GenerateThumbnailData = { url: string; size: number };

class SendEmailJob extends BackgroundJob<SendEmailData, SendEmailResult> {
  name = "send-email";
  queue = {} as never;
  async run(): Promise<SendEmailResult> {
    return { sent: true };
  }
}

class GenerateThumbnailJob extends BackgroundJob<GenerateThumbnailData, string> {
  name = "generate-thumbnail";
  queue = {} as never;
  async run(): Promise<string> {
    return "thumb.png";
  }
}

const jobs = {
  "send-email": SendEmailJob,
  "generate-thumbnail": GenerateThumbnailJob,
} satisfies Record<string, BackgroundJobConstructor>;

type JobRegistry = BullMQJobRegistry<typeof jobs>;

/**
 * Compile-time checks. These only fail the build when the client types are
 * wrong; the @ts-expect-error lines must retain their errors.
 */
function typeChecks(client: BullMQClient<JobRegistry>) {
  client.enqueue("send-email", { to: "a@b.com" });
  client.enqueue("generate-thumbnail", { url: "u", size: 32 }, { attempts: 2 });
  client.enqueueFlow(["generate-thumbnail", "send-email"], { url: "u", size: 32 });

  // @ts-expect-error unknown job name is rejected
  client.enqueue("nope", {});
  // @ts-expect-error wrong data shape for send-email is rejected
  client.enqueue("send-email", { recipient: "a@b.com" });
  // @ts-expect-error flow input must match the first job's data
  client.enqueueFlow(["send-email", "generate-thumbnail"], 123);
}

void typeChecks;

test("resolves the queue name for a BullMQ client", () => {
  assert.equal(
    resolveBullMQQueueName("email-worker", {
      EMAIL_WORKER_QUEUE_NAME: "production-emails",
    }),
    "production-emails",
  );
});
