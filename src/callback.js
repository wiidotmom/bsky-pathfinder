import {
	configureOAuth,
	finalizeAuthorization,
} from "@atcute/oauth-browser-client";

import { BASE_URL, CLIENT_ID } from "./constants";

configureOAuth({
	metadata: {
		client_id: CLIENT_ID,
		redirect_uri: `${BASE_URL}/oauth/callback`,
	},
});

const params = new URLSearchParams(location.hash.slice(1));
console.log(params);

history.replaceState(null, "", location.pathname + location.search);

const session = await finalizeAuthorization(params);

localStorage.setItem("actor", session.info.sub);

window.location.assign(BASE_URL);
