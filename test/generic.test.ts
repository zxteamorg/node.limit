import { assert } from "chai";

import { Task } from "ptask.js";

import { limitFactory, LimitToken, LimitError } from "../src";

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
			assert.isTrue(limitToken1Task.isCompletedSuccessfully);
			assert.isTrue(limitToken2Task.isCompletedSuccessfully);

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
			assert.isFalse(limitToken3Task.isCompletedSuccessfully);
			assert.isFalse(limitToken4Task.isCompletedSuccessfully);

			assert.instanceOf(limitToken3Task.error, LimitError);
			assert.instanceOf(limitToken4Task.error, LimitError);

			limitToken1Task.result.rollback();
			limitToken2Task.result.commit();
		} finally {
			await limit.dispose();
		}
	});
});
