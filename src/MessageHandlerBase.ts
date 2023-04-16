import { Readable, readable } from "svelte/store";
import { DirectMessage, DirectMessageChannel } from "./DirectMessages";
import DiscordGateway from "./DiscordGateway";
import { Unsubscriber } from "./EventEmitter";
import { GuildChannel } from "./GuildChannels";
import { Guild } from "./Guilds";
import { ServerProfile } from "./libs/types";
import { last, minutesDiff, sleep, toQuery } from "./libs/utils";
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

async function graduallyPush(
	messageType: typeof Message,
	targetArray: any[],
	thingsToPush: any[],
	gatewayInstance: DiscordGateway,
	channelInstance: GuildChannel | DirectMessageChannel,
	guildInstance?: Guild,
	push = true
) {
	for (let i = 0; i < thingsToPush.length; i++) {
		await sleep(MessageHandlerBase.gradualPushInterval);
		const element = thingsToPush[i];
		targetArray[push ? "push" : "unshift"](new messageType(element, gatewayInstance, channelInstance, guildInstance));
		await sleep(0);
	}
}

function mapMessages(
	messageType: typeof Message,
	messages: RawMessage[],
	gatewayInstance: DiscordGateway,
	channelInstance: GuildChannel | DirectMessageChannel,
	guildInstance?: Guild
) {
	return messages.map((message) => new messageType(message, gatewayInstance, channelInstance, guildInstance));
}

export default class MessageHandlerBase {
	public removeMessages = true;
	private bindedEvents: Unsubscriber[] = [];
	private messages: Message[] = [];

	/**
	 * If true, messages will be pushed gradually.
	 * This can be enabled if rendering too many elements at once is very slow.
	 */
	static gradualPush = false;
	static gradualPushInterval = 500;

	isListening = false;
	updateState: () => void;
	state: Readable<Message[]>;

	lastPush = performance.now();

	constructor(
		private readonly messageType: typeof Message,
		private readonly channelInstance: GuildChannel | DirectMessageChannel,
		private readonly gatewayInstance: DiscordGateway,
		private readonly guildInstance?: Guild
	) {
		const setState_def = (this.updateState = () => {});

		this.state = readable(this.messages, (set) => {
			this.updateState = () => {
				set(this.messages);
			};
			if (minutesDiff(this.lastPush) > 3) {
				this.getMessages({ limit: 100, after: last(this.messages)?.id }).then(async (messages) => {
					this.lastPush = performance.now();
					if (!messages.length) return;
					messages.reverse();
					if (MessageHandlerBase.gradualPush) {
						await graduallyPush(messageType, this.messages, messages, gatewayInstance, channelInstance, guildInstance);
					} else {
						this.messages.push(...mapMessages(messageType, messages, gatewayInstance, channelInstance, guildInstance));
					}
					this.updateState();
				});
			}

			this.isListening = true;
			return () => {
				this.isListening = false;
				this.updateState = setState_def;
			};
		});

		const push = (rawMessage: RawMessage) => {
			// just for safety
			if (this.messages.findLast((m) => m.id == rawMessage.id)) return null;
			const message = new this.messageType(rawMessage, gatewayInstance, channelInstance, guildInstance);
			this.messages.push(message);
			this.updateState();
			this.lastPush = performance.now();
			return message;
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
					const message = push(rawMessage);
					if (!message) return;
					this.channelInstance.rawChannel.last_message_id = message.id;
					if (message.wouldPing(true)) {
						gatewayInstance.read_state?.emit("count_update", this.channelInstance.id, 1);
					}
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

	async loadMessages(limit = 15) {
		if (this.messages.length > 1) {
			const messages = await this.getMessages({ before: this.messages[0].id, limit });
			if (!messages.length) return;
			if (MessageHandlerBase.gradualPush) {
				await graduallyPush(this.messageType, this.messages, messages, this.gatewayInstance, this.channelInstance, this.guildInstance, false);
			} else {
				messages.reverse();
				this.messages.unshift(...mapMessages(this.messageType, messages, this.gatewayInstance, this.channelInstance, this.guildInstance));
			}
		} else if (!this.messages.length) {
			const messages = await this.getMessages({ limit });
			if (!messages.length) return;
			messages.reverse();
			if (MessageHandlerBase.gradualPush) {
				await graduallyPush(this.messageType, this.messages, messages, this.gatewayInstance, this.channelInstance, this.guildInstance);
			} else {
				this.messages.push(...mapMessages(this.messageType, messages, this.gatewayInstance, this.channelInstance, this.guildInstance));
			}
		}
		this.updateState();
	}

	async ack() {
		await this.gatewayInstance.xhr(`channels/${this.channelInstance.id}/messages/${this.channelInstance.rawChannel.last_message_id}/ack`, {
			method: "post",
			data: { token: "null" },
		});
	}

	async getMessages(query: { limit?: number; before?: string; after?: string; around?: string } = {}) {
		return this.gatewayInstance.xhr(`channels/${this.channelInstance.id}/messages?` + toQuery(query), { method: "get" });
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
