import { LimitFactory } from "./index";
import { Deferred } from "./internal/misc";
import { InternalParallelLimit } from "./internal/InternalParallelLimit";
import { InternalTimespanLimit } from "./internal/InternalTimespanLimit";
import { LimitError, LimitToken } from "./contract";

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function InternalParallelLimitSyncTest() {
	const factory = new InternalParallelLimit(2);
	let completedJobCount = 0;
	const jobPromises = [];

	let defer = Deferred.create<number>();
	factory.addReleaseTokenListener((availableTokens) => {
		if (availableTokens > 0) {
			defer.resolve(availableTokens);
			defer = Deferred.create();
		}
	});
	for (let taskId = 0; taskId < 1200; taskId++) {
		jobPromises.push(
			async (token: LimitToken) => {
				const jobCount = ++completedJobCount;
				console.log(`${jobCount} Job#${taskId} was run at ${new Date().toISOString()}`);
				await sleep(1000);
				token.commit();
				console.log(`${jobCount} Job#${taskId} was committed. Available Tokens: ${factory.availableTokens}`);
			});
	}
	{
		let token: LimitToken;
		let job: ((token: LimitToken) => Promise<void>) | undefined;
		while (job = jobPromises.shift()) {
			try {
				if (factory.availableTokens === 0) { await defer.promise; continue; }
				token = factory.accrueToken();
				job(token);
			} catch (e) {
				if (e instanceof LimitError) { await defer.promise; continue; }
				throw e;
			}
		}
	}

	console.log(`Starts at ${new Date().toISOString()}`);
	await Promise.all(jobPromises);
	console.log(`Ends at   ${new Date().toISOString()}`);
}

async function InternalTimespanLimitSyncTest() {
	const factory = new InternalTimespanLimit(1000, 3);
	let completedJobCount = 0;
	const jobPromises = [];

	let defer = Deferred.create<number>();
	factory.addReleaseTokenListener((availableTokens) => {
		if (availableTokens > 0) {
			defer.resolve(availableTokens);
			defer = Deferred.create();
		}
	});
	for (let taskId = 0; taskId < 1200; taskId++) {
		jobPromises.push(
			async (token: LimitToken) => {
				const jobCount = ++completedJobCount;
				console.log(`${jobCount} Job#${taskId} was run at ${new Date().toISOString()}`);
				await sleep(0);
				token.commit();
				console.log(`${jobCount} Job#${taskId} was committed. Available Tokens: ${factory.availableTokens}`);
			});
	}

	console.log(`Starts at ${new Date().toISOString()}`);
	{
		let token: LimitToken;
		let job: ((token: LimitToken) => Promise<void>) | undefined;
		while (job = jobPromises.shift()) {
			try {
				if (factory.availableTokens === 0) { await defer.promise; continue; }
				token = factory.accrueToken();
				job(token);
			} catch (e) {
				if (e instanceof LimitError) { await defer.promise; continue; }
				throw e;
			}
		}
	}
	console.log(`Ends at   ${new Date().toISOString()}`);
}

async function LimitFactoryViaPromiseTest() {
	const limit = LimitFactory({
		parallel: 2,
		perSecond: 5,
		perMinute: 30,
		perHour: 300
	});

	let completedJobCount = 0;
	const jobPromises = [];

	for (let taskId = 0; taskId < 120; taskId++) {
		jobPromises.push(
			limit.accrueTokenLazy(5000)
				.then(async (token) => {
					const jobCount = ++completedJobCount;
					console.log(`${jobCount} Job#${taskId} was run at ${new Date().toISOString()}`);
					await sleep(0);
					token.commit();
					console.log(`${jobCount} Job#${taskId} was committed. Available Tokens: ${limit.availableTokens}`);
				})
				.catch(reason => console.error(reason))
		);
	}

	console.log(`Starts at ${new Date().toISOString()}`);
	await Promise.all(jobPromises);
	console.log(`Ends at   ${new Date().toISOString()}`);
}

async function LimitFactoryViaCallableTest() {
	const limit = LimitFactory({
		perSecond: 15
		,
		perMinute: 300
		,
		perHour: 8000
		,
		parallel: 5
	});
	const taskCount = 10000;

	let completedJobCount = 0;
	const jobPromises: Array<(token: LimitToken) => Promise<void>> = [];

	for (let taskId = 0; taskId < taskCount; taskId++) {
		jobPromises.push(
			async (token: LimitToken) => {
				const jobCount = ++completedJobCount;
				//console.log(`${jobCount} Job#${taskId}   was   run   at ${new Date().toISOString()}`);
				await sleep(250);
				token.commit();
				console.log(`${jobCount} Job#${taskId} was committed at ${new Date().toISOString()}`);
			});
	}

	let completedJobs = 0;

	function tokenCallback(err: any, token: LimitToken): void {
		if (err || !token) { throw err; }
		const job = jobPromises.shift();
		if (job) {
			job(token).then(() => {
				completedJobs++;
				if (completedJobs === taskCount) {
					console.log(`Ends at   ${new Date().toISOString()}`);
				}
			});
			limit.accrueTokenLazy(10000000, tokenCallback);
		} else {
			token.rollback();
		}
	}

	console.log(`Starts at ${new Date().toISOString()}`);
	limit.accrueTokenLazy(10000000, tokenCallback);
}

async function LimitFactoryAccrueWithTimeoutTest() {
	const limit = LimitFactory({
		perSecond: 3,
		perMinute: 5
	});

	const token0 = limit.accrueTokenImmediately();
	const token1 = limit.accrueTokenImmediately();
	const token2 = limit.accrueTokenImmediately();

	let expectedException;
	try {
		await limit.accrueTokenLazy(50);
	} catch (e) {
		expectedException = e;
	}
	console.log(expectedException);
}

async function main() {
	await LimitFactoryViaCallableTest();
	//await LimitFactoryAccrueWithTimeoutTest();

	//await LimitFactoryViaPromiseTest();
}

console.log((process as any)._getActiveRequests());
console.log((process as any)._getActiveHandles());
console.log("============================");
main()
	.catch(async (reason) => {
		console.log(reason);
	})
	.then(async () => {
		console.log("Exit in 1 sec...");
		console.log((process as any)._getActiveRequests());
		console.log((process as any)._getActiveHandles());
		await sleep(1000);
	});
