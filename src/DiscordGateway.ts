import EventEmitter from "./EventEmitter";

import { Deferred } from "./libs/utils";
import { pako } from "./libs/pako.js";

type Dispatch = 0;
type Heartbeat = 1;
type Identify = 2;
type PresenceUpdate = 3;
type VoiceStateUpdate = 4;
type Resume = 6;
type Reconnect = 7;
type RequestGuildMembers = 8;
type InvalidSession = 9;
type Hello = 10;
type HeartbeatAck = 11;
type GuildSync = 12;
type LazyGuilds = 14;

type GatewayOPCodes =
	| Dispatch
	| Heartbeat
	| Identify
	| PresenceUpdate
	| VoiceStateUpdate
	| Resume
	| Reconnect
	| RequestGuildMembers
	| InvalidSession
	| Hello
	| HeartbeatAck
	| GuildSync
	| LazyGuilds;

interface GatewayEvent<T = any> {
	op: GatewayOPCodes;
	d: T;
	s: number;
	t?: string;
}

class GatewayBase extends EventEmitter {
	private token?: string;
	private ws?: WebSocket;
	private sequence_num: number | null = null;
	private authenticated = false;
	readonly streamURL = "wss://gateway.discord.gg/?v=9&encoding=json&compress=zlib-stream";
	private pako = pako() as any;
	private _inflate: any;

	constructor(public _debug = false) {
		super();
	}

	get debug(): Function {
		if (!this._debug) return () => {};
		return Function.prototype.bind.call(console.info, console, "[Gateway]");
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

		switch (packet.op) {
			case 0:
				this.packetDispatch(packet);
				break;
			case 9:
				this.packetInvalidSess(packet);
				break;
			case 10:
				this.packetHello(packet);
				break;
			case 11:
				this.packetAck();
				break;
			default:
				this.debug("OP " + packet.op + "not found!");
				break;
		}
	}
	packetDispatch(packet: GatewayEvent) {
		this.sequence_num = packet.s;
		this.debug("dispatch:", packet);
		packet.t && this.emit("t:" + packet.t.toLowerCase(), packet.d);
	}
	packetInvalidSess(packet: GatewayEvent<false>) {
		this.debug("sess inv:", packet);
		this.close();
	}

	packetHello(
		packet: GatewayEvent<{
			heartbeat_interval: number;
		}>
	) {
		const ws = this.ws,
			beatMeat = () => this.send({ op: 1, d: this.sequence_num });

		this.debug("Sending initial heartbeat...");
		beatMeat();

		const interval = setInterval(() => {
			if (ws !== this.ws) return clearInterval(interval);
			this.debug("Sending heartbeat...");
			beatMeat();
		}, packet.d.heartbeat_interval) as unknown as number;
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
		this.ws = undefined;
		if (this._inflate) {
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
			if (e !== pako.Z_OK) throw new Error(`zlib error, ${e}, ${this._inflate.strm.msg}`);

			const chunks = this._inflate?.chunks as string[];

			const result = chunks.join("");
			result && this.handlePacket(JSON.parse(result));
			chunks.length = 0;
		};

		ws.addEventListener("message", ({ data }: MessageEvent<ArrayBuffer>) => {
			if (!this._inflate) return;
			const r = new DataView(data as ArrayBuffer),
				o = r.byteLength >= 4 && 65535 === r.getUint32(r.byteLength - 4, false);
			this._inflate.push(data, !!o && pako.Z_SYNC_FLUSH);
		});

		ws.addEventListener("open", () => this.debug("Sending Identity [OP 2]..."));
		ws.addEventListener("close", () => {
			this.ws = undefined;
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
		// @ts-ignore: not important
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

export function workerScript() {
	const importFunc = (func: Function) => `var ${func.name}=${func.toString()};`;
	return `// GATEWAY\n${[pako, EventEmitter, GatewayBase].map(importFunc).join("\n")}(${startWorker.toString()})()`;
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
		// @ts-ignore
		if (this.backend instanceof GatewayBase) this.backend[command](...args);
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
				new Blob([workerScript()], {
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

import type { ReadyEvent, UserSettings } from "./libs/types";
import ReadStateHandler from "./ReadStateHandler";
import Discord from "./main";
import Guilds, { Guild } from "./Guilds";

export default class DiscordGateway extends Gateway {
	// user_settings = writable(null);
	// guilds = writable(null);
	// private_channels = writable(null);
	// user_guild_settings = writable(null);

	private token: string | null = null;

	private isReady = new Deferred();
	xhr: Discord["xhr"];
	user?: ReadyEvent["user"];
	guilds?: Guilds;

	constructor({ debug = false, worker = true } = {}, private DiscordInstance: Discord) {
		super({ debug, worker });

		this.xhr = DiscordInstance.xhr;

		this.on("t:ready", (data: ReadyEvent) => {
			// console.log(data);
			const { user_settings, guilds, private_channels, read_state, user_guild_settings, user } = data;

			this.user_settings = user_settings;
			this.user = user;
			this.read_state = new ReadStateHandler(read_state, this);
			//console.log({ user_settings, private_channels, guilds, read_state, user_guild_settings });
			this.isReady.resolve(undefined);
			this.guilds = new Guilds(guilds, this);
		});
	}

	user_settings?: UserSettings;
	read_state?: ReadStateHandler;

	async login(token: string) {
		this.isReady = new Deferred();
		await this.run("login", token);
		await this.run("init");
		this.token = token;
		return this.isReady.promise;
	}

	async send(packet: any) {
		await this.run("send", packet);
	}

	async close() {
		this.read_state?.eject();
		this.read_state = undefined;
		await this.run("close");
	}
}
