import {
	configureOAuth,
	createAuthorizationUrl,
	resolveFromIdentity,
	OAuthUserAgent,
	deleteStoredSession,
	getSession,
} from "@atcute/oauth-browser-client";

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
} else {
	document.querySelector("#authorize").addEventListener("click", async (e) => {
		const handle = document.querySelector("#handle").value;
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
