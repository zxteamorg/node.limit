import { LimitToken } from "../contract";

export interface InternalLimit {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueToken(): LimitToken;
	addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	removeReleaseTokenListener(cb: (availableTokens: number) => void): void;
}

export abstract class InternalLimitSyncBase implements InternalLimit {
	private readonly _listeners: Array<(remainTokens: number) => void> = [];
	public abstract get availableTokens(): number;
	public abstract get maxTokens(): number;
	public abstract accrueToken(): LimitToken;
	public addReleaseTokenListener(cb: (availableTokens: number) => void): void { this._listeners.push(cb); }
	public removeReleaseTokenListener(cb: (availableTokens: number) => void): void {
		const cbIndex = this._listeners.indexOf(cb);
		if (cbIndex !== -1) { this._listeners.splice(cbIndex, 1); }
	}
	protected raiseReleaseToken() {
		const availableTokens = this.availableTokens;
		if (this.availableTokens > 0) {
			this._listeners.forEach(listener => listener(availableTokens));
		}
	}
}

export class AssertError extends Error { }

export function throwLimitConfigurationError(msg: string): never {
	throw new Error(`Wrong limit options: ${msg}`);
}
