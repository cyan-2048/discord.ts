import { readable, Readable } from "@stores";
import DiscordGateway from "./DiscordGateway";
import { Guild } from "./Guilds";
import type { ServerProfile, User } from "./libs/types";
import type { Unsubscriber } from "./EventEmitter";
import { Deferred } from "./libs/utils";

function decimal2rgb(ns: number) {
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
					event.members.forEach((profile) => {
						this.add(profile);
					});
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
		if (props.user) this.gatewayInstance.users_cache.set(id, props.user);
		this.profiles.get(id)?.updateProps(props);
	}

	private waiting = new Map();

	add(profile: ServerProfile) {
		const userID = profile.user.id,
			gateway = this.gatewayInstance;
		gateway.users_cache.set(userID, profile.user);
		this.profiles.get(userID) ? this.update(userID, profile) : this.profiles.set(userID, new GuildMember(profile, this.guildInstance, gateway));

		const waited = this.waiting.get(userID);
		if (waited) {
			// i am unsure if this is actually needed
			// this.alreadySent.delete(userID);
			waited.resolve(this.profiles.get(userID));
			this.waiting.delete(userID);
		}
	}

	private lastRequest = performance.now();
	private alreadySent = new Set<string>();

	private request() {
		if (performance.now() - this.lastRequest < 3000) return;

		setTimeout(async () => {
			this.lastRequest = performance.now();
			if (this.waiting.size == 0) return;
			const user_ids = [...this.waiting.keys()].filter((id) => !this.alreadySent.has(id));
			if (user_ids.length == 0) return;
			user_ids.forEach((a) => this.alreadySent.add(a));

			this.gatewayInstance.send({
				op: 8,
				d: {
					guild_id: [this.guildInstance.id],
					query: undefined,
					limit: undefined,
					presences: true,
					user_ids,
				},
			});
		}, 1000 + Math.floor(Math.random() * 1000));
	}

	/**
	 * lazily load user, useful so that we don't get banned for spamming requests
	 * @param userID
	 */
	lazy(userID: string): Promise<GuildMember> {
		const member = this.profiles.get(userID);
		if (member) return Promise.resolve(member);

		const alreadyWaiting = this.waiting.get(userID);
		if (alreadyWaiting) return alreadyWaiting.promise;

		const deferred = new Deferred<GuildMember>();
		this.waiting.set(userID, deferred);
		this.request();

		return deferred.promise;
	}

	get(id: string) {
		const profile = this.profiles.get(id);
		if (!profile) this.lazy(id);
		return profile;
	}

	eject() {
		this.bindedEvents.forEach((e) => e());
	}
}
