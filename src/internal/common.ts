import { LimitToken } from "../contract";

export interface InternalLimit {
	readonly availableTokens: number;
	readonly maxTokens: number;
	accrueToken(): LimitToken;
	addReleaseTokenListener(cb: (availableTokens: number) => void): void;
	dispose(): Promise<void>;
	removeReleaseTokenListener(cb: (availableTokens: number) => void): void;
}

export abstract class Disposable {
	private _disposed?: boolean;
	private _disposingPromise?: Promise<void>;

	public get disposed(): boolean { return !!this._disposed; }
	public get disposing(): boolean { return !!this._disposingPromise; }

	public dispose(): Promise<void> {
		if (!this._disposed) {
			if (!this._disposingPromise) {
				this._disposingPromise = this.onDispose();
			}
			return this._disposingPromise.then(() => {
				this._disposed = true;
				delete this._disposingPromise;
			});
		}
		return Promise.resolve();
	}

	protected abstract onDispose(): Promise<void>;

	protected verifyDestroy() {
		if (this.disposed || this.disposing) {
			throw new Error("Wrong operation on disposed object");
		}
	}
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

export function throwConfigurationError(msg: string): never {
	throw new Error(`Wrong limit options: ${msg}`);
}
