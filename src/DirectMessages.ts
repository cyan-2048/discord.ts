import DiscordGateway from "./DiscordGateway";
import { ChannelBase, CreateMessageParams, GuildChannel } from "./GuildChannels";
import { UserGuildSetting, Channel, PrivateChannel } from "./libs/types";
import Message, { RawMessage } from "./Message";
import MessageHandlerBase from "./MessageHandlerBase";

export class DirectMessage extends Message {
	constructor(rawMessage: RawMessage, gatewayInstance: DiscordGateway, channelInstance: DirectMessageChannel) {
		super(rawMessage, gatewayInstance, channelInstance);
	}

	/**
	 * @param mounted - whether this function is being called because a new message was created
	 */
	wouldPing(mounted = true) {
		return Boolean(mounted && !this.channelInstance.isMuted()) || this._wouldPing();
	}
}

export class DirectMessageChannel extends ChannelBase {
	messages: MessageHandlerBase;
	constructor(public rawChannel: PrivateChannel, guildSettings: UserGuildSetting[], gatewayInstance: DiscordGateway) {
		super(rawChannel.id, guildSettings, gatewayInstance);
		this.messages = new MessageHandlerBase(DirectMessage, this, gatewayInstance);
	}

	isMuted() {
		const settings = this.guildSettings;
		const guild = settings.find((e) => e.guild_id === null);
		if (!guild) return false;
		const find = guild.channel_overrides.find((a) => a.channel_id === this.id);
		if (find) return find.muted;
		return false;
	}
}

export default class DirectMessages {
	private channels = new Map<string, DirectMessageChannel>();

	constructor(private initialData: PrivateChannel[], private gatewayInstance: DiscordGateway) {}
}
