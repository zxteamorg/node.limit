import { limitFactory } from "../src";

describe(`0.0.3`, function () {
	it.only("The timers in the limit instance should not blocks process exit", async function () {
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
