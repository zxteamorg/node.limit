import { assert } from "chai";

import { Task } from "ptask.js";

import { limitFactory, LimitToken } from "../src";

async function nextTick() {
	return new Promise(r => process.nextTick(r));
}

describe("0.0.3", function () {
	it("The timers in the limit instance should not blocks process exit", async function () {
		const limit = limitFactory({
			perSecond: 2,
			perMinute: 4,
			perHour: 50,
			parallel: 2
		});
		try {
			const limitToken = await limit.accrueTokenLazy(3000);
			limitToken.commit();
		} finally {
			// Version 0.0.3 omits dispose() method.
			await limit.dispose();
		}
	});
});
describe("0.0.4", function () {

	it("dispose() should block flow while use any tokens", async function () {
		const limit = limitFactory({
			perSecond: 3,
			perMinute: 4,
			perHour: 50,
			parallel: 3
		});

		let limitToken1: LimitToken;
		let limitToken2: LimitToken;
		let limitToken3: LimitToken;
		try {
			limitToken1 = limit.accrueTokenImmediately();
			limitToken2 = limit.accrueTokenImmediately();
			limitToken3 = limit.accrueTokenImmediately();

			limitToken1.commit(); // force to start timers in InternalTimespanLimit

			let disposing = false;
			const limitDisposeTask = new Task<void>(() => {
				disposing = true;
				return limit.dispose();
			}).start();

			assert.isFalse(disposing, "Disposing process should NOT started before next tick");
			await nextTick();
			assert.isTrue(disposing, "Disposing process should started before next tick");
			assert.isFalse(limitDisposeTask.isCompleted, "Disposing process should NOT completed while limitToken2 and limitToken3 still in use");
			limitToken2.commit();
			assert.isFalse(limitDisposeTask.isCompleted,
				"Disposing process should NOT completed before next tick and while limitToken3 still in use");
			await nextTick();
			assert.isFalse(limitDisposeTask.isCompleted, "Disposing process should NOT completed while limitToken3 still in use");
			limitToken3.commit();
			assert.isFalse(limitDisposeTask.isCompleted, "Disposing process should NOT completed before next tick");
			await nextTick();
			assert.isTrue(limitDisposeTask.isCompleted, "Disposing process should completed due no any tokens in use.");
		} catch (e) {
			await limit.dispose();
			throw e;
		}
	});
});
