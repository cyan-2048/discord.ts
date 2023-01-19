var i=class {
    constructor() {
      this.events = new Map;
    }
    on(n, e) {
      this.events.set(n, (this.events.get(n) || new Set).add(e));
    }
    once(n, e) {
      let t = (...s) => {
        e(...s), this.off(n, t);
      };
      this.on(n, t);
    }
    off(n, e) {
      var t;
      (t = this.events.get(n)) == null || t.delete(e);
    }
    emit(n, ...e) {
      var t;
      (t = this.events.get(n)) == null || t.forEach((s) => s(...e));
    }
  };var o=class extends i {
    constructor(e = false) {
      super();
      this._debug = e;
      this.token = null;
      this.ws = null;
      this.sequence_num = null;
      this.authenticated = false;
      this.streamURL = "wss://gateway.discord.gg/?v=9&encoding=json";
    }
    debug(...e) {
      this._debug && console.info("[gateway] ", ...e);
    }
    login(e) {
      this.token = e;
    }
    send(e) {
      this.debug("send:", e), this.ws.send(JSON.stringify(e));
    }
    handlePacket(e) {
      var t = JSON.parse(e.data);
      this.debug("Handling packet with OP ", t.op);
      var s = { 0: this.packetDispacth, 9: this.packetInvalidSess, 10: this.packetHello, 11: this.packetAck };
      t.op in s ? s[t.op].apply(this, [t]) : this.debug("OP " + t.op + "not found!");
    }
    packetDispacth(e) {
      this.sequence_num = e.s , this.debug("dispatch:", e), this.emit("t:" + e.t.toLowerCase(), e.d);
    }
    packetInvalidSess(e) {
      this.debug("sess inv:", e), this.ws.close();
    }
    packetHello(e) {
      var t = this.ws;
      this.debug("Sending initial heartbeat..."), this.send({ op: 1, d: this.sequence_num });
      var s = setInterval(() => {
        if (t !== this.ws)
          return clearInterval(s);
        this.debug("Sending heartbeat..."), this.send({ op: 1, d: this.sequence_num });
      }, e.d.heartbeat_interval);
      this.debug("heartbeat interval: ", e.d.heartbeat_interval);
    }
    packetAck() {
      this.authenticated || (this.authenticated = true , this.send({ op: 2, d: { status: "online", token: this.token, intents: 131071, properties: { $os: "Android", $browser: "Discord Android", $device: "phone" } } }));
    }
    close() {
      var e;
      (e = this.ws) == null || e.close(), this.ws = null;
    }
    init() {
      if (!this.token)
        throw Error("You need to authenticate first!");
      this.debug("Connecting to gateway..."), this.close();
      let e = new WebSocket(this.streamURL);
      this.ws = e , e.addEventListener("message", (t) => this.handlePacket(t)), e.addEventListener("open", () => this.debug("Sending Identity [OP 2]...")), e.addEventListener("close", (t) => {
        this.ws = null , console.error("Discord gateway closed!"), this.emit("close", t);
      });
    }
  };(function d() {
    let a = new o;
    a.login("token"), a.init();
  })()
