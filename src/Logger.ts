interface Log {
	type: string;
	message: any[];
	stack?: string;
}

/**
 * stolen from betterdiscord
 */
export default class Logger {
	file: Log[] = [];

	constructor(public name: string, public color: string = "#3E82E5", public logToFile = false) {}

	stacktrace(message: string, error: any) {
		console.error(`%c[${this.name}]%c ${message}\n\n%c`, "color: #3a71c1; font-weight: 700;", "color: red; font-weight: 700;", "color: red;", error);
	}

	get err() {
		return this._log("error");
	}

	get error() {
		return this._log("error");
	}

	get warn() {
		return this._log("warn");
	}

	get info() {
		return this._log("info");
	}

	get dbg() {
		return this._log("debug");
	}

	get debug() {
		return this._log("debug");
	}

	get log() {
		return this._log();
	}

	private _log(type = "log") {
		const binded = Function.prototype.bind.call(console[type], console, `%c[${this.name}]%c`, `color: ${this.color}; font-weight: 700;`, "");
		if (this.logToFile)
			return (...message: any[]) => {
				this.file.push({ stack: new Error().stack, type, message });
				binded(...message);
			};
		return binded;
	}
}
