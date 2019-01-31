import { DisposableLike } from "@zxteam/contract";

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
}

export interface Limit extends DisposableLike {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueTokenImmediately(): LimitToken;
	accrueTokenLazy(timeout: number): Promise<LimitToken>;
	accrueTokenLazy(timeout: number, cb: TokenLazyCallback): void;
	//exec<T>(accrueTokenTimeout: number, job: () => T | Promise<T>): T;
	//exec<T>(accrueTokenTimeout: number, job: () => Promise<T>): Promise<T>;
	//addReleaseTokenListener(cb: (availableTokens: number) => void): void;
}
