import { assert } from "chai";

import { Limit } from "../src";

describe("ensureLimitOpts() tests", function () {
	it(`Should pass`, function () {
		Limit.ensureLimitOpts({ perSecond: 1 });
	});
	it(`Should raise`, function () {
		assert.throw(() => Limit.ensureLimitOpts({ perSecond: "1" }), Error, "Wrong argument for Limit Opts");
	});
});
