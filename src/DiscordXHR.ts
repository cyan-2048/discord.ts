export type HeadersOption = {
	[key: string]: string;
};
export type JSON = boolean | number | string | null | { [key: string]: JSON } | JSON[];
export type XHRMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace" | "connect";
export type XHROptions = {
	method?: XHRMethod;
	headers?: HeadersOption;
	data?: JSON | XMLHttpRequestBodyInit;
	response?: boolean;
	responseType?: XMLHttpRequestResponseType;
};

function isJSON(object: any) {
	const type = typeof object;
	if (type === "object") {
		return object.constructor === Object || object.constructor === Array;
	}
	return ["number", "string", "boolean"].includes(type);
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
	_postProgress: ((e: ProgressEvent) => void) | undefined;

	constructor(private token?: string) {}

	xhr(url: string, { method = "get", headers = {}, data, response = true, responseType = "json" }: XHROptions = {}): Promise<any> {
		return new Promise((res, rej) => {
			// @ts-ignore: kaios
			const xhr = new XMLHttpRequest({ mozAnon: true, mozSystem: true });
			if (method === "post") xhr.upload.onprogress = this._postProgress;
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
					res(response ? xhr : xhr.response);
				}
			};
			xhr.send(isJSON(data) ? JSON.stringify(data) : (data as XMLHttpRequestBodyInit));
		});
	}
}
