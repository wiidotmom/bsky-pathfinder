import {
	configureOAuth,
	createAuthorizationUrl,
	resolveFromIdentity,
	OAuthUserAgent,
	deleteStoredSession,
	getSession,
} from "@atcute/oauth-browser-client";
import { XRPC } from "@atcute/client";

import { BASE_URL, CLIENT_ID } from "./constants";
import { sleep } from "./util";

configureOAuth({
	metadata: {
		client_id: CLIENT_ID,
		redirect_uri: `${BASE_URL}/oauth/callback`,
	},
});

const params = new URL(window.location).searchParams;

if (
	localStorage.getItem("atcute-oauth:sessions") &&
	JSON.parse(localStorage.getItem("atcute-oauth:sessions")) &&
	localStorage.getItem("actor") in
		JSON.parse(localStorage.getItem("atcute-oauth:sessions"))
) {
	const actor = localStorage.getItem("actor");

	document.querySelector("#unauthorized").style.display = "none";
	document.querySelector("#authorized").style.display = "block";

	document.querySelector("#authorized-did").textContent = actor;

	document.querySelector("#logout").addEventListener("click", async () => {
		try {
			const session = await getSession(actor, { allowStale: true });
			const agent = new OAuthUserAgent(session);

			await agent.signOut();
		} catch (err) {
			deleteStoredSession(actor);
		}

		window.location.reload();
	});

	const session = await getSession(actor, { allowStale: true });

	const agent = new OAuthUserAgent(session);
	const rpc = new XRPC({ handler: agent });

	async function getFollows(actor) {
		let follows = [];
		let prev_fetched = 100;
		let cursor = null;

		let addViewer = false;
		while (prev_fetched == 100) {
			const { data } = await rpc.get("app.bsky.graph.getFollows", {
				params: {
					actor,
					limit: 100,
					cursor: cursor ? cursor : null,
				},
			});

			if (data.subject.viewer && data.subject.viewer.following)
				addViewer = true;
			data.follows.forEach((x) => follows.push(x.did));

			prev_fetched = data.follows.length;
			cursor = data.cursor;
			await sleep(10);
		}

		if (addViewer) follows.push(agent.sub);

		return follows;
	}

	async function getFollowers(actor) {
		let followers = [];
		let prev_fetched = 100;
		let cursor = null;

		let addViewer = false;
		while (prev_fetched == 100) {
			const { data } = await rpc.get("app.bsky.graph.getFollowers", {
				params: {
					actor,
					limit: 100,
					cursor: cursor ? cursor : null,
				},
			});

			if (data.subject.viewer && data.subject.viewer.followedBy)
				addViewer = true;
			data.followers.forEach((x) => followers.push(x.did));

			prev_fetched = data.followers.length;
			cursor = data.cursor;
			await sleep(10);
		}

		if (addViewer) followers.push(agent.sub);

		return followers;
	}

	// https://medium.com/@zdf2424/discovering-the-power-of-bidirectional-bfs-a-more-efficient-pathfinding-algorithm-72566f07d1bd
	async function bidirectionalSearch(start, end) {
		let queueStart = [start];
		let queueEnd = [end];
		let visitedStart = new Set();
		let visitedEnd = new Set();
		visitedStart.add(start);
		visitedEnd.add(end);

		let edges = new Set();

		while (queueStart.length > 0 && queueEnd.length > 0) {
			let currentStart = queueStart.shift();
			for (let neighbor of await getFollows(currentStart)) {
				if (!visitedStart.has(neighbor)) {
					queueStart.push(neighbor);
					visitedStart.add(neighbor);
					edges.add(`${currentStart}$${neighbor}`);
				}
				if (visitedEnd.has(neighbor)) {
					return edges;
				}
			}
			let currentEnd = queueEnd.shift();
			for (let neighbor of await getFollowers(currentEnd)) {
				if (!visitedEnd.has(neighbor)) {
					queueEnd.push(neighbor);
					visitedEnd.add(neighbor);
					edges.add(`${neighbor}$${currentEnd}`);
				}
				if (visitedStart.has(neighbor)) {
					return edges;
				}
			}
			document.querySelector("#path-edges").textContent = edges.size;
		}

		return new Set();
	}

	async function bfs(nodes, edges, s, t) {
		if (s == t) return [s, t];
		let visited = new Set();
		const queue = [s];
		visited.add(s);
		let prev = {};
		while (queue.length) {
			let u = queue.pop();
			let neighbors = edges
				.entries()
				.map((y) => y[0])
				.filter((y) => y.startsWith(u))
				.map((y) => y.split("$")[1]);
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
					console.log(path);
					let identitiesPath = await Promise.all(
						path.map(async (did) => {
							const response = await fetch(`https://plc.directory/${did}`);
							return (await response.json()).alsoKnownAs.find((x) =>
								x.startsWith("at://")
							);
						})
					);
					console.log(identitiesPath);
					document.querySelector("#path-output").textContent =
						identitiesPath.join(" -> ");
					return;
				}
				prev[v] = u;
				queue.push(v);
			}
		}
		return path;
	}

	document.querySelector("#path-go").addEventListener("click", async () => {
		const { identity: from } = await resolveFromIdentity(
			document.querySelector("#path-from").value
		);
		const { identity: to } = await resolveFromIdentity(
			document.querySelector("#path-to").value
		);

		if (from && to) {
			const edges = await bidirectionalSearch(from.id, to.id);
			if (edges.size > 0) {
				document.querySelector("#path-edges").textContent = edges.size;
				let nodes = new Set();
				for (let edge of edges) {
					let [x, y] = edge.split("$");
					nodes.add(x);
					nodes.add(y);
				}
				bfs(nodes, edges, from.id, to.id);
			} else {
				document.querySelector("#path-output").textContent = "Path not found";
			}
		}
	});
} else {
	document
		.querySelector("#authorize-go")
		.addEventListener("click", async (e) => {
			const handle = document.querySelector("#authorize-handle").value;
			const { identity, metadata } = await resolveFromIdentity(handle);

			console.log(identity);

			const authUrl = await createAuthorizationUrl({
				metadata: metadata,
				identity: identity,
				scope: "atproto transition:generic",
			});

			await sleep(200);

			window.location.assign(authUrl);

			await new Promise((_resolve, reject) => {
				const listener = () => {
					reject(new Error(`user aborted the login request`));
				};

				window.addEventListener("pageshow", listener, { once: true });
			});
		});
}
