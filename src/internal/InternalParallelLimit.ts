import { LimitToken, LimitError } from "../contract";
import { InternalLimitSyncBase } from "./common";
import { Deferred } from "./misc";


export class InternalParallelLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private _activeTokenDefers: Array<Deferred>;

	public constructor(hitCount: number) {
		super();
		this._maxTokens = hitCount;
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
					defer.resolve();
					const index = this._activeTokenDefers.indexOf(defer);
					this._activeTokenDefers.splice(index, 1);
					defer = null;
					this.raiseReleaseToken();
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
		await Promise.all(this._activeTokenDefers);
	}
}
