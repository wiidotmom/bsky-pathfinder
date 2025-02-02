import { resolve } from "path";
import { defineConfig } from "vite";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 5173;

export default defineConfig({
	base: "/tools/bsky-pathfinder",
	server: {
		host: SERVER_HOST,
		port: SERVER_PORT,
	},
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
			},
		},
		target: "esnext",
	},
});
