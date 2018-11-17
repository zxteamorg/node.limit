import { LimitToken, LimitError } from "../contract";

import { InternalLimitSyncBase } from "./common";

export class InternalTimespanLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private readonly _delay: number;
	private readonly _clearTimeoutFunc: (handle?: number) => void;
	private readonly _setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number;
	private readonly _timers: Array<number> = [];
	private _availableTokens: number;

	public constructor(delay: number, hitCount: number,
		stubs: { clearTimeoutFunc: (handle?: number) => void, setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number }
			= { clearTimeoutFunc: clearTimeout, setTimeoutFunc: setTimeout }) {
		super();
		this._maxTokens = hitCount;
		this._delay = delay;
		this._clearTimeoutFunc = stubs.clearTimeoutFunc;
		this._setTimeoutFunc = stubs.setTimeoutFunc;
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
					this._commitToken();
				}
			},
			rollback: () => {
				if (!tokenDisposed) {
					tokenDisposed = true;
					this._rollbackToken();
				}
			}
		};
		return token as LimitToken;
	}

	protected destroying(): void {
		this._timers.forEach(t => this._clearTimeoutFunc(t));
	}

	private _commitToken(): void {
		const timer = this._setTimeoutFunc(() => {
			const timerIndex = this._timers.indexOf(timer);
			if (timerIndex !== -1) { this._timers.splice(timerIndex, 1); }
			this._availableTokens++;
			this.raiseReleaseToken();
		}, this._delay);
		this._timers.push(timer);
	}

	private _rollbackToken(): void {
		this._availableTokens++;
		this.raiseReleaseToken();
	}
}
