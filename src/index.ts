import * as zxteam from "@zxteam/contract";

import { Limit, LimitError } from "./contract";
import { throwLimitConfigurationError, InternalLimit, AssertError } from "./internal/common";
import { InternalParallelLimit } from "./internal/InternalParallelLimit";
import { InternalTimespanLimit } from "./internal/InternalTimespanLimit";

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

function isCancellationToken(ct: any): ct is zxteam.CancellationToken {
	return typeof ct === "object" &&
		typeof ct.addCancelListener === "function" &&
		typeof ct.removeCancelListener === "function";
}

export function limitFactory(opts: Limit.Opts): Limit {
	const innerLimits = buildInnerLimits(opts);
	const busyLimits: Array<InternalLimit> = [];
	const waitForTokenCallbacks: Array<[Limit.TokenLazyCallback, Function]> = [];
	let disposing = false;

	function onBusyLimitsReleased(weight: Limit.Weight) {
		while (waitForTokenCallbacks.length > 0) {
			const token = _accrueAggregatedToken(weight);
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

	function _accrueAggregatedToken(weight: Limit.Weight): Limit.Token | null {
		if (busyLimits.length > 0) { return null; }
		if (disposing) { return null; }
		const innerTokens: Array<Limit.Token> = [];
		for (let innerLimitIndex = 0; innerLimitIndex < innerLimits.length; innerLimitIndex++) {
			const innerLimit = innerLimits[innerLimitIndex];
			if (innerLimit.availableWeight < weight) {
				busyLimits.push(innerLimit);
			} else {
				innerTokens.push(innerLimit.accrueToken(weight));
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
						onBusyLimitsReleased(weight);
					}
				}
				bl.addReleaseTokenListener(onReleaseBusyLimit);
			});
			return null;
		}
	}

	function accrueTokenImmediately(weight?: Limit.Weight): Limit.Token {
		if (disposing) { throw new Error("Wrong operation on disposed object"); }
		const aggregatedToken = _accrueAggregatedToken(weight !== undefined ? weight : 1);
		if (aggregatedToken != null) {
			return aggregatedToken;
		}
		throw new LimitError("No available tokens");
	}

	async function accrueTokenLazyWithCancellationTokenPromise(
		weight: Limit.Weight, ct: zxteam.CancellationToken
	): Promise<Limit.Token> {
		return new Promise<Limit.Token>((resolve, reject) => {
			accrueTokenLazyWithCancellationTokenCallback(weight, ct, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}
	async function accrueTokenLazyWithTimeoutPromise(
		weight: Limit.Weight, timeout: number
	): Promise<Limit.Token> {
		return new Promise<Limit.Token>((resolve, reject) => {
			accrueTokenLazyWithTimeoutCallback(weight, timeout, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}
	async function accrueTokenLazyPromise(
		weight: Limit.Weight, timeout: number, ct: zxteam.CancellationToken
	): Promise<Limit.Token> {
		return new Promise<Limit.Token>((resolve, reject) => {
			accrueTokenLazyCallback(weight, timeout, ct, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}

	// tslint:disable-next-line: max-line-length
	function accrueTokenLazyWithCancellationTokenCallback(
		weight: Limit.Weight, ct: zxteam.CancellationToken, cb: Limit.TokenLazyCallback
	): void {
		const token = _accrueAggregatedToken(weight);
		if (token !== null) {
			cb(undefined, token);
			return;
		}

		let tuple: [Limit.TokenLazyCallback, Function];
		const cancelCallback = () => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			tuple[1]();
			try {
				ct.throwIfCancellationRequested(); // Token should raise error
				// Guard from invalid token implementation. Fallback to LimitError.
				cb(new LimitError(`Timeout: Token was not accrued due cancel request`));
			} catch (e) {
				cb(e);
			}
		};
		ct.addCancelListener(cancelCallback);
		const removeListener = () => ct.removeCancelListener(cancelCallback);
		tuple = [cb, removeListener];
		waitForTokenCallbacks.push(tuple);
	}
	function accrueTokenLazyWithTimeoutCallback(
		weight: Limit.Weight, timeout: number, cb: Limit.TokenLazyCallback
	): void {
		const token = _accrueAggregatedToken(weight);
		if (token !== null) {
			cb(undefined, token);
			return;
		}

		// Timeout
		let tuple: [Limit.TokenLazyCallback, Function];
		const timer = setTimeout(() => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			cb(new LimitError(`Timeout: Token was not accrued in ${timeout} ms`));
		}, timeout);
		const removeTimer = () => clearTimeout(timer);
		tuple = [cb, removeTimer];
		waitForTokenCallbacks.push(tuple);
	}
	function accrueTokenLazyCallback(
		weight: Limit.Weight, timeout: number, ct: zxteam.CancellationToken, cb: Limit.TokenLazyCallback
	): void {
		const token = _accrueAggregatedToken(weight);
		if (token !== null) {
			cb(undefined, token);
			return;
		}

		// Timeout
		let tuple: [Limit.TokenLazyCallback, Function];
		const timer = setTimeout(() => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			cb(new LimitError(`Timeout: Token was not accrued in ${timeout} ms`));
		}, timeout);

		// Callback
		const cancelCallback = () => {
			const tupleIndex = waitForTokenCallbacks.indexOf(tuple);
			if (tupleIndex < 0) { throw new AssertError(); }
			waitForTokenCallbacks.splice(tupleIndex, 1);
			tuple[1]();
			try {
				ct.throwIfCancellationRequested(); // Token should raise error
				// Guard from invalid token implementation. Fallback to LimitError.
				cb(new LimitError(`Timeout: Token was not accrued due cancel request`));
			} catch (e) {
				cb(e);
			}
		};
		ct.addCancelListener(cancelCallback);

		const removeListenerAndTimer = () => {
			clearTimeout(timer);
			ct.removeCancelListener(cancelCallback);
		};
		tuple = [cb, removeListenerAndTimer];
		waitForTokenCallbacks.push(tuple);
	}

	function accrueTokenLazyOverrides(...args: Array<any>): any {
		if (disposing) { throw new Error("Wrong operation on disposed object"); }
		if (args.length === 1) {
			const arg0 = args[0];
			if (typeof arg0 === "number") {
				const timeout: number = arg0;
				// CASE 1: accrueTokenLazy(timeout: number): Promise<Limit.Token>
				return accrueTokenLazyWithTimeoutPromise(1/* weight */, timeout);
			}
			if (isCancellationToken(arg0)) {
				// CASE 2: accrueTokenLazy(cancellationToken: CancellationToken): Promise<Limit.Token>
				const cancellationToken: zxteam.CancellationToken = arg0;
				return accrueTokenLazyWithCancellationTokenPromise(1/* weight */, cancellationToken);
			}
		} else if (args.length === 2) {
			const [arg0, arg1] = args;
			if (typeof arg0 === "number") {
				const possibleWeightOrTimeout = arg0;
				if (typeof arg1 === "function") {
					// CASE 3: accrueTokenLazy(timeout: number, cb: TokenLazyCallback): void
					const timeout = possibleWeightOrTimeout;
					const callback = arg1;
					return accrueTokenLazyWithTimeoutCallback(1/* weight */, timeout, callback);
				}
				if (typeof arg1 === "number") {
					// CASE 6: accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number): Promise<Limit.Token>
					const tokenWeight = possibleWeightOrTimeout;
					const timeout = arg1;
					return accrueTokenLazyWithTimeoutPromise(tokenWeight, timeout);
				}
				if (isCancellationToken(arg1)) {
					// CASE 5: accrueTokenLazy(timeout: number, cancellationToken: CancellationToken): Promise<Limit.Token>
					const timeout = possibleWeightOrTimeout;
					const cancellationToken = arg1;
					return accrueTokenLazyPromise(1/* weight */, timeout, cancellationToken);
				}
			} else if (isCancellationToken(arg0)) {
				if (typeof arg1 === "function") {
					const cancellationToken = arg0;
					const callback = arg1;
					// CASE 4: accrueTokenLazy(cancellationToken: CancellationToken, cb: TokenLazyCallback): void
					return accrueTokenLazyWithCancellationTokenCallback(1/* weight */, cancellationToken, callback);
				}
			}
		} else if (args.length === 3) {
			const [arg0, arg1, arg2] = args;
			if (typeof arg0 === "number") {
				if (isCancellationToken(arg1) && typeof arg2 === "function") {
					// CASE 7: accrueTokenLazy(timeout: number, cancellationToken: CancellationToken, cb: TokenLazyCallback): void
					const timeout = arg0;
					const cancellationToken = arg1;
					const callback = arg2;
					return accrueTokenLazyCallback(1/* weight */, timeout, cancellationToken, callback);
				}
				if (typeof arg1 === "number") {
					if (typeof arg2 === "function") {
						// CASE 8: accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cb: TokenLazyCallback): void
						const tokenWeight = arg0;
						const timeout = arg1;
						const callback = arg2;
						return accrueTokenLazyWithTimeoutCallback(tokenWeight, timeout, callback);
					}
					if (isCancellationToken(arg2)) {
						// CASE 9: accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cancellationToken: CancellationToken): Promise<Limit.Token>
						const tokenWeight = arg0;
						const timeout = arg1;
						const cancellationToken = arg2;
						return accrueTokenLazyPromise(tokenWeight, timeout, cancellationToken);
					}
				}
			}
		} else if (args.length === 4) {
			const [arg0, arg1, arg2, arg3] = args;
			if (typeof arg0 === "number" && typeof arg1 === "number" && isCancellationToken(arg2) && typeof arg3 === "function") {
				// tslint:disable-next-line:max-line-length
				// CASE 10: accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cancellationToken: CancellationToken, cb: TokenLazyCallback): void
				const tokenWeight = arg0;
				const timeout = arg1;
				const cancellationToken = arg2;
				const callback = arg3;
				return accrueTokenLazyCallback(tokenWeight, timeout, cancellationToken, callback);
			}

		}
		throw Error("Wrong arguments");
	}

	function dispose(): Promise<void> {
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
		return Promise.resolve().then(async () => {
			await Promise.all(innerLimits.map(il => il.dispose()));
		});
	}

	return {
		get maxWeight() {
			return Math.min(...innerLimits.map(f => f.maxWeight));
		},
		get availableWeight() {
			return Math.min(...innerLimits.map(f => f.availableWeight));
		},
		accrueTokenImmediately,
		accrueTokenLazy: accrueTokenLazyOverrides,
		dispose
	};
}

export default limitFactory;
