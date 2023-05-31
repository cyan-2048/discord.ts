console.info("discord.ts worker init");

import DiscordXHR, { XHROptions, ProgressObject } from "./DiscordXHR";
import { GatewayBase } from "./DiscordGateway";

type KeyOfType<T, V> = keyof {
	[P in keyof T as T[P] extends V ? P : never]: any;
};

export type XHRAction = [
	"xhr",
	{
		readonly hash: string;
		readonly url: string;
		readonly params: XHROptions;
	}
];

type gatewayMethods = KeyOfType<GatewayBase, ((...arr: any[]) => any) | (() => void)>;

export type GatewayAction = [
	"gateway",
	{
		readonly method: gatewayMethods;
		readonly params: Parameters<GatewayBase[gatewayMethods]>;
	}
];

export type WorkerXHRResponse = [
	"xhr",
	{
		readonly hash: string;
		readonly data?: any;
		readonly error?: any;
	}
];

export type WorkerXHRProgress = [
	"xhr:progress",
	{
		readonly hash: string;
		readonly data: ProgressObject;
	}
];

export type WorkerGatewayResponse = [
	"gateway",
	{
		readonly event: string;
		readonly data: any;
	}
];

type WorkerActions = XHRAction | GatewayAction;
export type WorkerEvents = "setupXHR" | "setupGateway" | "debug" | WorkerActions;
export type WorkerResponse =
	| "xhrReady"
	| "gatewayReady"
	| WorkerXHRProgress
	| WorkerXHRResponse
	| WorkerGatewayResponse;

let XHR: DiscordXHR, GATEWAY: GatewayBase, TOKEN: string;

function emit<T extends Extract<WorkerResponse, object>[0]>(
	action: T | WorkerResponse,
	options?: Extract<WorkerResponse, [T, any]>[1]
) {
	if (options && typeof action == "string") {
		postMessage([action, options]);
	} else {
		postMessage(action);
	}
}

addEventListener("message", async ({ data }: { data: WorkerEvents }) => {
	if (typeof data == "string") {
		switch (data) {
			case "setupXHR":
				XHR = new DiscordXHR(TOKEN);
				emit("xhrReady");
				break;
			case "setupGateway":
				if (GATEWAY) GATEWAY.close();
				GATEWAY = new GatewayBase();
				GATEWAY.on("*", (event: string, ...data) => {
					emit("gateway", { event, data });
				});
				emit("gatewayReady");
				break;
			case "debug":
				GATEWAY && (GATEWAY._debug = true);
				break;
		}
	} else {
		const [action, options] = data;
		if (action == "xhr") {
			if (!XHR) return console.error("XHR not ready");
			const { hash, url, params } = options;
			try {
			} catch (err) {
				const e = err as XMLHttpRequest;

				const { response, status } = e;

				emit("xhr", { hash, error: { response, status } });
			}
			const resp = await XHR.xhr(url, {
				...params,
				onProgress: (e) => {
					emit("xhr:progress", { hash, data: e });
				},
			});
			emit("xhr", { hash, data: resp });
		} else {
			if (!GATEWAY) return console.error("Gateway not ready");
			const { method, params } = options;
			if (method == "login") {
				TOKEN = params[0] as string;
				if (XHR) XHR.token = TOKEN;
			}

			// @ts-ignore
			GATEWAY[method](...params);
		}
	}
});
