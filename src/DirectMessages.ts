import DiscordGateway from "./DiscordGateway";
import Message, { RawMessage } from "./Message";

export class DirectMessage extends Message {
	constructor(rawMessage: RawMessage, gatewayInstance: DiscordGateway, channelInstance: DirectMessageChannel) {
		super(rawMessage, gatewayInstance, channelInstance);
	}

	wouldPing() {
		return false;
	}
}

export class DirectMessageChannel {
	id: string = "temp";
}

export default class DirectMessages {}
