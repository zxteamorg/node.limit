import { assert } from "chai";

import { Limit } from "../src";

describe("isLimitOpts() tests", function () {
	const positiveCases: Array<any> = [
		{ perSecond: 1 },
		{ perMinute: 1 },
		{ perHour: 1 },
		{ parallel: 1 },
		{ perTimespan: { delay: 1, count: 1 } },
		{ perSecond: 3, parallel: 2, timeout: 1000 }
	];
	const negativeCases: Array<any> = [
		{ perSecond: "1" },
		{ perMinute: "1" },
		{ perHour: "1" },
		{ parallel: "1" },
		{ perTimespan: { delay: 1, count: "1" } },
		{ perTimespan: { delay: "1", count: 1 } },
		{ timeout: 1000 },
		undefined,
		42,
		"42",
		true,
		false,
		null
	];

	positiveCases.forEach(positiveCase => {
		it(`Positive Test ${JSON.stringify(positiveCase)}`, function () {
			assert.isTrue(Limit.isLimitOpts(positiveCase), "Limit.isLimitOpts() should return true for this case");
		});
	});

	negativeCases.forEach(negativeCase => {
		it(`Negative Test ${JSON.stringify(negativeCase)}`, function () {
			assert.isFalse(Limit.isLimitOpts(negativeCase), "Limit.isLimitOpts() should return false for this case");
		});
	});
});
