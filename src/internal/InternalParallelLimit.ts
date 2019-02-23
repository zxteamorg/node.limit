import { LimitToken, LimitError, Limit } from "../contract";
import { InternalLimitSyncBase } from "./common";
import { TokenDeferred } from "./misc";

type LimitTokenDeferred = TokenDeferred & { finalize: () => void };

export class InternalParallelLimit extends InternalLimitSyncBase {
	private readonly _maxWeight: number;
	private _activeTokenDefers: Array<TokenDeferred>;

	public constructor(totalWeight: Limit.Weight) {
		super();
		this._maxWeight = totalWeight;
		this._activeTokenDefers = [];
	}

	public get availableWeight(): number {
		if (super.disposed) { throw new Error("Wrong operation on disposed object"); }
		return this._maxWeight - this._activeTokenDefers.reduce((p, c) => p + c.weight, 0);
	}

	public get maxWeight(): number {
		if (super.disposed) { throw new Error("Wrong operation on disposed object"); }
		return this._maxWeight;
	}

	public accrueToken(weight: Limit.Weight): LimitToken {
		super.verifyNotDisposed();
		if (this.availableWeight < weight) { throw new LimitError("No any available tokens"); }

		let defer: LimitTokenDeferred | null = null;
		{ // local scope
			const realDefer: LimitTokenDeferred = {
				...TokenDeferred.create<void>(weight),
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
