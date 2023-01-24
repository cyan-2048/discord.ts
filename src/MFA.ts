import DiscordXHR from "./DiscordXHR";

export default class MFA extends DiscordXHR {
	constructor(public ticket: string) {
		super();
	}
	async auth(code: string) {
		let len = code.length;

		if (code === "" || isNaN(Number(code)) || len < 0 || len > 8) {
			throw new Error("Invalid code");
		} else {
			const resp = (await this.xhr("auth/mfa/totp", {
				method: "post",
				data: {
					ticket: this.ticket,
					code,
				},
			})) as any;
			if (!resp.token) throw resp;
			return resp.token;
		}
	}
}
