import EventEmitter from "./EventEmitter.ts";

import { writable } from "npm:svelte/store";
import { Deferred } from "./utils.ts";
import type { JSON } from "./DiscordXHR.ts";

interface GatewayEvent {
	op: number;
	d?: any;
	s?: number;
	t?: string;
}

class GatewayBase extends EventEmitter {
	private token?: string = null;
	private ws?: WebSocket = null;
	private sequence_num?: number = null;
	private authenticated = false;
	readonly streamURL = "wss://gateway.discord.gg/?v=9&encoding=json";

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
	send(data: JSON) {
		this.debug("send:", data);
		this.ws.send(JSON.stringify(data));
	}
	handlePacket(packet: GatewayEvent) {
		this.debug("Handling packet with OP ", packet.op);

		const callbacks = {
			0: this.packetDispacth,
			9: this.packetInvalidSess,
			10: this.packetHello,
			11: this.packetAck,
		};

		// @ts-ignore: it's going to work
		if (packet.op in callbacks) callbacks[packet.op].call(this, packet);
		else this.debug("OP " + packet.op + "not found!");
	}
	packetDispacth(packet: GatewayEvent) {
		this.sequence_num = packet.s;
		this.debug("dispatch:", packet);
		this.emit("t:" + packet.t.toLowerCase(), packet.d);
	}
	packetInvalidSess(packet: GatewayEvent) {
		this.debug("sess inv:", packet);
		this.ws.close();
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
	}

	init() {
		if (!this.token) throw Error("You need to authenticate first!");

		this.debug("Connecting to gateway...");
		this.close();

		const ws = (this.ws = new WebSocket(this.streamURL));

		ws.addEventListener("message", ({ data }) => {
			this.handlePacket(JSON.parse(data));
		});

		ws.addEventListener("open", () => this.debug("Sending Identity [OP 2]..."));
		ws.addEventListener("close", () => {
			this.ws = null;
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
	private backend?: GatewayWorker | GatewayBase = null;
	private ready = Promise.resolve();
	constructor({ debug = false, worker = true }) {
		super();
		if (worker && typeof Deno === "undefined" && typeof Worker !== "undefined") {
			this.backend = this.setupWorker(debug);
		} else this.backend = this.setupMainThread(debug);

		this.backend.on("*", (evt: string, ...data: any[]) => {
			this.emit(evt, ...data);
		});
	}
	async run(command: RunCommands, ...args: any[]) {
		await this.ready;
		// @ts-ignore: bruh
		if (command in this.backend) this.backend[command](...args);
		else if ("run" in this.backend) this.backend.run(command, ...args);
	}
	setupMainThread(debug: boolean) {
		return new GatewayBase(debug);
	}
	setupWorker(debug: boolean) {
		const deferred = new Deferred<void>();
		this.ready = deferred.promise;

		const worker = new Worker(
			URL.createObjectURL(
				new Blob([`var ${EventEmitter.name}=${EventEmitter.toString()};` + `var ${GatewayBase.name}=${GatewayBase.toString()};` + `(${startWorker.toString()})()`], {
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
	user_settings = writable(null);
	guilds = writable(null);
	private_channels = writable(null);
	read_state = writable(null);
	user_guild_settings = writable(null);

	private token?: string = null;

	constructor({ debug = false, worker = true }) {
		super({ debug, worker });
		this.on("t:ready", (data) => {
			let { user_settings, guilds, private_channels, read_state, user_guild_settings } = data;
			console.log({ user_settings, private_channels, guilds, read_state, user_guild_settings });
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
