import { LimitToken, LimitError } from "../contract";
import { InternalLimitSyncBase } from "./common";
import { Deferred } from "./misc";

export class InternalTimespanLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private _activeTokenDefers: Array<Deferred>;
	private readonly _delay: number;
	private readonly _clearTimeoutFunc: (handle?: number) => void;
	private readonly _setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number;
	private readonly _timers: Array<number> = [];

	public constructor(delay: number, hitCount: number,
		stubs: {
			clearTimeoutFunc: (handle?: number) => void,
			setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number
		}
			= { clearTimeoutFunc: clearTimeout, setTimeoutFunc: setTimeout }) {
		super();
		this._maxTokens = hitCount;
		this._delay = delay;
		this._clearTimeoutFunc = stubs.clearTimeoutFunc;
		this._setTimeoutFunc = stubs.setTimeoutFunc;
		this._activeTokenDefers = [];
	}

	public get availableTokens(): number {
		super.verifyNotDisposed();
		return this._maxTokens - this._activeTokenDefers.length;
	}

	public get maxTokens(): number {
		super.verifyNotDisposed();
		return this._maxTokens;
	}

	public accrueToken(): LimitToken {
		super.verifyNotDisposed();
		if (this.availableTokens === 0) { throw new LimitError("No any available tokens"); }
		let defer: Deferred | null = Deferred.create<void>();
		this._activeTokenDefers.push(defer);
		const token: LimitToken = {
			commit: () => {
				if (defer !== null) {
					const timer = this._setTimeoutFunc(() => {
						if (defer !== null) {
							const timerIndex = this._timers.indexOf(timer);
							if (timerIndex !== -1) { this._timers.splice(timerIndex, 1); }
							const index = this._activeTokenDefers.indexOf(defer);
							this._activeTokenDefers.splice(index, 1);
							defer.resolve();
							defer = null;
							this.raiseReleaseToken();
						}
					}, this._delay);
					this._timers.push(timer);
				}
			},
			rollback: () => {
				if (defer !== null) {
					defer.resolve();
					const index = this._activeTokenDefers.indexOf(defer);
					this._activeTokenDefers.splice(index, 1);
					defer = null;
					this.raiseReleaseToken();
				}
			}
		};
		return token as LimitToken;
	}

	protected async onDispose(): Promise<void> {
		this._timers.forEach(t => this._clearTimeoutFunc(t));
		await Promise.all(this._activeTokenDefers);
	}
}
