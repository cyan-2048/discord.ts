export type HeadersOption = {
	[key: string]: string;
};

export type XHRMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace" | "connect";
export type XHROptions = {
	method?: XHRMethod;
	headers?: HeadersOption;
	data?: object | XMLHttpRequestBodyInit;
	response?: boolean;
	responseType?: XMLHttpRequestResponseType;
};

function isJSON<T = unknown>(object: T) {
	const type = typeof object;

	if (["number", "string", "boolean"].includes(type) || object === null) return true;
	if (object === undefined) return false;
	if (type === "object") {
		return object.constructor === Object || object.constructor === Array;
	}
}

function fullURL(path = "/") {
	const base = "https://discord.com";

	if (path.startsWith("http")) {
		return path;
	}

	if (path.startsWith("/")) {
		return base + path;
	}

	return `${base}/api/v9/${path}`;
}

export default class DiscordXHR {
	_postProgress?: (e: ProgressEvent) => void;

	constructor(public token?: string) {}

	xhr(url: string, { method = "get", headers = {}, data, response = true, responseType = "json" }: XHROptions = {}): Promise<any> {
		return new Promise((res, rej) => {
			// @ts-ignore: kaios
			const xhr = new XMLHttpRequest({ mozAnon: true, mozSystem: true });

			if (method === "post") xhr.upload.onprogress = this._postProgress || null;
			xhr.responseType = responseType;
			xhr.open(method, fullURL(url), true);

			const hdr = {
				"Content-Type": "application/json",
				authorization: this.token || null,
				...headers,
			};
			Object.entries(hdr).forEach(([a, b]) => {
				if (a && b) xhr.setRequestHeader(a, b.replace(/\r?\n|\r/g, "")); // nodejs http bug
			});

			// reject if status is not 2xx
			xhr.onloadend = () => {
				if (xhr.status < 200 || xhr.status >= 300) {
					rej(xhr);
				} else {
					res(response ? xhr.response : xhr);
				}
			};
			xhr.send(isJSON(data) ? JSON.stringify(data) : (data as XMLHttpRequestBodyInit));
		});
	}
}
