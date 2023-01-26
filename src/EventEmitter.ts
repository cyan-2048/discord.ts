export default class EventEmitter {
	private _events = new Map<string, Set<Function>>();

	on(event: string, listener: Function) {
		this._events.set(event, (this._events.get(event) || new Set()).add(listener));
	}

	once(event: string, listener: Function) {
		const wrapper = (...args: any[]) => {
			listener(...args);
			this.off(event, wrapper);
		};
		this.on(event, wrapper);
	}

	off(event: string, listener: Function) {
		this._events.get(event)?.delete(listener);
	}

	offAll(event?: string) {
		if (event) this._events.delete(event);
		else this._events.clear();
	}

	emit(event: string, ...args: any[]) {
		this._events.get("*")?.forEach((listener) => listener(event, ...args));
		this._events.get(event)?.forEach((listener) => listener(...args));
	}
}
