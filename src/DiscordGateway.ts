import EventEmitter from "./EventEmitter";

// import { writable } from "svelte/store";
import { Deferred } from "./utils";
import { pako } from "./pako.js";

interface GatewayEvent {
	op: number;
	d?: any;
	s?: number;
	t: string;
}

class GatewayBase extends EventEmitter {
	private token?: string | null = null;
	private ws?: WebSocket | null = null;
	private sequence_num?: number | null = null;
	private authenticated = false;
	readonly streamURL = "wss://gateway.discord.gg/?v=9&encoding=json&compress=zlib-stream";
	private pako = pako() as any;
	private _inflate: any;

	constructor(public _debug = false) {
		super();
	}

	debug(...args: any[]) {
		// we use console.info so that we can opt out when debugging
		if (this._debug) console.info("[gateway] ", ...args);
	}

	login(token: string) {
		this.token = token;
	}
	send(data: object) {
		this.debug("send:", data);
		this.ws?.send(JSON.stringify(data));
	}
	handlePacket(packet: GatewayEvent) {
		this.debug("Handling packet with OP ", packet.op);

		const callbacks = {
			0: this.packetDispatch,
			9: this.packetInvalidSess,
			10: this.packetHello,
			11: this.packetAck,
		};

		if (packet.op in callbacks) callbacks[packet.op].call(this, packet);
		else this.debug("OP " + packet.op + "not found!");
	}
	packetDispatch(packet: GatewayEvent) {
		this.sequence_num = packet.s;
		this.debug("dispatch:", packet);
		this.emit("t:" + packet.t.toLowerCase(), packet.d);
	}
	packetInvalidSess(packet: GatewayEvent) {
		this.debug("sess inv:", packet);
		this.close();
	}

	packetHello(packet: GatewayEvent) {
		const ws = this.ws;

		this.debug("Sending initial heartbeat...");
		this.send({
			op: 1, // HEARTBEAT
			d: this.sequence_num,
		});

		const interval = setInterval(() => {
			if (ws !== this.ws) return clearInterval(interval);
			this.debug("Sending heartbeat...");
			this.send({
				op: 1, // HEARTBEAT
				d: this.sequence_num,
			});
		}, packet.d.heartbeat_interval);
		this.debug("heartbeat interval: ", packet.d.heartbeat_interval);
	}

	packetAck() {
		if (this.authenticated) return;
		this.authenticated = true;
		this.send({
			op: 2,
			d: {
				status: "online",
				token: this.token,
				// intents: 0b11111111111111111,
				// properties: {
				// 	$os: "Android",
				// 	$browser: "Discord Android",
				// 	$device: "phone",
				// },
				properties: {
					browser: "Discord Android",
					device: "sveltecord, discord4kaios",
					os: "Android",
				},
			},
		});
	}

	close() {
		this.ws?.close();
		this.ws = null;
		if (this._inflate) {
			// @ts-ignore
			this._inflate.chunks = [];
			this._inflate.onEnd = () => {};
			this._inflate = null;
		}
	}

	init() {
		if (!this.token) throw Error("You need to authenticate first!");

		this.debug("Connecting to gateway...");
		this.close();

		const pako = this.pako;

		this._inflate = new pako.Inflate({ chunkSize: 65536, to: "string" });
		const ws = (this.ws = new WebSocket(this.streamURL));
		ws.binaryType = "arraybuffer";

		this._inflate.onEnd = (e: number) => {
			// @ts-ignore
			if (e !== pako.Z_OK) throw new Error("zlib error, ".concat(e, ", ").concat(this._inflate.strm.msg));

			// @ts-ignore
			const chunks = this._inflate?.chunks as string[];

			const result = chunks?.join("");
			result && this.handlePacket(JSON.parse(result));
			chunks.length = 0;
		};

		ws.addEventListener("message", ({ data }: MessageEvent<ArrayBuffer>) => {
			if (!this._inflate) return;
			const r = new DataView(data as ArrayBuffer),
				o = r.byteLength >= 4 && 65535 === r.getUint32(r.byteLength - 4, false);
			// @ts-ignore
			this._inflate.push(data, !!o && pako.Z_SYNC_FLUSH);
		});

		ws.addEventListener("open", () => this.debug("Sending Identity [OP 2]..."));
		ws.addEventListener("close", () => {
			this.ws = null;
			this.close();
			console.error("Discord gateway closed!");
			this.emit("close");
		});
	}
}

function startWorker() {
	const gateway = new GatewayBase();
	gateway.on("*", (evt: string, ...data: any[]) => {
		self.postMessage({ evt, data });
	});
	self.onmessage = ({ data }) => {
		if (data === "worker:debug") gateway._debug = true;
		else gateway[data.evt](...data.data);
	};
	self.postMessage("worker:ready");
}

// console.log(`var ${EventEmitter.name}=${EventEmitter.toString()};var ${GatewayBase.name}=${GatewayBase.toString()};(${startWorker.toString()})()`);

type RunCommands = "close" | "send" | "login" | "init";

class GatewayWorker extends EventEmitter {
	constructor(public worker: Worker) {
		super();
		worker.onmessage = ({ data }) => {
			if (data.evt && data.data) this.emit(data.evt, ...data.data);
		};
	}
	run(command: RunCommands, ...args: any[]) {
		this.worker.postMessage({ evt: command, data: args });
	}
}

class Gateway extends EventEmitter {
	private backend: GatewayWorker | GatewayBase;
	private ready = Promise.resolve();
	constructor({ debug = false, worker = true }) {
		super();
		if (worker && typeof Worker !== "undefined") {
			this.backend = this.setupWorker(debug);
		} else this.backend = this.setupMainThread(debug);

		this.backend.on("*", (evt: string, ...data: any[]) => {
			this.emit(evt, ...data);
		});
	}
	async run(command: RunCommands, ...args: any[]) {
		await this.ready;
		if (this.backend[command]) this.backend[command](...args);
		else if ("run" in this.backend) this.backend.run(command, ...args);
	}
	setupMainThread(debug: boolean) {
		return new GatewayBase(debug);
	}
	setupWorker(debug: boolean) {
		const deferred = new Deferred<void>();
		this.ready = deferred.promise;

		const importFunc = (func: Function) => `var ${func.name}=${func.toString()};`;

		const toEval = `${[pako, EventEmitter, GatewayBase].map(importFunc).join("\n")}(${startWorker.toString()})()`;

		console.log(toEval);

		const worker = new Worker(
			URL.createObjectURL(
				new Blob([toEval], {
					type: "text/javascript",
				})
			)
		);

		worker.addEventListener("message", function e({ data }) {
			if (data === "worker:ready") {
				worker.removeEventListener("message", e);
				debug && worker.postMessage("worker:debug");
				deferred.resolve();
			}
		});

		const base = new GatewayWorker(worker);

		// base.on("close", () => worker.terminate());

		return base;
	}
}

export default class DiscordGateway extends Gateway {
	// user_settings = writable(null);
	// guilds = writable(null);
	// private_channels = writable(null);
	// read_state = writable(null);
	// user_guild_settings = writable(null);

	private token: string | null = null;

	constructor({ debug = false, worker = true }) {
		super({ debug, worker });
		this.on("t:ready", (data) => {
			const { user_settings, guilds, private_channels, read_state, user_guild_settings } = data;
			//console.log({ user_settings, private_channels, guilds, read_state, user_guild_settings });
		});
	}

	async login(token: string) {
		await this.run("login", token);
		await this.run("init");
		this.token = token;
	}

	async send(packet: any) {
		await this.run("send", packet);
	}

	async close() {
		await this.run("close");
	}
}
