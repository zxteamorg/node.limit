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
	rollback(): void;
	commit(): void;
}
export interface Limit {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueTokenImmediately(): LimitToken;
	accrueTokenLazy(timeout: number): Promise<LimitToken>;
	accrueTokenLazy(timeout: number, cb: (err: any, limitToken?: LimitToken) => void): void;
	//exec<T>(accrueTokenTimeout: number, job: () => T | Promise<T>): T;
	//exec<T>(accrueTokenTimeout: number, job: () => Promise<T>): Promise<T>;
	//addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	destroy(): void;
}
