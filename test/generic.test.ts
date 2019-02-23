import { assert } from "chai";

import { Task } from "ptask.js";

import { limitFactory, LimitToken } from "../src";

describe("Generic tests", function () {
	it("Should be able to cancel lazy accuring via Cancellation Token", async function () {
		const limit = limitFactory({
			perMinute: 2,
			perHour: 50,
			parallel: 2
		});

		let limitToken1Task: Task<LimitToken>;
		let limitToken2Task: Task<LimitToken>;
		let limitToken3Task: Task<LimitToken>;
		let limitToken4Task: Task<LimitToken>;

		try {
			const cts = Task.createCancellationTokenSource();

			limitToken1Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			limitToken2Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			await Task.sleep(5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);

			try {
				limitToken3Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
				limitToken4Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
				await Task.sleep(5);
				assert.isFalse(limitToken3Task.isCompleted);
				assert.isFalse(limitToken4Task.isCompleted);

				cts.cancel();
				await Task.sleep(5);
				await Task.sleep(5);
				await Task.sleep(5);
				await Task.sleep(5);

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

		let limitToken1Task: Task<LimitToken>;
		let limitToken2Task: Task<LimitToken>;
		let limitToken3Task: Task<LimitToken>;
		let limitToken4Task: Task<LimitToken>;

		try {
			const cts = Task.createCancellationTokenSource();

			limitToken1Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			limitToken2Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			await Task.sleep(5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);
			try {
				limitToken3Task = new Task(() => limit.accrueTokenLazy(1000, cts.token)).start();
				limitToken4Task = new Task(() => limit.accrueTokenLazy(1000, cts.token)).start();
				await Task.sleep(5);
				assert.isFalse(limitToken3Task.isCompleted);
				assert.isFalse(limitToken4Task.isCompleted);

				cts.cancel();
				await Task.sleep(5);
				await Task.sleep(5);
				await Task.sleep(5);
				await Task.sleep(5);

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

		let limitToken1Task: Task<LimitToken>;
		let limitToken2Task: Task<LimitToken>;
		let limitToken3Task: Task<LimitToken>;
		let limitToken4Task: Task<LimitToken>;

		try {
			const cts = Task.createCancellationTokenSource();

			limitToken1Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			limitToken2Task = new Task(() => limit.accrueTokenLazy(cts.token)).start();
			await Task.sleep(5);
			assert.isTrue(limitToken1Task.isSuccessed);
			assert.isTrue(limitToken2Task.isSuccessed);

			try {
				limitToken3Task = new Task(() => limit.accrueTokenLazy(50, cts.token)).start();
				limitToken4Task = new Task(() => limit.accrueTokenLazy(50, cts.token)).start();
				await Task.sleep(100);
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
