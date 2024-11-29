import { XRPC, XRPCResponse, simpleFetchHandler } from "@atcute/client";
import { resolveFromIdentity } from "@atcute/oauth-browser-client";
import {
	AppBskyGraphGetFollowers,
	AppBskyGraphGetFollows,
	At,
} from "@atcute/client/lexicons";
import "@atcute/bluesky/lexicons";

import { sleep } from "./util";

const handler = simpleFetchHandler({ service: "https://public.api.bsky.app" });
const rpc = new XRPC({ handler });

let didToHandle: { [key: At.DID]: string } = {};

let network_requests = 0;

async function getFollows(actor: At.DID) {
	let follows: At.DID[] = [];
	let prev_fetched = 100;
	let cursor = undefined;

	while (prev_fetched == 100) {
		const { data }: XRPCResponse<AppBskyGraphGetFollows.Output> = await rpc.get(
			"app.bsky.graph.getFollows",
			{
				params: {
					actor,
					limit: 100,
					cursor: cursor ? cursor : undefined,
				},
			}
		);
		network_requests++;
		(
			document.querySelector("#path-reqs") as HTMLSpanElement
		).textContent = `${network_requests}`;

		data.follows.forEach((x) => {
			follows.push(x.did);
			didToHandle[x.did] = x.handle;
		});

		prev_fetched = data.follows.length;
		cursor = data.cursor;
		await sleep(10);
	}

	return follows;
}

async function getFollowers(actor: At.DID) {
	let followers: At.DID[] = [];
	let prev_fetched = 100;
	let cursor = undefined;

	while (prev_fetched == 100) {
		const { data }: XRPCResponse<AppBskyGraphGetFollowers.Output> =
			await rpc.get("app.bsky.graph.getFollowers", {
				params: {
					actor,
					limit: 100,
					cursor: cursor ? cursor : undefined,
				},
			});

		network_requests++;
		(
			document.querySelector("#path-reqs") as HTMLSpanElement
		).textContent = `${network_requests}`;

		data.followers.forEach((x) => {
			followers.push(x.did);
			didToHandle[x.did] = x.handle;
		});

		prev_fetched = data.followers.length;
		cursor = data.cursor;
		await sleep(10);
	}

	return followers;
}

// https://medium.com/@zdf2424/discovering-the-power-of-bidirectional-bfs-a-more-efficient-pathfinding-algorithm-72566f07d1bd
async function bidirectionalSearch(
	start: At.DID,
	end: At.DID
): Promise<Set<SocialEdge>> {
	let queueStart: At.DID[] = [start];
	let queueEnd: At.DID[] = [end];
	let visitedStart = new Set();
	let visitedEnd = new Set();
	visitedStart.add(start);
	visitedEnd.add(end);

	let edges: Set<SocialEdge> = new Set();

	while (queueStart.length > 0 && queueEnd.length > 0) {
		let currentStart = queueStart.shift()!;
		for (let neighbor of await getFollows(currentStart)) {
			if (!visitedStart.has(neighbor)) {
				queueStart.push(neighbor);
				visitedStart.add(neighbor);
				edges.add(`${currentStart}$${neighbor}`);
				(
					document.querySelector("#path-edges") as HTMLSpanElement
				).textContent = `${edges.size}`;
			}
			if (visitedEnd.has(neighbor)) {
				return edges;
			}
		}
		let currentEnd = queueEnd.shift()!;
		for (let neighbor of await getFollowers(currentEnd)) {
			if (!visitedEnd.has(neighbor)) {
				queueEnd.push(neighbor);
				visitedEnd.add(neighbor);
				edges.add(`${neighbor}$${currentEnd}`);
				(
					document.querySelector("#path-edges") as HTMLSpanElement
				).textContent = `${edges.size}`;
			}
			if (visitedStart.has(neighbor)) {
				return edges;
			}
		}
	}

	return new Set();
}

type SocialEdge = `${At.DID}$${At.DID}`;

async function bfs(edges: Set<SocialEdge>, s: At.DID, t: At.DID) {
	if (s == t) return [s, t];
	let visited = new Set();
	const queue = [s];
	visited.add(s);
	let prev: { [key: At.DID]: At.DID } = {};
	while (queue.length) {
		let u = queue.pop()!;
		let neighbors: At.DID[] = Array.from(edges.entries())
			.map((y) => y[0])
			.filter((y) => y.startsWith(u))
			.map((y) => y.split("$")[1] as At.DID);
		for (let v of neighbors) {
			if (visited.has(v)) continue;
			visited.add(v);
			if (v === t) {
				var path = [v];
				while (u !== s) {
					path.push(u);
					u = prev[u];
				}
				path.push(u);
				path.reverse();
				const format_type = (
					document.querySelector("#display-format-at")! as HTMLInputElement
				).checked
					? "web+at"
					: (
							document.querySelector(
								"#display-format-https"
							)! as HTMLInputElement
					  ).checked
					? "https"
					: "none";
				switch (format_type) {
					case "web+at": {
						document.querySelector("#path-output")!.innerHTML = path
							.map(
								(did) =>
									`<a target="_blank" href="web+at://${didToHandle[did]}">at://${didToHandle[did]}</a>`
							)
							.join(" -> ");
						break;
					}
					case "https": {
						document.querySelector("#path-output")!.innerHTML = path
							.map(
								(did) =>
									`<a target="_blank" href="https://bsky.app/profile/${didToHandle[did]}">@${didToHandle[did]}</a>`
							)
							.join(" -> ");
						break;
					}
					default: {
						document.querySelector("#path-output")!.innerHTML = path
							.map((did) => `@${didToHandle[did]}`)
							.join(" -> ");
						break;
					}
				}
				return;
			}
			prev[v] = u;
			queue.push(v);
		}
	}
}

document.querySelector("#path-go")!.addEventListener("click", async () => {
	network_requests = 0;
	(
		document.querySelector("#path-reqs") as HTMLSpanElement
	).textContent = `${network_requests}`;
	(document.querySelector("#path-edges") as HTMLSpanElement).textContent = `0`;

	const { identity: from } = await resolveFromIdentity(
		(document.querySelector("#path-from")! as HTMLInputElement).value
	);
	const { identity: to } = await resolveFromIdentity(
		(document.querySelector("#path-to")! as HTMLInputElement).value
	);

	didToHandle[from.id] = from.raw;
	didToHandle[to.id] = to.raw;

	if (from && to) {
		const edges = await bidirectionalSearch(from.id, to.id);
		if (edges.size > 0) {
			let nodes = new Set<At.DID>();
			for (let edge of edges) {
				let [x, y] = (edge as SocialEdge).split("$");
				nodes.add(x as At.DID);
				nodes.add(y as At.DID);
			}
			bfs(edges, from.id, to.id);
		} else {
			(document.querySelector("#path-output")! as HTMLSpanElement).textContent =
				"Path not found";
		}
	}
});
