import { Readable, readable } from "svelte/store";
import DiscordGateway from "./DiscordGateway";
import EventEmitter, { Unsubscriber } from "./EventEmitter";
import { ReadState } from "./libs/types";

export class ReadStateListener {
	subscribe: Readable<ReadState>["subscribe"];
	constructor(public read_state: ReadState, private handler: ReadStateHandler) {
		this.subscribe = readable(read_state, (set) => {
			return handler.subscribe(read_state.id, () => {
				console.log("UPDATE OCCURED", read_state);
				set(read_state);
			});
		}).subscribe;
	}
}

interface MessageACKEvent {
	version: number;
	message_id: string;
	channel_id: string;
	mention_count?: number;
	manual?: boolean;
	ack_type?: 0;
}

interface ChannelUnreadUpdateEvent {
	channel_unread_updates: ReadState[];
	guild_id: string;
}

export default class ReadStateHandler extends EventEmitter {
	private bindedEvents: Unsubscriber[] = [];
	private cachedListeners: Map<string, ReadStateListener> = new Map();

	constructor(private readonly read_states: ReadState[], private readonly gateway: DiscordGateway) {
		super();
		this.bindedEvents.push(
			gateway.subscribe("t:message_ack", ({ mention_count, channel_id, message_id, ack_type }: MessageACKEvent) => {
				const el = read_states.find((e) => e.id == channel_id);
				let changed = false;
				if (el) {
					changed = el.last_message_id !== message_id;
					el.last_message_id = message_id;
					el.mention_count = mention_count || 0;
				}
				if (changed) this.emit(channel_id);
			}),
			gateway.subscribe("t:channel_unread_update", (event: ChannelUnreadUpdateEvent) => {
				event.channel_unread_updates.forEach((state) => {
					let el = read_states.find((e) => e.id == state.id);
					if (el && el.last_message_id !== state.last_message_id) {
						el.last_message_id = state.last_message_id;
						this.emit(el.id);
					}
				});
			}),
			this.subscribe("count_update", (channelID: string, mentionCount: number) => {
				const el = read_states.find((e) => e.id == channelID);
				if (el) el.mention_count = el.mention_count + mentionCount;
				this.emit(channelID);
			})
		);
	}

	listen(id: string) {
		const cached = this.cachedListeners.get(id);
		if (cached) return cached;

		const read_state = this.read_states.find((r) => r.id === id);
		if (!read_state) return null;
		const listener = new ReadStateListener(read_state, this);
		this.cachedListeners.set(id, listener);
		return listener;
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
		this.offAll();
	}
}
