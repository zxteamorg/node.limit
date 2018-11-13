import Task from "ptask.js";

import { LimitFactory, Limit, LimitOpts } from "./index";

async function main() {
	// Setup CryptoCompare limits
	// const limit = LimitFactory({
	// 	perSecond: 15,
	// 	perMinute: 300,
	// 	perHour: 8000
	// });

	const limit = LimitFactory({
		parallel: 2
	});

	const jobPromises = [];
	let completedJobCount = 0;
	for (let attempt = 0; attempt < 40; attempt++) {
		jobPromises.push(
			limit.exec(
				async () => {
					const now = new Date();
					++completedJobCount;
					console.log(`${completedJobCount} Job#${attempt} was run at ${now.toTimeString()}`);
					await Task.sleep(250);
				},
				-1
			)
		);
	}
	await Promise.all(jobPromises);
}

main().catch(async (reason) => {
	console.log(reason);
	await Task.sleep(1000);
});
