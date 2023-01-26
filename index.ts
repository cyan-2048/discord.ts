import DiscordGateway from "./src/DiscordGateway";
import DiscordXHR from "./src/DiscordXHR";
import MFA from "./src/MFA";

export default class Discord {
	gateway: DiscordGateway;
	_xhr: DiscordXHR;
	xhr: DiscordXHR["xhr"];

	constructor(debug = false) {
		this.gateway = new DiscordGateway({ debug, worker: true });
		const _xhr = (this._xhr = new DiscordXHR());
		this.xhr = _xhr.xhr.bind(_xhr);
	}

	async login(token: string) {
		await this.gateway.login(token);
		this._xhr.token = token;
	}

	async signin(email: string, password: string): Promise<MFA | string> {
		const resp = (await this.xhr("auth/login", {
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
