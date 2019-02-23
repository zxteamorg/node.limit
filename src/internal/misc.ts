import { Limit } from "..";

export interface TokenDeferred<T = any> {
	weight: Limit.Weight;
	resolve: (value?: T) => void;
	reject: (err: any) => void;
	promise: Promise<T>;
}

export namespace TokenDeferred {
	export function create<T>(weight: Limit.Weight): TokenDeferred<T> {
		const deferred: any = { weight };
		deferred.promise = new Promise<void>((r, j) => {
			deferred.resolve = r;
			deferred.reject = j;
		});
		return deferred;
	}
}
