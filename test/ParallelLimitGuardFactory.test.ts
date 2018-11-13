import { CancellationToken, Task } from "ptask.js";

import { assert } from "chai";

import { VISIBLE_FOR_TEST } from "../src/index";

const { ParallelLimitFactory } = VISIBLE_FOR_TEST;

describe("ParallelLimitGuardFactory tests", function () {
	it("Should complete 2 tasks and block 3-rd task", async function () {
		// Setup limit for 2 parallel call
		const limit = ParallelLimitFactory(2);

		// Create cancellation token source
		const cts = Task.createCancellationTokenSource();

		const limitTask0 = limit(cts.token);
		const limitTask1 = limit(cts.token);
		const limitTask2 = limit(cts.token);

		await Task.sleep(1);

		assert.isTrue(limitTask0.isCompleted);
		assert.equal(limitTask0.result.remainTokens, 1);
		assert.isFalse(limitTask0.isCancelled);
		assert.isFalse(limitTask0.isFaulted);

		assert.isTrue(limitTask1.isCompleted);
		assert.equal(limitTask1.result.remainTokens, 0);
		assert.isFalse(limitTask1.isCancelled);
		assert.isFalse(limitTask1.isFaulted);

		assert.isFalse(limitTask2.isCompleted);
		assert.isFalse(limitTask2.isCancelled);
		assert.isFalse(limitTask2.isFaulted);
	});
	it("Should complete 2 tasks, cancel 3-rd task, complete 4th task", async function () {
		// Setup limit for 2 parallel call
		const limit = ParallelLimitFactory(2);

		// Create cancellation token source
		const cts = Task.createCancellationTokenSource();

		const limitTask0 = limit(cts.token);
		const limitTask1 = limit(cts.token);
		const limitTask2 = limit(cts.token);

		await Task.sleep(1);

		cts.cancel();

		await Task.sleep(1);

		assert.isTrue(limitTask0.isCompleted);
		assert.isTrue(limitTask0.isCompletedSuccessfully);
		assert.equal(limitTask0.result.remainTokens, 1);
		assert.isFalse(limitTask0.isCancelled);
		assert.isFalse(limitTask0.isFaulted);

		assert.isTrue(limitTask1.isCompleted);
		assert.isTrue(limitTask1.isCompletedSuccessfully);
		assert.equal(limitTask1.result.remainTokens, 0);
		assert.isFalse(limitTask1.isCancelled);
		assert.isFalse(limitTask1.isFaulted);

		assert.isTrue(limitTask2.isCompleted);
		assert.isFalse(limitTask2.isCompletedSuccessfully);
		assert.isTrue(limitTask2.isCancelled);
		assert.isFalse(limitTask2.isFaulted);

		limitTask0.result.commit();
		limitTask1.result.commit();

		const cts2 = Task.createCancellationTokenSource();
		const limitTask4 = limit(cts2.token);

		await Task.sleep(1);

		assert.isTrue(limitTask4.isCompletedSuccessfully);
		assert.isTrue(limitTask4.isCompleted);
		assert.equal(limitTask4.result.remainTokens, 1);
		assert.isFalse(limitTask4.isCancelled);
		assert.isFalse(limitTask4.isFaulted);
	});
	it("Should complete 2 tasks and complete 3-rd task after done() 1st task", async function () {
		// Setup limit for 2 parallel call
		const limit = ParallelLimitFactory(2);

		// Create cancellation token source
		const cts = Task.createCancellationTokenSource();

		const limitTask0 = limit(cts.token);
		const limitTask1 = limit(cts.token);
		const limitTask2 = limit(cts.token);

		await Task.sleep(1);

		const limit1Context = await limitTask0;
		assert.equal(limitTask0.result.remainTokens, 1);
		limit1Context.commit();

		await Task.sleep(1);

		assert.isTrue(limitTask0.isCompleted);
		assert.equal(limitTask0.result.remainTokens, 1);
		assert.isFalse(limitTask0.isCancelled);
		assert.isFalse(limitTask0.isFaulted);

		assert.isTrue(limitTask1.isCompleted);
		assert.equal(limitTask1.result.remainTokens, 0);
		assert.isFalse(limitTask1.isCancelled);
		assert.isFalse(limitTask1.isFaulted);

		assert.isTrue(limitTask2.isCompleted);
		assert.equal(limitTask2.result.remainTokens, 0);
		assert.isFalse(limitTask2.isCancelled);
		assert.isFalse(limitTask2.isFaulted);
	});
	it("Should start 2 tasks and start 3-rd task after done() 1st and 2nd tasks", async function () {
		// Setup limit for 2 parallel call
		const limit = ParallelLimitFactory(2);

		// Create cancellation token source
		const cts = Task.createCancellationTokenSource();

		const limitTask0 = limit(cts.token);
		const limitTask1 = limit(cts.token);
		const limitTask2 = limit(cts.token);

		await Task.sleep(1);

		const limit0Context = await limitTask0;
		assert.equal(limitTask0.result.remainTokens, 1);
		limit0Context.commit();
		const limit1Context = await limitTask1;
		assert.equal(limitTask1.result.remainTokens, 0);
		limit1Context.commit();

		await Task.sleep(1);

		assert.isTrue(limitTask0.isCompleted);
		assert.equal(limitTask0.result.remainTokens, 1);
		assert.isFalse(limitTask0.isCancelled);
		assert.isFalse(limitTask0.isFaulted);

		assert.isTrue(limitTask1.isCompleted);
		assert.equal(limitTask1.result.remainTokens, 0);
		assert.isFalse(limitTask1.isCancelled);
		assert.isFalse(limitTask1.isFaulted);

		assert.isTrue(limitTask2.isCompleted);
		assert.equal(limitTask2.result.remainTokens, 0);
		assert.isFalse(limitTask2.isCancelled);
		assert.isFalse(limitTask2.isFaulted);
	});
	it("Should start 2 tasks and start 3-rd task after revert() 1-st task", async function () {
		// Setup limit for 2 parallel call
		const limit = ParallelLimitFactory(2);

		// Create cancellation token source
		const cts = Task.createCancellationTokenSource();

		const limitTask0 = limit(cts.token);
		const limitTask1 = limit(cts.token);
		const limitTask2 = limit(cts.token);

		await Task.sleep(1);

		const limit1Context = await limitTask0;
		limit1Context.rollback();

		await Task.sleep(1);

		assert.isTrue(limitTask0.isCompleted);
		assert.isFalse(limitTask0.isCancelled);
		assert.isFalse(limitTask0.isFaulted);

		assert.isTrue(limitTask1.isCompleted);
		assert.isFalse(limitTask1.isCancelled);
		assert.isFalse(limitTask1.isFaulted);

		assert.isTrue(limitTask2.isCompleted);
		assert.isFalse(limitTask2.isCancelled);
		assert.isFalse(limitTask2.isFaulted);
	});
});
