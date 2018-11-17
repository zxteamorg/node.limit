import { assert } from "chai";
import { spy } from "sinon";

import { LimitError } from "../src/index";
import { InternalParallelLimit } from "../src/internal/InternalParallelLimit";

describe(`${InternalParallelLimit.name} tests`, function () {
	it("Should be able to instance and destroy", async function () {
		const mylimit = new InternalParallelLimit(2);
		mylimit.accrueToken().commit();
		mylimit.destroy();
	});
	it("Should be equal maxTokens to hitCount", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);
		assert.equal(limit.maxTokens, 2);
	});
	it("Should get 2 tokens and block 3-rd token", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		let expectedError;
		try {
			const limitToken2 = limit.accrueToken();
		} catch (e) {
			expectedError = e;
		}
		assert.instanceOf(expectedError, LimitError);
	});
	it("Should get 2 tokens and commit 2 tokens", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 1);

		limitToken1.commit();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should get 2 tokens and rollback 2 tokens", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		limitToken0.rollback();
		assert.equal(limit.availableTokens, 1);

		limitToken1.rollback();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should get 2 tokens and get another 2 tokens", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 1);

		limitToken1.rollback();
		assert.equal(limit.availableTokens, 2);

		const limitToken2 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken3 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);
	});
	it("Should NOT decrement availableTokens on multiple call commit on same token", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);
		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should NOT decrement availableTokens on multiple call rollback on same token", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);
		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should NOT decrement availableTokens on multiple call commit+rollback on same token", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		assert.equal(limit.availableTokens, 2);
		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should fire callback on commit", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		const listenerSpy = spy();
		limit.addReleaseTokenListener(listenerSpy);

		const limitToken0 = limit.accrueToken();
		const limitToken1 = limit.accrueToken();

		assert.isFalse(listenerSpy.called, "Listener should NOT call before commit");

		limitToken0.commit();
		assert.isTrue(listenerSpy.calledOnce, "Listener should be called once");

		limitToken1.commit();
		assert.isTrue(listenerSpy.calledTwice, "Listener should be called twice");
	});
	it("Should fire callback on rollback", async function () {
		// Setup limit for 2 parallel call
		const limit = new InternalParallelLimit(2);

		const listenerSpy = spy();
		limit.addReleaseTokenListener(listenerSpy);

		const limitToken0 = limit.accrueToken();
		const limitToken1 = limit.accrueToken();

		assert.isFalse(listenerSpy.called, "Listener should NOT call before commit");

		limitToken0.rollback();
		assert.isTrue(listenerSpy.calledOnce, "Listener should be called once");

		limitToken1.rollback();
		assert.isTrue(listenerSpy.calledTwice, "Listener should be called twice");
	});
});
