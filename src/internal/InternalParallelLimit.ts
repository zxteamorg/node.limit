import { LimitToken, LimitError } from "../contract";
import { InternalLimitSyncBase } from "./common";
import { Deferred } from "./misc";

type LimitTokenDeferred = Deferred & { finalize: () => void };

export class InternalParallelLimit extends InternalLimitSyncBase {
	private readonly _maxTokens: number;
	private _activeTokenDefers: Array<Deferred>;

	public constructor(hitCount: number) {
		super();
		this._maxTokens = hitCount;
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
				}
			};
			this._activeTokenDefers.push(realDefer);
			defer = realDefer;
		}

		const token: LimitToken = {
			commit: () => {
				if (defer !== null) {
					defer.finalize();
				}
			},
			rollback: () => {
				if (defer !== null) {
					defer.finalize();
				}
			}
		};
		return token as LimitToken;
	}

	protected async onDispose(): Promise<void> {
		await Promise.all(this._activeTokenDefers.map(d => d.promise));
	}
}
