import { assert } from "chai";
import { spy } from "sinon";

import { InternalTimespanLimit } from "../src/internal/InternalTimespanLimit";
import { LimitError } from "../src";

class SetTimeoutStub {
	private readonly _clearTimeoutStub: (handle?: number) => void;
	private readonly _setTimeoutStub: (handler: TimerHandler, timeout?: number) => number;
	private readonly _map: { [stubId: string]: [number, Function] };
	private _index: number = 0;
	private _currentOffset = 0;
	public constructor() {
		this._map = {};
		this._clearTimeoutStub = (handle?: number): void => {
			if (typeof handle !== "number") { throw new Error("Not supported handler"); }
			delete this._map[handle.toString()];
		};
		this._setTimeoutStub = (handler: TimerHandler, timeout?: number): number => {
			if (typeof handler !== "function") { throw new Error("Not supported handler"); }
			const stubId = ++this._index;
			const friendlyTimeout = timeout ? timeout + this._currentOffset : this._currentOffset;
			this._map[stubId.toString()] = [friendlyTimeout, handler];
			return stubId;
		};
	}
	public get clearTimeout() { return this._clearTimeoutStub; }
	public get setTimeout() { return this._setTimeoutStub; }
	public timeForward(ms: number): void {
		this._currentOffset += ms;
		Object.keys(this._map).forEach((stubId) => {
			const [timeout, handler] = this._map[stubId];
			if (timeout <= this._currentOffset) {
				// expired
				delete this._map[stubId];
				handler();
			}
		});
	}
}

describe("InternalTimespanLimit tests", function () {
	let timeoutStub: SetTimeoutStub;
	let limit: InternalTimespanLimit;
	beforeEach(function () {
		timeoutStub = new SetTimeoutStub();
		limit = new InternalTimespanLimit(1000, 2, {
			clearTimeoutFunc: timeoutStub.clearTimeout,
			setTimeoutFunc: timeoutStub.setTimeout
		});
	});

	it("Should be able to instance and destroy", async function () {
		const mylimit = new InternalTimespanLimit(1000, 2);
		mylimit.accrueToken().commit();
		await mylimit.dispose();
	});
	it("Should be equal maxTokens to hitCount", async function () {
		assert.equal(limit.maxTokens, 2);
	});
	it("Should NOT fail on commit timeout with broken _timers array", async function () {
		const token = limit.accrueToken();
		token.commit();
		(limit as any)._timers = [];
		timeoutStub.timeForward(1000);
	});
	it("Should get 2 tokens and block 3-rd token", async function () {
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
		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 0);
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 1);

		limitToken1.commit();
		assert.equal(limit.availableTokens, 1);
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
	});
	it("Should get 2 tokens and rollback 2 tokens", async function () {
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
		assert.equal(limit.availableTokens, 2);

		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken1 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);

		limitToken0.commit();
		assert.equal(limit.availableTokens, 0);
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 1);

		limitToken1.rollback();
		assert.equal(limit.availableTokens, 2);

		const limitToken2 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		const limitToken3 = limit.accrueToken();
		assert.equal(limit.availableTokens, 0);
	});
	it("Should NOT decrement availableTokens on multiple call commit on same token", async function () {
		assert.equal(limit.availableTokens, 2);
		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		limitToken0.commit();
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
	});
	it("Should NOT decrement availableTokens on multiple call rollback on same token", async function () {
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
		assert.equal(limit.availableTokens, 2);
		const limitToken0 = limit.accrueToken();
		assert.equal(limit.availableTokens, 1);

		limitToken0.commit();
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
		limitToken0.commit();
		timeoutStub.timeForward(1000);
		assert.equal(limit.availableTokens, 2);
		limitToken0.rollback();
		assert.equal(limit.availableTokens, 2);
	});
	it("Should fire callback on commit", async function () {
		const listenerSpy = spy();
		limit.addReleaseTokenListener(listenerSpy);

		const limitToken0 = limit.accrueToken();
		const limitToken1 = limit.accrueToken();

		assert.isFalse(listenerSpy.called, "Listener should NOT call before commit");

		limitToken0.commit();
		assert.isFalse(listenerSpy.calledOnce, "Listener should NOT be called once before timeout");
		timeoutStub.timeForward(1000);
		assert.isTrue(listenerSpy.calledOnce, "Listener should be called once");

		limitToken1.commit();
		assert.isFalse(listenerSpy.calledTwice, "Listener should NOT be called twice before timeout");
		timeoutStub.timeForward(1000);
		assert.isTrue(listenerSpy.calledTwice, "Listener should be called twice");
	});
	it("Should fire callback on rollback", async function () {
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
