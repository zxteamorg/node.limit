import { LimitToken } from "../contract";

export interface InternalLimit {
	readonly availableTokens: number;
	readonly maxTokens: number;
	addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	accrueToken(): LimitToken;
	destroy(): void;
	removeReleaseTokenListener(cb: (availableTokens: number) => void): void;
}

export abstract class InternalLimitSyncBase implements InternalLimit {
	private readonly _listeners: Array<(remainTokens: number) => void> = [];
	private _destoyed: boolean;
	public constructor() { this._destoyed = false; }
	public abstract get availableTokens(): number;
	public abstract get maxTokens(): number;
	public addReleaseTokenListener(cb: (availableTokens: number) => void): void { this._listeners.push(cb); }
	public abstract accrueToken(): LimitToken;
	public destroy(): void {
		if (!this._destoyed) {
			this.destroying();
			this._destoyed = true;
		}
	}
	public removeReleaseTokenListener(cb: (availableTokens: number) => void): void {
		const cbIndex = this._listeners.indexOf(cb);
		if (cbIndex !== -1) { this._listeners.splice(cbIndex, 1); }
	}
	protected abstract destroying(): void;
	protected raiseReleaseToken() {
		const availableTokens = this.availableTokens;
		if (this.availableTokens > 0) {
			this._listeners.forEach(listener => listener(availableTokens));
		}
	}
	protected verifyDestroy() {
		if (this._destoyed) {
			throw new Error("Wrong operation on destoyed object");
		}
	}
}

export class AssertError extends Error { }

export function throwConfigurationError(msg: string): never {
	throw new Error(`Wrong limit options: ${msg}`);
}
