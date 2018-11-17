import { LimitToken, LimitError } from "../contract";

import { InternalLimitSyncBase } from "./common";


export class InternalParallelLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private _availableTokens: number;
	public constructor(hitCount: number) {
		super();
		this._maxTokens = hitCount;
		this._availableTokens = hitCount;
	}

	public get availableTokens(): number {
		this.verifyDestroy();
		return this._availableTokens;
	}

	public get maxTokens(): number {
		this.verifyDestroy();
		return this._maxTokens;
	}

	public accrueToken(): LimitToken {
		this.verifyDestroy();
		if (this._availableTokens === 0) { throw new LimitError("No any available tokens"); }
		this._availableTokens--;
		let tokenDisposed = false;
		const token: LimitToken = {
			commit: () => {
				if (!tokenDisposed) {
					tokenDisposed = true;
					this._commitToken(token);
				}
			},
			rollback: () => {
				if (!tokenDisposed) {
					tokenDisposed = true;
					this._rollbackToken(token);
				}
			}
		};
		return token as LimitToken;
	}

	protected destroying(): void {
		// do nothing in this limit
	}

	private _commitToken(token: LimitToken): void {
		this._availableTokens++;
		this.raiseReleaseToken();
	}

	private _rollbackToken(token: LimitToken): void {
		this._availableTokens++;
		this.raiseReleaseToken();
	}
}
