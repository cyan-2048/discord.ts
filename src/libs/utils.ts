/**
 * Copyright (c) 2016 shogogg <shogo@studofly.net>
 *
 * This software is released under the MIT License.
 * http://opensource.org/licenses/mit-license.php
 */
export class Deferred<T> {
	private readonly _promise: Promise<T>;
	private _resolve!: (value: T | PromiseLike<T>) => void;
	private _reject!: (reason: any) => void;
	private done = false;

	constructor() {
		this._promise = new Promise<T>((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
		});
	}

	get promise(): Promise<T> {
		return this._promise;
	}

	resolve = (value: T | PromiseLike<T>): void => {
		if (this.done) return;
		this._resolve(value);
		this.done = true;
	};

	reject = (reason?: any): void => {
		if (this.done) return;
		this._reject(reason);
		this.done = true;
	};
}

export function toQuery(obj: any = {}) {
	return Object.keys(obj)
		.filter((a) => obj[a] != null)
		.map((key) => `${key}=${encodeURIComponent(obj[key])}`)
		.join("&");
}

export function minutesDiff(date: number) {
	return Math.floor(Math.abs(Date.now() - date) / 1000 / 60);
}

export function last<T = any>(array: ArrayLike<T>) {
	return array[array.length - 1];
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function generateNonce() {
	return String(Date.now() * 512 * 1024);
}
