/**
 * batch-remember-worker.test.js
 * 작성자: 최진호 / 수정일: 2026-06-19
 * 신뢰성 소비(ack/재시도/dead-letter) 검증 + start/stop drain 검증.
 */
import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

const reliable = {
  pop      : mock.fn(),
  ack      : mock.fn(async () => true),
  requeue  : mock.fn(async () => 0),
  push     : mock.fn(async () => true),
  pushDead : mock.fn(async () => true),
};

mock.module("../../lib/redis.js", {
  namedExports: {
    popFromQueueReliable: reliable.pop,
    ackQueueItem        : reliable.ack,
    requeueProcessing   : reliable.requeue,
    pushToQueue         : reliable.push,
    pushToQueueDead     : reliable.pushDead,
    redisClient         : { status: "ready" },
    disconnectRedis     : async () => {},
  }
});
mock.module("../../config/memory.js", {
  namedExports: {
    MEMORY_CONFIG: {
      batchRememberWorker: {
        intervalMs: 5,
        retryLimit: 3,
        queueKey  : "memento:batch_remember_queue"
      }
    }
  }
});
mock.module("../../lib/logger.js", {
  namedExports: {
    logInfo : mock.fn(),
    logWarn : mock.fn(),
    logError: mock.fn(),
  }
});

describe("BatchRememberWorker reliability", () => {
  beforeEach(() => {
    for (const k of Object.values(reliable)) k.mock.resetCalls();
  });

  test("성공 job은 ack되고 dead-letter로 가지 않는다", async () => {
    const { BatchRememberWorker } = await import("../../lib/memory/BatchRememberWorker.js");
    const processor = { process: mock.fn(async () => ({ inserted: 2, skipped: 0 })) };
    const w = new BatchRememberWorker(processor);
    await w._processJobEnvelope({
      raw : "RAW1",
      data: { jobId: "j1", params: { fragments: [] }, retryCount: 0 }
    });
    assert.equal(processor.process.mock.callCount(), 1);
    assert.equal(reliable.ack.mock.callCount(), 1);
    assert.equal(reliable.pushDead.mock.callCount(), 0);
  });

  test("실패 job은 재적재 후 ack된다 (retryCount<limit)", async () => {
    const { BatchRememberWorker } = await import("../../lib/memory/BatchRememberWorker.js");
    const processor = { process: mock.fn(async () => { throw new Error("db down"); }) };
    const w = new BatchRememberWorker(processor);
    await w._processJobEnvelope({
      raw : "RAW2",
      data: { jobId: "j2", params: { fragments: [] }, retryCount: 0 }
    });
    assert.equal(reliable.push.mock.callCount(), 1, "재적재");
    assert.equal(reliable.ack.mock.callCount(), 1, "원본 ack");
    assert.equal(reliable.pushDead.mock.callCount(), 0);
  });

  test("재시도 한도 초과 job은 dead-letter로 이동 후 ack", async () => {
    const { BatchRememberWorker } = await import("../../lib/memory/BatchRememberWorker.js");
    const processor = { process: mock.fn(async () => { throw new Error("db down"); }) };
    const w = new BatchRememberWorker(processor);
    await w._processJobEnvelope({
      raw : "RAW3",
      data: { jobId: "j3", params: { fragments: [] }, retryCount: 3 }
    });
    assert.equal(reliable.pushDead.mock.callCount(), 1, "dead-letter 적재");
    assert.equal(reliable.ack.mock.callCount(), 1);
    assert.equal(reliable.push.mock.callCount(), 0, "재적재 안 함");
  });

  test("start() 후 running=true, stop() 후 running=false 로 깨끗하게 drain", async () => {
    const { BatchRememberWorker } = await import("../../lib/memory/BatchRememberWorker.js");
    // pop은 null을 반환해 루프가 idle 대기하도록 설정
    reliable.pop.mock.resetCalls();
    reliable.pop.mock.restore && reliable.pop.mock.restore();
    const processor = { process: mock.fn(async () => ({ results: [], inserted: 0, skipped: 0 })) };
    const w = new BatchRememberWorker(processor);

    // pop이 항상 null을 반환 → 루프는 idle sleep
    reliable.pop.mock.mockImplementation(async () => null);

    await w.start();
    assert.equal(w.running, true);

    await w.stop();
    assert.equal(w.running, false);
  });

  test("실행 중이 아닐 때 stop() 은 즉시 resolve", async () => {
    const { BatchRememberWorker } = await import("../../lib/memory/BatchRememberWorker.js");
    const w = new BatchRememberWorker({ process: mock.fn() });
    await assert.doesNotReject(() => w.stop());
  });
});
