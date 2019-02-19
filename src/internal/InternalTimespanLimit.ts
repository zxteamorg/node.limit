import { LimitToken, LimitError } from "../contract";
import { InternalLimitSyncBase } from "./common";
import { Deferred } from "./misc";

type LimitTokenDeferred = Deferred & { finalize: () => void, finalizing: boolean };

export class InternalTimespanLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private _activeTokenDefers: Array<LimitTokenDeferred>;
	private readonly _delay: number;
	private readonly _clearTimeoutFunc: (handle?: number) => void;
	private readonly _setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number;
	private readonly _timers: Array<number> = [];

	public constructor(delay: number, hitCount: number,
		stubs: {
			clearTimeoutFunc: (handle?: number) => void,
			setTimeoutFunc: (handler: TimerHandler, timeout?: number) => number
		}
			= {
				clearTimeoutFunc: (...args) => clearTimeout(...args),
				setTimeoutFunc: (...args) => setTimeout(...args)
			}
	) {
		super();
		this._maxTokens = hitCount;
		this._delay = delay;
		this._clearTimeoutFunc = stubs.clearTimeoutFunc;
		this._setTimeoutFunc = stubs.setTimeoutFunc;
		this._activeTokenDefers = [];
	}

	public get availableTokens(): number {
		if (super.disposed) { throw new Error("Wrong operation on disposed object"); }
		return this._maxTokens - this._activeTokenDefers.length;
	}

	public get maxTokens(): number {
		if (super.disposed) { throw new Error("Wrong operation on disposed object"); }
		return this._maxTokens;
	}

	public accrueToken(): LimitToken {
		super.verifyNotDisposed();
		if (this.availableTokens === 0) { throw new LimitError("No any available tokens"); }

		let defer: LimitTokenDeferred | null = null;
		{ // local scope
			const realDefer: LimitTokenDeferred = {
				...Deferred.create<void>(),
				finalize: () => {
					realDefer.resolve();
					const index = this._activeTokenDefers.indexOf(realDefer);
					this._activeTokenDefers.splice(index, 1);
					this.raiseReleaseToken();
				},
				finalizing: false
			};
			this._activeTokenDefers.push(realDefer);
			defer = realDefer;
		}

		const token: LimitToken = {
			commit: () => {
				if (defer !== null) {
					const selfDefer = defer;
					defer = null;
					selfDefer.finalizing = true;
					if (!super.disposing) {
						const timer = this._setTimeoutFunc(() => {
							const timerIndex = this._timers.indexOf(timer);
							if (timerIndex !== -1) { this._timers.splice(timerIndex, 1); }
							selfDefer.finalize();
						}, this._delay);
						this._timers.push(timer);
					} else {
						selfDefer.finalize();
					}
				}
			},
			rollback: () => {
				if (defer !== null) {
					const selfDefer = defer;
					defer = null;
					selfDefer.finalizing = true;
					selfDefer.finalize();
				}
			}
		};
		return token as LimitToken;
	}

	protected async onDispose(): Promise<void> {
		this._timers.slice().forEach(timer => {
			this._clearTimeoutFunc(timer);
			const timerIndex = this._timers.indexOf(timer);
			if (timerIndex !== -1) { this._timers.splice(timerIndex, 1); }
		});
		this._activeTokenDefers.filter(w => w.finalizing).forEach(d => d.finalize());
		await Promise.all(this._activeTokenDefers.map(d => d.promise));
	}
}
