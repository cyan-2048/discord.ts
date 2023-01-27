import type { User } from "./libs/types";

export interface Message {
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
