/**
 * What the web tier does not log, forward or leak (privacy stage A), pinned as
 * plain text: no browser, no nginx binary, no Docker.
 *
 * The settings below are easy to lose and invisible when lost. A request that
 * reaches a container with the stock nginx image is logged to stdout with the
 * client address, the full request line, the referrer and the user agent
 * unless a server block says `access_log off;`, and a proxy that forwards
 * `$remote_addr` hands another process every visitor's address. Nothing fails
 * when either comes back, so this reads the four files that decide it and
 * fails with the line to fix:
 *
 * - `apps/www/Dockerfile`: the server block the image writes to
 *   conf.d/default.conf (the one `docker run` and the published image serve).
 * - `apps/www/nginx.https.conf`: the compose stack's template, which replaces
 *   that file (two server blocks, :80 and :443).
 * - `apps/www/nginx.security-headers.conf`: the `Referrer-Policy` both include.
 * - `nginx.conf` at the repo root: the TTS front-end, which has its own http
 *   block and so its own (otherwise compiled-in) access log.
 *
 * Deliberately not covered: `error_log` (left on - nginx's error log still
 * carries a client address and request line when an upstream fails, and cannot
 * be made address-free without dropping nginx's own errors), the TTS proxy
 * snippet's forwarding (`nginx.tts-proxy.conf` and the root `nginx.conf`'s
 * `proxy_set_header`s are not part of this change), and the compose
 * `logging:` bound in infra/compose/www.yml.
 *
 * Why a parser and not a regex over the text: `access_log off;` in a comment,
 * or in the wrong block, reads the same as the real thing to a substring
 * match. The tiny block parser below understands comments, quotes and braces
 * (and throws on unbalanced ones), which is all these files use. It is not a
 * general nginx parser.
 *
 * The checks are pure functions returning problems, and the last group feeds
 * them known-bad configs, so a test that has quietly stopped looking at
 * anything cannot stay green.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/serving-privacy/__tests__ -> the repository root. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.."
)

const DOCKERFILE = "apps/www/Dockerfile"
const HTTPS_CONF = "apps/www/nginx.https.conf"
const HEADERS_CONF = "apps/www/nginx.security-headers.conf"
const ROOT_CONF = "nginx.conf"
const VITE_CONFIG = "apps/www/vite.config.ts"

const HEADERS_INCLUDE = "include /etc/nginx/security-headers.conf"
const FILE_HOST_LOCATION = "location ^~ /api/file-host/"
const TABS_LOCATION = "location ^~ /api/file-host/api/v1/tabs"

/** The headers file_host must not be sent, by lower-cased name. */
const CLIENT_ADDRESS_HEADERS = [
  ["x-real-ip", "X-Real-IP"],
  ["x-forwarded-for", "X-Forwarded-For"],
] as const

/** Variables that carry a client address, in any header value. */
const CLIENT_ADDRESS_VARIABLE =
  /\$(?:remote_addr|binary_remote_addr|realip_remote_addr|proxy_add_x_forwarded_for|http_x_forwarded_for|http_x_real_ip|proxy_protocol_addr)\b/

type Block = {
  /** The text before `{`, whitespace collapsed; "" for the top level. */
  readonly head: string
  /** Each `...;` directly inside, whitespace collapsed, `;` dropped. */
  readonly directives: Array<string>
  readonly children: Array<Block>
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Parses nginx config text into nested blocks. Understands `#` comments
 * (only where a token starts, as nginx does), single and double quotes, and
 * `${name}` references; throws on an unterminated quote or unbalanced braces.
 */
function parseNginx(source: string, label: string): Block {
  const root: Block = { head: "", directives: [], children: [] }
  const parents: Array<Block> = []
  let current = root
  let token = ""
  let i = 0

  while (i < source.length) {
    const ch = source.charAt(i)
    if (ch === '"' || ch === "'") {
      let end = i + 1
      while (end < source.length && source.charAt(end) !== ch) {
        end += source.charAt(end) === "\\" ? 2 : 1
      }
      if (end >= source.length) {
        throw new Error(`${label}: unterminated ${ch} quote near "${token}"`)
      }
      token += source.slice(i, end + 1)
      i = end + 1
    } else if (ch === "$" && source.charAt(i + 1) === "{") {
      const end = source.indexOf("}", i)
      if (end === -1) throw new Error(`${label}: unterminated "\${" reference`)
      token += source.slice(i, end + 1)
      i = end + 1
    } else if (ch === "#" && (token === "" || /\s$/.test(token))) {
      const end = source.indexOf("\n", i)
      i = end === -1 ? source.length : end
    } else if (ch === ";") {
      current.directives.push(collapse(token))
      token = ""
      i += 1
    } else if (ch === "{") {
      const child: Block = {
        head: collapse(token),
        directives: [],
        children: [],
      }
      current.children.push(child)
      parents.push(current)
      current = child
      token = ""
      i += 1
    } else if (ch === "}") {
      const parent = parents.pop()
      if (parent === undefined) {
        throw new Error(`${label}: "}" with no open block`)
      }
      current = parent
      token = ""
      i += 1
    } else {
      token += ch
      i += 1
    }
  }

  if (parents.length > 0) {
    throw new Error(`${label}: ${parents.length} block(s) never closed`)
  }
  if (collapse(token) !== "") {
    throw new Error(`${label}: trailing text with no ";": "${collapse(token)}"`)
  }
  return root
}

function walk(block: Block): Array<Block> {
  return [block, ...block.children.flatMap(walk)]
}

function describeBlock(block: Block): string {
  const listen = block.directives.find((d) => d.startsWith("listen "))
  return `\`${block.head === "" ? "(top level)" : block.head}\`${
    listen === undefined ? "" : ` (${listen})`
  }`
}

/** Every `proxy_set_header` in a block, by lower-cased header name. */
function proxyHeaders(block: Block): Map<string, string> {
  const headers = new Map<string, string>()
  for (const directive of block.directives) {
    const match = /^proxy_set_header (\S+) ?(.*)$/.exec(directive)
    if (match) headers.set(match[1].toLowerCase(), match[2])
  }
  return headers
}

/**
 * No `access_log` anywhere in `root` may be anything but `off` (a nested
 * `access_log /dev/stdout;` re-enables it for that block), and each of
 * `owners` must say `access_log off;` itself.
 */
function accessLogProblems(
  file: string,
  root: Block,
  owners: Array<Block>
): Array<string> {
  const problems: Array<string> = []
  for (const block of walk(root)) {
    for (const directive of block.directives) {
      if (/^access_log\b/.test(directive) && directive !== "access_log off") {
        problems.push(
          `${file}: \`${directive};\` in ${describeBlock(block)} turns an access log back on. ` +
            "Replace it with `access_log off;` - requests carry visitors' addresses, query strings and user agents."
        )
      }
    }
  }
  for (const owner of owners) {
    if (!owner.directives.includes("access_log off")) {
      problems.push(
        `${file}: ${describeBlock(owner)} has no \`access_log off;\`. ` +
          "Add it directly in that block; without it the stock image logs every request to stdout."
      )
    }
  }
  return problems
}

/** What each server block that proxies to file_host must and must not do. */
function fileHostProblems(file: string, servers: Array<Block>): Array<string> {
  const problems: Array<string> = []
  for (const server of servers) {
    const where = describeBlock(server)
    const heads = server.children.map((child) => child.head)
    const proxyAt = heads.indexOf(FILE_HOST_LOCATION)
    const tabsAt = heads.indexOf(TABS_LOCATION)

    if (proxyAt === -1) {
      problems.push(
        `${file}: ${where} has no \`${FILE_HOST_LOCATION} {\`. ` +
          "If the proxy moved, update this test to follow it; do not delete the check."
      )
      continue
    }

    if (tabsAt === -1) {
      problems.push(
        `${file}: ${where} has no \`${TABS_LOCATION} { return 404; }\` ahead of the file-host proxy. ` +
          "file_host's tabs routes are unauthenticated and this proxy has no path allowlist."
      )
    } else {
      if (tabsAt > proxyAt) {
        problems.push(
          `${file}: in ${where} the tabs location is below the file-host proxy. Move it above (nginx's longest ` +
            "prefix wins either way, but the stop-gap should be read before the proxy it carves out of)."
        )
      }
      const tabs = server.children[tabsAt]
      if (
        tabs.directives.length !== 1 ||
        tabs.directives[0] !== "return 404" ||
        tabs.children.length > 0
      ) {
        problems.push(
          `${file}: in ${where}, \`${TABS_LOCATION}\` must contain exactly \`return 404;\`, ` +
            `found: ${JSON.stringify(tabs.directives)}.`
        )
      }
    }

    const headers = proxyHeaders(server.children[proxyAt])
    for (const [key, name] of CLIENT_ADDRESS_HEADERS) {
      const value = headers.get(key)
      if (value !== '""') {
        problems.push(
          `${file}: in ${where}, \`${FILE_HOST_LOCATION}\` must have \`proxy_set_header ${name} "";\` ` +
            `(an empty value makes nginx drop the header, a client-supplied one included); found ${
              value ?? "none"
            }.`
        )
      }
    }
    for (const [name, value] of headers) {
      if (CLIENT_ADDRESS_VARIABLE.test(value)) {
        problems.push(
          `${file}: in ${where}, \`proxy_set_header ${name} ${value};\` forwards the client address to file_host. ` +
            "Remove it or set it to an empty string."
        )
      }
    }
  }
  return problems
}

/** `Referrer-Policy` is `no-referrer`, set once, and reaches every server. */
function referrerProblems(
  headersConf: Block,
  servers: ReadonlyArray<{ readonly file: string; readonly block: Block }>
): Array<string> {
  const problems: Array<string> = []
  const policies = headersConf.directives.filter((d) =>
    /^add_header Referrer-Policy\b/i.test(d)
  )
  if (policies.length !== 1) {
    problems.push(
      `${HEADERS_CONF}: expected exactly one \`add_header Referrer-Policy "no-referrer" always;\`, found ${policies.length}.`
    )
  } else if (
    !/^add_header Referrer-Policy "no-referrer"(?: always)?$/i.test(policies[0])
  ) {
    problems.push(
      `${HEADERS_CONF}: \`${policies[0]};\` must be \`add_header Referrer-Policy "no-referrer" always;\` - ` +
        "any other policy sends the page URL (path and query) to some other origin."
    )
  }
  for (const { file, block } of servers) {
    if (!block.directives.includes(HEADERS_INCLUDE)) {
      problems.push(
        `${file}: ${describeBlock(block)} does not \`${HEADERS_INCLUDE};\`, so it serves no Referrer-Policy at all.`
      )
    }
  }
  return problems
}

function read(path: string): string {
  const text = readFileSync(resolve(REPO_ROOT, path), "utf8")
  // A wrong REPO_ROOT or an emptied file would otherwise leave every check
  // below with nothing to look at.
  if (text.trim() === "") throw new Error(`${path} was read but is empty`)
  return text
}

/** The nginx config the Dockerfile's runtime stage writes to conf.d. */
function dockerfileServerConf(dockerfile: string): string {
  const match =
    /RUN <<'?EOF'?\s*>\s*\/etc\/nginx\/conf\.d\/default\.conf\r?\n([\s\S]*?)\r?\nEOF\b/.exec(
      dockerfile
    )
  if (!match) {
    throw new Error(
      `${DOCKERFILE} no longer writes /etc/nginx/conf.d/default.conf from a ` +
        "`RUN <<'EOF' > ...` heredoc. Point this test at wherever the image's " +
        "nginx config comes from now; do not delete the check."
    )
  }
  return match[1]
}

function serversOf(root: Block): Array<Block> {
  return walk(root).filter((block) => block.head === "server")
}

/**
 * `vite dev` and `vite preview` proxy `/api/file-host/` with no path
 * allowlist, so the tabs stop-gap needs the same refusal there as in nginx.
 * Reads the proxy's entry in vite.config.ts as text (that file runs Vite, so
 * it cannot be imported here) and requires its `bypass` to ask
 * `isBlockedProxyPath`, the predicate `file-host.dev.ts` defines and
 * dev-target.test.ts exercises.
 */
function viteProxyProblems(file: string, text: string): Array<string> {
  const entry = /\[FILE_HOST_PROXY_PATH\]:\s*\{([\s\S]*?)\n {8}\},/.exec(text)
  if (!entry) {
    return [`${file}: no proxy entry for FILE_HOST_PROXY_PATH to check`]
  }
  return /bypass:[^\n]*\n?[^\n]*isBlockedProxyPath\(/.test(entry[1])
    ? []
    : [
        `${file}: the file_host proxy has no bypass that asks isBlockedProxyPath, ` +
          "so the unauthenticated tabs routes are reachable through vite dev.",
      ]
}

const dockerfile = read(DOCKERFILE)
const dockerConf = parseNginx(dockerfileServerConf(dockerfile), DOCKERFILE)
const dockerServers = serversOf(dockerConf)

const httpsConf = parseNginx(read(HTTPS_CONF), HTTPS_CONF)
const httpsServers = serversOf(httpsConf)

const headersConf = parseNginx(read(HEADERS_CONF), HEADERS_CONF)

const rootConf = parseNginx(read(ROOT_CONF), ROOT_CONF)
const rootHttp = rootConf.children.filter((block) => block.head === "http")

describe("the configs are read, not assumed", () => {
  it("finds the server blocks the other checks run over", () => {
    expect(dockerServers, `${DOCKERFILE}: server blocks`).toHaveLength(1)
    // :80 and :443. A third is fine; fewer means a listener lost its checks.
    expect(
      httpsServers.length,
      `${HTTPS_CONF}: server blocks`
    ).toBeGreaterThanOrEqual(2)
    expect(rootHttp, `${ROOT_CONF}: top-level http blocks`).toHaveLength(1)
    expect(
      headersConf.directives.length,
      `${HEADERS_CONF}: directives`
    ).toBeGreaterThan(0)
  })

  it("copies the security headers into the image the Dockerfile serves", () => {
    expect(dockerfile).toMatch(
      /^COPY apps\/www\/nginx\.security-headers\.conf \/etc\/nginx\/security-headers\.conf$/m
    )
  })
})

describe("access logs stay off", () => {
  it("in the Dockerfile's server block", () => {
    expect(accessLogProblems(DOCKERFILE, dockerConf, dockerServers)).toEqual([])
  })

  it("in every server block of nginx.https.conf", () => {
    expect(accessLogProblems(HTTPS_CONF, httpsConf, httpsServers)).toEqual([])
  })

  it("in the http block of the root nginx.conf", () => {
    expect(accessLogProblems(ROOT_CONF, rootConf, rootHttp)).toEqual([])
  })
})

describe("the file_host proxy", () => {
  it("forwards no client address, and 404s the unauthenticated tabs routes", () => {
    expect(fileHostProblems(HTTPS_CONF, httpsServers)).toEqual([])
  })

  it("is refused the tabs routes by the Vite proxy as well", () => {
    expect(viteProxyProblems(VITE_CONFIG, read(VITE_CONFIG))).toEqual([])
  })

  it("no longer sets the old forwarding lines anywhere in nginx.https.conf", () => {
    const directives = httpsServers
      .flatMap(walk)
      .flatMap((block) => block.directives)
    expect(
      directives.filter((d) => /X-Real-IP \$remote_addr/i.test(d))
    ).toEqual([])
    expect(
      directives.filter((d) =>
        /X-Forwarded-For \$proxy_add_x_forwarded_for/i.test(d)
      )
    ).toEqual([])
  })
})

describe("Referrer-Policy", () => {
  it("is no-referrer, and every server block includes it", () => {
    expect(
      referrerProblems(headersConf, [
        ...dockerServers.map((block) => ({ file: DOCKERFILE, block })),
        ...httpsServers.map((block) => ({ file: HTTPS_CONF, block })),
      ])
    ).toEqual([])
  })
})

describe("the checks can fail", () => {
  const bad = (text: string): Block => parseNginx(text, "fixture")

  it("parses blocks, ignores comments, and throws on unbalanced braces", () => {
    const root = bad(`
      # access_log off;
      server { listen 80; # access_log off;
        location /x { return 404; }
        add_header X "a;b{c" always;
      }`)
    const [server] = root.children
    expect(server.head).toBe("server")
    expect(server.directives).toEqual([
      "listen 80",
      'add_header X "a;b{c" always',
    ])
    expect(server.children.map((c) => c.head)).toEqual(["location /x"])
    expect(() => bad("server { listen 80;")).toThrow(/never closed/)
    expect(() => bad("listen 80; }")).toThrow(/no open block/)
  })

  it("flags a server block with no access_log off, or only in a comment", () => {
    const root = bad("server { listen 80; # access_log off;\n }")
    expect(accessLogProblems("f", root, serversOf(root))).toHaveLength(1)
  })

  it("flags an access_log that is on, wherever it hides", () => {
    const root = bad(
      "server { access_log off; location / { access_log /dev/stdout main; } }"
    )
    const problems = accessLogProblems("f", root, serversOf(root))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("turns an access log back on")
  })

  it("flags a Vite proxy entry with no bypass, or with none that asks the predicate", () => {
    const entry = (body: string): string =>
      `proxy: {\n        [FILE_HOST_PROXY_PATH]: {\n${body}\n        },\n      }`
    expect(
      viteProxyProblems("f", entry("          changeOrigin: true,"))
    ).toHaveLength(1)
    expect(
      viteProxyProblems("f", entry("          bypass: () => undefined,"))
    ).toHaveLength(1)
    expect(
      viteProxyProblems(
        "f",
        entry(
          "          bypass: (req) =>\n            isBlockedProxyPath(req.url) ? false : undefined,"
        )
      )
    ).toEqual([])
    expect(viteProxyProblems("f", "export default {}")).toHaveLength(1)
  })

  it("flags the old forwarding lines, a missing tabs block and a bad policy", () => {
    const root = bad(`server {
      listen 80;
      location ^~ /api/file-host/ {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      }
    }`)
    const servers = serversOf(root)
    const problems = fileHostProblems("f", servers)
    expect(problems.some((p) => p.includes("return 404"))).toBe(true)
    expect(problems.some((p) => p.includes('X-Real-IP "";'))).toBe(true)
    expect(problems.some((p) => p.includes('X-Forwarded-For "";'))).toBe(true)
    expect(
      problems.filter((p) => p.includes("forwards the client address"))
    ).toHaveLength(2)

    const policy = bad(
      'add_header Referrer-Policy "no-referrer-when-downgrade" always;'
    )
    expect(
      referrerProblems(policy, [{ file: "f", block: servers[0] }])
    ).toHaveLength(2)
  })
})
