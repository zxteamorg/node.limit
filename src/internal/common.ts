import * as zxteam from "@zxteam/contract";
import { Disposable } from "@zxteam/disposable";

import { LimitToken, Limit } from "../contract";

export interface InternalLimit {
	readonly availableWeight: number;
	readonly maxWeight: number;
	accrueToken(weight: Limit.Weight): LimitToken;
	addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	removeReleaseTokenListener(cb: (availableTokens: number) => void): void;
	dispose(): Promise<void>;
}

export abstract class InternalLimitSyncBase extends Disposable implements InternalLimit {
	private readonly _listeners: Array<(remainTokens: number) => void> = [];
	public abstract get availableWeight(): number;
	public abstract get maxWeight(): number;
	public abstract accrueToken(weight: Limit.Weight): LimitToken;
	public addReleaseTokenListener(cb: (availableTokens: number) => void): void { this._listeners.push(cb); }
	public removeReleaseTokenListener(cb: (availableTokens: number) => void): void {
		const cbIndex = this._listeners.indexOf(cb);
		if (cbIndex !== -1) { this._listeners.splice(cbIndex, 1); }
	}
	protected raiseReleaseToken() {
		const availableTokens = this.availableWeight;
		if (this.availableWeight > 0) {
			this._listeners.forEach(listener => listener(availableTokens));
		}
	}
}

export class AssertError extends Error { }

export function throwLimitConfigurationError(msg: string): never {
	throw new Error(`Wrong limit options: ${msg}`);
}
