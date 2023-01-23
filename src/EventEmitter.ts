type EventList = Map<string, Set<Function>>;

export default class EventEmitter {
	private events: EventList = new Map();

	on(event: string, listener: Function) {
		this.events.set(event, (this.events.get(event) || new Set()).add(listener));
	}

	once(event: string, listener: Function) {
		const wrapper = (...args: any[]) => {
			listener(...args);
			this.off(event, wrapper);
		};
		this.on(event, wrapper);
	}

	off(event: string, listener: Function) {
		this.events.get(event)?.delete(listener);
	}

	emit(event: string, ...args: any[]) {
		this.events.get("*")?.forEach((listener) => listener(event, ...args));
		this.events.get(event)?.forEach((listener) => listener(...args));
	}
}
