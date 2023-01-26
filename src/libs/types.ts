export interface ReadyEvent {
	v: number;
	user_settings: UserSettings;
	user_guild_settings: UserGuildSetting[];
	user: User;
	sessions: Session[];
	session_type: string;
	session_id: string;
	resume_gateway_url: string;
	relationships: Relationship[];
	read_state: ReadState[];
	private_channels: PrivateChannel[];
	presences: any[];
	guilds: Guild[];
	country_code: string;
	connected_accounts: ConnectedAccount[];
	auth_session_id_hash: string;
	api_code_version: number;
}

export interface ConnectedAccount {
	visibility: number;
	verified: boolean;
	type: string;
	two_way_link: boolean;
	show_activity: boolean;
	revoked: boolean;
	name: string;
	metadata_visibility: number;
	id: string;
	friend_sync: boolean;
	access_token?: string;
}

export interface Guild {
	max_members: number;
	features: string[];
	roles: Role[];
	premium_progress_bar_enabled: boolean;
	application_id: null;
	nsfw_level: number;
	premium_tier: number;
	vanity_url_code: null | string;
	large: boolean;
	preferred_locale: string;
	premium_subscription_count: number;
	nsfw: boolean;
	splash: null | string;
	banner: null | string;
	id: string;
	stickers: Sticker[];
	owner_id: string;
	hub_type: null;
	system_channel_id: string;
	stage_instances: any[];
	rules_channel_id: null | string;
	home_header: null;
	channels: Channel[];
	threads: any[];
	member_count: number;
	mfa_level: number;
	afk_channel_id: null | string;
	voice_states: any[];
	max_stage_video_channel_users: number;
	presences: Presence[];
	max_video_channel_users: number;
	embedded_activities: any[];
	emojis: Emoji[];
	guild_hashes: GuildHashes;
	application_command_counts: { [key: string]: number };
	afk_timeout: number;
	region: string;
	explicit_content_filter: number;
	verification_level: number;
	discovery_splash: null | string;
	default_message_notifications: number;
	lazy: boolean;
	joined_at: Date;
	members: Member[];
	name: string;
	description: null | string;
	system_channel_flags: number;
	public_updates_channel_id: null | string;
	safety_alerts_channel_id: null | string;
	guild_scheduled_events: GuildScheduledEvent[];
	icon: null | string;
}

export interface Channel {
	version: number;
	type: number;
	position: number;
	permission_overwrites: PermissionOverwrite[];
	name: string;
	id: string;
	flags: number;
	topic?: null | string;
	rate_limit_per_user?: number;
	parent_id?: string;
	nsfw?: boolean;
	last_pin_timestamp?: Date;
	last_message_id?: null | string;
	user_limit?: number;
	rtc_region?: null | string;
	bitrate?: number;
	template?: string;
	default_sort_order?: null;
	default_reaction_emoji?: null;
	default_forum_layout?: number;
	available_tags?: any[];
	default_thread_rate_limit_per_user?: number;
	video_quality_mode?: number;
}

export interface PermissionOverwrite {
	type: number;
	id: string;
	deny: string;
	allow: string;
}

export interface Emoji {
	version: number;
	roles: string[];
	require_colons: boolean;
	name: string;
	managed: boolean;
	id: string;
	available: boolean;
	animated: boolean;
}

export interface GuildHashes {
	version: number;
	roles: Channels;
	metadata: Channels;
	channels: Channels;
}

export interface Channels {
	omitted: boolean;
	hash: string;
}

export interface GuildScheduledEvent {
	status: number;
	sku_ids: any[];
	scheduled_start_time: Date;
	scheduled_end_time: Date;
	privacy_level: number;
	name: string;
	image: null;
	id: string;
	guild_id: string;
	entity_type: number;
	entity_metadata: EntityMetadata;
	entity_id: null;
	description: string;
	channel_id: null;
}

export interface EntityMetadata {
	location: string;
}

export interface Member {
	user: User;
	roles: string[];
	premium_since: null;
	pending: boolean;
	nick: null | string;
	mute: boolean;
	joined_at: Date;
	flags: number;
	deaf: boolean;
	communication_disabled_until: Date | null;
	avatar: null;
}

export interface User {
	username: string;
	public_flags: number;
	id: string;
	discriminator: string;
	bot?: boolean;
	avatar_decoration: null;
	avatar: null | string;
	display_name?: null;
}

export interface DiscordUser extends User {
	verified: boolean;
	purchased_flags: number;
	premium_type: number;
	premium: boolean;
	phone: null;
	nsfw_allowed: boolean;
	mobile: boolean;
	mfa_enabled: boolean;
	flags: number;
	email?: string;
	desktop: boolean;
	banner_color: null;
	banner: null;
	accent_color: null;
}

export type DiscordClients = "desktop" | "mobile" | "web";
export type ClientStatuses = "online" | "idle" | "dnd" | "offline";

export interface Presence {
	user: {
		id: string;
	};
	status: string;
	client_status: {
		[key in DiscordClients]?: ClientStatuses;
	};
	activities: Activity[];
}

export interface Activity {
	type: number;
	state?: string;
	name: string;
	id: string;
	created_at: number;
}

export interface PresenceUser {
	id: string;
}

export interface Role {
	version: number;
	unicode_emoji: null | string;
	tags: Tags;
	position: number;
	permissions: string;
	name: string;
	mentionable: boolean;
	managed: boolean;
	id: string;
	icon: null | string;
	hoist: boolean;
	flags: number;
	color: number;
}

export interface Tags {
	bot_id?: string;
	premium_subscriber?: null;
}

export interface Sticker {
	version: number;
	type: number;
	tags: string;
	name: string;
	id: string;
	guild_id: string;
	format_type: number;
	description: null | string;
	available: boolean;
	asset?: string;
}

export interface PrivateChannel {
	type: number;
	recipients: User[];
	last_message_id: string;
	is_spam?: boolean;
	id: string;
	flags: number;
	owner_id?: string;
	name?: string;
	icon?: string;
}

export interface ReadState {
	mention_count: number;
	last_pin_timestamp: Date;
	last_message_id: string;
	id: string;
}

export interface Relationship {
	type: number;
	nickname: null | string;
	id: string;
	user: User;
}

export interface Session {
	status: string;
	session_id: string;
	client_info: {
		version: number;
		os: string;
		client: string;
	};
	activities: any[];
}

export interface UserGuildSetting {
	version: number;
	suppress_roles: boolean;
	suppress_everyone: boolean;
	notify_highlights: number;
	muted: boolean;
	mute_scheduled_events: boolean;
	mute_config: null;
	mobile_push: boolean;
	message_notifications: number;
	hide_muted_channels: boolean;
	guild_id: null | string;
	flags: number;
	channel_overrides: ChannelOverride[];
}

export interface ChannelOverride {
	muted: boolean;
	mute_config: null;
	message_notifications: number;
	collapsed: boolean;
	channel_id: string;
}

export interface UserSettings {
	detect_platform_accounts: boolean;
	animate_stickers: number;
	inline_attachment_media: boolean;
	status: string;
	message_display_compact: boolean;
	view_nsfw_guilds: boolean;
	timezone_offset: number;
	enable_tts_command: boolean;
	disable_games_tab: boolean;
	stream_notifications_enabled: boolean;
	animate_emoji: boolean;
	guild_folders: GuildFolder[];
	activity_joining_restricted_guild_ids: any[];
	convert_emoticons: boolean;
	afk_timeout: number;
	passwordless: boolean;
	contact_sync_enabled: boolean;
	gif_auto_play: boolean;
	custom_status: CustomStatus;
	native_phone_integration_enabled: boolean;
	allow_accessibility_detection: boolean;
	friend_discovery_flags: number;
	show_current_game: boolean;
	restricted_guilds: any[];
	developer_mode: boolean;
	view_nsfw_commands: boolean;
	render_reactions: boolean;
	locale: string;
	render_embeds: boolean;
	inline_embed_media: boolean;
	default_guilds_restricted: boolean;
	explicit_content_filter: number;
	activity_restricted_guild_ids: any[];
	theme: "dark" | "light";
}

export interface CustomStatus {
	text: string;
	expires_at: null;
	emoji_name: null | string;
	emoji_id: null | string;
}

export interface GuildFolder {
	name: null;
	id: number | null;
	guild_ids: string[];
	color: number | null;
}
