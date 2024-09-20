import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fetchFn = globalThis.fetch;

export async function fetch(...args: Parameters<typeof fetchFn>): ReturnType<typeof fetchFn> {
  const options = { ...args[1] };
  for (const key in options) {
    if (typeof options[<keyof typeof options> key] === 'undefined') {
      delete options[<keyof typeof options> key];
    }
  }

  // @ts-expect-error
  options.headers = Object.fromEntries(options.headers?.entries() ?? []);

  const json = JSON.stringify([
    // eslint-disable-next-line ts/no-base-to-string
    args[0].toString(),
    Object.entries(options).sort(([ a ], [ b ]) => a.localeCompare(b)),
  ]);
  const jsonHash = createHash('md5').update(json).digest('hex');
  const pth = join(__dirname, 'networkCache', jsonHash);
  if (!existsSync(pth)) {
    const res = await fetchFn(...args);
    writeFileSync(pth, JSON.stringify({
      ...res,
      content: await res.text(),
      // @ts-expect-error
      headers: [ ...res.headers.entries() ],
    }));
  }
  const { content, ...init } = JSON.parse(readFileSync(pth).toString());
  return new Response(content, init);
};
