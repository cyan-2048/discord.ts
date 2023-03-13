# discord.ts

Discord4KaiOS - with a different approach😉

Attempt on making a library using TypeScript.

- supports zlib-stream, uses Discord Web's stolen pako implementation
- should work fine on nodejs
- Object Oriented approach, basically a discord.js knockoff lmao
- will try to be efficient as much as possible, will avoid making major changes
- ~~This library uses svelte/stores, so it's very useful for a discord client that is written in svelte.~~ since I'm moving to preact, I made a [partial](src/libs/stores.ts) implementation of `svelte/store` using preact's [signals](https://preactjs.com/guide/v10/signals/), it should [still work](https://svelte.dev/tutorial/custom-stores) with svelte stores, I recommend going to the `tsconfig.json` and changing the path to `stores` to the svelte one to avoid having to bundle preact...
