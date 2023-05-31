import EventEmitter from "./EventEmitter";

import { Deferred, sleep } from "./libs/utils";
import { pako } from "./libs/pako.js";
import { Inflate } from "pako";

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

interface Pako {
	Inflate: typeof Inflate;
	Z_SYNC_FLUSH: number;
	Z_OK: number;
}

export class GatewayBase extends EventEmitter {
	private token?: string;
	private ws?: WebSocket;
	private sequence_num: number | null = null;
	private authenticated = false;
	readonly streamURL = "wss://gateway.discord.gg/?v=9&encoding=json&compress=zlib-stream";
	// @ts-ignore
	private pako = pako() as Pako;
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
	#handlePacket(packet: GatewayEvent) {
		this.debug("Handling packet with OP ", packet.op);

		switch (packet.op) {
			case 0:
				this.#packetDispatch(packet);
				break;
			case 9:
				this.#packetInvalidSess(packet);
				break;
			case 10:
				this.#packetHello(packet);
				break;
			case 11:
				this.#packetAck();
				break;
			default:
				this.debug("OP " + packet.op + "not found!");
				break;
		}
	}
	#packetDispatch(packet: GatewayEvent) {
		this.sequence_num = packet.s;
		this.debug("dispatch:", packet);
		packet.t && this.emit("t:" + packet.t.toLowerCase(), packet.d);
	}
	#packetInvalidSess(packet: GatewayEvent<false>) {
		this.debug("sess inv:", packet);
		this.close();
	}

	#packetHello(
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

	#packetAck() {
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
			result && this.#handlePacket(JSON.parse(result));
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

type RunCommands = GatewayAction[1]["method"];

class GatewayWorker extends EventEmitter {
	constructor(private worker: Worker, debug = false, ready?: () => void) {
		super();

		worker.addEventListener("message", ({ data }: MessageEvent<WorkerResponse>) => {
			if (typeof data == "string") {
				if (data == "gatewayReady") ready?.();
			} else {
				const [evt, obj] = data;
				if (evt != "gateway") return;
				this.emit(obj.event, ...data);
			}
		});

		debug && worker.postMessage("debug");
		worker.postMessage("setupGateway");
	}
	run(command: RunCommands, ...args: any[]) {
		if (command == "close") {
			return this.worker.terminate();
		}
		this.worker.postMessage(["gateway", { method: command, params: args }]);
	}
}

interface GatewayProps {
	debug?: boolean;
	worker?: boolean;
	instance: Discord;
}
class Gateway extends EventEmitter {
	static workerSrc: null | string = null;
	#backend!: GatewayWorker | GatewayBase;
	private ready = Promise.resolve();
	constructor({ worker = false, debug = false, instance }: GatewayProps) {
		super();

		if (worker && typeof Worker !== "undefined" && instance._worker) {
			const deferred = new Deferred<void>();
			this.ready = deferred.promise;
			this.#backend = new GatewayWorker(instance._worker, debug, deferred.resolve);
		} else this.#backend = new GatewayBase(debug);

		this.forwardEvents();
	}

	forwardEvents() {
		this.#backend.on("*", (evt: string, ...data: any[]) => {
			this.emit(evt, ...data);
		});
	}

	async run(command: RunCommands, ...args: any[]) {
		await this.ready;
		// @ts-ignore
		if (this.#backend instanceof GatewayBase) this.#backend[command](...args);
		else if ("run" in this.#backend) this.#backend.run(command, ...args);
	}
}

import type { ReadyEvent, User, UserSettings } from "./libs/types";
import ReadStateHandler from "./ReadStateHandler";
import Discord from "./main";
import Guilds from "./Guilds";
import DirectMessages, { DirectMessageChannel } from "./DirectMessages";
import { GuildChannel } from "./GuildChannels";
import { GatewayAction, WorkerResponse } from "./worker";

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
	private_channels?: DirectMessages;
	users_cache = new Map<string, User>();

	constructor({ debug = false, worker = true } = {}, private DiscordInstance: Discord) {
		super({ debug, worker, instance: DiscordInstance });

		this.xhr = DiscordInstance.xhr;

		this.on("t:ready", (data: ReadyEvent) => {
			// console.log(data);
			const { user_settings, guilds, private_channels, read_state, user_guild_settings, user } = data;

			this.user_settings = user_settings;
			this.user = user;
			this.read_state = new ReadStateHandler(read_state, this);
			//console.log({ user_settings, private_channels, guilds, read_state, user_guild_settings });
			this.isReady.resolve(undefined);
			this.guilds = new Guilds(guilds, user_guild_settings, this);
			this.private_channels = new DirectMessages(private_channels, this);
		});
	}

	/**
	 * Find a channel by its ID
	 */
	findChannelByID(id: string): GuildChannel | DirectMessageChannel | null {
		let channelFoundFromGuilds: GuildChannel | void;
		// @ts-ignore
		const guildsToSearchThrough = this.guilds?.guilds.values() || [];

		for (const guild of guildsToSearchThrough) {
			// @ts-ignore
			for (const channel of guild.channels.channels.values()) {
				if (channel.id === id) {
					channelFoundFromGuilds = channel;
					break;
				}
			}
			if (channelFoundFromGuilds) return channelFoundFromGuilds;
		}

		// @ts-ignore
		for (const dm of this.private_channels?.channels.values() || []) {
			if (dm.id === id) return dm;
		}

		return null;
	}

	findGuildByID(id: string) {
		if (id == "@me") return this.private_channels || null;
		return this.guilds?.getAll().find((g) => g.id === id) || null;
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
		this.emit("close");
		await this.run("close");
	}
}
