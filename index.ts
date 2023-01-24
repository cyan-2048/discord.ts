import DiscordGateway from "./src/DiscordGateway";
import DiscordXHR from "./src/DiscordXHR";
import MFA from "./src/MFA";

export default class Discord {
	gateway: DiscordGateway;
	xhr?: DiscordXHR["xhr"];

	constructor(debug = false) {
		this.gateway = new DiscordGateway({ debug, worker: true });
	}

	async login(token: string) {
		await this.gateway.login(token);
		const discord = new DiscordXHR(token);
		this.xhr = discord.xhr.bind(discord);
	}

	async signin(email: string, password: string): Promise<MFA | string> {
		const discord = new DiscordXHR();
		const resp = (await discord.xhr("auth/login", {
			method: "post",
			data: { email, password },
		})) as any;
		if (resp.errors) throw resp;
		if (resp.captcha_service) {
			throw new Error("you are being captcha-ed! please use a token instead.");
		}
		if (resp.mfa) return new MFA(resp.mfa);
		return resp.token;
	}
}
