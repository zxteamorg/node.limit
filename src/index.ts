import { Limit, LimitError, LimitToken, TokenLazyCallback } from "./contract";
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

export function LimitFactory(opts: Limit.Opts): Limit {
	const innerLimits = buildInnerLimits(opts);
	const busyLimits: Array<InternalLimit> = [];
	const waitForTokenCallbacks: Array<[TokenLazyCallback, any]> = [];

	function onBusyLimitsReleased() {
		while (waitForTokenCallbacks.length > 0) {
			const token = _accrueAggregatedToken();
			if (token === null) { break; }

			const tulpe = waitForTokenCallbacks.shift();
			if (!tulpe) {
				throw new AssertError();
			}
			const [cb, timer] = tulpe;
			clearTimeout(timer);
			cb(undefined, token);
		}
	}

	function _accrueAggregatedToken(): LimitToken | null {
		if (busyLimits.length > 0) { return null; }
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
		const aggregatedToken = _accrueAggregatedToken();
		if (aggregatedToken != null) {
			return aggregatedToken;
		}
		throw new LimitError("No available tokens");
	}

	async function accrueTokenLazyPromise(timeout: number): Promise<LimitToken> {
		return new Promise<LimitToken>((resolve, reject) => {
			accrueTokenLazyCallback(timeout, (err, token) => {
				if (err) {
					reject(err);
				} else {
					resolve(token);
				}
			});
		});
	}

	function accrueTokenLazyCallback(timeout: number, cb: TokenLazyCallback): void {
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
		if (args.length === 1) {
			const possibleTimeout = args[0];
			if (typeof possibleTimeout === "number") { return accrueTokenLazyPromise(possibleTimeout); }
		} else if (args.length === 2) {
			const possibleTimeout = args[0];
			const possibleCallback = args[1];
			if (typeof possibleTimeout === "number" && typeof possibleCallback === "function") {
				return accrueTokenLazyCallback(possibleTimeout, possibleCallback);
			}
		}
		throw Error("Wrong arguments");
	}

	return {
		get maxTokens() {
			return Math.min(...innerLimits.map(f => f.maxTokens));
		},
		get availableTokens() {
			return Math.min(...innerLimits.map(f => f.availableTokens));
		},
		accrueTokenImmediately,
		accrueTokenLazy: accrueTokenLazyOverrides
	};
}

export default LimitFactory;
