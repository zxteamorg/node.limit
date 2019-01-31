import { Limit, LimitError, LimitToken, TokenLazyCallback } from "./contract";
import { throwLimitConfigurationError, InternalLimit, AssertError } from "./internal/common";
import { InternalParallelLimit } from "./internal/InternalParallelLimit";
import { InternalTimespanLimit } from "./internal/InternalTimespanLimit";
import { CancellationTokenLike } from "@zxteam/contract";

export * from "./contract";

function buildInnerLimits(opts: Limit.Opts): Array<InternalLimit> {
	const innerLimits: Array<InternalLimit> = [];

	if (opts.perHour) {
		let count = opts.perHour;
		if (count <= 0) {
			return throwLimitConfigurationError("perHour count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000 * 60 * 60/* 1 hour */, count));
	}
	if (opts.perMinute) {
		let count = opts.perMinute;
		if (count <= 0) {
			return throwLimitConfigurationError("perMinute count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000 * 60/* 1 minute */, count));
	}
	if (opts.perSecond) {
		const count = opts.perSecond;
		if (count <= 0) {
			return throwLimitConfigurationError("perSecond count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000/* 1 second */, count));
	}
	if (opts.perTimespan) {
		const count: number = opts.perTimespan.count;
		const delay: number = opts.perTimespan.delay;
		if (count <= 0) {
			return throwLimitConfigurationError("perTimespan count value should be above zero integer");
		}
		if (delay <= 0) {
			return throwLimitConfigurationError("perTimespan delay value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(delay, count));
	}
	if (opts.parallel) {
		let count = opts.parallel;
		if (count <= 0) {
			return throwLimitConfigurationError("parallel count value should be above zero integer");
		}
		innerLimits.push(new InternalParallelLimit(count));
	}

	return innerLimits;
}

function isCancellationTokenLike(ct: any): ct is CancellationTokenLike {
	return typeof ct === "object" &&
		typeof ct.addCancelListener === "function" &&
		typeof ct.removeCancelListener === "function";
}

export function limitFactory(opts: Limit.Opts): Limit {
	const innerLimits = buildInnerLimits(opts);
	const busyLimits: Array<InternalLimit> = [];
	const waitForTokenCallbacks: Array<[TokenLazyCallback, any]> = [];
	let disposing = false;

	function onBusyLimitsReleased() {
		while (waitForTokenCallbacks.length > 0) {
			const token = _accrueAggregatedToken();
			if (token === null) { break; }

			const tulpe = waitForTokenCallbacks.shift();
			if (!tulpe) {
				throw new AssertError();
			}
			const [cb, timerOrRemoveListener] = tulpe;
			if (typeof timerOrRemoveListener === "function") {
				timerOrRemoveListener();
			} else {
				clearTimeout(timerOrRemoveListener);
			}
			cb(undefined, token);
		}
	}

	function _accrueAggregatedToken(): LimitToken | null {
		if (busyLimits.length > 0) { return null; }
		if (disposing) { return null; }
		const innerTokens: Array<LimitToken> = [];
		for (let innerLimitIndex = 0; innerLimitIndex < innerLimits.length; innerLimitIndex++) {
			const innerLimit = innerLimits[innerLimitIndex];
			if (innerLimit.availableTokens === 0) {
				busyLimits.push(innerLimit);
			} else {
				innerTokens.push(innerLimit.accrueToken());
			}
		}
		if (innerLimits.length === innerTokens.length) {
			return {
				commit: () => { innerTokens.forEach(it => it.commit()); },
				rollback: () => { innerTokens.forEach(it => it.rollback()); }
			};
		} else {
			innerTokens.forEach(it => it.rollback());
			busyLimits.forEach(bl => {
				function onReleaseBusyLimit() {
					bl.removeReleaseTokenListener(onReleaseBusyLimit);
					const blIndex = busyLimits.indexOf(bl);
					busyLimits.splice(blIndex, 1);
					if (busyLimits.length === 0) {
						onBusyLimitsReleased();
					}
				}
				bl.addReleaseTokenListener(onReleaseBusyLimit);
			});
			return null;
		}
	}

	function accrueTokenImmediately(): LimitToken {
		if (disposing) { throw new Error("Wrong operation on disposed object"); }
		const aggregatedToken = _accrueAggregatedToken();
		if (aggregatedToken != null) {
			return aggregatedToken;
		}
		throw new LimitError("No available tokens");
	}

	async function accrueTokenLazyWithCancellationTokenPromise(ct: CancellationTokenLike): Promise<LimitToken> {
		return new Promise<LimitToken>((resolve, reject) => {
			accrueTokenLazyWithCancellationTokenCallback(ct, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}
	async function accrueTokenLazyWithTimeoutPromise(timeout: number): Promise<LimitToken> {
		return new Promise<LimitToken>((resolve, reject) => {
			accrueTokenLazyWithTimeoutCallback(timeout, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}

	function accrueTokenLazyWithCancellationTokenCallback(ct: CancellationTokenLike, cb: TokenLazyCallback): void {
		const token = _accrueAggregatedToken();
		if (token !== null) {
			cb(undefined, token);
			return;
		}

		let tuple: [TokenLazyCallback, Function];
		const cancelCallback = () => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			tuple[1]();
			cb(new LimitError(`Timeout: Token was not accrued due cancel request`));
		};
		ct.addCancelListener(cancelCallback);
		const removeListener = () => ct.removeCancelListener(cancelCallback);
		tuple = [cb, removeListener];
		waitForTokenCallbacks.push(tuple);
	}
	function accrueTokenLazyWithTimeoutCallback(timeout: number, cb: TokenLazyCallback): void {
		const token = _accrueAggregatedToken();
		if (token !== null) {
			cb(undefined, token);
			return;
		}

		// Timeout
		let tuple: [TokenLazyCallback, number];
		const timer = setTimeout(() => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			cb(new LimitError(`Timeout: Token was not accrued in ${timeout} ms`));
		}, timeout);
		tuple = [cb, timer as any];
		waitForTokenCallbacks.push(tuple);
	}

	function accrueTokenLazyOverrides(...args: Array<any>): any {
		if (disposing) { throw new Error("Wrong operation on disposed object"); }
		if (args.length === 1) {
			const possibleTimeoutOrCancellationToken = args[0];
			if (typeof possibleTimeoutOrCancellationToken === "number") {
				return accrueTokenLazyWithTimeoutPromise(possibleTimeoutOrCancellationToken);
			}
			if (isCancellationTokenLike(possibleTimeoutOrCancellationToken)) {
				return accrueTokenLazyWithCancellationTokenPromise(possibleTimeoutOrCancellationToken);
			}
		} else if (args.length === 2) {
			const possibleTimeoutOrCancellationToken = args[0];
			const possibleCallback = args[1];
			if (typeof possibleCallback === "function") {
				if (typeof possibleTimeoutOrCancellationToken === "number") {
					return accrueTokenLazyWithTimeoutCallback(possibleTimeoutOrCancellationToken, possibleCallback);
				}
				if (isCancellationTokenLike(possibleTimeoutOrCancellationToken)) {
					return accrueTokenLazyWithCancellationTokenCallback(possibleTimeoutOrCancellationToken, possibleCallback);
				}
			}
		}
		throw Error("Wrong arguments");
	}

	async function dispose(): Promise<void> {
		disposing = true;
		waitForTokenCallbacks.slice().forEach(waitForTokenCallback => {
			const tupleIndex = waitForTokenCallbacks.indexOf(waitForTokenCallback);
			if (tupleIndex !== -1) { waitForTokenCallbacks.splice(tupleIndex, 1); }
			const [cb, timerOrRemoveListener] = waitForTokenCallback;
			if (typeof timerOrRemoveListener === "function") {
				timerOrRemoveListener();
			} else {
				clearTimeout(timerOrRemoveListener);
			}
			cb(new LimitError(`Timeout: Token was not accrued due disposing`));
		});
		await Promise.all(innerLimits.map(il => il.dispose()));
	}

	return {
		get maxTokens() {
			return Math.min(...innerLimits.map(f => f.maxTokens));
		},
		get availableTokens() {
			return Math.min(...innerLimits.map(f => f.availableTokens));
		},
		accrueTokenImmediately,
		accrueTokenLazy: accrueTokenLazyOverrides,
		dispose
	};
}

export default limitFactory;
