import { Readable, readable } from "svelte/store";
import { DirectMessage, DirectMessageChannel } from "./DirectMessages";
import DiscordGateway from "./DiscordGateway";
import { Unsubscriber } from "./EventEmitter";
import { GuildChannel } from "./GuildChannels";
import { Guild } from "./Guilds";
import { ServerProfile } from "./libs/types";
import Message, { APIPartialEmoji, RawMessage } from "./Message";

interface MessageDeleteEvent {
	id: string;
	channel_id: string;
	guild_id?: string;
}

interface MessageDeleteBulk {
	ids: string[];
	channel_id: string;
	guild_id?: string;
}

interface MessageReactionRemoveAll {
	channel_id: string;
	message_id: string;
	guild_id?: string;
}

interface MessageReactionRemoveEmoji extends MessageReactionRemoveAll {
	emoji: APIPartialEmoji;
}

interface MessageReactionRemove extends MessageReactionRemoveEmoji {
	user_id: string;
}

interface MessageReactionAdd extends MessageReactionRemove {
	member?: ServerProfile;
}

export default class MessageHandlerBase {
	public removeMessages = true;
	private bindedEvents: Unsubscriber[] = [];
	private messages: Message[] = [];

	isListening = false;
	updateState: () => void;
	state: Readable<Message[]>;

	constructor(
		private messageType: typeof Message | typeof DirectMessage,
		private channelInstance: GuildChannel | DirectMessageChannel,
		private gatewayInstance: DiscordGateway,
		private guildInstance?: Guild
	) {
		const setState_def = (this.updateState = () => {});

		this.state = readable(this.messages, (set) => {
			this.updateState = () => {
				set(this.messages);
			};
			this.isListening = true;
			return () => {
				this.isListening = false;
				this.updateState = setState_def;
			};
		});

		const push = (rawMessage: RawMessage) => {
			this.messages.push(new this.messageType(rawMessage, gatewayInstance, channelInstance, guildInstance));
			this.updateState();
		};

		const remove = (message: Message) => {
			this.messages.splice(this.messages.indexOf(message), 1);
			this.updateState();
		};

		const deleteByID = (id: string) => {
			const message = findByID(id);
			if (message) {
				if (this.removeMessages) {
					remove(message);
				} else {
					message.deleted.set(true);
				}
			}
		};

		const findByID = (id: string) => this.messages.find((m) => m.id == id);

		const reactionToggle = (message: Message, emoji: APIPartialEmoji, user_id: string, add = true) => {
			message.reactions[add ? "add" : "remove"](emoji, user_id == gatewayInstance.user?.id);
		};

		this.bindedEvents.push(
			gatewayInstance.subscribe("t:message_create", (rawMessage: RawMessage) => {
				if (rawMessage.channel_id == channelInstance.id) {
					push(rawMessage);
				}
			}),
			gatewayInstance.subscribe("t:message_update", (rawMessage: RawMessage) => {
				if (rawMessage.channel_id == channelInstance.id) {
					const message = findByID(rawMessage.id);
					if (message) {
						if (message.rawMessage.content !== rawMessage.content) message.updateContent(rawMessage.content);
						message.updateProps(rawMessage);
					}
				}
			}),
			gatewayInstance.subscribe("t:message_delete", (event: MessageDeleteEvent) => {
				if (event.channel_id == channelInstance.id) {
					deleteByID(event.id);
				}
			}),
			gatewayInstance.subscribe("t:message_delete_bulk", (event: MessageDeleteBulk) => {
				if (event.channel_id == channelInstance.id) {
					event.ids.forEach(deleteByID);
				}
			}),
			gatewayInstance.subscribe("t:message_reaction_add", (event: MessageReactionAdd) => {
				if (event.channel_id == channelInstance.id) {
					const message = findByID(event.message_id);
					if (message) {
						reactionToggle(message, event.emoji, event.user_id);
					}
				}
			}),
			gatewayInstance.subscribe("t:message_reaction_remove", (event: MessageReactionRemove) => {
				if (event.channel_id == channelInstance.id) {
					const message = findByID(event.message_id);
					if (message) {
						reactionToggle(message, event.emoji, event.user_id, false);
					}
				}
			}),
			gatewayInstance.subscribe("t:message_reaction_remove_all", (event: MessageReactionRemoveAll) => {
				if (event.channel_id == channelInstance.id) {
					const message = findByID(event.message_id);
					if (message) {
						message.reactions.clear();
					}
				}
			}),
			gatewayInstance.subscribe("t:message_reaction_remove_emoji", (event: MessageReactionRemoveEmoji) => {
				if (event.channel_id == channelInstance.id) {
					const message = findByID(event.message_id);
					if (message) {
						message.reactions.removeEmoji(event.emoji);
					}
				}
			})
		);
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
