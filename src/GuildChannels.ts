import { Channel as RawChannel, UserGuildSetting } from "./libs/types";
import { Guild } from "./Guilds";
import DiscordGateway from "./DiscordGateway";
import { derived, readable, Readable, Writable, writable } from "svelte/store";
import { Unsubscriber } from "./EventEmitter";
import { ReadStateListener } from "./ReadStateHandler";
import MessageHandlerBase from "./MessageHandlerBase";
import Message, { APIPartialEmoji, Attachment, Embed, MessageReference } from "./Message";
import { generateNonce } from "./libs/utils";

export interface CreateMessageParams {
	content: string;
	nonce?: string;
	tts?: boolean;
	message_reference?: MessageReference;
	//	message_components?: // TODO
	attachments?: Partial<Attachment>[];
}

export class ChannelBase {
	messages!: MessageHandlerBase;

	lastMessageID: Writable<string | null> = writable(null);

	constructor(public id: string, public guildSettings: UserGuildSetting[], public gatewayInstance: DiscordGateway) {}

	sendMessage(message: string = "", opts: Partial<CreateMessageParams> = {}, attachments?: File[] | Blob[]) {
		if (!message && !attachments) return;

		const obj: CreateMessageParams = {
			content: message.trim(),
			nonce: generateNonce(),
			...opts,
		};
		const url = `channels/${this.id}/messages`;

		if (!attachments) return this.gatewayInstance.xhr(url, { method: "post", data: obj });

		const form = new FormData();

		obj.attachments = [];
		const len = attachments.length;
		for (let id = 0; id < len; id++) {
			const file = attachments[id];
			obj.attachments.push({
				id,
				filename: "name" in file ? file.name : "blob",
			});
			form.append(`files[${id}]`, file);
		}

		form.append("payload_json", JSON.stringify(obj));

		return this.gatewayInstance.xhr(url, {
			method: "post",
			data: form,
			response: false,
		});
	}

	isMuted() {
		return false;
	}
}

export class GuildChannel extends ChannelBase {
	props: Readable<RawChannel>;
	updateProps: (props: Partial<RawChannel>) => void;

	isUsedProps = false;
	position: number;
	type: number;
	readState?: ReadStateListener | null;
	unread?: Readable<boolean>;
	messages: MessageHandlerBase;

	constructor(public rawChannel: RawChannel, guildSettings: UserGuildSetting[], private readonly guildInstance: Guild, gatewayInstance: DiscordGateway) {
		super(rawChannel.id, guildSettings, gatewayInstance);
		this.position = rawChannel.position;
		this.type = rawChannel.type;

		const setProps_default = (this.updateProps = (props) => {
			Object.assign(rawChannel, props);
			this.position = props.position || this.position;
			this.type = props.type || this.type;
		});

		this.messages = new MessageHandlerBase(Message, this, gatewayInstance, guildInstance);

		this.props = readable(rawChannel, (set) => {
			this.updateProps = (props) => {
				setProps_default(props);
				set(rawChannel);
			};
			this.isUsedProps = true;
			return () => {
				this.isUsedProps = false;
				this.updateProps = setProps_default;
			};
		});

		this.lastMessageID.set(rawChannel.last_message_id || null);

		this.readState = this.gatewayInstance.read_state?.listen(this.id);

		if (this.readState)
			this.unread = derived([this.readState, this.lastMessageID], ([$readState, $lastMessageID]) =>
				Boolean($lastMessageID && ($readState.mention_count || $readState.last_message_id !== $lastMessageID))
			);
	}

	roleAccess() {
		return this.guildInstance.parseRoleAccess(this.rawChannel.permission_overwrites);
	}

	isMuted() {
		const settings = this.guildSettings;
		const guild = settings.find((e) => e.guild_id === this.guildInstance.id);
		if (!guild) return false;
		const find = guild.channel_overrides.find((a) => a.channel_id === this.id);
		if (find) return find.muted;
		return false;
	}

	isPrivate() {
		let ft = this.rawChannel.permission_overwrites?.find((l) => l.id == this.guildInstance.rawGuild.roles.find((p) => p.position == 0)?.id);
		if (!ft) return false;
		return (+ft.deny & 1024) == 1024;
	}

	get name() {
		return this.rawChannel.name;
	}
}

function siftChannels(channels: GuildChannel[]) {
	const position = (a: GuildChannel, b: GuildChannel) => a?.position - b?.position;

	channels.sort(position);

	const channelMap = new Map<string | null, GuildChannel[]>([[null, []]]);

	channels.forEach((a) => {
		if (a.type == 4) {
			channelMap.set(a.id, [a]);
		}
	});

	channels.forEach((channel) => {
		if (channel.type == 0 || channel.type == 5) {
			const perms = channel.roleAccess();

			if (perms.read !== false) {
				const arr = channelMap.get(channel.rawChannel.parent_id || null) || channelMap.get(null);
				arr?.push(channel);
			}
		}
	});

	channels.length = 0;

	return mergeArrayLikeSet<GuildChannel>(channels, [...channelMap.values()].sort(([a], [b]) => position(a, b)).flat());
}

function removeAllInstances(arr: any[], item: any[]) {
	for (var i = arr.length; i--; ) {
		if (arr[i] === item) arr.splice(i, 1);
	}
}

function mergeArrayLikeSet<T>(array1: Array<T>, array2: Iterable<T>) {
	for (const a of array2) {
		array1.includes(a) || array1.push(a);
	}
	return array1;
}

export default class GuildChannels {
	channels = new Map<string, GuildChannel>();
	#bindedEvents: Unsubscriber[] = [];
	siftedChannels: Readable<GuildChannel[]>;

	readonly #guildSettings: UserGuildSetting[];
	readonly #guildInstance: Guild;
	readonly #gatewayInstance: DiscordGateway;

	constructor(initialValue: RawChannel[], guildSettings: UserGuildSetting[], guildInstance: Guild, gatewayInstance: DiscordGateway) {
		this.#guildSettings = guildSettings;
		this.#guildInstance = guildInstance;
		this.#gatewayInstance = gatewayInstance;

		initialValue.forEach((rawChannel) => this.add(rawChannel));

		const shiftedChannels = [...this.channels.values()];
		siftChannels(shiftedChannels);

		const channelsChanged_def = () => {
			mergeArrayLikeSet(shiftedChannels, this.channels.values());
			siftChannels(shiftedChannels);
		};

		let channelsChanged = channelsChanged_def;

		this.siftedChannels = readable(shiftedChannels, (set) => {
			channelsChanged = () => {
				channelsChanged_def();
				set(shiftedChannels);
			};

			return () => {
				channelsChanged = channelsChanged_def;
			};
		});

		this.#bindedEvents.push(
			gatewayInstance.subscribe("t:channel_update", (d: RawChannel) => {
				if (d.guild_id === guildInstance.id) {
					this.update(d.id, d);
					channelsChanged();
				}
			}),
			gatewayInstance.subscribe("t:channel_delete", (d: RawChannel) => {
				if (d.guild_id === guildInstance.id) {
					this.delete(d.id);
					channelsChanged();
				}
			}),
			gatewayInstance.subscribe("t:channel_create", (d: RawChannel) => {
				if (d.guild_id === guildInstance.id) {
					this.add(d);
					channelsChanged();
				}
			})
		);
	}

	update(id: string, props: Partial<RawChannel>) {
		this.channels.get(id)?.updateProps(props);
	}

	add(channel: RawChannel) {
		this.get(channel.id)
			? this.update(channel.id, channel)
			: this.channels.set(channel.id, new GuildChannel(channel, this.#guildSettings, this.#guildInstance, this.#gatewayInstance));
	}

	get(id: string) {
		return this.channels.get(id);
	}

	delete(id: string) {
		this.channels.delete(id);
	}

	eject() {
		this.#bindedEvents.forEach((e) => e());
	}
}
