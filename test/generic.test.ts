import { ManualCancellationTokenSource, DUMMY_CANCELLATION_TOKEN, sleep } from "@zxteam/cancellation";

import { assert } from "chai";

import { limitFactory, Limit } from "../src";
import { Task } from "@zxteam/task";

describe("Generic tests", function () {
	it("Should be able to cancel lazy accuring via Cancellation Token", async function () {
		const limit = limitFactory({
			perMinute: 2,
			perHour: 50,
			parallel: 2
		});

		let limitToken1Task: Task<Limit.Token>;
		let limitToken2Task: Task<Limit.Token>;
		let limitToken3Task: Task<Limit.Token>;
		let limitToken4Task: Task<Limit.Token>;

		try {
			const cts = new ManualCancellationTokenSource();

			limitToken1Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			limitToken2Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			await sleep(DUMMY_CANCELLATION_TOKEN, 5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);

			try {
				limitToken3Task = Task.run(() => limit.accrueTokenLazy(cts.token));
				limitToken4Task = Task.run(() => limit.accrueTokenLazy(cts.token));
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				assert.isFalse(limitToken3Task.isCompleted);
				assert.isFalse(limitToken4Task.isCompleted);

				cts.cancel();
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);

				assert.isTrue(limitToken3Task.isCompleted);
				assert.isTrue(limitToken4Task.isCompleted);
				assert.isFalse(limitToken3Task.isSuccessed);
				assert.isFalse(limitToken4Task.isSuccessed);

				assert.isTrue(limitToken3Task.isCancelled);
				assert.isTrue(limitToken4Task.isCancelled);
			} finally {
				limitToken1Task.result.rollback();
				limitToken2Task.result.commit();
			}
		} finally {
			await limit.dispose();
		}
	});
	it("Should be able to cancel lazy accuring via Cancellation Token with timeout", async function () {
		const limit = limitFactory({
			perMinute: 2,
			perHour: 50,
			parallel: 2
		});

		let limitToken1Task: Task<Limit.Token>;
		let limitToken2Task: Task<Limit.Token>;
		let limitToken3Task: Task<Limit.Token>;
		let limitToken4Task: Task<Limit.Token>;

		try {
			const cts = new ManualCancellationTokenSource();

			limitToken1Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			limitToken2Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			await sleep(DUMMY_CANCELLATION_TOKEN, 5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);
			try {
				limitToken3Task = Task.run(() => limit.accrueTokenLazy(1000, cts.token));
				limitToken4Task = Task.run(() => limit.accrueTokenLazy(1000, cts.token));
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				assert.isFalse(limitToken3Task.isCompleted);
				assert.isFalse(limitToken4Task.isCompleted);

				cts.cancel();
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);
				await sleep(DUMMY_CANCELLATION_TOKEN, 5);

				assert.isTrue(limitToken3Task.isCompleted);
				assert.isTrue(limitToken4Task.isCompleted);
				assert.isFalse(limitToken3Task.isSuccessed);
				assert.isFalse(limitToken4Task.isSuccessed);

				assert.isTrue(limitToken3Task.isCancelled);
				assert.isTrue(limitToken4Task.isCancelled);
			} finally {
				limitToken1Task.result.rollback();
				limitToken2Task.result.commit();
			}
		} finally {
			await limit.dispose();
		}
	});
	it("Should produce timeout with Cancellation Token", async function () {
		const limit = limitFactory({
			perMinute: 2,
			perHour: 50,
			parallel: 2
		});

		let limitToken1Task: Task<Limit.Token>;
		let limitToken2Task: Task<Limit.Token>;
		let limitToken3Task: Task<Limit.Token>;
		let limitToken4Task: Task<Limit.Token>;

		try {
			const cts = new ManualCancellationTokenSource();

			limitToken1Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			limitToken2Task = Task.run(() => limit.accrueTokenLazy(cts.token));
			await sleep(DUMMY_CANCELLATION_TOKEN, 5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);

			try {
				limitToken3Task = Task.run(() => limit.accrueTokenLazy(50, cts.token));
				limitToken4Task = Task.run(() => limit.accrueTokenLazy(50, cts.token));
				await sleep(DUMMY_CANCELLATION_TOKEN, 100);
				assert.isTrue(limitToken3Task.isCompleted, "limitToken3Task should complete");
				assert.isTrue(limitToken4Task.isCompleted, "limitToken4Task should complete");
				assert.isFalse(limitToken3Task.isSuccessed, "limitToken3Task should complete with failure");
				assert.isFalse(limitToken4Task.isSuccessed, "limitToken4Task should complete with failure");
				assert.instanceOf(limitToken3Task.error, Error, "limitToken3Task should complete with Timeout error");
				assert.instanceOf(limitToken4Task.error, Error, "limitToken4Task should complete with Timeout error");
			} finally {
				limitToken1Task.result.rollback();
				limitToken2Task.result.commit();
			}
		} finally {
			await limit.dispose();
		}
	});
});
