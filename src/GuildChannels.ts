import { Channel as RawChannel, UserGuildSetting } from "./libs/types";
import { Guild } from "./Guilds";
import DiscordGateway from "./DiscordGateway";
import { derived, readable, Readable } from "svelte/store";
import { Unsubscriber } from "./EventEmitter";
import { ReadStateListener } from "./ReadStateHandler";
import MessageHandlerBase from "./MessageHandlerBase";
import Message from "./Message";

export class GuildChannel {
	id: string;
	props: Readable<RawChannel>;
	updateProps: (props: Partial<RawChannel>) => void;

	isUsedProps = false;
	position: number;
	type: number;
	readState?: ReadStateListener | null;
	unread?: Readable<boolean>;
	messages: MessageHandlerBase;

	constructor(public rawChannel: RawChannel, private guildSettings: UserGuildSetting[], private guildInstance: Guild, private gatewayInstance: DiscordGateway) {
		this.id = rawChannel.id;
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

		this.readState = this.gatewayInstance.read_state?.listen(this.id);

		if (this.readState) this.unread = derived(this.readState, ($readState) => Boolean($readState.mention_count || $readState.last_message_id !== this.rawChannel.last_message_id));
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
	private channels = new Map<string, GuildChannel>();
	private bindedEvents: Unsubscriber[] = [];
	siftedChannels: Readable<GuildChannel[]>;

	constructor(initialValue: RawChannel[], private guildSettings: UserGuildSetting[], private guildInstance: Guild, private gatewayInstance: DiscordGateway) {
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

		this.bindedEvents.push(
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
			: this.channels.set(channel.id, new GuildChannel(channel, this.guildSettings, this.guildInstance, this.gatewayInstance));
	}

	get(id: string) {
		return this.channels.get(id);
	}

	delete(id: string) {
		this.channels.delete(id);
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
