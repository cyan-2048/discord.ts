import { readable, Readable } from "stores";
import DiscordGateway from "./DiscordGateway";
import { Guild } from "./Guilds";
import type { ServerProfile, User } from "./libs/types";
import type { Unsubscriber } from "./EventEmitter";

function decimal2rgb(ns) {
	const r = Math.floor(ns / (256 * 256)),
		g = Math.floor(ns / 256) % 256,
		b = ns % 256;
	return [r, g, b];
}

export class GuildMember {
	id: string;
	props: Readable<ServerProfile>;
	updateProps: (props: Partial<ServerProfile>) => void;

	isUsedProps = false;

	constructor(public rawProfile: ServerProfile, private readonly guildInstance: Guild, private readonly gatewayInstance: DiscordGateway) {
		this.id = rawProfile.user.id;
		const setProps_default = (this.updateProps = (props) => void Object.assign(rawProfile, props));

		this.props = readable(rawProfile, (set) => {
			this.updateProps = (props) => {
				setProps_default(props);
				set(rawProfile);
			};
			this.isUsedProps = true;
			return () => {
				this.isUsedProps = false;
				this.updateProps = setProps_default;
			};
		});
	}

	/**
	 * returns the color of the username
	 */
	getColor() {
		const role = this.guildInstance.rawGuild.roles.find((o) => this.rawProfile.roles.includes(o.id) && o.color > 0);
		return role ? decimal2rgb(role.color) : null;
	}
}

interface GuildMembersChunkEvent {
	not_found: string[];
	members: ServerProfile[];
	guild_id: string;
	chunk_index: number;
	chunk_count: number;
}
interface GuildMemberRemoveEvent {
	guild_id: string;
	user: User;
}

export default class GuildMembers {
	private profiles = new Map<string, GuildMember>();
	private bindedEvents: Unsubscriber[] = [];

	constructor(initialValue: ServerProfile[], private readonly guildInstance: Guild, private readonly gatewayInstance: DiscordGateway) {
		initialValue.forEach((profile) => this.add(profile));

		this.bindedEvents.push(
			gatewayInstance.subscribe("t:guild_members_chunk", (event: GuildMembersChunkEvent) => {
				if (event.guild_id == guildInstance.id) {
					event.members.forEach((profile) => this.add(profile));
				}
			}),
			gatewayInstance.subscribe("t:guild_member_update", (profile: ServerProfile) => {
				if (profile.guild_id == guildInstance.id) {
					this.update(profile.user.id, profile);
				}
			}),
			gatewayInstance.subscribe("t:guild_member_remove", (event: GuildMemberRemoveEvent) => {
				if (event.guild_id == guildInstance.id) {
					this.profiles.delete(event.user.id);
				}
			}),
			gatewayInstance.subscribe("t:guild_member_add", (event: ServerProfile) => {
				if (event.guild_id == guildInstance.id) {
					this.add(event);
				}
			})
		);
	}

	update(id: string, props: Partial<ServerProfile>) {
		this.profiles.get(id)?.updateProps(props);
	}

	add(profile: ServerProfile) {
		this.get(profile.user.id) ? this.update(profile.user.id, profile) : this.profiles.set(profile.user.id, new GuildMember(profile, this.guildInstance, this.gatewayInstance));
	}

	get(id: string) {
		return this.profiles.get(id);
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
