import assert from "node:assert/strict";
import test from "node:test";
import { BackgroundJob, } from "./utils.js";
import { resolveBullMQQueueName } from "./environment.js";
class SendEmailJob extends BackgroundJob {
    name = "send-email";
    queue = {};
    async run() {
        return { sent: true };
    }
}
class GenerateThumbnailJob extends BackgroundJob {
    name = "generate-thumbnail";
    queue = {};
    async run() {
        return "thumb.png";
    }
}
const jobs = {
    "send-email": SendEmailJob,
    "generate-thumbnail": GenerateThumbnailJob,
};
/**
 * Compile-time checks. These only fail the build when the client types are
 * wrong; the @ts-expect-error lines must retain their errors.
 */
function typeChecks(client) {
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
    assert.equal(resolveBullMQQueueName("email-worker", {
        EMAIL_WORKER_QUEUE_NAME: "production-emails",
    }), "production-emails");
});
