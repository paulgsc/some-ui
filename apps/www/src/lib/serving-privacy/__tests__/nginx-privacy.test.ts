/**
 * What the web tier does not log, forward or leak (privacy stage A), pinned as
 * plain text: no browser, no nginx binary, no Docker. A lost `access_log off;`
 * or a forwarded `$remote_addr` fails nothing at runtime, so this reads the
 * files that decide it and fails with the line to fix:
 *
 * - `apps/www/nginx.https.conf`: the image's one server block (:80), which
 *   `apps/www/Dockerfile` copies to nginx's templates directory and nothing
 *   else writes conf.d or templates (WI1: the file the image ships is the file
 *   read here). The image's entrypoint renders it to conf.d/default.conf at
 *   start, filling in only the `${NAME}`s the Dockerfile declares.
 * - `apps/www/nginx.security-headers.conf`: the `Referrer-Policy` it includes.
 *
 * Not covered: `error_log` (it cannot be made address-free without dropping
 * nginx's own errors), and the deployment's `logging:` bound.
 *
 * A tiny block parser (comments, quotes, braces; not general nginx), because
 * a substring match cannot tell `access_log off;` in a comment or the wrong
 * block from the real thing. The last group feeds the checks known-bad
 * configs, so a check that stopped looking cannot stay green.
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
const VITE_CONFIG = "apps/www/vite.config.ts"

const HEADERS_INCLUDE = "include /etc/nginx/security-headers.conf"
const FILE_HOST_LOCATION = "location ^~ /api/file-host/"
const TABS_LOCATION = "location ^~ /api/file-host/api/v1/tabs"
const RESUME_LOCATION = "location ^~ /api/resume/"
/** Where the base image's entrypoint looks for the server block's template. */
const TEMPLATE_TARGET = "/etc/nginx/templates/default.conf.template"

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

/** The résumé proxy carries the PII's request and must forward no address. */
function resumeProblems(file: string, servers: Array<Block>): Array<string> {
  const problems: Array<string> = []
  for (const server of servers) {
    const where = describeBlock(server)
    const location = server.children.find(
      (child) => child.head === RESUME_LOCATION
    )
    if (!location) {
      problems.push(
        `${file}: ${where} has no \`${RESUME_LOCATION} {\`. ` +
          "If the proxy moved, update this test to follow it; do not delete the check."
      )
      continue
    }
    const headers = proxyHeaders(location)
    for (const [key, name] of CLIENT_ADDRESS_HEADERS) {
      if (headers.get(key) !== '""') {
        problems.push(
          `${file}: in ${where}, \`${RESUME_LOCATION}\` must have \`proxy_set_header ${name} "";\`.`
        )
      }
    }
    for (const [name, value] of headers) {
      if (CLIENT_ADDRESS_VARIABLE.test(value)) {
        problems.push(
          `${file}: in ${where}, \`proxy_set_header ${name} ${value};\` forwards the client address to the résumé service.`
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

/**
 * WI1: the image's server block is `nginx.https.conf` as the repo keeps it. The
 * Dockerfile copies that file to the templates directory on one line, and no
 * other line names conf.d or templates, so no heredoc, `RUN` or second `COPY`
 * can write over it or beside it (#2652: a `RUN <<'EOF' > default.conf`
 * shipped an empty file).
 */
function defaultConfProblems(file: string, dockerfile: string): Array<string> {
  const copy = `COPY ${HTTPS_CONF} ${TEMPLATE_TARGET}`
  const lines = dockerfile.split(/\r?\n/)
  const copies = lines.filter((line) => line.trim() === copy).length
  const others = lines.filter(
    (line) =>
      /\/etc\/nginx\/(?:conf\.d|templates)\b/.test(line) &&
      line.trim() !== copy &&
      !line.trimStart().startsWith("#")
  )
  return [
    ...(copies === 1
      ? []
      : [`${file}: \`${copy}\` appears ${String(copies)} times, not once.`]),
    ...others.map(
      (line) =>
        `${file}: \`${line.trim()}\` also writes nginx's config, beside ${HTTPS_CONF}.`
    ),
  ]
}

/**
 * Every `${NAME}` the template reads is one the Dockerfile gives a default
 * with `ENV` and lets through `NGINX_ENVSUBST_FILTER`. The entrypoint leaves a
 * name it does not substitute as written, and nginx then refuses to start on
 * the unknown variable, so a bare `docker run` would serve nothing. The filter
 * also has to let nothing else through: an env var named like one of nginx's
 * own variables would otherwise be substituted into the block.
 */
function templateEnvProblems(
  template: string,
  dockerfile: string
): Array<string> {
  const names = new Set(
    [...template.replace(/^\s*#.*$/gm, "").matchAll(/\$\{(\w+)\}/g)].map(
      (match) => match[1]
    )
  )
  const env = new Map(
    [...dockerfile.matchAll(/^ENV (\w+)=(.*)$/gm)].map((match) => [
      match[1],
      match[2].replace(/^"(.*)"$/, "$1"),
    ])
  )
  const filter = env.get("NGINX_ENVSUBST_FILTER")
  if (filter === undefined) {
    return ["the Dockerfile sets no NGINX_ENVSUBST_FILTER"]
  }
  const passes = new RegExp(filter)
  const problems: Array<string> = []
  if (names.size === 0) problems.push("the template reads no ${NAME} at all")
  for (const name of names) {
    if (!env.has(name)) {
      problems.push(`the template reads \${${name}}, which no ENV declares`)
    }
    if (!passes.test(name)) {
      problems.push(`NGINX_ENVSUBST_FILTER does not let \${${name}} through`)
    }
  }
  for (const nginxVariable of ["host", "uri", "scheme", "PATH", "HOME"]) {
    if (passes.test(nginxVariable)) {
      problems.push(`NGINX_ENVSUBST_FILTER lets \${${nginxVariable}} through`)
    }
  }
  return problems
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

const httpsText = read(HTTPS_CONF)
const httpsConf = parseNginx(httpsText, HTTPS_CONF)
const httpsServers = serversOf(httpsConf)

const headersConf = parseNginx(read(HEADERS_CONF), HEADERS_CONF)

describe("the configs are read, not assumed", () => {
  it("finds the server blocks the other checks run over", () => {
    expect(httpsServers, `${HTTPS_CONF}: server blocks`).toHaveLength(1)
    expect(
      headersConf.directives.length,
      `${HEADERS_CONF}: directives`
    ).toBeGreaterThan(0)
  })

  it("copies its server block, and nothing else, into the image's config (WI1)", () => {
    expect(defaultConfProblems(DOCKERFILE, dockerfile)).toEqual([])
  })

  it("declares a default for every per-host value the server block reads", () => {
    expect(templateEnvProblems(httpsText, dockerfile)).toEqual([])
  })

  it("copies the security headers into the image the Dockerfile serves", () => {
    expect(dockerfile).toMatch(
      /^COPY apps\/www\/nginx\.security-headers\.conf \/etc\/nginx\/security-headers\.conf$/m
    )
  })
})

describe("access logs stay off", () => {
  it("in the image's server block", () => {
    expect(accessLogProblems(HTTPS_CONF, httpsConf, httpsServers)).toEqual([])
  })
})

describe("the file_host proxy", () => {
  it("forwards no client address, and 404s the unauthenticated tabs routes", () => {
    expect(fileHostProblems(HTTPS_CONF, httpsServers)).toEqual([])
  })

  it("and the résumé proxy forward no client address", () => {
    expect(resumeProblems(HTTPS_CONF, httpsServers)).toEqual([])
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

  it("flags a conf.d written any way but the one COPY, as #2652's heredoc was", () => {
    const copy = `COPY ${HTTPS_CONF} ${TEMPLATE_TARGET}`
    expect(defaultConfProblems("f", `FROM nginx\n${copy}\n`)).toEqual([])
    expect(
      defaultConfProblems(
        "f",
        "FROM nginx\nRUN <<'EOF' > /etc/nginx/conf.d/default.conf\nserver {}\nEOF\n"
      )
    ).toHaveLength(2)
    expect(
      defaultConfProblems(
        "f",
        `FROM nginx\n${copy}\nRUN echo "" > /etc/nginx/conf.d/default.conf\n`
      )
    ).toHaveLength(1)
    expect(
      defaultConfProblems("f", `FROM nginx\n${copy}\n${copy}\n`)
    ).toHaveLength(1)
    expect(
      defaultConfProblems(
        "f",
        `FROM nginx\n${copy}\nCOPY x.conf /etc/nginx/templates/x.conf.template\n`
      )
    ).toHaveLength(1)
  })

  it("flags a template name with no default, one the filter drops, and a filter too wide", () => {
    const template = 'set $a "${A_UPSTREAM}";\n# ${IN_A_COMMENT}\n'
    const ok = 'ENV A_UPSTREAM=a:1\nENV NGINX_ENVSUBST_FILTER="^A_UPSTREAM$"\n'
    expect(templateEnvProblems(template, ok)).toEqual([])
    expect(
      templateEnvProblems(
        template,
        'ENV NGINX_ENVSUBST_FILTER="^A_UPSTREAM$"\n'
      )
    ).toHaveLength(1)
    expect(
      templateEnvProblems(
        template,
        'ENV A_UPSTREAM=a:1\nENV NGINX_ENVSUBST_FILTER="^B$"\n'
      )
    ).toHaveLength(1)
    expect(
      templateEnvProblems(
        template,
        'ENV A_UPSTREAM=a:1\nENV NGINX_ENVSUBST_FILTER=".*"\n'
      )
    ).toHaveLength(5)
    expect(templateEnvProblems(template, "ENV A_UPSTREAM=a:1\n")).toHaveLength(
      1
    )
  })

  it("flags a résumé proxy that forwards the client address", () => {
    const root = bad(`server {
      location ^~ /api/resume/ {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      }
    }`)
    expect(resumeProblems("f", serversOf(root))).toHaveLength(3)
    expect(resumeProblems("f", serversOf(bad("server { }")))).toHaveLength(1)
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
