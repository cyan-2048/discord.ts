import { Readable, readable } from "svelte/store";
import { DirectMessage, DirectMessageChannel } from "./DirectMessages";
import DiscordGateway from "./DiscordGateway";
import { Unsubscriber } from "./EventEmitter";
import { GuildChannel } from "./GuildChannels";
import { Guild } from "./Guilds";
import Message, { RawMessage } from "./Message";

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
			gatewayInstance.subscribe("t:message_reaction_add", (event: any) => {
				if (event.channel_id == channelInstance.id) {
					const message = findByID(event.message_id);
					if (message) {
						// TO DO REACTION HANDLER
					}
				}
			})
		);
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
