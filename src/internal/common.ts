import { DisposableLike } from "@zxteam/contract";
import { Disposable } from "@zxteam/disposable";

import { LimitToken } from "../contract";

export interface InternalLimit extends DisposableLike {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueToken(): LimitToken;
	addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	removeReleaseTokenListener(cb: (availableTokens: number) => void): void;
	dispose(): Promise<void>;
}

export abstract class InternalLimitSyncBase extends Disposable implements InternalLimit {
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
