import { CancelledError, CancellationTokenSource, CancellationToken, Task } from "ptask.js";

export class LimitError extends Error {
}
export interface LimitOpts {
	perSecond?: number;
	perMinute?: number;
	perHour?: number;
	perTimespan?: {
		delay: number;
		count: number;
	};
	parallel?: number;
}
export interface LimitToken {
	readonly remainTokens: number;
	rollback(): void;
	commit(): void;
}
export interface Limit {
	accrueToken(timeout: number, cb: (limitToken: LimitToken | null) => void): void;
	accrueToken(cb: (limitToken: LimitToken) => void): void;
	exec<T>(job: () => T | Promise<T>, timeout: number): Promise<T>;
}
export function LimitFactory(opts: LimitOpts): Limit {
	const limitContextFactories: Array<LimitContextFactory> = [];

	if (opts.parallel) {
		let count = opts.parallel;
		if (count <= 0) {
			return throwConfigurationError("parallel count value should be above zero integer");
		}
		limitContextFactories.push(ParallelLimitContextFactory(count));
	}
	if (opts.perSecond) {
		const count = opts.perSecond;
		if (count <= 0) {
			return throwConfigurationError("perSecond count value should be above zero integer");
		}
		limitContextFactories.push(TimespanLimitContextFactory(1000/* 1 second */, count));
	}
	if (opts.perMinute) {
		let count = opts.perMinute;
		if (count <= 0) {
			return throwConfigurationError("perMinute count value should be above zero integer");
		}
		limitContextFactories.push(TimespanLimitContextFactory(1000 * 60/* 1 minute */, count));
	}
	if (opts.perHour) {
		let count = opts.perHour;
		if (count <= 0) {
			return throwConfigurationError("perHour count value should be above zero integer");
		}
		limitContextFactories.push(TimespanLimitContextFactory(1000 * 60 * 60/* 1 hour */, count));
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
		limitContextFactories.push(TimespanLimitContextFactory(delay, count));
	}

	function accrueTokenWithTimeout(timeout: number, cb: (context: LimitToken | null) => void): void {
		const cts: CancellationTokenSource = Task.createCancellationTokenSource();

		// const limitContextTasks: Array<Task<LimitToken>> = limitContextFactories.map(limitContextFactory => {
		// 	const limitContextTask = limitContextFactory(cts.token);
		// 	limitContextTask.catch((reason) => { cts.cancel(); throw reason; });
		// 	return limitContextTask;
		// });
	}
	function accrueToken(cb: (limitToken: LimitToken) => void): void {
		const cts: CancellationTokenSource = Task.createCancellationTokenSource();
		// TODO: Infinity Cancellation Token
		const errors: Array<any> = [];
		const limitContexts: Array<Promise<LimitToken | null>> = limitContextFactories.map(limitContextFactory => {
			const limitContextTask = limitContextFactory(cts.token);
			const safeLimitContextPromise = limitContextTask
				.catch((reason) => {
					cts.cancel();
					errors.push(reason);
					return null;
				});
			return safeLimitContextPromise;
		});
		Promise.all(limitContexts).then((rawLimitTokens) => {
			const limitTokens: Array<LimitToken> = rawLimitTokens.map(limitToken => {
				if (limitToken === null) { throw new AssertError(); }
				return limitToken;
			});
			const context: LimitToken = {
				remainTokens: Math.max(...limitTokens.map(limitToken => limitToken.remainTokens)),
				commit() { limitTokens.forEach(limitToken => limitToken.commit()); },
				rollback() { limitTokens.forEach(limitToken => limitToken.rollback()); }
			};
			cb(context);
		});
	}
	function accrueTokenOverrides(
		timeoutOrCb: number | ((context: LimitToken) => void),
		possibleCb?: (context: LimitToken | null) => void
	): void {
		if (typeof timeoutOrCb === "number") {
			if (!possibleCb) { throw new AssertError(); }
			accrueTokenWithTimeout(timeoutOrCb, possibleCb);
		} else {
			accrueToken(timeoutOrCb);
		}
	}

	function promisableAccrueToken(timeout: number): Promise<LimitToken | null> {
		if (timeout >= 0) {
			return new Promise(resolve => accrueTokenWithTimeout(timeout, resolve));
		} else {
			return new Promise(resolve => accrueToken(resolve));
		}
	}

	async function exec<T>(job: () => T | Promise<T>, timeout: number): Promise<T> {
		const token = await promisableAccrueToken(timeout);
		if (token === null) { throw new LimitError("LimitToken was not accrued in defined timeout"); }
		try {
			return await job();
		} finally {
			token.commit();
		}
	}

	return {
		accrueToken: accrueTokenOverrides,
		exec
	};

	// return async (job: Function, timeout: number = -1): Limit => {


	// 	try {
	// 		await Task.waitAll(limitContextTasks[0]);
	// 	} catch (e) {
	// 		limitContextTasks.forEach(limitContextTask => {
	// 			if (limitContextTask.isCompleted && !limitContextTask.isFaulted && !limitContextTask.isCancelled) {
	// 				limitContextTask.result.rollback();
	// 			}
	// 		});
	// 		throw e;
	// 	}

	// 	try {
	// 		//return await job();
	// 	} finally {
	// 		limitContextTasks.forEach(limitContextTask => limitContextTask.result.commit());
	// 	}
	// };
}
export default LimitFactory;


type LimitContextFactory = (cancellationToken: CancellationToken) => Task<LimitToken>;

interface Deferred {
	resolve: () => void;
	reject: (err: any) => void;
	promise: Promise<void>;
}

function createDefer(): Deferred {
	const deferred: any = {};
	deferred.promise = new Promise<void>((r, j) => {
		deferred.resolve = r;
		deferred.reject = j;
	});
	return deferred;
}

function throwConfigurationError(msg: string): never {
	throw new Error(`Wrong limit options: ${msg}`);
}

function TimespanLimitContextFactory(delay: number, count: number): LimitContextFactory {
	throw new Error("Not implemented yet");
}

function ParallelLimitContextFactory(parallelCount: number): LimitContextFactory {
	const activeLimitContexts: Array<LimitToken> = [];
	const queueLimitContexts: Array<[LimitToken/* context */, Deferred]> = [];
	function accureContext(context: LimitToken, cancellationToken: CancellationToken): Task<LimitToken> {
		if (activeLimitContexts.length < parallelCount) {
			activeLimitContexts.push(context);
			return new Task(() => context);
		} else {
			const deferred = createDefer();
			const tuple: [LimitToken/* context */, Deferred] = [context, deferred];
			queueLimitContexts.push(tuple);
			return new Task(async function () {
				if (cancellationToken.isCancellationRequested) {
					throw new CancelledError("Parallel Limit was cancelled");
				}
				cancellationToken.addCancelListener(function () {
					const tupleIndex = queueLimitContexts.indexOf(tuple);
					queueLimitContexts.splice(tupleIndex, 1);
					deferred.reject(new CancelledError("Parallel Limit was cancelled"));
				});
				await deferred.promise; // Wait for resolve
				{ // local scope
					const tupleIndex = queueLimitContexts.indexOf(tuple);
					queueLimitContexts.splice(tupleIndex, 1);
					activeLimitContexts.push(context);
				}
				return context;
			}, cancellationToken);
		}
	}
	function releaseContext(context: LimitToken) {
		const contextIndex = activeLimitContexts.indexOf(context);
		activeLimitContexts.splice(contextIndex, 1);
		if (queueLimitContexts.length > 0) {
			const deferred = queueLimitContexts[0][1];
			deferred.resolve();
			// Do not remove the item from queueLimitContexts.
			// This will happens in accureContext()
		}
	}
	const factory = (cancellationToken: CancellationToken): Task<LimitToken> => {
		const context = {
			remainTokens: 0,
			rollback() { releaseContext(context); },
			commit() { releaseContext(context); }
		};
		const task = accureContext(context, cancellationToken).start();
		const usedTokens = activeLimitContexts.length + queueLimitContexts.length;
		context.remainTokens = parallelCount > usedTokens ? parallelCount - usedTokens : 0;
		return task;
	};
	return factory;
}

class AssertError extends Error { }

export const VISIBLE_FOR_TEST = {
	throwConfigurationError,
	TimespanLimitContextFactory,
	ParallelLimitContextFactory
};
