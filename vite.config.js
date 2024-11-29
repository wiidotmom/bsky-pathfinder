import { resolve } from "path";
import { defineConfig } from "vite";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 5173;

export default defineConfig({
	server: {
		host: SERVER_HOST,
		port: SERVER_PORT,
	},
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				callback: resolve(__dirname, "oauth/callback.html"),
			},
		},
		target: "esnext",
	},
});
