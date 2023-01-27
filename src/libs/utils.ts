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
