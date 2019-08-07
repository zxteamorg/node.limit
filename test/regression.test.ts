import * as zxteam from "@zxteam/contract";
import { assert } from "chai";

import { Task } from "@zxteam/task";

import { limitFactory, Limit, LimitError } from "../src";

async function nextTick() {
	return new Promise(r => process.nextTick(r));
}

describe("Regression", function () {
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

			let limitToken1: Limit.Token;
			let limitToken2: Limit.Token;
			let limitToken3: Limit.Token;
			try {
				limitToken1 = limit.accrueTokenImmediately();
				limitToken2 = limit.accrueTokenImmediately();
				limitToken3 = limit.accrueTokenImmediately();

				limitToken1.commit(); // force to start timers in InternalTimespanLimit

				let disposing = false;
				const limitDisposeTask = Task.run<void>(() => {
					disposing = true;
					return limit.dispose();
				});

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
	describe("0.0.5", function () {
		it("dispose() should block flow while use any tokens (in lazy mode)", async function () {
			const limit = limitFactory({
				perMinute: 3,
				perHour: 50,
				parallel: 2
			});

			let limitToken1Task: zxteam.Task<Limit.Token>;
			let limitToken2Task: zxteam.Task<Limit.Token>;
			let limitToken3Task: zxteam.Task<Limit.Token>;
			let limitToken4Task: zxteam.Task<Limit.Token>;
			try {
				limitToken1Task = Task.run(() => limit.accrueTokenLazy(10000));
				assert.isFalse(limitToken1Task.isCompleted);
				await Task.sleep(5);
				assert.isTrue(limitToken1Task.isSuccessed);
				limitToken1Task.result.commit(); // force to start timers in InternalTimespanLimit


				limitToken2Task = Task.run(() => limit.accrueTokenLazy(10000));
				await Task.sleep(5);
				assert.isTrue(limitToken2Task.isSuccessed);

				limitToken3Task = Task.run(() => limit.accrueTokenLazy(10000));
				await Task.sleep(5);
				assert.isTrue(limitToken3Task.isSuccessed);

				limitToken4Task = Task.run(() => limit.accrueTokenLazy(10000));
				await Task.sleep(5);
				assert.isFalse(limitToken4Task.isCompleted);

				let disposing = false;
				const limitDisposeTask = Task.run(() => {
					disposing = true;
					return limit.dispose();
				});

				assert.isFalse(disposing, "Disposing process should NOT started before next tick");
				await Task.sleep(5);
				assert.isTrue(disposing, "Disposing process should started before next tick");
				assert.isFalse(limitDisposeTask.isCompleted,
					"Disposing process should NOT completed while limitToken2, limitToken3 still in use and limitToken4 in lazy accuring");

				limitToken2Task.result.commit();
				limitToken3Task.result.commit();

				assert.isFalse(limitDisposeTask.isCompleted, "Disposing process should NOT completed before next tick");
				await Task.sleep(5);

				assert.isTrue(limitToken4Task.isCompleted, "limitToken4Task should completed");
				assert.isFalse(limitToken4Task.isSuccessed, "limitToken4Task should completed as error");
				assert.instanceOf(limitToken4Task.error, LimitError, "error of limitToken4Task should be LimitError");

				assert.isTrue(limitDisposeTask.isSuccessed, "Disposing process should completed due no any tokens in use.");

			} catch (e) {
				await limit.dispose();
				throw e;
			}
		});
	});
});
