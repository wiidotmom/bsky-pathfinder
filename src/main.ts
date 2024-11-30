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
			}
			if (visitedEnd.has(neighbor)) {
				(
					document.querySelector("#path-edges") as HTMLSpanElement
				).textContent = `${edges.size}`;
				return edges;
			}
		}
		(
			document.querySelector("#path-edges") as HTMLSpanElement
		).textContent = `${edges.size}`;
		let currentEnd = queueEnd.shift()!;
		for (let neighbor of await getFollowers(currentEnd)) {
			if (!visitedEnd.has(neighbor)) {
				queueEnd.push(neighbor);
				visitedEnd.add(neighbor);
				edges.add(`${neighbor}$${currentEnd}`);
			}
			if (visitedStart.has(neighbor)) {
				(
					document.querySelector("#path-edges") as HTMLSpanElement
				).textContent = `${edges.size}`;
				return edges;
			}
		}
		(
			document.querySelector("#path-edges") as HTMLSpanElement
		).textContent = `${edges.size}`;
	}

	return new Set();
}

type SocialEdge = `${At.DID}$${At.DID}`;

async function djikstra(
	nodes: Set<At.DID>,
	edges: Set<SocialEdge>,
	s: At.DID,
	t: At.DID
): Promise<At.DID[]> {
	let dist: { [key: At.DID]: number } = {};
	let prev: { [key: At.DID]: At.DID } = {};
	let visited: Set<At.DID> = new Set();
	let q: At.DID[] = [];
	for (let node of nodes) {
		dist[node] = Number.MAX_VALUE;
	}
	dist[s] = 0;
	q.push(s);

	while (q.length && !visited.has(t)) {
		q.sort((a, b) => dist[a] - dist[b]);
		let u = q.pop()!;
		if (visited.has(u)) continue;
		visited.add(u);

		let neighbors: At.DID[] = Array.from(edges.entries())
			.map((y) => y[0])
			.filter((y) => y.startsWith(u))
			.map((y) => y.split("$")[1] as At.DID);
		for (let v of neighbors) {
			if (dist[v] > dist[u] + 1) {
				dist[v] = dist[u] + 1;
				q.push(v);
				prev[v] = u;
			}
		}
	}

	let path: At.DID[] = [];
	path.push(t);
	let u = t;
	while (u != s) {
		u = prev[u];
		path.push(u);
	}
	path.reverse();
	return path;
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
			try {
				let nodes = new Set<At.DID>();
				for (let edge of edges) {
					let [x, y] = (edge as SocialEdge).split("$");
					nodes.add(x as At.DID);
					nodes.add(y as At.DID);
				}
				console.log("hey girl");
				let path = await djikstra(nodes, edges, from.id, to.id);
				if (path.length > 1) {
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
										`<a target="_blank" href="web+at://${didToHandle[did]}">web+at://${didToHandle[did]}</a>`
								)
								.join(" 🡒 ");
							break;
						}
						case "https": {
							document.querySelector("#path-output")!.innerHTML = path
								.map(
									(did) =>
										`<a target="_blank" href="https://bsky.app/profile/${didToHandle[did]}">@${didToHandle[did]}</a>`
								)
								.join(" 🡒 ");
							break;
						}
						default: {
							document.querySelector("#path-output")!.innerHTML = path
								.map((did) => `@${didToHandle[did]}`)
								.join(" 🡒 ");
							break;
						}
					}
				} else {
					(
						document.querySelector("#path-output")! as HTMLSpanElement
					).textContent = "Path not found";
				}
			} catch (err: any) {
				(
					document.querySelector("#path-output")! as HTMLSpanElement
				).textContent = err.toString();
			}
		} else {
			(document.querySelector("#path-output")! as HTMLSpanElement).textContent =
				"Path not found";
		}
	}
});
