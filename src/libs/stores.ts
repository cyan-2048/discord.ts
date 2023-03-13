/** Callback to inform of a value updates. */
type Subscriber<T> = (value: T) => void;
/** Unsubscribes from value updates. */
type Unsubscriber = () => void;
/** Callback to update a value. */
type Updater<T> = (value: T) => T;
/** Start and stop notification callbacks. */
type StartStopNotifier<T> = (set: Subscriber<T>) => Unsubscriber | void;
/** Readable interface for subscribing. */
export interface Readable<T> {
	/**
	 * Subscribe on value changes.
	 * @param run subscription callback
	 * @param invalidate cleanup callback
	 */
	subscribe(this: void, run: Subscriber<T>, invalidate?: Invalidator<T>): Unsubscriber;
}
/** Writable interface for both updating and subscribing. */
export interface Writable<T> extends Readable<T> {
	/**
	 * Set value and inform subscribers.
	 * @param value to set
	 */
	set(this: void, value: T): void;
	/**
	 * Update value using callback and inform subscribers.
	 * @param updater callback
	 */
	update(this: void, updater: Updater<T>): void;
}

import { signal } from "@preact/signals";

const _signalKey = Symbol();

type Invalidator<T> = (value?: T) => void;

function createWritable<T = any>(initialValue: T): Writable<T> {
	const _signal = signal(initialValue);

	function subscribe(fn: Subscriber<T>) {
		return _signal.subscribe(fn);
	}

	subscribe[_signalKey] = _signal;

	return {
		subscribe,
		set: (value: T) => {
			_signal.value = value;
		},
		update: (fn: (value: T) => T) => {
			_signal.value = fn(_signal.value);
		},
	};
}

function createReadable<T = any>(initialValue: T, startStop: StartStopNotifier<T>): Readable<T> {
	const _signal = signal<T>(initialValue);
	const listeners: Function[] = [];

	function setter(value: T) {
		_signal.value = value;
	}

	let cleanup = startStop(setter);
	if (typeof cleanup === "function") cleanup();

	function subscribe(run: Subscriber<T>, invalidate?: Invalidator<T>) {
		cleanup = startStop(setter);

		const subscriber = _signal.subscribe(run);
		listeners.push(subscriber);

		return () => {
			const index = listeners.indexOf(subscriber);
			if (index !== -1) listeners.splice(index, 1);
			subscriber();
			if (listeners.length === 0) {
				if (typeof cleanup === "function") cleanup();
				// unsure if this is how it works?
				// i have never used this parameter before...
				invalidate?.();
			}
		};
	}

	subscribe[_signalKey] = _signal;
	subscribe.test = listeners;

	return {
		subscribe,
	};
}

function simulateGet(store: Readable<any> | Writable<any>) {
	return store.subscribe[_signalKey]?.value;
}

/**
 * very partial implementation of derived, only adding support for what my code is using...
 */
function partialDerived<T = any, R = any>(readable: Readable<R>, fn: (value: R) => T) {
	return createReadable<T>(fn(simulateGet(readable)), (set) => {
		return readable.subscribe((value) => {
			set(fn(value));
		});
	});
}

export { partialDerived as derived, simulateGet as get, createReadable as readable, createWritable as writable };
