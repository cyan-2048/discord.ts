import DiscordGateway from "./DiscordGateway";
import DiscordXHR, { ProgressObject, XHROptions } from "./DiscordXHR";
import MFA from "./MFA";
import { WorkerResponse } from "./worker";

class ProxiedDiscordXHR extends DiscordXHR {
	constructor(private worker: Worker) {
		super();
	}

	// some requests require the main thread
	#xhr = new DiscordXHR();

	_postProgress?: (e: ProgressObject) => void;

	#token = "";

	get token() {
		return this.#token;
	}
	set token(val: string) {
		this.#xhr.token = val;
		this.worker.postMessage([
			"gateway",
			{
				method: "login",
				params: [val],
			},
		]);
	}

	hash = Math.ceil(Math.random() * 100);

	async xhr(url: string, { onProgress, ...options }: XHROptions = {}) {
		// we need the main thread if you want the XHR object to be returned
		if (options.response === false) {
			return this.#xhr.xhr(url, options);
		}

		this.hash++;
		const hash = "xhr-" + this.hash;

		this.worker.postMessage([
			"xhr",
			{
				hash,
				url,
				params: options,
			},
		]);

		return new Promise((resolve, reject) => {
			const worker = this.worker;
			worker.addEventListener("message", function e({ data }: { data: WorkerResponse }) {
				if (!Array.isArray(data)) return;
				const [type, obj] = data;

				if (!("hash" in obj) || obj.hash != hash) return;

				if (type == "xhr") {
					worker.removeEventListener("message", e);
					if (obj.error) reject(obj.error);
					else resolve(obj.data);
				} else if (onProgress) {
					onProgress(obj.data);
				}
			});
		});
	}
}
export default class Discord {
	gateway: DiscordGateway;
	_xhr: DiscordXHR;
	_worker?: Worker;
	xhr: DiscordXHR["xhr"];

	constructor(props: boolean | { debug?: boolean; worker?: boolean } = false) {
		const isBoolean = typeof props === "boolean";
		const debug = isBoolean ? props : props.debug;
		let worker = isBoolean ? true : props.worker;

		// @ts-ignore vite
		if (import.meta.env.DEV) {
			// esm web workers doesn't work on Firefox
			if (navigator.userAgent.search("Firefox") > 0) worker = false;
		}

		if (worker) {
			// @ts-ignore vite
			const _worker = (this._worker = new Worker(new URL("./worker.ts", import.meta.url), {
				type: "module",
			}));

			this.gateway = new DiscordGateway({ debug, worker: true }, this);
			this._xhr = new ProxiedDiscordXHR(_worker);
		} else {
			this.gateway = new DiscordGateway({ debug, worker: false }, this);
			this._xhr = new DiscordXHR();
		}

		const _xhr = this._xhr;
		this.xhr = _xhr.xhr.bind(_xhr);
	}

	async login(token: string) {
		await this.gateway.login(token);
		this._xhr.token = token;
		this.gateway.xhr = this.xhr;
	}

	async signin(email: string, password: string): Promise<MFA | string> {
		const resp = (await this.xhr("auth/login", {
			method: "post",
			data: { email, password },
		})) as any;
		if (resp.errors) throw resp;
		if (resp.captcha_service) {
			throw new Error("you are being captcha-ed! please use a token instead.");
		}
		if (resp.mfa) return new MFA(resp.mfa);
		return resp.token;
	}
}

// fucking vite
export type { Readable, Writable } from "svelte/store";

export { get, writable, readable, derived } from "svelte/store";
