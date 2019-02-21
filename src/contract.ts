import { CancellationTokenLike, DisposableLike } from "@zxteam/contract";

export class LimitError extends Error {
}
export interface LimitToken {
	rollback(): void;
	commit(): void;
}
export type TokenLazyCallback = (err: any, limitToken?: LimitToken) => void;

export namespace Limit {
	export interface Opts {
		perSecond?: number;
		perMinute?: number;
		perHour?: number;
		perTimespan?: {
			delay: number;
			count: number;
		};
		parallel?: number;
	}

	export function isLimitOpts(probablyOpts: any): probablyOpts is Opts {
		if (probablyOpts !== undefined && probablyOpts !== null) {
			if (typeof probablyOpts === "object") {
				let hasAnyFriendlyField = false;
				if ("perSecond" in probablyOpts) {
					if (!(probablyOpts.perSecond !== undefined && Number.isInteger(probablyOpts.perSecond))) {
						return false;
					}
					hasAnyFriendlyField = true;
				}
				if ("perMinute" in probablyOpts) {
					if (!(probablyOpts.perMinute !== undefined && Number.isInteger(probablyOpts.perMinute))) {
						return false;
					}
					hasAnyFriendlyField = true;
				}
				if ("perHour" in probablyOpts) {
					if (!(probablyOpts.perHour !== undefined && Number.isInteger(probablyOpts.perHour))) {
						return false;
					}
					hasAnyFriendlyField = true;
				}
				if ("perTimespan" in probablyOpts) {
					if (!(
						probablyOpts.perTimespan !== undefined
						&& Number.isInteger(probablyOpts.perTimespan.count)
						&& Number.isInteger(probablyOpts.perTimespan.delay))
					) {
						return false;
					}
					hasAnyFriendlyField = true;
				}
				if ("parallel" in probablyOpts) {
					if (!(probablyOpts.parallel !== undefined && Number.isInteger(probablyOpts.parallel))) {
						return false;
					}
					hasAnyFriendlyField = true;
				}
				if (hasAnyFriendlyField) {
					return true;
				}
			}
		}

		return false;
	}

	export function ensureLimitOpts(probablyOpts: any): Opts {
		if (isLimitOpts(probablyOpts)) {
			return probablyOpts;
		}
		throw new Error("Wrong argument for Limit Opts");
	}
}

export interface Limit extends DisposableLike {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueTokenImmediately(): LimitToken;

	accrueTokenLazy(timeout: number, cb: TokenLazyCallback): void;
	accrueTokenLazy(timeout: number): Promise<LimitToken>;

	accrueTokenLazy(cancellationToken: CancellationTokenLike, cb: TokenLazyCallback): void;
	accrueTokenLazy(cancellationToken: CancellationTokenLike): Promise<LimitToken>;

	accrueTokenLazy(timeout: number, cancellationToken: CancellationTokenLike, cb: TokenLazyCallback): void;
	accrueTokenLazy(timeout: number, cancellationToken: CancellationTokenLike): Promise<LimitToken>;

	//exec<T>(accrueTokenTimeout: number, job: () => T | Promise<T>): T;
	//exec<T>(accrueTokenTimeout: number, job: () => Promise<T>): Promise<T>;
	//addReleaseTokenListener(cb: (availableTokens: number) => void): void;
}
