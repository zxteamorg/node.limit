import { Limit, LimitError, LimitOpts, LimitToken } from "./contract";
import { throwConfigurationError, InternalLimit } from "./internal/common";
import { InternalParallelLimit  } from "./internal/InternalParallelLimit";
import { InternalTimespanLimit } from "./internal/InternalTimespanLimit";

export * from "./contract";

function buildInnerLimits(opts: LimitOpts): Array<InternalLimit> {
	const innerLimits: Array<InternalLimit> = [];

	if (opts.perHour) {
		let count = opts.perHour;
		if (count <= 0) {
			return throwConfigurationError("perHour count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000 * 60 * 60/* 1 hour */, count));
	}
	if (opts.perMinute) {
		let count = opts.perMinute;
		if (count <= 0) {
			return throwConfigurationError("perMinute count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000 * 60/* 1 minute */, count));
	}
	if (opts.perSecond) {
		const count = opts.perSecond;
		if (count <= 0) {
			return throwConfigurationError("perSecond count value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(1000/* 1 second */, count));
	}
	if (opts.perTimespan) {
		const count: number = opts.perTimespan.count;
		const delay: number = opts.perTimespan.delay;
		if (count <= 0) {
			return throwConfigurationError("perTimespan count value should be above zero integer");
		}
		if (delay <= 0) {
			return throwConfigurationError("perTimespan delay value should be above zero integer");
		}
		innerLimits.push(new InternalTimespanLimit(delay, count));
	}
	if (opts.parallel) {
		let count = opts.parallel;
		if (count <= 0) {
			return throwConfigurationError("parallel count value should be above zero integer");
		}
		innerLimits.push(new InternalParallelLimit(count));
	}

	return innerLimits;
}

export function LimitFactory(opts: LimitOpts): Limit {
	const innerLimits = buildInnerLimits(opts);

	function _accrueAggregatedToken(): LimitToken | null {
		const innerTokens: Array<LimitToken> = [];
		let error;
		try {
			for (let innerLimitIndex = 0; innerLimitIndex < innerLimits.length; innerLimitIndex++) {
				const innerLimit = innerLimits[innerLimitIndex];
				if (innerLimit.availableTokens === 0) {
					// There are no reason to accrue next token
					break;
				}
				innerTokens.push(innerLimit.accrueToken());
			}
		} catch (e) {
			error = e;
		}
		if (innerLimits.length === innerTokens.length && !error) {
			return {
				commit: () => { innerTokens.forEach(it => it.commit()); },
				rollback: () => { innerTokens.forEach(it => it.rollback()); }
			};
		} else {
			innerTokens.forEach(it => it.rollback());
			if (error && !(error instanceof LimitError)) {
				throw error;
			}
			return null;
		}
	}

	function accrueTokenImmediately(): LimitToken {
		const aggregatedToken = _accrueAggregatedToken();
		if (aggregatedToken != null) {
			return aggregatedToken;
		}
		throw new LimitError("No any available tokens");
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
	function accrueTokenLazyCallback(timeout: number, cb: (err: any, limitToken?: LimitToken) => void): void {
		function accrueAggregatedTokenAndFireCallback(): boolean {
			try {
				const aggregatedToken = _accrueAggregatedToken();
				if (aggregatedToken != null) {
					cb(null, aggregatedToken); return true;
				} else {
					return false;
				}
			} catch (e) {
				cb(e);
				return true;
			}
		}

		if (accrueAggregatedTokenAndFireCallback()) { return; }

		// Timeout
		const timer = setTimeout(() => {
			// remove listeners
			innerLimits.map(il => il.removeReleaseTokenListener(onReleaseToken));
			cb(new LimitError(`Timeout: Token was not accrued in ${timeout} ms`));
		}, timeout);

		// Released tokens
		innerLimits.map(il => il.addReleaseTokenListener(onReleaseToken));
		let insideOnReleaseToken = false;
		function onReleaseToken(availableTokens: number) {
			if (insideOnReleaseToken) { return; }
			insideOnReleaseToken = true;
			try {
				if (availableTokens > 0) {
					if (accrueAggregatedTokenAndFireCallback()) {
						clearTimeout(timer);
						// remove listeners
						innerLimits.map(il => il.removeReleaseTokenListener(onReleaseToken));
					}
				}
			} finally {
				insideOnReleaseToken = false;
			}
		}
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

	function destroy() {
		innerLimits.forEach(il => il.destroy());
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
		destroy
	};
}

export default LimitFactory;
