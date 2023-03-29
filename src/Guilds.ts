import { Readable, readable } from "svelte/store";
import DiscordGateway from "./DiscordGateway";
import { Unsubscriber } from "./EventEmitter";
import GuildChannels from "./GuildChannels";
import GuildMembers from "./GuildMembers";
import { RawGuild, PermissionOverwrite, UserGuildSetting } from "./libs/types";

export const bitwise2text = {
	64: "add_reactions",
	8: "admin",
	1024: "read",
	2048: "write",
	8192: "manage_messages",
	32768: "attach",
	65536: "history",
	131072: "ping_everyone",
	262144: "ext_emojis",
	137438953472: "ext_stickers",
	17179869184: "manage_threads",
	34359738368: "make_pub_thread",
	68719476736: "make_priv_thread",
	274877906944: "write_thread",
};

interface RoleAccess {
	add_reactions?: boolean;
	admin?: boolean;
	read?: boolean;
	write?: boolean;
	manage_messages?: boolean;
	attach?: boolean;
	history?: boolean;
	ping_everyone?: boolean;
	ext_emojis?: boolean;
	ext_stickers?: boolean;
	manage_threads?: boolean;
	make_pub_thread?: boolean;
	make_priv_thread?: boolean;
	write_thread?: boolean;
}

export class Guild {
	id: RawGuild["id"];

	updateProps: (props: Partial<RawGuild>) => void;
	props: Readable<RawGuild>;
	isUsedProps: boolean = false;

	members: GuildMembers;
	channels: GuildChannels;

	constructor(public rawGuild: RawGuild, private readonly guildSettings: UserGuildSetting[], private readonly gatewayInstance: DiscordGateway) {
		this.id = rawGuild.id;
		const setProps_default = (this.updateProps = (props) => void Object.assign(rawGuild, props));

		rawGuild.roles.sort((a, b) => a.position - b.position);

		this.members = new GuildMembers(rawGuild.members, this, gatewayInstance);
		this.channels = new GuildChannels(rawGuild.channels, guildSettings, this, gatewayInstance);

		this.props = readable(rawGuild, (set) => {
			this.updateProps = (props) => {
				setProps_default(props);
				set(rawGuild);
			};
			this.isUsedProps = true;
			return () => {
				this.isUsedProps = false;
				this.updateProps = setProps_default;
			};
		});
	}

	async getServerProfile(userId: string) {
		const e = this.members.get(userId);
		if (e) return e;

		const res = await this.gatewayInstance.xhr(`guilds/${this.id}/members/${userId == "@me" ? this.gatewayInstance.user?.id : userId}`);
		console.log(res);
		this.members.add(res);

		return res;
	}

	/**
	 * undocumented "Lazy Guilds" api, it will request for members and other state changes for the guild
	 */
	lazy(user_ids?: string[]) {
		this.gatewayInstance.send({
			op: 14,
			d: {
				activities: true,
				guild_id: this.id,
				threads: false,
				typing: true,
			},
		});
		this.gatewayInstance.send({
			op: 8,
			d: {
				guild_id: [this.id],
				query: "",
				limit: 100,
				presences: false,
				user_ids,
			},
		});
	}

	parseRoleAccess(channelOverwrites: PermissionOverwrite[] = []) {
		const rej = new Error("Gateway not initialized properly!");

		let obj: RoleAccess = {};

		const user_id = this.gatewayInstance.user?.id;

		if (!user_id) throw rej;

		const serverRoles = this.rawGuild.roles;
		const isOwner = this.rawGuild.owner_id == user_id;
		const profileRoles = (this.members.get(user_id)?.rawProfile.roles || []).concat(user_id);

		if (!profileRoles || !serverRoles) throw rej;

		let everyone_id: string | null = null;

		if (serverRoles?.length > 0)
			[...serverRoles]
				.sort((a, b) => a.position - b.position)
				.filter((o) => {
					const isEveryone = o.position === 0;
					if (isEveryone) everyone_id = o.id;

					return profileRoles.includes(o.id) || isEveryone;
				})
				.map((o) => o.permissions)
				.forEach((perms) => {
					Object.entries(bitwise2text).forEach(([num, perm]) => {
						if ((+num & +perms) == +num) obj[perm] = true;
					});
				});

		if (obj.admin === true || isOwner) {
			Object.values(bitwise2text).forEach((a) => (obj[a] = true));
			// console.error("person is admin, gib all perms true", obj);
			return obj;
		}

		//	let grouped = groupBy(channelOverwrites, "type");

		const overwrites = [...channelOverwrites];

		if (everyone_id) {
			const everyone = overwrites.findIndex((o) => o.id == everyone_id);
			if (everyone != -1) {
				overwrites.unshift(overwrites.splice(everyone, 1)[0]);
				profileRoles.unshift(everyone_id);
			}
		}

		overwrites.forEach((o) => {
			if (profileRoles.includes(o.id)) {
				Object.entries(bitwise2text).forEach(([num, perm]) => {
					if ((+o.deny & +num) === +num) obj[perm] = false;
					if ((+o.allow & +num) === +num) obj[perm] = true;
				});
			}
		});

		return obj;
	}

	isMuted() {
		const foundGuild = this.guildSettings.find((a) => a.guild_id == this.id);
		return Boolean(foundGuild && foundGuild.muted);
	}
}

export default class Guilds {
	private guilds: Map<string, Guild> = new Map();
	private bindedEvents: Unsubscriber[] = [];

	constructor(initialData: RawGuild[], private readonly guildSettings: UserGuildSetting[], private readonly gatewayInstance: DiscordGateway) {
		initialData.forEach((rawGuild) => this.add(rawGuild));
	}

	update(id: string, props: Partial<RawGuild>) {
		this.guilds.get(id)?.updateProps(props);
	}

	add(guild: RawGuild) {
		this.get(guild.id) ? this.update(guild.id, guild) : this.guilds.set(guild.id, new Guild(guild, this.guildSettings, this.gatewayInstance));
	}

	getAll() {
		return [...this.guilds.values()];
	}

	get(id: string) {
		return this.guilds.get(id);
	}

	remove(id: string) {
		this.guilds.delete(id);
	}
}
