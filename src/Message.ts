import { get, Readable, readable, Writable, writable } from "@stores";
import DiscordGateway from "./DiscordGateway";
import { Guild } from "./Guilds";
import { ChannelBase, CreateMessageParams, GuildChannel } from "./GuildChannels";
import type { User } from "./libs/types";

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

export interface RawReaction {
	count: number;
	me: boolean;
	emoji: APIEmoji;
}

export interface RawMessage {
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
	reactions?: RawReaction[];
	interaction?: {
		id: string;
		type: number;
		name: string;
		user: User;
	};
}

export interface Attachment {
	id: string | number;
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

function getReactionID(emoji: APIEmoji) {
	return emoji.id || emoji.name || "";
}

class Reaction {
	id: string;
	count: Writable<number>;
	me: Writable<boolean>;

	constructor(public rawReaction: RawReaction, private readonly messageInstance: Message) {
		this.id = getReactionID(rawReaction.emoji);
		this.count = writable(rawReaction.count);
		this.me = writable(rawReaction.me);
	}

	toggle() {
		this.messageInstance.reaction(get(this.me) ? "delete" : "put", this.rawReaction.emoji);
	}
}

class ReactionsHandler {
	private reactions = new Map<string, Reaction>();

	static getReactionID = getReactionID;

	isUsed = false;
	state: Readable<Reaction[]>;
	updateState: (props: Iterable<Reaction>) => void;

	constructor(initialData: RawReaction[], private readonly messageInstance: Message) {
		let reaction_arr: Reaction[] = [];

		initialData.forEach((rawReaction) => {
			const react = new Reaction(rawReaction, messageInstance);
			this.reactions.set(react.id, react);
		});

		const setProps_default = (this.updateState = (props: Iterable<Reaction>) => {
			reaction_arr.length = 0;
			reaction_arr = [...props];
		});

		setProps_default(this.reactions.values());

		this.state = readable(reaction_arr, (set) => {
			this.updateState = (props) => {
				setProps_default(props);
				set(reaction_arr);
			};
			this.isUsed = true;
			return () => {
				this.isUsed = false;
				this.updateState = setProps_default;
			};
		});
	}

	add(emoji: APIEmoji, me = false) {
		const id = getReactionID(emoji);
		const reaction = this.reactions.get(id);

		if (reaction) {
			reaction.count.update((count) => count + 1);
			if (me) reaction.me.set(true);
		} else {
			const newReaction = new Reaction({ count: 1, me, emoji }, this.messageInstance);
			this.reactions.set(id, newReaction);
			this.updateState(this.reactions.values());
		}
	}

	remove(emoji: APIEmoji, me = false) {
		const id = getReactionID(emoji);
		const reaction = this.reactions.get(id);

		if (reaction) {
			let removed = false;
			reaction.count.update((count) => {
				const r = count - 1;
				if (!r) removed = true;
				return r;
			});

			if (removed) {
				this.reactions.delete(id);
				this.updateState(this.reactions.values());
				return;
			}

			if (me) reaction.me.set(false);
		}
	}

	removeEmoji(emoji: APIEmoji) {
		const id = getReactionID(emoji);
		this.reactions.delete(id);
		this.updateState(this.reactions.values());
	}

	clear() {
		this.reactions.clear();
		this.updateState([]);
	}
}

const check_arr = (e: any) => Array.isArray(e) && Boolean(e[0]);

/**
 * TODO: reply method, must need to create Channel class
 */
export default class Message {
	id: string;

	props: Readable<RawMessage>;
	updateProps: (props: Partial<RawMessage>) => void;

	content: Readable<RawMessage["content"]>;
	updateContent: (content: RawMessage["content"]) => void;

	isUsed = false;
	isUsedProps = false;
	channelID: string;

	deleted = writable(false);
	reactions: ReactionsHandler;

	/**
	 * TODO: use channel class instead of string id of channel and guild
	 */
	constructor(public rawMessage: RawMessage, private readonly gatewayInstance: DiscordGateway, readonly channelInstance: ChannelBase, readonly guildInstance?: Guild) {
		this.id = rawMessage.id;
		// not allowed to set new values to the writable
		// we're only allowed to update object
		// avoiding making new instances of objects
		const setProps_default = (this.updateProps = (props) => void Object.assign(rawMessage, props));

		this.props = readable(rawMessage, (set) => {
			this.updateProps = (props) => {
				setProps_default(props);
				set(rawMessage);
			};
			this.isUsedProps = true;
			return () => {
				this.isUsedProps = false;
				this.updateProps = setProps_default;
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

		this.channelID = channelInstance.id;

		this.reactions = new ReactionsHandler(rawMessage.reactions || [], this);
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

	pin(put = true) {
		return this.gatewayInstance.xhr(`channels/${this.channelID}/pins/${this.id}`, { method: put ? "put" : "delete" });
	}

	unpin() {
		return this.pin(false);
	}

	reply(message: string = "", opts: Partial<CreateMessageParams> = {}, attachments?: File[] | Blob[]) {
		return this.channelInstance.sendMessage(
			message,
			{
				...opts,
				message_reference: {
					message_id: this.id,
					channel_id: this.channelInstance.id,
				},
			},
			attachments
		);
	}

	_wouldPing() {
		const userID = this.gatewayInstance.user?.id || "";

		if (!userID) return false;

		const { mention_everyone, mentions } = this.rawMessage;

		return Boolean(mention_everyone || (check_arr(mentions) && mentions.find((a) => a.id == userID)));
	}

	wouldPing(...args: any[]) {
		const userID = this.gatewayInstance.user?.id || "";
		const roles = this.guildInstance?.members.get(userID)?.rawProfile.roles || [];

		if (!userID) return false;

		const { mention_roles } = this.rawMessage;

		return this._wouldPing() || Boolean(check_arr(mention_roles) && mention_roles.some((r) => roles?.includes(r)));
	}
}
