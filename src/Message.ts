import { Readable, readable, Subscriber, Writable, writable } from "svelte/store";
import DiscordGateway from "./DiscordGateway";
import type { User } from "./libs/types";

export interface MessageRaw {
	id: string;
	type: number;
	content: string;
	channel_id: string;
	author: User;
	attachments: Attachment[];
	embeds: Embed[];
	mentions: User[];
	mention_roles: string[];
	pinned: boolean;
	mention_everyone: boolean;
	tts: boolean;
	timestamp: Date;
	edited_timestamp: Date | null;
	flags: number;
	components: any[];
	message_reference?: MessageReference;
	referenced_message?: ReferencedMessage;
	sticker_items?: StickerItem[];
}

export interface Attachment {
	id: string;
	filename: string;
	size: number;
	url: string;
	proxy_url: string;
	content_type?: string;
	width?: number;
	height?: number;
}

export interface Embed {
	type: string;
	url: string;
	provider?: Provider;
	thumbnail: Thumbnail;
	video?: Thumbnail;
}

export interface Provider {
	name: string;
	url: string;
}

export interface Thumbnail {
	url: string;
	proxy_url: string;
	width: number;
	height: number;
}

export interface MessageReference {
	channel_id: string;
	message_id: string;
	guild_id?: string;
}

export interface ReferencedMessage {
	id: string;
	type: number;
	content: string;
	channel_id: string;
	author: User;
	attachments: any[];
	embeds: any[];
	mentions: User[];
	mention_roles: string[];
	pinned: boolean;
	mention_everyone: boolean;
	tts: boolean;
	timestamp: Date;
	edited_timestamp: null;
	flags: number;
	components: any[];
	sticker_items?: StickerItem[];
	message_reference?: MessageReference;
}

export interface StickerItem {
	id: string;
	format_type: number;
	name: string;
}

/**
 * Not documented but mentioned
 */
export interface APIPartialEmoji {
	/**
	 * Emoji id
	 */
	id: string | null;
	/**
	 * Emoji name (can be null only in reaction emoji objects)
	 */
	name: string | null;
	/**
	 * Whether this emoji is animated
	 */
	animated?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/emoji#emoji-object-emoji-structure
 */
export interface APIEmoji extends APIPartialEmoji {
	/**
	 * Roles this emoji is whitelisted to
	 */
	roles?: string[];
	/**
	 * User that created this emoji
	 */
	user?: User;
	/**
	 * Whether this emoji must be wrapped in colons
	 */
	require_colons?: boolean;
	/**
	 * Whether this emoji is managed
	 */
	managed?: boolean;
	/**
	 * Whether this emoji can be used, may be false due to loss of Server Boosts
	 */
	available?: boolean;
}

/**
 * TODO: reply method, must need to create Channel class
 */
export default class Message {
	id: string;

	properties: Readable<MessageRaw>;
	updateProperties: (props: Partial<MessageRaw>) => void;

	content: Readable<MessageRaw["content"]>;
	updateContent: (content: MessageRaw["content"]) => void;

	isUsed = false;
	isUsedProps = false;

	/**
	 * TODO: use channel class instead of string id of channel and guild
	 */
	constructor(public rawMessage: MessageRaw, private gatewayInstance: DiscordGateway, private channelID?: string, private guildID?: string) {
		this.id = rawMessage.id;
		// not allowed to set new values to the writable
		// we're only allowed to update object
		// avoiding making new instances of objects

		const setProps_default = (this.updateProperties = (props) => void Object.assign(rawMessage, props));

		this.properties = readable(rawMessage, (set) => {
			this.updateProperties = (props) => {
				setProps_default(props);
				set(rawMessage);
			};
			this.isUsedProps = true;
			return () => {
				this.isUsedProps = false;
				this.updateProperties = setProps_default;
			};
		});

		const setContent_default = (this.updateContent = (content) => (rawMessage.content = content));

		this.content = readable(rawMessage.content, (set) => {
			this.isUsed = true;
			this.updateContent = (content) => {
				setContent_default(content);
				set(content);
			};
			return () => {
				this.isUsed = false;
				this.updateContent = setContent_default;
			};
		});

		if (!channelID) this.channelID = rawMessage.channel_id;
	}

	async edit(content: string, opts: any = {}) {
		if (this.gatewayInstance.user?.id == this.rawMessage.author.id)
			return this.gatewayInstance.xhr(`channels/${this.channelID}/messages/${this.id}`, {
				method: "patch",
				data: Object.assign({ content: content.trim() }, opts),
			});
	}

	async delete() {
		return this.gatewayInstance.xhr(`channels/${this.channelID}/messages/${this.id}`, { method: "delete" });
	}

	_emojiURI(emoji: APIEmoji | string) {
		const en = encodeURIComponent;
		if (typeof emoji === "object") {
			return emoji.id ? en(emoji.name + ":" + emoji.id) : en(emoji.name || "");
		}
		return en(String(emoji));
	}

	async reaction(method: "put" | "delete", emoji: APIEmoji | string, user = "@me") {
		return this.gatewayInstance.xhr(`channels/${this.channelID}/messages/${this.id}/reactions/${this._emojiURI(emoji)}/${user}`, { method });
	}

	async addReaction(...args: [APIEmoji | string, string?]) {
		return this.reaction("put", ...args);
	}

	async removeReaction(...args: [APIEmoji | string, string?]) {
		return this.reaction("delete", ...args);
	}
}
