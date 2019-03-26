import { CancellationToken, Disposable } from "@zxteam/contract";

export class LimitError extends Error {
}
export interface LimitToken {
	rollback(): void;
	commit(): void;
}
export type TokenLazyCallback = (err: any, limitToken?: LimitToken) => void;

export namespace Limit {
	export type Weight = number;

	export interface Opts {
		perSecond?: Weight;
		perMinute?: Weight;
		perHour?: Weight;
		perTimespan?: {
			delay: number;
			count: Weight;
		};
		parallel?: Weight;
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

export interface Limit extends Disposable {
	readonly availableWeight: number;
	readonly maxWeight: number;

	/**
	 * @param tokenWeight default: 1
	 */
	accrueTokenImmediately(): LimitToken;
	accrueTokenImmediately(tokenWeight: Limit.Weight): LimitToken;

	accrueTokenLazy(timeout: number): Promise<LimitToken>;	// 1
	accrueTokenLazy(cancellationToken: CancellationToken): Promise<LimitToken>; // 2

	accrueTokenLazy(timeout: number, cb: TokenLazyCallback): void; // 3
	accrueTokenLazy(cancellationToken: CancellationToken, cb: TokenLazyCallback): void; // 4
	accrueTokenLazy(timeout: number, cancellationToken: CancellationToken): Promise<LimitToken>; // 5
	accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number): Promise<LimitToken>; // 6

	accrueTokenLazy(timeout: number, cancellationToken: CancellationToken, cb: TokenLazyCallback): void; // 7
	accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cb: TokenLazyCallback): void; // 8
	accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cancellationToken: CancellationToken): Promise<LimitToken>; // 9

	accrueTokenLazy(tokenWeight: Limit.Weight, timeout: number, cancellationToken: CancellationToken, cb: TokenLazyCallback): void; // 10

	//exec<T>(accrueTokenTimeout: number, job: () => T | Promise<T>): T;
	//exec<T>(accrueTokenTimeout: number, job: () => Promise<T>): Promise<T>;
	//addReleaseTokenListener(cb: (availableTokens: number) => void): void;
}
