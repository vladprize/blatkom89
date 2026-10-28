import { createRequire as __blatkomCreateRequire } from 'node:module';
const require = __blatkomCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// apps/server/src/admin/cli.ts
import { createInterface } from "node:readline";

// ../vendor-src/postgres/src/index.js
import os from "os";
import fs from "fs";

// ../vendor-src/postgres/src/query.js
var originCache = /* @__PURE__ */ new Map();
var originStackCache = /* @__PURE__ */ new Map();
var originError = /* @__PURE__ */ Symbol("OriginError");
var CLOSE = {};
var Query = class extends Promise {
  constructor(strings, args, handler, canceller, options = {}) {
    let resolve, reject;
    super((a, b2) => {
      resolve = a;
      reject = b2;
    });
    this.tagged = Array.isArray(strings.raw);
    this.strings = strings;
    this.args = args;
    this.handler = handler;
    this.canceller = canceller;
    this.options = options;
    this.state = null;
    this.statement = null;
    this.resolve = (x) => (this.active = false, resolve(x));
    this.reject = (x) => (this.active = false, reject(x));
    this.active = false;
    this.cancelled = null;
    this.executed = false;
    this.signature = "";
    this[originError] = this.handler.debug ? new Error() : this.tagged && cachedError(this.strings);
  }
  get origin() {
    return (this.handler.debug ? this[originError].stack : this.tagged && originStackCache.has(this.strings) ? originStackCache.get(this.strings) : originStackCache.set(this.strings, this[originError].stack).get(this.strings)) || "";
  }
  static get [Symbol.species]() {
    return Promise;
  }
  cancel() {
    return this.canceller && (this.canceller(this), this.canceller = null);
  }
  simple() {
    this.options.simple = true;
    this.options.prepare = false;
    return this;
  }
  async readable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  async writable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  cursor(rows = 1, fn) {
    this.options.simple = false;
    if (typeof rows === "function") {
      fn = rows;
      rows = 1;
    }
    this.cursorRows = rows;
    if (typeof fn === "function")
      return this.cursorFn = fn, this;
    let prev;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (this.executed && !this.active)
            return { done: true };
          prev && prev();
          const promise = new Promise((resolve, reject) => {
            this.cursorFn = (value) => {
              resolve({ value, done: false });
              return new Promise((r) => prev = r);
            };
            this.resolve = () => (this.active = false, resolve({ done: true }));
            this.reject = (x) => (this.active = false, reject(x));
          });
          this.execute();
          return promise;
        },
        return() {
          prev && prev(CLOSE);
          return { done: true };
        }
      })
    };
  }
  describe() {
    this.options.simple = false;
    this.onlyDescribe = this.options.prepare = true;
    return this;
  }
  stream() {
    throw new Error(".stream has been renamed to .forEach");
  }
  forEach(fn) {
    this.forEachFn = fn;
    this.handle();
    return this;
  }
  raw() {
    this.isRaw = true;
    return this;
  }
  values() {
    this.isRaw = "values";
    return this;
  }
  async handle() {
    !this.executed && (this.executed = true) && await 1 && this.handler(this);
  }
  execute() {
    this.handle();
    return this;
  }
  then() {
    this.handle();
    return super.then.apply(this, arguments);
  }
  catch() {
    this.handle();
    return super.catch.apply(this, arguments);
  }
  finally() {
    this.handle();
    return super.finally.apply(this, arguments);
  }
};
function cachedError(xs) {
  if (originCache.has(xs))
    return originCache.get(xs);
  const x = Error.stackTraceLimit;
  Error.stackTraceLimit = 4;
  originCache.set(xs, new Error());
  Error.stackTraceLimit = x;
  return originCache.get(xs);
}

// ../vendor-src/postgres/src/errors.js
var PostgresError = class extends Error {
  constructor(x) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
};
var Errors = {
  connection,
  postgres,
  generic,
  notSupported
};
function connection(x, options, socket) {
  const { host, port } = socket || options;
  const error = Object.assign(
    new Error("write " + x + " " + (options.path || host + ":" + port)),
    {
      code: x,
      errno: x,
      address: options.path || host
    },
    options.path ? {} : { port }
  );
  Error.captureStackTrace(error, connection);
  return error;
}
function postgres(x) {
  const error = new PostgresError(x);
  Error.captureStackTrace(error, postgres);
  return error;
}
function generic(code, message) {
  const error = Object.assign(new Error(code + ": " + message), { code });
  Error.captureStackTrace(error, generic);
  return error;
}
function notSupported(x) {
  const error = Object.assign(
    new Error(x + " (B) is not supported"),
    {
      code: "MESSAGE_NOT_SUPPORTED",
      name: x
    }
  );
  Error.captureStackTrace(error, notSupported);
  return error;
}

// ../vendor-src/postgres/src/types.js
var types = {
  string: {
    to: 25,
    from: null,
    // defaults to string
    serialize: (x) => "" + x
  },
  number: {
    to: 0,
    from: [21, 23, 26, 700, 701],
    serialize: (x) => "" + x,
    parse: (x) => +x
  },
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x) => JSON.stringify(x),
    parse: (x) => JSON.parse(x)
  },
  boolean: {
    to: 16,
    from: 16,
    serialize: (x) => x === true ? "t" : "f",
    parse: (x) => x === "t"
  },
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (x) => (x instanceof Date ? x : new Date(x)).toISOString(),
    parse: (x) => new Date(x)
  },
  bytea: {
    to: 17,
    from: 17,
    serialize: (x) => "\\x" + Buffer.from(x).toString("hex"),
    parse: (x) => Buffer.from(x.slice(2), "hex")
  }
};
var NotTagged = class {
  then() {
    notTagged();
  }
  catch() {
    notTagged();
  }
  finally() {
    notTagged();
  }
};
var Identifier = class extends NotTagged {
  constructor(value) {
    super();
    this.value = escapeIdentifier(value);
  }
};
var Parameter = class extends NotTagged {
  constructor(value, type, array) {
    super();
    this.value = value;
    this.type = type;
    this.array = array;
  }
};
var Builder = class extends NotTagged {
  constructor(first, rest) {
    super();
    this.first = first;
    this.rest = rest;
  }
  build(before, parameters, types2, options) {
    const keyword = builders.map(([x, fn]) => ({ fn, i: before.search(x) })).sort((a, b2) => a.i - b2.i).pop();
    return keyword.i === -1 ? escapeIdentifiers(this.first, options) : keyword.fn(this.first, this.rest, parameters, types2, options);
  }
};
function handleValue(x, parameters, types2, options) {
  let value = x instanceof Parameter ? x.value : x;
  if (value === void 0) {
    x instanceof Parameter ? x.value = options.transform.undefined : value = x = options.transform.undefined;
    if (value === void 0)
      throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
  }
  return "$" + types2.push(
    x instanceof Parameter ? (parameters.push(x.value), x.array ? x.array[x.type || inferType(x.value)] || x.type || firstIsString(x.value) : x.type) : (parameters.push(x), inferType(x))
  );
}
var defaultHandlers = typeHandlers(types);
function stringify(q, string, value, parameters, types2, options) {
  for (let i = 1; i < q.strings.length; i++) {
    string += stringifyValue(string, value, parameters, types2, options) + q.strings[i];
    value = q.args[i];
  }
  return string;
}
function stringifyValue(string, value, parameters, types2, o) {
  return value instanceof Builder ? value.build(string, parameters, types2, o) : value instanceof Query ? fragment(value, parameters, types2, o) : value instanceof Identifier ? value.value : value && value[0] instanceof Query ? value.reduce((acc, x) => acc + " " + fragment(x, parameters, types2, o), "") : handleValue(value, parameters, types2, o);
}
function fragment(q, parameters, types2, options) {
  q.fragment = true;
  return stringify(q, q.strings[0], q.args[0], parameters, types2, options);
}
function valuesBuilder(first, parameters, types2, columns, options) {
  return first.map(
    (row) => "(" + columns.map(
      (column) => stringifyValue("values", row[column], parameters, types2, options)
    ).join(",") + ")"
  ).join(",");
}
function values(first, rest, parameters, types2, options) {
  const multi = Array.isArray(first[0]);
  const columns = rest.length ? rest.flat() : Object.keys(multi ? first[0] : first);
  return valuesBuilder(multi ? first : [first], parameters, types2, columns, options);
}
function select(first, rest, parameters, types2, options) {
  typeof first === "string" && (first = [first].concat(rest));
  if (Array.isArray(first))
    return escapeIdentifiers(first, options);
  let value;
  const columns = rest.length ? rest.flat() : Object.keys(first);
  return columns.map((x) => {
    value = first[x];
    return (value instanceof Query ? fragment(value, parameters, types2, options) : value instanceof Identifier ? value.value : handleValue(value, parameters, types2, options)) + " as " + escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x);
  }).join(",");
}
var builders = Object.entries({
  values,
  in: (...xs) => {
    const x = values(...xs);
    return x === "()" ? "(null)" : x;
  },
  select,
  as: select,
  returning: select,
  "\\(": select,
  update(first, rest, parameters, types2, options) {
    return (rest.length ? rest.flat() : Object.keys(first)).map(
      (x) => escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x) + "=" + stringifyValue("values", first[x], parameters, types2, options)
    );
  },
  insert(first, rest, parameters, types2, options) {
    const columns = rest.length ? rest.flat() : Object.keys(Array.isArray(first) ? first[0] : first);
    return "(" + escapeIdentifiers(columns, options) + ")values" + valuesBuilder(Array.isArray(first) ? first : [first], parameters, types2, columns, options);
  }
}).map(([x, fn]) => [new RegExp("((?:^|[\\s(])" + x + "(?:$|[\\s(]))(?![\\s\\S]*\\1)", "i"), fn]);
function notTagged() {
  throw Errors.generic("NOT_TAGGED_CALL", "Query not called as a tagged template literal");
}
var serializers = defaultHandlers.serializers;
var parsers = defaultHandlers.parsers;
function firstIsString(x) {
  if (Array.isArray(x))
    return firstIsString(x[0]);
  return typeof x === "string" ? 1009 : 0;
}
var mergeUserTypes = function(types2) {
  const user = typeHandlers(types2 || {});
  return {
    serializers: Object.assign({}, serializers, user.serializers),
    parsers: Object.assign({}, parsers, user.parsers)
  };
};
function typeHandlers(types2) {
  return Object.keys(types2).reduce((acc, k) => {
    types2[k].from && [].concat(types2[k].from).forEach((x) => acc.parsers[x] = types2[k].parse);
    if (types2[k].serialize) {
      acc.serializers[types2[k].to] = types2[k].serialize;
      types2[k].from && [].concat(types2[k].from).forEach((x) => acc.serializers[x] = types2[k].serialize);
    }
    return acc;
  }, { parsers: {}, serializers: {} });
}
function escapeIdentifiers(xs, { transform: { column } }) {
  return xs.map((x) => escapeIdentifier(column.to ? column.to(x) : x)).join(",");
}
var escapeIdentifier = function escape(str) {
  return '"' + str.replace(/"/g, '""').replace(/\./g, '"."') + '"';
};
var inferType = function inferType2(x) {
  return x instanceof Parameter ? x.type : x instanceof Date ? 1184 : x instanceof Uint8Array ? 17 : x === true || x === false ? 16 : typeof x === "bigint" ? 20 : Array.isArray(x) ? inferType2(x[0]) : 0;
};
var escapeBackslash = /\\/g;
var escapeQuote = /"/g;
function arrayEscape(x) {
  return x.replace(escapeBackslash, "\\\\").replace(escapeQuote, '\\"');
}
var arraySerializer = function arraySerializer2(xs, serializer, options, typarray) {
  if (Array.isArray(xs) === false)
    return xs;
  if (!xs.length)
    return "{}";
  const first = xs[0];
  const delimiter = typarray === 1020 ? ";" : ",";
  if (Array.isArray(first) && !first.type)
    return "{" + xs.map((x) => arraySerializer2(x, serializer, options, typarray)).join(delimiter) + "}";
  return "{" + xs.map((x) => {
    if (x === void 0) {
      x = options.transform.undefined;
      if (x === void 0)
        throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
    }
    return x === null ? "null" : '"' + arrayEscape(serializer ? serializer(x.type ? x.value : x) : "" + x) + '"';
  }).join(delimiter) + "}";
};
var arrayParserState = {
  i: 0,
  char: null,
  str: "",
  quoted: false,
  last: 0
};
var arrayParser = function arrayParser2(x, parser, typarray) {
  arrayParserState.i = arrayParserState.last = 0;
  return arrayParserLoop(arrayParserState, x, parser, typarray);
};
function arrayParserLoop(s, x, parser, typarray) {
  const xs = [];
  const delimiter = typarray === 1020 ? ";" : ",";
  for (; s.i < x.length; s.i++) {
    s.char = x[s.i];
    if (s.quoted) {
      if (s.char === "\\") {
        s.str += x[++s.i];
      } else if (s.char === '"') {
        xs.push(parser ? parser(s.str) : s.str);
        s.str = "";
        s.quoted = x[s.i + 1] === '"';
        s.last = s.i + 2;
      } else {
        s.str += s.char;
      }
    } else if (s.char === '"') {
      s.quoted = true;
    } else if (s.char === "{") {
      s.last = ++s.i;
      xs.push(arrayParserLoop(s, x, parser, typarray));
    } else if (s.char === "}") {
      s.quoted = false;
      s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
      break;
    } else if (s.char === delimiter && s.p !== "}" && s.p !== '"') {
      xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
    }
    s.p = s.char;
  }
  s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i + 1)) : x.slice(s.last, s.i + 1));
  return xs;
}
var toCamel = (x) => {
  let str = x[0];
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toPascal = (x) => {
  let str = x[0].toUpperCase();
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toKebab = (x) => x.replace(/_/g, "-");
var fromCamel = (x) => x.replace(/([A-Z])/g, "_$1").toLowerCase();
var fromPascal = (x) => (x.slice(0, 1) + x.slice(1).replace(/([A-Z])/g, "_$1")).toLowerCase();
var fromKebab = (x) => x.replace(/-/g, "_");
function createJsonTransform(fn) {
  return function jsonTransform(x, column) {
    return typeof x === "object" && x !== null && (column.type === 114 || column.type === 3802) ? Array.isArray(x) ? x.map((x2) => jsonTransform(x2, column)) : Object.entries(x).reduce((acc, [k, v]) => Object.assign(acc, { [fn(k)]: jsonTransform(v, column) }), {}) : x;
  };
}
toCamel.column = { from: toCamel };
toCamel.value = { from: createJsonTransform(toCamel) };
fromCamel.column = { to: fromCamel };
var camel = { ...toCamel };
camel.column.to = fromCamel;
toPascal.column = { from: toPascal };
toPascal.value = { from: createJsonTransform(toPascal) };
fromPascal.column = { to: fromPascal };
var pascal = { ...toPascal };
pascal.column.to = fromPascal;
toKebab.column = { from: toKebab };
toKebab.value = { from: createJsonTransform(toKebab) };
fromKebab.column = { to: fromKebab };
var kebab = { ...toKebab };
kebab.column.to = fromKebab;

// ../vendor-src/postgres/src/connection.js
import net from "net";
import tls from "tls";
import crypto from "crypto";
import Stream from "stream";
import { performance } from "perf_hooks";

// ../vendor-src/postgres/src/result.js
var Result = class extends Array {
  constructor() {
    super();
    Object.defineProperties(this, {
      count: { value: null, writable: true },
      state: { value: null, writable: true },
      command: { value: null, writable: true },
      columns: { value: null, writable: true },
      statement: { value: null, writable: true }
    });
  }
  static get [Symbol.species]() {
    return Array;
  }
};

// ../vendor-src/postgres/src/queue.js
var queue_default = Queue;
function Queue(initial = []) {
  let xs = initial.slice();
  let index = 0;
  return {
    get length() {
      return xs.length - index;
    },
    remove: (x) => {
      const index2 = xs.indexOf(x);
      return index2 === -1 ? null : (xs.splice(index2, 1), x);
    },
    push: (x) => (xs.push(x), x),
    shift: () => {
      const out = xs[index++];
      if (index === xs.length) {
        index = 0;
        xs = [];
      } else {
        xs[index - 1] = void 0;
      }
      return out;
    }
  };
}

// ../vendor-src/postgres/src/bytes.js
var size = 256;
var buffer = Buffer.allocUnsafe(size);
var messages = "BCcDdEFfHPpQSX".split("").reduce((acc, x) => {
  const v = x.charCodeAt(0);
  acc[x] = () => {
    buffer[0] = v;
    b.i = 5;
    return b;
  };
  return acc;
}, {});
var b = Object.assign(reset, messages, {
  N: String.fromCharCode(0),
  i: 0,
  inc(x) {
    b.i += x;
    return b;
  },
  str(x) {
    const length = Buffer.byteLength(x);
    fit(length);
    b.i += buffer.write(x, b.i, length, "utf8");
    return b;
  },
  i16(x) {
    fit(2);
    buffer.writeUInt16BE(x, b.i);
    b.i += 2;
    return b;
  },
  i32(x, i) {
    if (i || i === 0) {
      buffer.writeUInt32BE(x, i);
      return b;
    }
    fit(4);
    buffer.writeUInt32BE(x, b.i);
    b.i += 4;
    return b;
  },
  z(x) {
    fit(x);
    buffer.fill(0, b.i, b.i + x);
    b.i += x;
    return b;
  },
  raw(x) {
    buffer = Buffer.concat([buffer.subarray(0, b.i), x]);
    b.i = buffer.length;
    return b;
  },
  end(at = 1) {
    buffer.writeUInt32BE(b.i - at, at);
    const out = buffer.subarray(0, b.i);
    b.i = 0;
    buffer = Buffer.allocUnsafe(size);
    return out;
  }
});
var bytes_default = b;
function fit(x) {
  if (buffer.length - b.i < x) {
    const prev = buffer, length = prev.length;
    buffer = Buffer.allocUnsafe(length + (length >> 1) + x);
    prev.copy(buffer);
  }
}
function reset() {
  b.i = 0;
  return b;
}

// ../vendor-src/postgres/src/connection.js
var connection_default = Connection;
var uid = 1;
var Sync = bytes_default().S().end();
var Flush = bytes_default().H().end();
var SSLRequest = bytes_default().i32(8).i32(80877103).end(8);
var ExecuteUnnamed = Buffer.concat([bytes_default().E().str(bytes_default.N).i32(0).end(), Sync]);
var DescribeUnnamed = bytes_default().D().str("S").str(bytes_default.N).end();
var noop = () => {
};
var retryRoutines = /* @__PURE__ */ new Set([
  "FetchPreparedStatement",
  "RevalidateCachedQuery",
  "transformAssignedExpr"
]);
var errorFields = {
  83: "severity_local",
  // S
  86: "severity",
  // V
  67: "code",
  // C
  77: "message",
  // M
  68: "detail",
  // D
  72: "hint",
  // H
  80: "position",
  // P
  112: "internal_position",
  // p
  113: "internal_query",
  // q
  87: "where",
  // W
  115: "schema_name",
  // s
  116: "table_name",
  // t
  99: "column_name",
  // c
  100: "data type_name",
  // d
  110: "constraint_name",
  // n
  70: "file",
  // F
  76: "line",
  // L
  82: "routine"
  // R
};
function Connection(options, queues = {}, { onopen = noop, onend = noop, onclose = noop } = {}) {
  const {
    sslnegotiation,
    ssl,
    max,
    user,
    host,
    port,
    database,
    parsers: parsers2,
    transform,
    onnotice,
    onnotify,
    onparameter,
    max_pipeline,
    keep_alive,
    backoff: backoff2,
    target_session_attrs
  } = options;
  const sent = queue_default(), id = uid++, backend = { pid: null, secret: null }, idleTimer = timer(end, options.idle_timeout), lifeTimer = timer(end, options.max_lifetime), connectTimer = timer(connectTimedOut, options.connect_timeout);
  let socket = null, cancelMessage, errorResponse = null, result = new Result(), incoming = Buffer.alloc(0), needsTypes = options.fetch_types, backendParameters = {}, statements = {}, statementId = Math.random().toString(36).slice(2), statementCount = 1, closedTime = 0, remaining = 0, hostIndex = 0, retries = 0, length = 0, delay = 0, rows = 0, serverSignature = null, nextWriteTimer = null, terminated = false, incomings = null, results = null, initial = null, ending = null, stream = null, chunk = null, ended = null, nonce = null, query = null, final = null;
  const connection2 = {
    queue: queues.closed,
    idleTimer,
    connect(query2) {
      initial = query2;
      reconnect();
    },
    terminate,
    execute,
    cancel,
    end,
    count: 0,
    id
  };
  queues.closed && queues.closed.push(connection2);
  return connection2;
  async function createSocket() {
    let x;
    try {
      x = options.socket ? await Promise.resolve(options.socket(options)) : new net.Socket();
    } catch (e) {
      error(e);
      return;
    }
    x.on("error", error);
    x.on("close", closed);
    x.on("drain", drain);
    return x;
  }
  async function cancel({ pid, secret }, resolve, reject) {
    try {
      cancelMessage = bytes_default().i32(16).i32(80877102).i32(pid).i32(secret).end(16);
      await connect();
      socket.once("error", reject);
      socket.once("close", resolve);
    } catch (error2) {
      reject(error2);
    }
  }
  function execute(q) {
    if (terminated)
      return queryError(q, Errors.connection("CONNECTION_DESTROYED", options));
    if (stream)
      return queryError(q, Errors.generic("COPY_IN_PROGRESS", "You cannot execute queries during copy"));
    if (q.cancelled)
      return;
    try {
      q.state = backend;
      query ? sent.push(q) : (query = q, query.active = true);
      build(q);
      return write(toBuffer(q)) && !q.describeFirst && !q.cursorFn && sent.length < max_pipeline && (!q.options.onexecute || q.options.onexecute(connection2));
    } catch (error2) {
      sent.length === 0 && write(Sync);
      errored(error2);
      return true;
    }
  }
  function toBuffer(q) {
    if (q.parameters.length >= 65534)
      throw Errors.generic("MAX_PARAMETERS_EXCEEDED", "Max number of parameters (65534) exceeded");
    return q.options.simple ? bytes_default().Q().str(q.statement.string + bytes_default.N).end() : q.describeFirst ? Buffer.concat([describe(q), Flush]) : q.prepare ? q.prepared ? prepared(q) : Buffer.concat([describe(q), prepared(q)]) : unnamed(q);
  }
  function describe(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types, q.statement.name),
      Describe("S", q.statement.name)
    ]);
  }
  function prepared(q) {
    return Buffer.concat([
      Bind(q.parameters, q.statement.types, q.statement.name, q.cursorName),
      q.cursorFn ? Execute("", q.cursorRows) : ExecuteUnnamed
    ]);
  }
  function unnamed(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types),
      DescribeUnnamed,
      prepared(q)
    ]);
  }
  function build(q) {
    const parameters = [], types2 = [];
    const string = stringify(q, q.strings[0], q.args[0], parameters, types2, options);
    !q.tagged && q.args.forEach((x) => handleValue(x, parameters, types2, options));
    q.prepare = options.prepare && ("prepare" in q.options ? q.options.prepare : true);
    q.string = string;
    q.signature = q.prepare && types2 + string;
    q.onlyDescribe && delete statements[q.signature];
    q.parameters = q.parameters || parameters;
    q.prepared = q.prepare && q.signature in statements;
    q.describeFirst = q.onlyDescribe || parameters.length && !q.prepared;
    q.statement = q.prepared ? statements[q.signature] : { string, types: types2, name: q.prepare ? statementId + statementCount++ : "" };
    typeof options.debug === "function" && options.debug(id, string, parameters, types2);
  }
  function write(x, fn) {
    chunk = chunk ? Buffer.concat([chunk, x]) : Buffer.from(x);
    if (fn || chunk.length >= 1024)
      return nextWrite(fn);
    nextWriteTimer === null && (nextWriteTimer = setImmediate(nextWrite));
    return true;
  }
  function nextWrite(fn) {
    const x = socket.write(chunk, fn);
    nextWriteTimer !== null && clearImmediate(nextWriteTimer);
    chunk = nextWriteTimer = null;
    return x;
  }
  function connectTimedOut() {
    errored(Errors.connection("CONNECT_TIMEOUT", options, socket));
    socket.destroy();
  }
  async function secure() {
    if (sslnegotiation !== "direct") {
      write(SSLRequest);
      const canSSL = await new Promise((r) => socket.once("data", (x) => r(x[0] === 83)));
      if (!canSSL && ssl === "prefer")
        return connected();
    }
    const options2 = {
      socket,
      servername: net.isIP(socket.host) ? void 0 : socket.host
    };
    if (sslnegotiation === "direct")
      options2.ALPNProtocols = ["postgresql"];
    if (ssl === "require" || ssl === "allow" || ssl === "prefer")
      options2.rejectUnauthorized = false;
    else if (typeof ssl === "object")
      Object.assign(options2, ssl);
    socket.removeAllListeners();
    socket = tls.connect(options2);
    socket.on("secureConnect", connected);
    socket.on("error", error);
    socket.on("close", closed);
    socket.on("drain", drain);
  }
  function drain() {
    !query && onopen(connection2);
  }
  function data(x) {
    if (incomings) {
      incomings.push(x);
      remaining -= x.length;
      if (remaining > 0)
        return;
    }
    incoming = incomings ? Buffer.concat(incomings, length - remaining) : incoming.length === 0 ? x : Buffer.concat([incoming, x], incoming.length + x.length);
    while (incoming.length > 4) {
      length = incoming.readUInt32BE(1);
      if (length >= incoming.length) {
        remaining = length - incoming.length;
        incomings = [incoming];
        break;
      }
      try {
        handle(incoming.subarray(0, length + 1));
      } catch (e) {
        query && (query.cursorFn || query.describeFirst) && write(Sync);
        errored(e);
      }
      incoming = incoming.subarray(length + 1);
      remaining = 0;
      incomings = null;
    }
  }
  async function connect() {
    terminated = false;
    backendParameters = {};
    socket || (socket = await createSocket());
    if (!socket)
      return;
    connectTimer.start();
    if (options.socket)
      return ssl ? secure() : connected();
    socket.on("connect", ssl ? secure : connected);
    if (options.path)
      return socket.connect(options.path);
    socket.ssl = ssl;
    socket.connect(port[hostIndex], host[hostIndex]);
    socket.host = host[hostIndex];
    socket.port = port[hostIndex];
    hostIndex = (hostIndex + 1) % port.length;
  }
  function reconnect() {
    setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance.now()) : 0);
  }
  function connected() {
    try {
      statements = {};
      needsTypes = options.fetch_types;
      statementId = Math.random().toString(36).slice(2);
      statementCount = 1;
      lifeTimer.start();
      socket.on("data", data);
      keep_alive && socket.setKeepAlive && socket.setKeepAlive(true, 1e3 * keep_alive);
      const s = StartupMessage();
      write(s);
    } catch (err) {
      error(err);
    }
  }
  function error(err) {
    if (connection2.queue === queues.connecting && options.host[retries + 1])
      return;
    errored(err);
    while (sent.length)
      queryError(sent.shift(), err);
  }
  function errored(err) {
    stream && (stream.destroy(err), stream = null);
    query && queryError(query, err);
    initial && (queryError(initial, err), initial = null);
  }
  function queryError(query2, err) {
    if (query2.reserve)
      return query2.reject(err);
    if (!err || typeof err !== "object")
      err = new Error(err);
    "query" in err || "parameters" in err || Object.defineProperties(err, {
      stack: { value: err.stack + query2.origin.replace(/.*\n/, "\n"), enumerable: options.debug },
      query: { value: query2.string, enumerable: options.debug },
      parameters: { value: query2.parameters, enumerable: options.debug },
      args: { value: query2.args, enumerable: options.debug },
      types: { value: query2.statement && query2.statement.types, enumerable: options.debug }
    });
    query2.reject(err);
  }
  function end() {
    return ending || (!connection2.reserved && onend(connection2), !connection2.reserved && !initial && !query && sent.length === 0 ? (terminate(), new Promise((r) => socket && socket.readyState !== "closed" ? socket.once("close", r) : r())) : ending = new Promise((r) => ended = r));
  }
  function terminate() {
    terminated = true;
    if (stream || query || initial || sent.length)
      error(Errors.connection("CONNECTION_DESTROYED", options));
    clearImmediate(nextWriteTimer);
    if (socket) {
      socket.removeListener("data", data);
      socket.removeListener("connect", connected);
      socket.readyState === "open" && socket.end(bytes_default().X().end());
    }
    ended && (ended(), ending = ended = null);
  }
  async function closed(hadError) {
    incoming = Buffer.alloc(0);
    remaining = 0;
    incomings = null;
    clearImmediate(nextWriteTimer);
    socket.removeListener("data", data);
    socket.removeListener("connect", connected);
    idleTimer.cancel();
    lifeTimer.cancel();
    connectTimer.cancel();
    socket.removeAllListeners();
    socket = null;
    if (initial)
      return reconnect();
    !hadError && (query || sent.length) && error(Errors.connection("CONNECTION_CLOSED", options, socket));
    closedTime = performance.now();
    hadError && options.shared.retries++;
    delay = (typeof backoff2 === "function" ? backoff2(options.shared.retries) : backoff2) * 1e3;
    onclose(connection2, Errors.connection("CONNECTION_CLOSED", options, socket));
  }
  function handle(xs, x = xs[0]) {
    (x === 68 ? DataRow : (
      // D
      x === 100 ? CopyData : (
        // d
        x === 65 ? NotificationResponse : (
          // A
          x === 83 ? ParameterStatus : (
            // S
            x === 90 ? ReadyForQuery : (
              // Z
              x === 67 ? CommandComplete : (
                // C
                x === 50 ? BindComplete : (
                  // 2
                  x === 49 ? ParseComplete : (
                    // 1
                    x === 116 ? ParameterDescription : (
                      // t
                      x === 84 ? RowDescription : (
                        // T
                        x === 82 ? Authentication : (
                          // R
                          x === 110 ? NoData : (
                            // n
                            x === 75 ? BackendKeyData : (
                              // K
                              x === 69 ? ErrorResponse : (
                                // E
                                x === 115 ? PortalSuspended : (
                                  // s
                                  x === 51 ? CloseComplete : (
                                    // 3
                                    x === 71 ? CopyInResponse : (
                                      // G
                                      x === 78 ? NoticeResponse : (
                                        // N
                                        x === 72 ? CopyOutResponse : (
                                          // H
                                          x === 99 ? CopyDone : (
                                            // c
                                            x === 73 ? EmptyQueryResponse : (
                                              // I
                                              x === 86 ? FunctionCallResponse : (
                                                // V
                                                x === 118 ? NegotiateProtocolVersion : (
                                                  // v
                                                  x === 87 ? CopyBothResponse : (
                                                    // W
                                                    /* c8 ignore next */
                                                    UnknownMessage
                                                  )
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ))(xs);
  }
  function DataRow(x) {
    let index = 7;
    let length2;
    let column;
    let value;
    const row = query.isRaw ? new Array(query.statement.columns.length) : {};
    for (let i = 0; i < query.statement.columns.length; i++) {
      column = query.statement.columns[i];
      length2 = x.readInt32BE(index);
      index += 4;
      value = length2 === -1 ? null : query.isRaw === true ? x.subarray(index, index += length2) : column.parser === void 0 ? x.toString("utf8", index, index += length2) : column.parser.array === true ? column.parser(x.toString("utf8", index + 1, index += length2)) : column.parser(x.toString("utf8", index, index += length2));
      query.isRaw ? row[i] = query.isRaw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
    }
    query.forEachFn ? query.forEachFn(transform.row.from ? transform.row.from(row) : row, result) : result[rows++] = transform.row.from ? transform.row.from(row) : row;
  }
  function ParameterStatus(x) {
    const [k, v] = x.toString("utf8", 5, x.length - 1).split(bytes_default.N);
    backendParameters[k] = v;
    if (options.parameters[k] !== v) {
      options.parameters[k] = v;
      onparameter && onparameter(k, v);
    }
  }
  function ReadyForQuery(x) {
    if (query) {
      if (errorResponse) {
        query.retried ? errored(query.retried) : query.prepared && retryRoutines.has(errorResponse.routine) ? retry(query, errorResponse) : errored(errorResponse);
      } else {
        query.resolve(results || result);
      }
    } else if (errorResponse) {
      errored(errorResponse);
    }
    query = results = errorResponse = null;
    result = new Result();
    connectTimer.cancel();
    if (initial) {
      if (target_session_attrs) {
        if (!backendParameters.in_hot_standby || !backendParameters.default_transaction_read_only)
          return fetchState();
        else if (tryNext(target_session_attrs, backendParameters))
          return terminate();
      }
      if (needsTypes) {
        initial.reserve && (initial = null);
        return fetchArrayTypes();
      }
      initial && !initial.reserve && execute(initial);
      options.shared.retries = retries = 0;
      initial = null;
      return;
    }
    while (sent.length && (query = sent.shift()) && (query.active = true, query.cancelled))
      Connection(options).cancel(query.state, query.cancelled.resolve, query.cancelled.reject);
    if (query)
      return;
    connection2.reserved ? !connection2.reserved.release && x[5] === 73 ? ending ? terminate() : (connection2.reserved = null, onopen(connection2)) : connection2.reserved() : ending ? terminate() : onopen(connection2);
  }
  function CommandComplete(x) {
    rows = 0;
    for (let i = x.length - 1; i > 0; i--) {
      if (x[i] === 32 && x[i + 1] < 58 && result.count === null)
        result.count = +x.toString("utf8", i + 1, x.length - 1);
      if (x[i - 1] >= 65) {
        result.command = x.toString("utf8", 5, i);
        result.state = backend;
        break;
      }
    }
    final && (final(), final = null);
    if (result.command === "BEGIN" && max !== 1 && !connection2.reserved)
      return errored(Errors.generic("UNSAFE_TRANSACTION", "Only use sql.begin, sql.reserved or max: 1"));
    if (query.options.simple)
      return BindComplete();
    if (query.cursorFn) {
      result.count && query.cursorFn(result);
      write(Sync);
    }
  }
  function ParseComplete() {
    query.parsing = false;
  }
  function BindComplete() {
    !result.statement && (result.statement = query.statement);
    result.columns = query.statement.columns;
  }
  function ParameterDescription(x) {
    const length2 = x.readUInt16BE(5);
    for (let i = 0; i < length2; ++i)
      !query.statement.types[i] && (query.statement.types[i] = x.readUInt32BE(7 + i * 4));
    query.prepare && (statements[query.signature] = query.statement);
    query.describeFirst && !query.onlyDescribe && (write(prepared(query)), query.describeFirst = false);
  }
  function RowDescription(x) {
    if (result.command) {
      results = results || [result];
      results.push(result = new Result());
      result.count = null;
      query.statement.columns = null;
    }
    const length2 = x.readUInt16BE(5);
    let index = 7;
    let start;
    query.statement.columns = Array(length2);
    for (let i = 0; i < length2; ++i) {
      start = index;
      while (x[index++] !== 0) ;
      const table = x.readUInt32BE(index);
      const number = x.readUInt16BE(index + 4);
      const type = x.readUInt32BE(index + 6);
      query.statement.columns[i] = {
        name: transform.column.from ? transform.column.from(x.toString("utf8", start, index - 1)) : x.toString("utf8", start, index - 1),
        parser: parsers2[type],
        table,
        number,
        type
      };
      index += 18;
    }
    result.statement = query.statement;
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  async function Authentication(x, type = x.readUInt32BE(5)) {
    (type === 3 ? AuthenticationCleartextPassword : type === 5 ? AuthenticationMD5Password : type === 10 ? SASL : type === 11 ? SASLContinue : type === 12 ? SASLFinal : type !== 0 ? UnknownAuth : noop)(x, type);
  }
  async function AuthenticationCleartextPassword() {
    const payload = await Pass();
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function AuthenticationMD5Password(x) {
    const payload = "md5" + await md5(
      Buffer.concat([
        Buffer.from(await md5(await Pass() + user)),
        x.subarray(9)
      ])
    );
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function SASL() {
    nonce = (await crypto.randomBytes(18)).toString("base64");
    bytes_default().p().str("SCRAM-SHA-256" + bytes_default.N);
    const i = bytes_default.i;
    write(bytes_default.inc(4).str("n,,n=*,r=" + nonce).i32(bytes_default.i - i - 4, i).end());
  }
  async function SASLContinue(x) {
    const res = x.toString("utf8", 9).split(",").reduce((acc, x2) => (acc[x2[0]] = x2.slice(2), acc), {});
    const saltedPassword = await crypto.pbkdf2Sync(
      await Pass(),
      Buffer.from(res.s, "base64"),
      parseInt(res.i),
      32,
      "sha256"
    );
    const clientKey = await hmac(saltedPassword, "Client Key");
    const auth = "n=*,r=" + nonce + ",r=" + res.r + ",s=" + res.s + ",i=" + res.i + ",c=biws,r=" + res.r;
    serverSignature = (await hmac(await hmac(saltedPassword, "Server Key"), auth)).toString("base64");
    const payload = "c=biws,r=" + res.r + ",p=" + xor(
      clientKey,
      Buffer.from(await hmac(await sha256(clientKey), auth))
    ).toString("base64");
    write(
      bytes_default().p().str(payload).end()
    );
  }
  function SASLFinal(x) {
    if (x.toString("utf8", 9).split(bytes_default.N, 1)[0].slice(2) === serverSignature)
      return;
    errored(Errors.generic("SASL_SIGNATURE_MISMATCH", "The server did not return the correct signature"));
    socket.destroy();
  }
  function Pass() {
    return Promise.resolve(
      typeof options.pass === "function" ? options.pass() : options.pass
    );
  }
  function NoData() {
    result.statement = query.statement;
    result.statement.columns = [];
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  function BackendKeyData(x) {
    backend.pid = x.readUInt32BE(5);
    backend.secret = x.readUInt32BE(9);
  }
  async function fetchArrayTypes() {
    needsTypes = false;
    const types2 = await new Query([`
      select b.oid, b.typarray
      from pg_catalog.pg_type a
      left join pg_catalog.pg_type b on b.oid = a.typelem
      where a.typcategory = 'A'
      group by b.oid, b.typarray
      order by b.oid
    `], [], execute);
    types2.forEach(({ oid, typarray }) => addArrayType(oid, typarray));
  }
  function addArrayType(oid, typarray) {
    if (!!options.parsers[typarray] && !!options.serializers[typarray]) return;
    const parser = options.parsers[oid];
    options.shared.typeArrayMap[oid] = typarray;
    options.parsers[typarray] = (xs) => arrayParser(xs, parser, typarray);
    options.parsers[typarray].array = true;
    options.serializers[typarray] = (xs) => arraySerializer(xs, options.serializers[oid], options, typarray);
  }
  function tryNext(x, xs) {
    return x === "read-write" && xs.default_transaction_read_only === "on" || x === "read-only" && xs.default_transaction_read_only === "off" || x === "primary" && xs.in_hot_standby === "on" || x === "standby" && xs.in_hot_standby === "off" || x === "prefer-standby" && xs.in_hot_standby === "off" && options.host[retries];
  }
  function fetchState() {
    const query2 = new Query([`
      show transaction_read_only;
      select pg_catalog.pg_is_in_recovery()
    `], [], execute, null, { simple: true });
    query2.resolve = ([[a], [b2]]) => {
      backendParameters.default_transaction_read_only = a.transaction_read_only;
      backendParameters.in_hot_standby = b2.pg_is_in_recovery ? "on" : "off";
    };
    query2.execute();
  }
  function ErrorResponse(x) {
    if (query) {
      (query.cursorFn || query.describeFirst) && write(Sync);
      errorResponse = Errors.postgres(parseError(x));
    } else {
      errored(Errors.postgres(parseError(x)));
    }
  }
  function retry(q, error2) {
    delete statements[q.signature];
    q.retried = error2;
    execute(q);
  }
  function NotificationResponse(x) {
    if (!onnotify)
      return;
    let index = 9;
    while (x[index++] !== 0) ;
    onnotify(
      x.toString("utf8", 9, index - 1),
      x.toString("utf8", index, x.length - 1)
    );
  }
  async function PortalSuspended() {
    try {
      const x = await Promise.resolve(query.cursorFn(result));
      rows = 0;
      x === CLOSE ? write(Close(query.portal)) : (result = new Result(), write(Execute("", query.cursorRows)));
    } catch (err) {
      write(Sync);
      query.reject(err);
    }
  }
  function CloseComplete() {
    result.count && query.cursorFn(result);
    query.resolve(result);
  }
  function CopyInResponse() {
    stream = new Stream.Writable({
      autoDestroy: true,
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
        stream = null;
      }
    });
    query.resolve(stream);
  }
  function CopyOutResponse() {
    stream = new Stream.Readable({
      read() {
        socket.resume();
      }
    });
    query.resolve(stream);
  }
  function CopyBothResponse() {
    stream = new Stream.Duplex({
      autoDestroy: true,
      read() {
        socket.resume();
      },
      /* c8 ignore next 11 */
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
      }
    });
    query.resolve(stream);
  }
  function CopyData(x) {
    stream && (stream.push(x.subarray(5)) || socket.pause());
  }
  function CopyDone() {
    stream && stream.push(null);
    stream = null;
  }
  function NoticeResponse(x) {
    onnotice ? onnotice(parseError(x)) : console.log(parseError(x));
  }
  function EmptyQueryResponse() {
  }
  function FunctionCallResponse() {
    errored(Errors.notSupported("FunctionCallResponse"));
  }
  function NegotiateProtocolVersion() {
    errored(Errors.notSupported("NegotiateProtocolVersion"));
  }
  function UnknownMessage(x) {
    console.error("Postgres.js : Unknown Message:", x[0]);
  }
  function UnknownAuth(x, type) {
    console.error("Postgres.js : Unknown Auth:", type);
  }
  function Bind(parameters, types2, statement = "", portal = "") {
    let prev, type;
    bytes_default().B().str(portal + bytes_default.N).str(statement + bytes_default.N).i16(0).i16(parameters.length);
    parameters.forEach((x, i) => {
      if (x === null)
        return bytes_default.i32(4294967295);
      type = types2[i];
      parameters[i] = x = type in options.serializers ? options.serializers[type](x) : "" + x;
      prev = bytes_default.i;
      bytes_default.inc(4).str(x).i32(bytes_default.i - prev - 4, prev);
    });
    bytes_default.i16(0);
    return bytes_default.end();
  }
  function Parse(str, parameters, types2, name = "") {
    bytes_default().P().str(name + bytes_default.N).str(str + bytes_default.N).i16(parameters.length);
    parameters.forEach((x, i) => bytes_default.i32(types2[i] || 0));
    return bytes_default.end();
  }
  function Describe(x, name = "") {
    return bytes_default().D().str(x).str(name + bytes_default.N).end();
  }
  function Execute(portal = "", rows2 = 0) {
    return Buffer.concat([
      bytes_default().E().str(portal + bytes_default.N).i32(rows2).end(),
      Flush
    ]);
  }
  function Close(portal = "") {
    return Buffer.concat([
      bytes_default().C().str("P").str(portal + bytes_default.N).end(),
      bytes_default().S().end()
    ]);
  }
  function StartupMessage() {
    return cancelMessage || bytes_default().inc(4).i16(3).z(2).str(
      Object.entries(Object.assign(
        {
          user,
          database,
          client_encoding: "UTF8"
        },
        options.connection
      )).filter(([, v]) => v).map(([k, v]) => k + bytes_default.N + v).join(bytes_default.N)
    ).z(2).end(0);
  }
}
function parseError(x) {
  const error = {};
  let start = 5;
  for (let i = 5; i < x.length - 1; i++) {
    if (x[i] === 0) {
      error[errorFields[x[start]]] = x.toString("utf8", start + 1, i);
      start = i + 1;
    }
  }
  return error;
}
function md5(x) {
  return crypto.createHash("md5").update(x).digest("hex");
}
function hmac(key, x) {
  return crypto.createHmac("sha256", key).update(x).digest();
}
function sha256(x) {
  return crypto.createHash("sha256").update(x).digest();
}
function xor(a, b2) {
  const length = Math.max(a.length, b2.length);
  const buffer2 = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++)
    buffer2[i] = a[i] ^ b2[i];
  return buffer2;
}
function timer(fn, seconds) {
  seconds = typeof seconds === "function" ? seconds() : seconds;
  if (!seconds)
    return { cancel: noop, start: noop };
  let timer2;
  return {
    cancel() {
      timer2 && (clearTimeout(timer2), timer2 = null);
    },
    start() {
      timer2 && clearTimeout(timer2);
      timer2 = setTimeout(done, seconds * 1e3, arguments);
    }
  };
  function done(args) {
    fn.apply(null, args);
    timer2 = null;
  }
}

// ../vendor-src/postgres/src/subscribe.js
var noop2 = () => {
};
function Subscribe(postgres2, options) {
  const subscribers = /* @__PURE__ */ new Map(), slot = "postgresjs_" + Math.random().toString(36).slice(2), state = {};
  let connection2, stream, ended = false;
  const sql2 = subscribe.sql = postgres2({
    ...options,
    transform: { column: {}, value: {}, row: {} },
    max: 1,
    fetch_types: false,
    idle_timeout: null,
    max_lifetime: null,
    connection: {
      ...options.connection,
      replication: "database"
    },
    onclose: async function() {
      if (ended)
        return;
      stream = null;
      state.pid = state.secret = void 0;
      connected(await init(sql2, slot, options.publications));
      subscribers.forEach((event) => event.forEach(({ onsubscribe }) => onsubscribe()));
    },
    no_subscribe: true
  });
  const end = sql2.end, close = sql2.close;
  sql2.end = async () => {
    ended = true;
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return end();
  };
  sql2.close = async () => {
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return close();
  };
  return subscribe;
  async function subscribe(event, fn, onsubscribe = noop2, onerror = noop2) {
    event = parseEvent(event);
    if (!connection2)
      connection2 = init(sql2, slot, options.publications);
    const subscriber = { fn, onsubscribe };
    const fns = subscribers.has(event) ? subscribers.get(event).add(subscriber) : subscribers.set(event, /* @__PURE__ */ new Set([subscriber])).get(event);
    const unsubscribe = () => {
      fns.delete(subscriber);
      fns.size === 0 && subscribers.delete(event);
    };
    return connection2.then((x) => {
      connected(x);
      onsubscribe();
      stream && stream.on("error", onerror);
      return { unsubscribe, state, sql: sql2 };
    });
  }
  function connected(x) {
    stream = x.stream;
    state.pid = x.state.pid;
    state.secret = x.state.secret;
  }
  async function init(sql3, slot2, publications) {
    if (!publications)
      throw new Error("Missing publication names");
    const xs = await sql3.unsafe(
      `CREATE_REPLICATION_SLOT ${slot2} TEMPORARY LOGICAL pgoutput NOEXPORT_SNAPSHOT`
    );
    const [x] = xs;
    const stream2 = await sql3.unsafe(
      `START_REPLICATION SLOT ${slot2} LOGICAL ${x.consistent_point} (proto_version '1', publication_names '${publications}')`
    ).writable();
    const state2 = {
      lsn: Buffer.concat(x.consistent_point.split("/").map((x2) => Buffer.from(("00000000" + x2).slice(-8), "hex")))
    };
    stream2.on("data", data);
    stream2.on("error", error);
    stream2.on("close", sql3.close);
    return { stream: stream2, state: xs.state };
    function error(e) {
      console.error("Unexpected error during logical streaming - reconnecting", e);
    }
    function data(x2) {
      if (x2[0] === 119) {
        parse(x2.subarray(25), state2, sql3.options.parsers, handle, options.transform);
      } else if (x2[0] === 107 && x2[17]) {
        state2.lsn = x2.subarray(1, 9);
        pong();
      }
    }
    function handle(a, b2) {
      const path = b2.relation.schema + "." + b2.relation.table;
      call("*", a, b2);
      call("*:" + path, a, b2);
      b2.relation.keys.length && call("*:" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
      call(b2.command, a, b2);
      call(b2.command + ":" + path, a, b2);
      b2.relation.keys.length && call(b2.command + ":" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
    }
    function pong() {
      const x2 = Buffer.alloc(34);
      x2[0] = "r".charCodeAt(0);
      x2.fill(state2.lsn, 1);
      x2.writeBigInt64BE(BigInt(Date.now() - Date.UTC(2e3, 0, 1)) * BigInt(1e3), 25);
      stream2.write(x2);
    }
  }
  function call(x, a, b2) {
    subscribers.has(x) && subscribers.get(x).forEach(({ fn }) => fn(a, b2, x));
  }
}
function Time(x) {
  return new Date(Date.UTC(2e3, 0, 1) + Number(x / BigInt(1e3)));
}
function parse(x, state, parsers2, handle, transform) {
  const char = (acc, [k, v]) => (acc[k.charCodeAt(0)] = v, acc);
  Object.entries({
    R: (x2) => {
      let i = 1;
      const r = state[x2.readUInt32BE(i)] = {
        schema: x2.toString("utf8", i += 4, i = x2.indexOf(0, i)) || "pg_catalog",
        table: x2.toString("utf8", i + 1, i = x2.indexOf(0, i + 1)),
        columns: Array(x2.readUInt16BE(i += 2)),
        keys: []
      };
      i += 2;
      let columnIndex = 0, column;
      while (i < x2.length) {
        column = r.columns[columnIndex++] = {
          key: x2[i++],
          name: transform.column.from ? transform.column.from(x2.toString("utf8", i, i = x2.indexOf(0, i))) : x2.toString("utf8", i, i = x2.indexOf(0, i)),
          type: x2.readUInt32BE(i += 1),
          parser: parsers2[x2.readUInt32BE(i)],
          atttypmod: x2.readUInt32BE(i += 4)
        };
        column.key && r.keys.push(column);
        i += 4;
      }
    },
    Y: () => {
    },
    // Type
    O: () => {
    },
    // Origin
    B: (x2) => {
      state.date = Time(x2.readBigInt64BE(9));
      state.lsn = x2.subarray(1, 9);
    },
    I: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      const { row } = tuples(x2, relation.columns, i += 7, transform);
      handle(row, {
        command: "insert",
        relation
      });
    },
    D: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      handle(
        key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform).row : null,
        {
          command: "delete",
          relation,
          key
        }
      );
    },
    U: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      const xs = key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform) : null;
      xs && (i = xs.i);
      const { row } = tuples(x2, relation.columns, i + 3, transform);
      handle(row, {
        command: "update",
        relation,
        key,
        old: xs && xs.row
      });
    },
    T: () => {
    },
    // Truncate,
    C: () => {
    }
    // Commit
  }).reduce(char, {})[x[0]](x);
}
function tuples(x, columns, xi, transform) {
  let type, column, value;
  const row = transform.raw ? new Array(columns.length) : {};
  for (let i = 0; i < columns.length; i++) {
    type = x[xi++];
    column = columns[i];
    value = type === 110 ? null : type === 117 ? void 0 : column.parser === void 0 ? x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)) : column.parser.array === true ? column.parser(x.toString("utf8", xi + 5, xi += 4 + x.readUInt32BE(xi))) : column.parser(x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)));
    transform.raw ? row[i] = transform.raw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
  }
  return { i: xi, row: transform.row.from ? transform.row.from(row) : row };
}
function parseEvent(x) {
  const xs = x.match(/^(\*|insert|update|delete)?:?([^.]+?\.?[^=]+)?=?(.+)?/i) || [];
  if (!xs)
    throw new Error("Malformed subscribe pattern: " + x);
  const [, command, path, key] = xs;
  return (command || "*") + (path ? ":" + (path.indexOf(".") === -1 ? "public." + path : path) : "") + (key ? "=" + key : "");
}

// ../vendor-src/postgres/src/large.js
import Stream2 from "stream";
function largeObject(sql2, oid, mode = 131072 | 262144) {
  return new Promise(async (resolve, reject) => {
    await sql2.begin(async (sql3) => {
      let finish;
      !oid && ([{ oid }] = await sql3`select lo_creat(-1) as oid`);
      const [{ fd }] = await sql3`select lo_open(${oid}, ${mode}) as fd`;
      const lo = {
        writable,
        readable,
        close: () => sql3`select lo_close(${fd})`.then(finish),
        tell: () => sql3`select lo_tell64(${fd})`,
        read: (x) => sql3`select loread(${fd}, ${x}) as data`,
        write: (x) => sql3`select lowrite(${fd}, ${x})`,
        truncate: (x) => sql3`select lo_truncate64(${fd}, ${x})`,
        seek: (x, whence = 0) => sql3`select lo_lseek64(${fd}, ${x}, ${whence})`,
        size: () => sql3`
          select
            lo_lseek64(${fd}, location, 0) as position,
            seek.size
          from (
            select
              lo_lseek64($1, 0, 2) as size,
              tell.location
            from (select lo_tell64($1) as location) tell
          ) seek
        `
      };
      resolve(lo);
      return new Promise(async (r) => finish = r);
      async function readable({
        highWaterMark = 2048 * 8,
        start = 0,
        end = Infinity
      } = {}) {
        let max = end - start;
        start && await lo.seek(start);
        return new Stream2.Readable({
          highWaterMark,
          async read(size2) {
            const l = size2 > max ? size2 - max : size2;
            max -= size2;
            const [{ data }] = await lo.read(l);
            this.push(data);
            if (data.length < size2)
              this.push(null);
          }
        });
      }
      async function writable({
        highWaterMark = 2048 * 8,
        start = 0
      } = {}) {
        start && await lo.seek(start);
        return new Stream2.Writable({
          highWaterMark,
          write(chunk, encoding, callback) {
            lo.write(chunk).then(() => callback(), callback);
          }
        });
      }
    }).catch(reject);
  });
}

// ../vendor-src/postgres/src/index.js
Object.assign(Postgres, {
  PostgresError,
  toPascal,
  pascal,
  toCamel,
  camel,
  toKebab,
  kebab,
  fromPascal,
  fromCamel,
  fromKebab,
  BigInt: {
    to: 20,
    from: [20],
    parse: (x) => BigInt(x),
    // eslint-disable-line
    serialize: (x) => x.toString()
  }
});
var src_default = Postgres;
function Postgres(a, b2) {
  const options = parseOptions(a, b2), subscribe = options.no_subscribe || Subscribe(Postgres, { ...options });
  let ending = false;
  const queries = queue_default(), connecting = queue_default(), reserved = queue_default(), closed = queue_default(), ended = queue_default(), open = queue_default(), busy = queue_default(), full = queue_default(), queues = { connecting, reserved, closed, ended, open, busy, full };
  const connections = [...Array(options.max)].map(() => connection_default(options, queues, { onopen, onend, onclose }));
  const sql2 = Sql(handler);
  Object.assign(sql2, {
    get parameters() {
      return options.parameters;
    },
    largeObject: largeObject.bind(null, sql2),
    subscribe,
    CLOSE,
    END: CLOSE,
    PostgresError,
    options,
    reserve,
    listen,
    begin,
    close,
    end
  });
  return sql2;
  function Sql(handler2) {
    handler2.debug = options.debug;
    Object.entries(options.types).reduce((acc, [name, type]) => {
      acc[name] = (x) => new Parameter(x, type.to);
      return acc;
    }, typed);
    Object.assign(sql3, {
      types: typed,
      typed,
      unsafe,
      notify,
      array,
      json,
      file
    });
    return sql3;
    function typed(value, type) {
      return new Parameter(value, type);
    }
    function sql3(strings, ...args) {
      const query = strings && Array.isArray(strings.raw) ? new Query(strings, args, handler2, cancel) : typeof strings === "string" && !args.length ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings) : new Builder(strings, args);
      return query;
    }
    function unsafe(string, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([string], args, handler2, cancel, {
        prepare: false,
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
    function file(path, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([], args, (query2) => {
        fs.readFile(path, "utf8", (err, string) => {
          if (err)
            return query2.reject(err);
          query2.strings = [string];
          handler2(query2);
        });
      }, cancel, {
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
  }
  async function listen(name, fn, onlisten) {
    const listener = { fn, onlisten };
    const sql3 = listen.sql || (listen.sql = Postgres({
      ...options,
      max: 1,
      idle_timeout: null,
      max_lifetime: null,
      fetch_types: false,
      onclose() {
        Object.entries(listen.channels).forEach(([name2, { listeners }]) => {
          delete listen.channels[name2];
          Promise.all(listeners.map((l) => listen(name2, l.fn, l.onlisten).catch(() => {
          })));
        });
      },
      onnotify(c, x) {
        c in listen.channels && listen.channels[c].listeners.forEach((l) => l.fn(x));
      }
    }));
    const channels = listen.channels || (listen.channels = {}), exists = name in channels;
    if (exists) {
      channels[name].listeners.push(listener);
      const result2 = await channels[name].result;
      listener.onlisten && listener.onlisten();
      return { state: result2.state, unlisten };
    }
    channels[name] = { result: sql3`listen ${sql3.unsafe('"' + name.replace(/"/g, '""') + '"')}`, listeners: [listener] };
    const result = await channels[name].result;
    listener.onlisten && listener.onlisten();
    return { state: result.state, unlisten };
    async function unlisten() {
      if (name in channels === false)
        return;
      channels[name].listeners = channels[name].listeners.filter((x) => x !== listener);
      if (channels[name].listeners.length)
        return;
      delete channels[name];
      return sql3`unlisten ${sql3.unsafe('"' + name.replace(/"/g, '""') + '"')}`;
    }
  }
  async function notify(channel, payload) {
    return await sql2`select pg_notify(${channel}, ${"" + payload})`;
  }
  async function reserve() {
    const queue = queue_default();
    const c = open.length ? open.shift() : await new Promise((resolve, reject) => {
      const query = { reserve: resolve, reject };
      queries.push(query);
      closed.length && connect(closed.shift(), query);
    });
    move(c, reserved);
    c.reserved = () => queue.length ? c.execute(queue.shift()) : move(c, reserved);
    c.reserved.release = true;
    const sql3 = Sql(handler2);
    sql3.release = () => {
      c.reserved = null;
      onopen(c);
    };
    return sql3;
    function handler2(q) {
      c.queue === full ? queue.push(q) : c.execute(q) || move(c, full);
    }
  }
  async function begin(options2, fn) {
    !fn && (fn = options2, options2 = "");
    const queries2 = queue_default();
    let savepoints = 0, connection2, prepare = null;
    try {
      await sql2.unsafe("begin " + options2.replace(/[^a-z ]/ig, ""), [], { onexecute }).execute();
      return await Promise.race([
        scope(connection2, fn),
        new Promise((_, reject) => connection2.onclose = reject)
      ]);
    } catch (error) {
      throw error;
    }
    async function scope(c, fn2, name) {
      const sql3 = Sql(handler2);
      sql3.savepoint = savepoint;
      sql3.prepare = (x) => prepare = x.replace(/[^a-z0-9$-_. ]/gi);
      let uncaughtError, result;
      name && await sql3`savepoint ${sql3(name)}`;
      try {
        result = await new Promise((resolve, reject) => {
          const x = fn2(sql3);
          Promise.resolve(Array.isArray(x) ? Promise.all(x) : x).then(resolve, reject);
        });
        if (uncaughtError)
          throw uncaughtError;
      } catch (e) {
        await (name ? sql3`rollback to ${sql3(name)}` : sql3`rollback`);
        throw e instanceof PostgresError && e.code === "25P02" && uncaughtError || e;
      }
      if (!name) {
        prepare ? await sql3`prepare transaction '${sql3.unsafe(prepare)}'` : await sql3`commit`;
      }
      return result;
      function savepoint(name2, fn3) {
        if (name2 && Array.isArray(name2.raw))
          return savepoint((sql4) => sql4.apply(sql4, arguments));
        arguments.length === 1 && (fn3 = name2, name2 = null);
        return scope(c, fn3, "s" + savepoints++ + (name2 ? "_" + name2 : ""));
      }
      function handler2(q) {
        q.catch((e) => uncaughtError || (uncaughtError = e));
        c.queue === full ? queries2.push(q) : c.execute(q) || move(c, full);
      }
    }
    function onexecute(c) {
      connection2 = c;
      move(c, reserved);
      c.reserved = () => queries2.length ? c.execute(queries2.shift()) : move(c, reserved);
    }
  }
  function move(c, queue) {
    c.queue.remove(c);
    queue.push(c);
    c.queue = queue;
    queue === open ? c.idleTimer.start() : c.idleTimer.cancel();
    return c;
  }
  function json(x) {
    return new Parameter(x, 3802);
  }
  function array(x, type) {
    if (!Array.isArray(x))
      return array(Array.from(arguments));
    return new Parameter(x, type || (x.length ? inferType(x) || 25 : 0), options.shared.typeArrayMap);
  }
  function handler(query) {
    if (ending)
      return query.reject(Errors.connection("CONNECTION_ENDED", options, options));
    if (open.length)
      return go(open.shift(), query);
    if (closed.length)
      return connect(closed.shift(), query);
    busy.length ? go(busy.shift(), query) : queries.push(query);
  }
  function go(c, query) {
    return c.execute(query) ? move(c, busy) : move(c, full);
  }
  function cancel(query) {
    return new Promise((resolve, reject) => {
      query.state ? query.active ? connection_default(options).cancel(query.state, resolve, reject) : query.cancelled = { resolve, reject } : (queries.remove(query), query.cancelled = true, query.reject(Errors.generic("57014", "canceling statement due to user request")), resolve());
    });
  }
  async function end({ timeout = null } = {}) {
    if (ending)
      return ending;
    await 1;
    let timer2;
    return ending = Promise.race([
      new Promise((r) => timeout !== null && (timer2 = setTimeout(destroy, timeout * 1e3, r))),
      Promise.all(connections.map((c) => c.end()).concat(
        listen.sql ? listen.sql.end({ timeout: 0 }) : [],
        subscribe.sql ? subscribe.sql.end({ timeout: 0 }) : []
      ))
    ]).then(() => clearTimeout(timer2));
  }
  async function close() {
    await Promise.all(connections.map((c) => c.end()));
  }
  async function destroy(resolve) {
    await Promise.all(connections.map((c) => c.terminate()));
    while (queries.length)
      queries.shift().reject(Errors.connection("CONNECTION_DESTROYED", options));
    resolve();
  }
  function connect(c, query) {
    move(c, connecting);
    c.connect(query);
    return c;
  }
  function onend(c) {
    move(c, ended);
  }
  function onopen(c) {
    if (queries.length === 0)
      return move(c, open);
    let max = Math.ceil(queries.length / (connecting.length + 1)), ready = true;
    while (ready && queries.length && max-- > 0) {
      const query = queries.shift();
      if (query.reserve)
        return query.reserve(c);
      ready = c.execute(query);
    }
    ready ? move(c, busy) : move(c, full);
  }
  function onclose(c, e) {
    move(c, closed);
    c.reserved = null;
    c.onclose && (c.onclose(e), c.onclose = null);
    options.onclose && options.onclose(c.id);
    queries.length && connect(c, queries.shift());
  }
}
function parseOptions(a, b2) {
  if (a && a.shared)
    return a;
  const env = process.env, o = (!a || typeof a === "string" ? b2 : a) || {}, { url: url2, multihost } = parseUrl(a), query = [...url2.searchParams].reduce((a2, [b3, c]) => (a2[b3] = c, a2), {}), host = o.hostname || o.host || multihost || url2.hostname || env.PGHOST || "localhost", port = o.port || url2.port || env.PGPORT || 5432, user = o.user || o.username || url2.username || env.PGUSERNAME || env.PGUSER || osUsername();
  o.no_prepare && (o.prepare = false);
  query.sslmode && (query.ssl = query.sslmode, delete query.sslmode);
  "timeout" in o && (console.log("The timeout option is deprecated, use idle_timeout instead"), o.idle_timeout = o.timeout);
  query.sslrootcert === "system" && (query.ssl = "verify-full");
  const ints = ["idle_timeout", "connect_timeout", "max_lifetime", "max_pipeline", "backoff", "keep_alive"];
  const defaults = {
    max: globalThis.Cloudflare ? 3 : 10,
    ssl: false,
    sslnegotiation: null,
    idle_timeout: null,
    connect_timeout: 30,
    max_lifetime,
    max_pipeline: 100,
    backoff,
    keep_alive: 60,
    prepare: true,
    debug: false,
    fetch_types: true,
    publications: "alltables",
    target_session_attrs: null
  };
  return {
    host: Array.isArray(host) ? host : host.split(",").map((x) => x.split(":")[0]),
    port: Array.isArray(port) ? port : host.split(",").map((x) => parseInt(x.split(":")[1] || port)),
    path: o.path || host.indexOf("/") > -1 && host + "/.s.PGSQL." + port,
    database: o.database || o.db || (url2.pathname || "").slice(1) || env.PGDATABASE || user,
    user,
    pass: o.pass || o.password || url2.password || env.PGPASSWORD || "",
    ...Object.entries(defaults).reduce(
      (acc, [k, d]) => {
        const value = k in o ? o[k] : k in query ? query[k] === "disable" || query[k] === "false" ? false : query[k] : env["PG" + k.toUpperCase()] || d;
        acc[k] = typeof value === "string" && ints.includes(k) ? +value : value;
        return acc;
      },
      {}
    ),
    connection: {
      application_name: env.PGAPPNAME || "postgres.js",
      ...o.connection,
      ...Object.entries(query).reduce((acc, [k, v]) => (k in defaults || (acc[k] = v), acc), {})
    },
    types: o.types || {},
    target_session_attrs: tsa(o, url2, env),
    onnotice: o.onnotice,
    onnotify: o.onnotify,
    onclose: o.onclose,
    onparameter: o.onparameter,
    socket: o.socket,
    transform: parseTransform(o.transform || { undefined: void 0 }),
    parameters: {},
    shared: { retries: 0, typeArrayMap: {} },
    ...mergeUserTypes(o.types)
  };
}
function tsa(o, url2, env) {
  const x = o.target_session_attrs || url2.searchParams.get("target_session_attrs") || env.PGTARGETSESSIONATTRS;
  if (!x || ["read-write", "read-only", "primary", "standby", "prefer-standby"].includes(x))
    return x;
  throw new Error("target_session_attrs " + x + " is not supported");
}
function backoff(retries) {
  return (0.5 + Math.random() / 2) * Math.min(3 ** retries / 100, 20);
}
function max_lifetime() {
  return 60 * (30 + Math.random() * 30);
}
function parseTransform(x) {
  return {
    undefined: x.undefined,
    column: {
      from: typeof x.column === "function" ? x.column : x.column && x.column.from,
      to: x.column && x.column.to
    },
    value: {
      from: typeof x.value === "function" ? x.value : x.value && x.value.from,
      to: x.value && x.value.to
    },
    row: {
      from: typeof x.row === "function" ? x.row : x.row && x.row.from,
      to: x.row && x.row.to
    }
  };
}
function parseUrl(url2) {
  if (!url2 || typeof url2 !== "string")
    return { url: { searchParams: /* @__PURE__ */ new Map() } };
  let host = url2;
  host = host.slice(host.indexOf("://") + 3).split(/[?/]/)[0];
  host = decodeURIComponent(host.slice(host.indexOf("@") + 1));
  const urlObj = new URL(url2.replace(host, host.split(",")[0]));
  return {
    url: {
      username: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      host: urlObj.host,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      searchParams: urlObj.searchParams
    },
    multihost: host.indexOf(",") > -1 && host
  };
}
function osUsername() {
  try {
    return os.userInfo().username;
  } catch (_) {
    return process.env.USERNAME || process.env.USER || process.env.LOGNAME;
  }
}

// apps/server/src/database/db.ts
function createDb(url2, opts = {}) {
  return src_default(url2, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {
    },
    types: {},
    transform: { undefined: null }
  });
}

// apps/server/src/database/migrate.ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// packages/shared/src/constants/game.ts
var TICK_RATE = 60;
var TICK_MS = 1e3 / TICK_RATE;
var TICK_DT = 1 / TICK_RATE;
var MAX_NAME_LENGTH = 24;

// packages/shared/src/game-rules/characters.ts
var CHARACTER_IDS = [
  "petya",
  "valuta",
  // for level + talons
  "uchastkovy",
  "mihalych",
  "vorona",
  "zmeya",
  "varan",
  "popugay",
  "golub",
  "tarakan",
  "krysa",
  "svinya",
  "buyvol",
  // for diamonds
  "piranya",
  "akula",
  "oryol",
  "leopard",
  "slon",
  "lobster",
  "koshka",
  "lisa",
  "nosorog",
  "gorilla",
  "lev"
];
var CHARACTER_BASE_STATS = Object.freeze({ maxHp: 100, speed: 1, radius: 10 });
var CHARACTERS = {
  petya: {
    id: "petya",
    name: "Petya",
    nickname: "The Commandant",
    species: "Rooster",
    role: "Former dormitory commandant",
    personality: "Keeps order. Knows every corner of the yard.",
    quote: "My yard. My rules.",
    district: "3rd Microdistrict",
    business: "Running the yard",
    weaponsNote: "Anything, as long as it comes with respect.",
    lore: "For twenty years he ran the textile mill dormitory with an iron fist: lights out at 23:00, guests until 22:00, immersion heaters strictly forbidden. The dormitory was resettled, the habit of giving orders stayed. Now Petya has appointed himself commandant of the whole yard \u2014 and nobody has dared to argue yet.",
    tier: "base",
    accent: "#c8312a",
    tag: "Petya"
  },
  valuta: {
    id: "valuta",
    name: "Valuta",
    nickname: "The Black Marketeer",
    species: "Panther",
    role: "Black marketeer and fixer",
    personality: "Always knows where to get it. Settles questions at any level.",
    quote: "Connections decide everything.",
    district: "Garage Cooperative",
    business: "Trade, deliveries, hard currency",
    weaponsNote: "A gun, connections and good information.",
    lore: "Started out flogging chewing gum outside the Intourist hotel; now half the jeans in the district pass through his garages. Moves without a sound, talks in a whisper and never lets go of his little book of phone numbers. Need a VCR, a sheepskin coat or the right certificate with the right stamp? Everybody goes to Valuta. The only question is the price.",
    tier: "base",
    accent: "#d8a637",
    tag: "Valuta"
  },
  // ── unlocked by level + talons (the wolf and the bear were free until v0.23: accounts made before
  //    then keep them, see migration 009) ─────────────────────────────────────────────────────────
  uchastkovy: {
    id: "uchastkovy",
    name: "Uchastkovy",
    nickname: "Knows Everyone",
    species: "Wolf",
    role: "The beat cop. Watches the district, knows everyone and everything.",
    personality: "Suspicious, observant, bureaucratically relentless.",
    quote: "Where are you off to? Papers, please.",
    district: "3rd Microdistrict",
    business: "Order, reports, district affairs",
    weaponsNote: "Pistol, rifle, baton, sawn-off.",
    lore: "Fifteen years on the beat, and he remembers everyone who ever crossed the street in the wrong place. His reports get read out at tenants\u2019 meetings like detective novels. The bosses keep promising him a transfer to the city centre, but he is in no hurry: here he knows who, where and for how much.",
    tier: "progress",
    accent: "#3d5a8c",
    tag: "Uchastkovy"
  },
  mihalych: {
    id: "mihalych",
    name: "Mikhalych",
    nickname: "The Demob",
    species: "Bear",
    role: "Ex-army. Went out for bread, now settles the district\u2019s affairs.",
    personality: "Calm, experienced, stays out of the fuss \u2014 but sorts it out when he has to. Respects his own, keeps his word.",
    quote: "Order isn\u2019t what they write down. Order is what people hold together.",
    district: "Garage Cooperative",
    business: "Security, muscle, settling disputes",
    weaponsNote: "Rifle, sawn-off, pistol, hand-to-hand.",
    lore: "Served his time, came home and went out for a loaf of bread. On the way he broke up two fights, made peace between the garage owners and somehow became head of security for the whole cooperative. They say he never did buy the bread. You don\u2019t need to talk Mikhalych into anything \u2014 just ask him like a human being.",
    tier: "progress",
    accent: "#6b7536",
    tag: "Mikhalych"
  },
  // (art of the next characters: references/08…16, supplied by the product owner)
  vorona: {
    id: "vorona",
    name: "Karlych",
    nickname: "The Informant",
    species: "Raven",
    role: "Knows everything that happens in the district. Gets information, brings people together, sorts things out.",
    personality: "Sly, observant, always a step ahead. Stays out of open fights, but is always there at the right moment.",
    quote: "Walls hear more than people think.",
    district: "Old Town",
    business: "Connections, rumours, people",
    weaponsNote: "Pistols, SMGs",
    lore: "Karlych has ears in every yard of the Old Town: caretakers, cabbies, canteen ladies \u2014 everyone tells him something. A cassette recorder hangs on his chest and his pockets are full of tapes of other people\u2019s conversations. Karlych never sells information \u2014 he trades it. And if you were the last to hear the news, Karlych was the first.",
    tier: "progress",
    accent: "#b8302a",
    tag: "Karlych"
  },
  zmeya: {
    id: "zmeya",
    name: "Sonka",
    nickname: "The Temptress",
    species: "Snake",
    role: "Reconnaissance, cunning operations, provocations. Knows every loophole in the district.",
    personality: "Quiet, clever, always a step ahead. Knows how to strike a deal \u2014 and how to vanish.",
    quote: "Everyone has a price. You just need to know where to press.",
    district: "Market / Railway Station",
    business: "Connections, deliveries, reconnaissance",
    weaponsNote: "SMGs, pistols, knife",
    lore: "Every conductor at the station knows Sonka, and so does every scales lady at the market. She turns up wherever a deal is being made and disappears before anyone misses their wallet. She smiles, whispers, promises \u2014 and everyone walks away sure they got a bargain. They realise they were taken a week later. Beautiful, dirty, effective: that is her signature.",
    tier: "progress",
    accent: "#6f8a3a",
    tag: "Sonka"
  },
  varan: {
    id: "varan",
    name: "Tolyan",
    nickname: "The Techie",
    species: "Monitor Lizard",
    role: "Knows machines, locks and engines. Fixes, improves and gets what can\u2019t be bought.",
    personality: "Calm, calculating, always on the move. Does more than he talks. At home among the garages.",
    quote: "If it can be fixed, it can still fight.",
    district: "Garage Cooperative",
    business: "Weapons, machinery, modifications, break-ins",
    weaponsNote: "Rifles, SMGs, shotguns",
    lore: "There is no lock in the cooperative Tolyan can\u2019t open in a minute, and no engine he can\u2019t push-start. He\u2019ll build an armoured car out of an old Moskvich, a timer out of an alarm clock, and out of a written-off shotgun \u2014 a piece people drive over from other districts to see. Says little, smokes a lot and always smells of engine oil.",
    tier: "progress",
    accent: "#8a7444",
    tag: "Tolyan"
  },
  popugay: {
    id: "popugay",
    name: "Gosha",
    nickname: "The Liaison",
    species: "Parrot",
    role: "Passes the word, coordinates the crew, knows every district. Quick to react and always in the loop.",
    personality: "Talkative, charismatic, sharp-tongued, always on the line. Can talk his way out of anything. Loves freedom and a bit of action.",
    quote: "I hear it all, see it all, fly everywhere. News travels faster than a bullet!",
    district: "Market / Radio Tower",
    business: "Communications, reconnaissance, passing on the word",
    weaponsNote: "Pistols, SMGs, rifles",
    lore: "Gosha sits on the radio tower above the market and listens to the whole city: the militsiya band, the cabbies, the port dispatchers. Every negotiation in the district goes through him \u2014 he\u2019ll pass it on, remind you, warn you and, if needed, embellish it a little. Walkie-talkie on his belt, pipe in his beak, flying goggles on his forehead. Whoever owns the information owns the district.",
    tier: "progress",
    accent: "#e0a020",
    tag: "Gosha"
  },
  // ── premium (diamonds) ────────────────────────────────────────────────────
  piranya: {
    id: "piranya",
    name: "Vityok",
    nickname: "The Madman",
    species: "Piranha",
    role: "First into any brawl. Close combat and pressure are his element. Creates chaos so his own can take what\u2019s theirs.",
    personality: "Impulsive, wild, unpredictable. Does what he feels. Lives for the moment.",
    quote: "The smell of blood is the best plan.",
    district: "River / Port",
    business: "Muscle, cargo protection",
    weaponsNote: "Uzi, shotguns, knives, mines",
    lore: "They found Vityok on a river barge, where he had single-handedly chased off a whole gang of dockers from the next district. Since then he gets called when the talking is over. He never has a plan \u2014 just a red bandana, a mouth full of teeth and the firm conviction that fish have a say too. His own people are a bit scared of him; strangers even more so.",
    tier: "premium",
    accent: "#c24a3a",
    tag: "Vityok"
  },
  akula: {
    id: "akula",
    name: "Zhora",
    nickname: "The Businessman",
    species: "Shark",
    role: "Settles things with money, connections and force. Controls trade, deliveries and protection.",
    personality: "Cold-blooded, calculating, always looking for an angle. Keeps smiling even when it\u2019s too late to save anything.",
    quote: "Everything in the district is for sale. It\u2019s only a question of price.",
    district: "Port / Market",
    business: "Deliveries, contraband, a cut of every business",
    weaponsNote: "Rifles, SMGs, shotguns",
    lore: "Zhora came to the port back when they only loaded timber and fish. Now VCRs, jeans and everything \u201Cnot allowed\u201D come through his piers. He wears a pinstripe suit, smokes a fat cigar and never raises his voice \u2014 why would he, when he can simply smile. Everyone who trades by the sea pays Zhora his cut. Those who don\u2019t pay don\u2019t trade any more.",
    tier: "premium",
    accent: "#3d5a8c",
    tag: "Zhora"
  },
  oryol: {
    id: "oryol",
    name: "Garik",
    nickname: "Pendos",
    species: "Eagle",
    role: "Sniper. Takes out targets from a distance, holds the key positions.",
    personality: "Calm, deliberate, never says a word too many.",
    quote: "I see further. I shoot straighter.",
    district: "Port",
    business: "Holding the territory",
    weaponsNote: "Sniper rifle",
    lore: "They started calling Garik \u201CPendos\u201D \u2014 the Yankee \u2014 back in 1980: aviator shades, a sheepskin bomber jacket and chewing gum he chews even in his sleep. He traded a crate of matryoshka dolls for the shades with a foreign sailor and has never taken them off since. Garik sits up on the port cranes and sees everything that happens at the piers. He says little, shoots rarely \u2014 and almost never misses.",
    tier: "premium",
    accent: "#e8b030",
    tag: "Garik"
  },
  leopard: {
    id: "leopard",
    name: "Lyova",
    nickname: "The Mercenary",
    species: "Leopard",
    role: "Takes on the hard jobs. Settles matters when speed and precision are needed.",
    personality: "Cold, confident, always in control. Doesn\u2019t chatter. Values results.",
    quote: "A job should be clean, like tracks in fresh snow.",
    district: "The Whole City",
    business: "Protection, escorts, special orders",
    weaponsNote: "Assault and sniper rifles, pistols",
    lore: "Nobody hires Lyova \u2014 you put your name down on his waiting list. He takes only difficult jobs, works alone and never haggles: the price is named, the question is closed. He wears a sheepskin coat all year round and never takes the cigarette out of his mouth, even on a job. The district tells legends about his past; the few who know the truth prefer to keep quiet.",
    tier: "premium",
    accent: "#d89a2a",
    tag: "Lyova"
  },
  slon: {
    id: "slon",
    name: "Batya",
    nickname: "The Roof",
    species: "Elephant",
    role: "Holds the districts, covers the businesses, settles the big conflicts. The heavy artillery of any affair.",
    personality: "Calm, massive, says little but every word counts. Always keeps his word. When the Elephant is around, problems disappear.",
    quote: "Big things are done slowly \u2014 but forever.",
    district: "The Whole City",
    business: "Protection (\u201Ca roof\u201D) for businesses, security, muscle",
    weaponsNote: "Machine guns, RPGs, heavy weapons",
    lore: "Every kiosk, cooperative and car workshop in the city has a \u201Croof\u201D \u2014 protection. And every roof has Batya. He doesn\u2019t run, doesn\u2019t shout and doesn\u2019t hurry: he arrives in person, sits down, listens in silence \u2014 and the matter is closed for good. A red tracksuit, a fur waistcoat and a gold chain with a star: the whole city knows him by these, and nobody wants to check whether it\u2019s true that he never forgets.",
    tier: "premium",
    accent: "#c8312a",
    tag: "Batya"
  },
  lobster: {
    id: "lobster",
    name: "Slavik",
    nickname: "The Fence",
    species: "Lobster",
    role: "Controls deliveries, gets hold of defitsit, weapons and hard currency. Always knows where to find anything.",
    personality: "Sly, enterprising, a born negotiator who always comes out dry. Loves luxury, but is always ready for a fight.",
    quote: "Everything you need is already on its way. All it takes is the right port.",
    district: "Port",
    business: "Deliveries, defitsit, currency exchange",
    weaponsNote: "Pistols, SMGs, shotguns",
    lore: "Slavik grew up in the port and has spent his whole life mastering one skill: coming out of the water dry. Jeans, chewing gum, video cassettes, hard currency \u2014 whatever the district needs, with Slavik it\u2019s \u201Calready on its way\u201D. He adores gold, tracksuits and good cigars, and in an argument he always offers a deal first \u2014 and only then uses his claws.",
    tier: "premium",
    accent: "#c8402a",
    tag: "Slavik"
  },
  // (v0.23: art of the next ten characters — references/27…36, supplied by the product owner; names,
  //  nicknames and texts written for the game, the sheets' abilities are not implemented)
  golub: {
    id: "golub",
    name: "Sizy",
    nickname: "The Chemist",
    species: "Pigeon",
    role: "Reconnaissance, sabotage, poisoned zones. Spreads chaos and gets in the enemy\u2019s way.",
    personality: "Crazy and unpredictable. Sees what others don\u2019t. Talks in scraps of sentences and strange hints.",
    quote: "Where I fly over, only smoke and pigeons are left.",
    district: "Derelict Sites / Dump",
    business: "Sabotage, reconnaissance, poisoned zones",
    weaponsNote: "SMGs, shotguns, grenades, toxic mixtures",
    lore: "Sizy grew up on the roof of the chemical works and has glowed in the dark ever since \u2014 at least his left eye has. The pockets of his vest hold jars of green muck to his own recipe, a radiation badge sits on his chest, and his head is full of plans nobody understands, himself included. Wherever the Chemist has been, it smells of sulphur for a long time and nobody wants to stay.",
    tier: "progress",
    accent: "#7fbf3a",
    tag: "Sizy"
  },
  tarakan: {
    id: "tarakan",
    name: "Prusak",
    nickname: "The Underground Man",
    species: "Cockroach",
    role: "Survival, covert jobs, finding supplies. Always turns up where nobody expects him.",
    personality: "Sly and tough, adapts to anything. Sees opportunities where others see rubbish.",
    quote: "Every district has cracks. The question is who finds them.",
    district: "Basements / Garages",
    business: "Scouting, scrounging, sabotage, survival",
    weaponsNote: "SMGs, shotguns, home-made guns, traps",
    lore: "They dusted Prusak with poison, evicted him and walled him up in the boiler-house basement \u2014 and every time he came back livelier than before. He knows every basement, heating duct and crawl space in the district; his rucksack holds whatever might come in handy, from sugar to spare parts. He doesn\u2019t take his dark glasses off even at night. They say he will outlive us all, and the district too.",
    tier: "progress",
    accent: "#9a5a24",
    tag: "Prusak"
  },
  krysa: {
    id: "krysa",
    name: "Sery",
    nickname: "The Gym Rat",
    species: "Rat",
    role: "Heavy assault. Breaks, crushes and holds the district. Goes in first and survives longest.",
    personality: "Aggressive, unpredictable, strong. Doesn\u2019t talk much \u2014 lets his actions speak.",
    quote: "The harder you press, the cleaner the district.",
    district: "Dump / Industrial Zone",
    business: "Muscle jobs, taking positions, clean-ups",
    weaponsNote: "Shotguns, SMGs, heavy weapons, bat",
    lore: "Sery pumped iron in a basement gym on barbells made of tractor axles and washed his workouts down with water from the chemical works\u2019 settling tank. The muscles grew, the fur thinned, and here and there glowing green slime came through \u2014 Sery thinks it is just being in shape. He doesn\u2019t explain much: first he takes the door off, then he asks who lived there.",
    tier: "progress",
    accent: "#b52a2a",
    tag: "Sery"
  },
  svinya: {
    id: "svinya",
    name: "Borka",
    nickname: "The Runaway",
    species: "Pig",
    role: "Former livestock. Escaped from the slaughterhouse. Now takes revenge on everyone in uniform.",
    personality: "Angry, ruthless, impulsive. Charges straight in. Isn\u2019t afraid of pain.",
    quote: "Better to croak free than on the hook.",
    district: "Slaughterhouse / Industrial Zone",
    business: "Revenge, destruction, freedom",
    weaponsNote: "Shotguns, axe, chain, pistols",
    lore: "Borka\u2019s ear tag still says 89 \u2014 that is how the meat plant registered him. The night before \xABdispatch\xBB he snapped his chain, broke down the gates of Slaughterhouse No. 3 and has been on the run ever since. Scars, tusks and a length of chain round his neck are all they left him. Borka forgives nobody in uniform and spares nobody, himself included.",
    tier: "progress",
    accent: "#d0645a",
    tag: "Borka"
  },
  buyvol: {
    id: "buyvol",
    name: "Bugai",
    nickname: "The Bouncer",
    species: "Buffalo",
    role: "Breakthroughs and holding ground by force. Smashes cover, knocks enemies back, takes a lot of punishment.",
    personality: "Stern, a little slow, but unstoppable. Always moves forward. Respects strength and loyalty. Says little, but to the point.",
    quote: "If there\u2019s a wall, it needs knocking down.",
    district: "Dump / Industrial Zone",
    business: "Muscle clean-ups, security, knocking down barriers, heavy jobs",
    weaponsNote: "Machine guns, shotguns, grenade launchers, fists",
    lore: "For ten years Bugai stood on the door of the Kosmos restaurant and never let in a single man without a tie. The restaurant closed, the habit stayed: now he \xABstands on the door\xBB of the whole industrial zone. Horns, a gold chain with a dollar sign and a cigar \u2014 a calling card nobody needs to see twice.",
    tier: "progress",
    accent: "#a4241e",
    tag: "Bugai"
  },
  koshka: {
    id: "koshka",
    name: "Murka",
    nickname: "The Tipster",
    species: "Cat",
    role: "Knows how to strike a deal, gather information and get what others can\u2019t reach.",
    personality: "Smart, sly, charming. Uses her looks as a weapon. Always plays one move ahead.",
    quote: "In this district connections decide everything\u2026 plus a little attention.",
    district: "Night Market / Bar",
    business: "Information, connections, access",
    weaponsNote: "Pistols, SMGs, knife",
    lore: "Every barman and every black marketeer at the night market knows Murka. She hears everything said at the next table and remembers who owes whom. A tipster: she\u2019ll tell you where the goods are, when the watchman leaves and who has the warehouse keys \u2014 for a cut, of course. One smile, one drag on her cigarette, and you won\u2019t notice how you told her too much.",
    tier: "premium",
    accent: "#8e1f2c",
    tag: "Murka"
  },
  lisa: {
    id: "lisa",
    name: "Alisa",
    nickname: "The Con Artist",
    species: "Fox",
    role: "Distracts, manipulates, controls her turf. Works with charisma and speed.",
    personality: "Cunning, confident, cool-headed. Always knows how to get what she wants. Don\u2019t underestimate her.",
    quote: "Beauty is a weapon too.",
    district: "Centre / Clubs / Market",
    business: "Scouting, influence, contacts, quick jobs",
    weaponsNote: "Pistols, SMGs, knives",
    lore: "Alisa sold one co-op owner the fountain on the square, another a \xABCzech\xBB furniture set made of chipboard, and a third his own IOU that he had given her in the first place. The clubs know her under five names, the police under six. Fur coat thrown open, a gold heart on her neck and a smile after which you had better check your pockets.",
    tier: "premium",
    accent: "#e0702a",
    tag: "Alisa"
  },
  nosorog: {
    id: "nosorog",
    name: "Rogov",
    nickname: "The Old Lag",
    species: "Rhino",
    role: "Breakthroughs, close combat, smashing cover. Moves like a tank and breaks everything in his path.",
    personality: "Hard, laconic, dangerous. Respects strength and the code. Prison made him angrier. Always goes forward, never backs down.",
    quote: "Walls fall too.",
    district: "Prison / Industrial Zone",
    business: "Muscle clean-ups, storming strongholds, collecting debts, security",
    weaponsNote: "Spiked bat, shotguns, grenade launchers, fists",
    lore: "Rogov served three terms and walked out still in his orange prison overalls \u2014 says he got used to them. Crowns are tattooed on his hide, and round his neck hangs the chain of the handcuffs he broke himself. He talks little and only by the code. If Rogov is charging, step aside: walls fall too, he has checked.",
    tier: "premium",
    accent: "#e0601c",
    tag: "Rogov"
  },
  gorilla: {
    id: "gorilla",
    name: "Samson",
    nickname: "The Foreman",
    species: "Gorilla",
    role: "Head-on assault, brute force, holding ground. Breaks defences, smashes cover, takes out key targets.",
    personality: "Stern, domineering, calm \u2014 but explodes when someone touches his people. Always goes in first. Never backs down.",
    quote: "Strength decides where words fail.",
    district: "Market / Garages",
    business: "Muscle clean-ups, protection, collecting debts",
    weaponsNote: "Machine guns, shotguns, fists, grenades",
    lore: "Samson is the foreman of the central market\u2019s porters and of all its crew. He lifts a crate of watermelons with one hand and a debtor with two fingers. At the market his word is law: the stallholders bring him pies, the co-op owners bring envelopes. Calm as long as nobody touches his own; if they do, the whole crew comes out.",
    tier: "premium",
    accent: "#9c1c22",
    tag: "Samson"
  },
  lev: {
    id: "lev",
    name: "Arkadich",
    nickname: "The Shadow Tycoon",
    species: "Lion",
    role: "Controls the profitable districts, money and supplies. Looks after his own. Settles things with money and force.",
    personality: "Confident, commanding, cold-blooded. Always a step ahead. Knows how to negotiate \u2014 and how to lean on people when needed.",
    quote: "The district feeds those who can count.",
    district: "Centre / Business Quarter",
    business: "Finance, control, supplies, exclusive orders",
    weaponsNote: "Golden rifle, pistols, grenades",
    lore: "Officially Arkadich is the modest head of a consumer-goods workshop. Unofficially his underground workshops dress half the city: \xABMontana\xBB jeans, jackets, bobble hats. A fur coat on his shoulders, gold on his neck, a cigar in his teeth \u2014 and not a single piece of paper anyone could produce against him. Arkadich never raises his voice: why would he, when everyone listens anyway?",
    tier: "premium",
    accent: "#d4a237",
    tag: "Arkadich"
  }
};
var FREE_CHARACTERS = CHARACTER_IDS.filter((c) => CHARACTERS[c].tier === "base");

// packages/shared/src/game-rules/avatars.ts
var AVATAR_IDS = [
  "shades",
  "tracksuit",
  "blonde",
  "ushanka",
  "flatcap",
  "balaclava",
  "bob",
  "resort",
  "thinker",
  "agent",
  "smoker",
  "dog",
  "veteran",
  "hood",
  "brick",
  "tattoo",
  "furcoat",
  "panama",
  "militia",
  "disco",
  "shotgun",
  "babushka",
  "driver",
  "tram"
];
var AVATAR_SET = new Set(AVATAR_IDS);

// packages/shared/src/game-rules/nicknames.ts
var PRACTICE_NAMES = Object.freeze({
  en: ["Beardy", "Comrade_312", "The Cooperator", "Petrovich", "Plumber", "Quartermaster", "Praporshchik", "Kolyan", "Mechanic", "Shurik", "Valerka", "The Docent"],
  ru: ["Borodach", "Tovarishch_312", "Kooperator", "Petrovich", "Santekhnik", "Zavkhoz", "Praporshchik", "Kolyan", "Mekhanik", "Shurik", "Valerka", "Dotsent"]
});

// packages/shared/src/game-rules/aliases.ts
var LOOKALIKES = Object.freeze({
  \u0430: "a",
  \u0432: "b",
  \u0435: "e",
  \u0451: "e",
  \u043A: "k",
  \u043C: "m",
  \u043D: "h",
  \u043E: "o",
  \u0440: "p",
  \u0441: "c",
  \u0442: "t",
  \u0443: "y",
  \u0445: "x",
  \u0456: "i",
  \u0458: "j",
  \u0455: "s",
  "\u0501": "d",
  "\u051B": "q",
  "\u051D": "w",
  "\u2019": "'"
});
function nameKey(name) {
  const s = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  let out = "";
  for (const ch of s) out += LOOKALIKES[ch] ?? ch;
  return out;
}
function numberedAlias(base2, n) {
  const tail = ` ${n}`;
  return base2.slice(0, MAX_NAME_LENGTH - tail.length).trimEnd() + tail;
}
var LATIN_NAME_RE = /^[A-Za-z0-9 _.\-’']+$/;
var CYRILLIC = Object.freeze({
  \u0430: "a",
  \u0431: "b",
  \u0432: "v",
  \u0433: "g",
  \u0434: "d",
  \u0435: "e",
  \u0451: "yo",
  \u0436: "zh",
  \u0437: "z",
  \u0438: "i",
  \u0439: "y",
  \u043A: "k",
  \u043B: "l",
  \u043C: "m",
  \u043D: "n",
  \u043E: "o",
  \u043F: "p",
  \u0440: "r",
  \u0441: "s",
  \u0442: "t",
  \u0443: "u",
  \u0444: "f",
  \u0445: "kh",
  \u0446: "ts",
  \u0447: "ch",
  \u0448: "sh",
  \u0449: "shch",
  \u044A: "",
  \u044B: "y",
  \u044C: "",
  \u044D: "e",
  \u044E: "yu",
  \u044F: "ya",
  \u0456: "i",
  \u0457: "yi",
  \u0454: "ye",
  \u0491: "g",
  \u045E: "u",
  \u04D9: "a",
  \u0493: "gh",
  \u049B: "q",
  \u04A3: "ng",
  \u04E9: "o",
  \u04B1: "u",
  \u04AF: "u",
  \u04BB: "h"
});
var LATIN_EXTRA = Object.freeze({ \u00DF: "ss", \u00E6: "ae", \u00C6: "AE", \u00F8: "o", \u00D8: "O", \u0153: "oe", \u0152: "OE", \u0142: "l", \u0141: "L", \u0111: "d", \u0110: "D", \u00FE: "th", \u00DE: "Th", \u0131: "i" });
function transliterate(raw) {
  const words = raw.normalize("NFKC").split(/(\s+)/);
  const out = words.map((w) => {
    if (!/[\u0400-\u04ff]/.test(w)) return w;
    const letters = [...w].filter((c) => new RegExp("\\p{L}", "u").test(c));
    const shout = letters.length > 1 && letters.every((c) => c === c.toUpperCase() && c !== c.toLowerCase());
    let res = "";
    for (const ch of w) {
      const low = ch.toLowerCase();
      const m = CYRILLIC[low];
      if (m === void 0) res += ch;
      else if (shout) res += m.toUpperCase();
      else res += ch !== low && m ? m[0].toUpperCase() + m.slice(1) : m;
    }
    return res;
  }).join("");
  return [...out].map((c) => LATIN_EXTRA[c] ?? c).join("").normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "");
}
function toLatin(raw) {
  return transliterate(raw).replace(/[^A-Za-z0-9 _.\-’']/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}
function latinName(raw, fallback) {
  const s = toLatin(raw);
  return s.length >= 2 && /[A-Za-z0-9]/.test(s) ? s : fallback;
}

// packages/shared/src/game-rules/weapons.ts
var WEAPON_IDS = [
  // base (free)
  "pistol",
  "montirovka",
  "obrez",
  "avtomat",
  // shop: sidearms
  "tt",
  "p92",
  "deagle",
  // shop: melee
  "nozh",
  "bita",
  "topor",
  // shop: primaries
  "uzi",
  "ppsh",
  "mp5",
  "s12",
  "ksyuha",
  "m4",
  "g36",
  "svd",
  "awm",
  "m24",
  "rpg",
  "m249",
  // rare (cases)
  "mauser",
  "kuvalda",
  "zolotoy",
  "tommy",
  "tulka",
  "ognemet",
  "arbalet",
  "gvozdomet",
  "muha",
  "granatomet"
];
var base = {
  pellets: 1,
  falloffStart: 9999,
  minDamageFactor: 1,
  spreadPerShot: 0,
  spreadMax: 0,
  spreadRecovery: 0,
  meleeArc: 0,
  meleeRange: 0,
  reserveOnPickup: 0,
  projectile: null,
  moveSpeed: 1,
  silenced: false,
  laser: false,
  drawMs: 150,
  automatic: true
};
var sidearm = (d) => ({
  ...base,
  slot: 1,
  pose: "pistol",
  kind: "hitscan",
  reserveMax: -1,
  falloffStart: 280,
  minDamageFactor: 0.75,
  shake: 0.15,
  sound: "pistol",
  flash: "pistol",
  ...d
});
var melee = (d) => ({
  ...base,
  slot: 2,
  pose: "melee",
  kind: "melee",
  range: d.meleeRange,
  spread: 0,
  magazine: 0,
  reserveMax: 0,
  reloadMs: 0,
  shake: 0.2,
  sound: "swing",
  flash: "none",
  ...d
});
var primary = (d) => ({
  ...base,
  slot: 3,
  pose: "long",
  kind: "hitscan",
  shake: 0.22,
  sound: "avtomat",
  flash: "avtomat",
  ...d
});
var DEFS = {
  // ── base ──────────────────────────────────────────────────────────────────
  pistol: sidearm({ name: "Makarov (PM)", blurb: "The trusty Makarov. Always on you, never runs out of ammo.", tier: "base", damage: 25, fireIntervalMs: 260, magazine: 8, reloadMs: 1100, spread: 0.028, range: 520 }),
  montirovka: melee({ name: "Crowbar", blurb: "Two swings and the conversation is over.", tier: "base", damage: 55, fireIntervalMs: 460, meleeRange: 36, meleeArc: 115 * Math.PI / 180 }),
  obrez: primary({
    name: "Sawn-off",
    blurb: "Two barrels point-blank settle any argument.",
    tier: "shop",
    damage: 14,
    pellets: 8,
    fireIntervalMs: 650,
    range: 260,
    falloffStart: 70,
    minDamageFactor: 0.3,
    spread: 0.2,
    magazine: 2,
    reserveMax: 16,
    reserveOnPickup: 10,
    reloadMs: 1700,
    shake: 0.55,
    sound: "obrez",
    flash: "obrez"
  }),
  avtomat: primary({
    name: "AK-47",
    blurb: "The classic: four hits, thirty rounds.",
    tier: "base",
    damage: 27,
    fireIntervalMs: 100,
    range: 650,
    falloffStart: 400,
    minDamageFactor: 0.7,
    spread: 0.025,
    spreadPerShot: 0.01,
    spreadMax: 0.11,
    spreadRecovery: 0.3,
    magazine: 30,
    reserveMax: 90,
    reserveOnPickup: 60,
    reloadMs: 2200
  }),
  // ── shop: sidearms ─────────────────────────────────────────────────────────
  tt: sidearm({ name: "TT", blurb: "The Tula Tokarev: three hits up close, but a stiff action.", tier: "shop", damage: 34, fireIntervalMs: 340, magazine: 8, reloadMs: 1300, spread: 0.022, range: 580, falloffStart: 300, sound: "revolver", shake: 0.2 }),
  p92: sidearm({ name: "P92", blurb: "An imported nine-millimetre: fifteen rounds, quick, but weaker.", tier: "shop", damage: 20, fireIntervalMs: 200, magazine: 15, reloadMs: 1500, spread: 0.03, range: 500, falloffStart: 260 }),
  deagle: sidearm({ name: "Deagle", blurb: "A hand cannon from the desert: two hits, but heavy recoil and seven rounds.", tier: "shop", damage: 50, fireIntervalMs: 560, magazine: 7, reloadMs: 1900, spread: 0.026, range: 620, falloffStart: 340, minDamageFactor: 0.7, sound: "revolver", shake: 0.32 }),
  // ── shop: melee ───────────────────────────────────────────────────────────
  nozh: melee({ name: "Knife", blurb: "Short, fast and quiet. You run lighter with it.", tier: "shop", damage: 40, fireIntervalMs: 300, meleeRange: 30, meleeArc: 90 * Math.PI / 180, moveSpeed: 1.04 }),
  bita: melee({ name: "Bat", blurb: "A wide swing and a heavy hit.", tier: "shop", damage: 65, fireIntervalMs: 600, meleeRange: 40, meleeArc: 130 * Math.PI / 180, sound: "heavySwing" }),
  topor: melee({ name: "Axe", blurb: "Two swings like the crowbar, but a longer wind-up.", tier: "shop", damage: 70, fireIntervalMs: 640, meleeRange: 38, meleeArc: 110 * Math.PI / 180, moveSpeed: 0.97, sound: "heavySwing", shake: 0.3 }),
  // ── shop: primaries ───────────────────────────────────────────────────────
  uzi: primary({ name: "Uzi", blurb: "A thousand rounds a minute, but weak at range.", tier: "shop", damage: 15, fireIntervalMs: 60, range: 430, falloffStart: 200, minDamageFactor: 0.55, spread: 0.05, spreadPerShot: 0.01, spreadMax: 0.13, spreadRecovery: 0.4, magazine: 32, reserveMax: 128, reserveOnPickup: 64, reloadMs: 1700, sound: "smg" }),
  ppsh: primary({ name: "PPSh-41", blurb: "A 71-round drum. Reloading takes ages \u2014 better not miss.", tier: "shop", damage: 17, fireIntervalMs: 70, range: 460, falloffStart: 230, minDamageFactor: 0.6, spread: 0.05, spreadPerShot: 8e-3, spreadMax: 0.13, spreadRecovery: 0.3, magazine: 71, reserveMax: 142, reserveOnPickup: 71, reloadMs: 3200, moveSpeed: 0.95, sound: "smg" }),
  mp5: primary({ name: "MP5", blurb: "An accurate submachine gun: tight groups, modest damage.", tier: "shop", damage: 18, fireIntervalMs: 75, range: 500, falloffStart: 260, minDamageFactor: 0.6, spread: 0.028, spreadPerShot: 7e-3, spreadMax: 0.1, spreadRecovery: 0.4, magazine: 30, reserveMax: 120, reserveOnPickup: 60, reloadMs: 1900, sound: "smg" }),
  s12: primary({ name: "S-12K", blurb: "A self-loading shotgun: fast, but a wider spread than the sawn-off.", tier: "shop", damage: 11, pellets: 8, fireIntervalMs: 330, range: 270, falloffStart: 80, minDamageFactor: 0.3, spread: 0.17, magazine: 8, reserveMax: 24, reserveOnPickup: 16, reloadMs: 2600, sound: "shotgun", flash: "obrez", shake: 0.45 }),
  ksyuha: primary({ name: "AKS-74U", blurb: "The \u201CKsyukha\u201D: fires faster, hits worse at range.", tier: "shop", damage: 22, fireIntervalMs: 80, range: 520, falloffStart: 300, minDamageFactor: 0.65, spread: 0.035, spreadPerShot: 0.011, spreadMax: 0.12, spreadRecovery: 0.32, magazine: 30, reserveMax: 120, reserveOnPickup: 60, reloadMs: 2e3 }),
  m4: primary({ name: "M4A1", blurb: "Fast and accurate, but five hits instead of four.", tier: "shop", damage: 24, fireIntervalMs: 80, range: 680, falloffStart: 420, minDamageFactor: 0.7, spread: 0.02, spreadPerShot: 8e-3, spreadMax: 0.09, spreadRecovery: 0.35, magazine: 30, reserveMax: 90, reserveOnPickup: 60, reloadMs: 2e3 }),
  g36: primary({ name: "G36", blurb: "A tight-grouping rifle with built-in optics. Heavier and slower to reload.", tier: "shop", damage: 26, fireIntervalMs: 100, range: 720, falloffStart: 450, minDamageFactor: 0.7, spread: 0.016, spreadPerShot: 8e-3, spreadMax: 0.09, spreadRecovery: 0.3, magazine: 30, reserveMax: 90, reserveOnPickup: 60, reloadMs: 2600, moveSpeed: 0.95 }),
  svd: primary({ name: "SVD", blurb: "The Dragunov self-loading sniper rifle: two hits.", tier: "shop", damage: 70, fireIntervalMs: 600, range: 950, spread: 6e-3, magazine: 10, reserveMax: 30, reserveOnPickup: 20, reloadMs: 2600, moveSpeed: 0.9, sound: "rifle", shake: 0.4, drawMs: 300 }),
  awm: primary({ name: "AWM", blurb: "Finishes a wounded target in one shot. The bolt and the weight are the price.", tier: "shop", damage: 95, fireIntervalMs: 1450, range: 1050, spread: 2e-3, magazine: 5, reserveMax: 20, reserveOnPickup: 10, reloadMs: 3200, moveSpeed: 0.86, sound: "rifle", shake: 0.55, drawMs: 400 }),
  m24: primary({ name: "M24", blurb: "A bolt-action rifle: two hits, a faster bolt than the AWM.", tier: "shop", damage: 85, fireIntervalMs: 1150, range: 980, spread: 3e-3, magazine: 5, reserveMax: 25, reserveOnPickup: 10, reloadMs: 2600, moveSpeed: 0.92, sound: "rifle", shake: 0.45, drawMs: 350 }),
  rpg: primary({
    name: "RPG-7",
    blurb: "The blast catches everyone nearby \u2014 you included.",
    tier: "shop",
    kind: "projectile",
    damage: 30,
    fireIntervalMs: 900,
    range: 800,
    spread: 0.01,
    magazine: 1,
    reserveMax: 4,
    reserveOnPickup: 3,
    reloadMs: 2800,
    projectile: { speed: 520, radius: 70, splash: 110, selfFactor: 0.5 },
    moveSpeed: 0.85,
    sound: "rocket",
    flash: "obrez",
    shake: 0.6,
    drawMs: 350
  }),
  m249: primary({ name: "M249", blurb: "A hundred rounds in the box. Heavy: you move slower.", tier: "shop", damage: 23, fireIntervalMs: 80, range: 700, falloffStart: 450, minDamageFactor: 0.7, spread: 0.04, spreadPerShot: 8e-3, spreadMax: 0.14, spreadRecovery: 0.25, magazine: 100, reserveMax: 100, reserveOnPickup: 100, reloadMs: 4400, moveSpeed: 0.82, sound: "lmg", shake: 0.3, drawMs: 350 }),
  // ── rare (cases) ──────────────────────────────────────────────────────────
  mauser: sidearm({ name: "Commissar\u2019s Mauser", blurb: "A wooden holster, ten rounds and a temper.", tier: "rare", damage: 34, fireIntervalMs: 360, magazine: 10, reloadMs: 1700, spread: 0.02, range: 600, falloffStart: 360, sound: "revolver", shake: 0.22 }),
  kuvalda: melee({ name: "Udarnik Sledgehammer", blurb: "One blow, one elimination \u2014 if you land it: a long wind-up and a short reach.", tier: "rare", damage: 100, fireIntervalMs: 1050, meleeRange: 33, meleeArc: 100 * Math.PI / 180, moveSpeed: 0.9, sound: "heavySwing", shake: 0.45 }),
  zolotoy: primary({ name: "Golden Kalash", blurb: "The same AK-47, only gold-plated and with a 35-round magazine.", tier: "rare", damage: 27, fireIntervalMs: 100, range: 660, falloffStart: 400, minDamageFactor: 0.7, spread: 0.024, spreadPerShot: 95e-4, spreadMax: 0.105, spreadRecovery: 0.32, magazine: 35, reserveMax: 105, reserveOnPickup: 70, reloadMs: 2200 }),
  tommy: primary({ name: "Chicago Tommy Gun", blurb: "A 50-round drum. Contraband with a sense of humour.", tier: "rare", damage: 19, fireIntervalMs: 66, range: 480, falloffStart: 250, minDamageFactor: 0.6, spread: 0.045, spreadPerShot: 9e-3, spreadMax: 0.13, spreadRecovery: 0.3, magazine: 50, reserveMax: 100, reserveOnPickup: 50, reloadMs: 3e3, moveSpeed: 0.95, sound: "smg" }),
  tulka: primary({ name: "Engraved Tulka", blurb: "A master\u2019s double-barrel: tighter and longer-reaching than the sawn-off, weaker point-blank.", tier: "rare", damage: 12, pellets: 8, fireIntervalMs: 420, range: 320, falloffStart: 110, minDamageFactor: 0.35, spread: 0.11, magazine: 2, reserveMax: 20, reserveOnPickup: 12, reloadMs: 2200, sound: "obrez", flash: "obrez", shake: 0.5 }),
  ognemet: primary({ name: "Plamya-84 Flamethrower", blurb: "A jet of fire up close. Keep your distance.", tier: "rare", damage: 6, pellets: 3, fireIntervalMs: 100, range: 160, falloffStart: 60, minDamageFactor: 0.4, spread: 0.25, magazine: 60, reserveMax: 120, reserveOnPickup: 60, reloadMs: 3e3, moveSpeed: 0.9, sound: "flame", flash: "none", shake: 0.12 }),
  arbalet: primary({ name: "The Beat Cop\u2019s Crossbow", blurb: "A silent bolt: 90 damage, reload after every shot.", tier: "rare", damage: 90, fireIntervalMs: 400, range: 800, spread: 3e-3, magazine: 1, reserveMax: 20, reserveOnPickup: 12, reloadMs: 1100, silenced: true, sound: "bow", flash: "none", shake: 0.15 }),
  gvozdomet: primary({ name: "Stroyka Nail Gun", blurb: "Forty nails in a row. Labour valour!", tier: "rare", damage: 14, fireIntervalMs: 85, range: 450, falloffStart: 250, minDamageFactor: 0.6, spread: 0.03, spreadPerShot: 6e-3, spreadMax: 0.08, spreadRecovery: 0.4, magazine: 40, reserveMax: 120, reserveOnPickup: 80, reloadMs: 2400, sound: "nail", flash: "pistol", shake: 0.12 }),
  muha: primary({
    name: "Mukha RPG",
    blurb: "A light disposable launcher: faster than the RPG, a smaller blast.",
    tier: "rare",
    kind: "projectile",
    damage: 25,
    fireIntervalMs: 700,
    range: 760,
    spread: 0.012,
    magazine: 1,
    reserveMax: 3,
    reserveOnPickup: 3,
    reloadMs: 2e3,
    projectile: { speed: 600, radius: 60, splash: 95, selfFactor: 0.5 },
    moveSpeed: 0.92,
    sound: "rocket",
    flash: "obrez",
    shake: 0.5
  }),
  granatomet: primary({
    name: "GM-94 Grenade Launcher",
    blurb: "Three grenades in the magazine. Smaller blasts, but more often.",
    tier: "rare",
    kind: "projectile",
    damage: 20,
    fireIntervalMs: 700,
    range: 620,
    spread: 0.02,
    magazine: 3,
    reserveMax: 9,
    reserveOnPickup: 6,
    reloadMs: 3200,
    projectile: { speed: 420, radius: 56, splash: 75, selfFactor: 0.5 },
    moveSpeed: 0.88,
    sound: "rocket",
    flash: "obrez",
    shake: 0.45
  })
};
var WEAPONS = Object.fromEntries(WEAPON_IDS.map((id, index) => [id, { ...DEFS[id], id, index }]));
var SIDEARMS = WEAPON_IDS.filter((w) => DEFS[w].slot === 1);
var MELEE_WEAPONS = WEAPON_IDS.filter((w) => DEFS[w].slot === 2);
var PRIMARY_WEAPONS = WEAPON_IDS.filter((w) => DEFS[w].slot === 3);
var MOD_IDS = ["silencer", "reddot", "scope", "laser", "grip", "extmag"];

// packages/shared/src/game-rules/gadgets.ts
var GADGET_IDS = ["f1", "smoke", "flash", "molotov", "mine", "c4", "turret"];
var D = (d) => d;
var DEFS2 = {
  f1: D({ name: "F-1 Grenade", blurb: "The classic \u201Climonka\u201D: goes off after 1.8 s. Bounces off walls.", use: "throw", charges: 2, throwSpeed: 520, fuseMs: 1800, radius: 100, damage: 110, durationMs: 0, selfFactor: 0.6, cooldownMs: 700 }),
  smoke: D({ name: "Smoke Grenade", blurb: "A cloud of smoke for 9 s: nobody sees you inside, bots lose their target.", use: "throw", charges: 2, throwSpeed: 480, fuseMs: 1e3, radius: 96, damage: 0, durationMs: 9e3, selfFactor: 0, cooldownMs: 700 }),
  flash: D({ name: "Flashbang", blurb: "Blinds everyone looking its way for a couple of seconds.", use: "throw", charges: 2, throwSpeed: 540, fuseMs: 1400, radius: 260, damage: 0, durationMs: 2600, selfFactor: 1, cooldownMs: 700 }),
  molotov: D({ name: "Molotov Cocktail", blurb: "Shatters on a wall or the floor \u2014 5 s of fire that burns everyone inside.", use: "throw", charges: 1, throwSpeed: 500, fuseMs: 900, radius: 72, damage: 7, durationMs: 5e3, selfFactor: 0.5, cooldownMs: 700 }),
  mine: D({ name: "Mine", blurb: "Placed at your feet, armed in a second. Goes off when an enemy comes near.", use: "place", charges: 2, throwSpeed: 0, fuseMs: 1200, radius: 78, damage: 120, durationMs: 6e4, selfFactor: 0.6, cooldownMs: 600 }),
  c4: D({ name: "C4", blurb: "A remote charge: one press to place it, the same button to blow it.", use: "place", charges: 1, throwSpeed: 0, fuseMs: 500, radius: 120, damage: 150, durationMs: 45e3, selfFactor: 0.6, cooldownMs: 400 }),
  turret: D({ name: "Turret", blurb: "A home-made turret: fires at enemies in sight for 20 s. It can be destroyed.", use: "deploy", charges: 1, throwSpeed: 0, fuseMs: 600, radius: 320, damage: 7, durationMs: 2e4, selfFactor: 0, cooldownMs: 600 })
};
var GADGETS = Object.fromEntries(GADGET_IDS.map((id, index) => [id, { ...DEFS2[id], id, index }]));
var TURRET = Object.freeze({ hp: 100, radius: 9, fireIntervalMs: 160, spread: 0.06, ammo: 90, turnRate: 6 });

// packages/shared/src/game-rules/skins.ts
var FINISH_IDS = ["berezka", "rzhavchina", "zima", "flora", "gzhel", "pioner", "malahit", "hohloma", "zoloto", "yantar"];
var FINISHES = Object.freeze({
  berezka: { id: "berezka", name: "Birch Camo", rarity: "common" },
  rzhavchina: { id: "rzhavchina", name: "Rust", rarity: "common" },
  zima: { id: "zima", name: "Winter", rarity: "common" },
  flora: { id: "flora", name: "Flora", rarity: "rare" },
  gzhel: { id: "gzhel", name: "Gzhel", rarity: "rare" },
  pioner: { id: "pioner", name: "Pioneer", rarity: "rare" },
  malahit: { id: "malahit", name: "Malachite", rarity: "epic" },
  hohloma: { id: "hohloma", name: "Khokhloma", rarity: "epic" },
  zoloto: { id: "zoloto", name: "Party Gold", rarity: "legendary" },
  yantar: { id: "yantar", name: "Amber", rarity: "legendary" }
});
var SKIN_RARITY_CHANCE = Object.freeze({ common: 55, rare: 28, epic: 13, legendary: 4 });

// packages/shared/src/game-rules/loadout.ts
var DEFAULT_LOADOUT = Object.freeze({ sidearm: "pistol", melee: "montirovka", primary: "avtomat", gadget: "f1", mods: {}, skins: {} });

// packages/shared/src/game-rules/economy.ts
var FREE_WEAPONS = WEAPON_IDS.filter((w) => WEAPONS[w].tier === "base");
var WEAPON_PRICES = {
  // four for talons from the start (the first one after about three matches)
  obrez: { currency: "tokens", amount: 100, level: 1 },
  nozh: { currency: "tokens", amount: 120, level: 1 },
  tt: { currency: "tokens", amount: 150, level: 1 },
  uzi: { currency: "tokens", amount: 200, level: 1 },
  // fifteen up the ladder (v0.24: the ten that were sold for diamonds are in it now)
  p92: { currency: "tokens", amount: 250, level: 3 },
  deagle: { currency: "tokens", amount: 300, level: 4 },
  bita: { currency: "tokens", amount: 300, level: 5 },
  topor: { currency: "tokens", amount: 350, level: 6 },
  ksyuha: { currency: "tokens", amount: 400, level: 7 },
  mp5: { currency: "tokens", amount: 450, level: 8 },
  s12: { currency: "tokens", amount: 500, level: 9 },
  ppsh: { currency: "tokens", amount: 500, level: 10 },
  m4: { currency: "tokens", amount: 550, level: 11 },
  g36: { currency: "tokens", amount: 600, level: 12 },
  m24: { currency: "tokens", amount: 650, level: 13 },
  m249: { currency: "tokens", amount: 700, level: 14 },
  svd: { currency: "tokens", amount: 800, level: 15 },
  awm: { currency: "tokens", amount: 900, level: 17 },
  rpg: { currency: "tokens", amount: 1e3, level: 19 }
};
var CHARACTER_PRICES = {
  // for experience (level) + tokens
  uchastkovy: { currency: "tokens", amount: 150, level: 1 },
  mihalych: { currency: "tokens", amount: 200, level: 2 },
  vorona: { currency: "tokens", amount: 300, level: 3 },
  zmeya: { currency: "tokens", amount: 400, level: 5 },
  varan: { currency: "tokens", amount: 550, level: 7 },
  popugay: { currency: "tokens", amount: 700, level: 9 },
  // v0.23: five more for talons, higher up the ladder
  golub: { currency: "tokens", amount: 800, level: 10 },
  tarakan: { currency: "tokens", amount: 900, level: 11 },
  krysa: { currency: "tokens", amount: 1e3, level: 12 },
  svinya: { currency: "tokens", amount: 1100, level: 13 },
  buyvol: { currency: "tokens", amount: 1250, level: 15 },
  // v0.24: the eleven that were sold for diamonds close the ladder
  piranya: { currency: "tokens", amount: 1300, level: 16 },
  koshka: { currency: "tokens", amount: 1350, level: 17 },
  leopard: { currency: "tokens", amount: 1400, level: 18 },
  lobster: { currency: "tokens", amount: 1450, level: 19 },
  akula: { currency: "tokens", amount: 1500, level: 20 },
  lisa: { currency: "tokens", amount: 1600, level: 21 },
  oryol: { currency: "tokens", amount: 1700, level: 22 },
  nosorog: { currency: "tokens", amount: 1800, level: 23 },
  slon: { currency: "tokens", amount: 1900, level: 24 },
  gorilla: { currency: "tokens", amount: 2e3, level: 25 },
  lev: { currency: "tokens", amount: 2200, level: 26 }
};
var GADGET_PRICES = {
  smoke: { currency: "tokens", amount: 100, level: 1 },
  flash: { currency: "tokens", amount: 150, level: 2 },
  molotov: { currency: "tokens", amount: 250, level: 4 },
  mine: { currency: "tokens", amount: 300, level: 6 },
  c4: { currency: "tokens", amount: 350, level: 8 },
  turret: { currency: "tokens", amount: 450, level: 12 }
};
var CASE_TABLE = [
  { weapon: "mauser", rarity: "rare", chance: 12 },
  { weapon: "kuvalda", rarity: "rare", chance: 12 },
  { weapon: "tulka", rarity: "rare", chance: 12 },
  { weapon: "arbalet", rarity: "rare", chance: 12 },
  { weapon: "gvozdomet", rarity: "rare", chance: 12 },
  { weapon: "tommy", rarity: "epic", chance: 10 },
  { weapon: "ognemet", rarity: "epic", chance: 10 },
  { weapon: "muha", rarity: "epic", chance: 10 },
  { weapon: "zolotoy", rarity: "legendary", chance: 5 },
  { weapon: "granatomet", rarity: "legendary", chance: 5 }
];
var TOKEN_REWARD = Object.freeze({ perKill: 5, perAssist: 2, completion: 5, maxPerMatch: 100 });
var SHOP_WEAPONS = WEAPON_IDS.filter((w) => WEAPON_PRICES[w]);
var SHOP_CHARACTERS = CHARACTER_IDS.filter((c) => CHARACTER_PRICES[c]);
var SHOP_GADGETS = GADGET_IDS.filter((g) => GADGET_PRICES[g]);
var CASE_WEAPONS = CASE_TABLE.map((e) => e.weapon);

// packages/shared/src/game-rules/match.ts
var GAME_MODES = ["ffa", "teams", "ctf", "bases"];
var CTF_RULES = Object.freeze({
  /** Pick-up / return / capture distance from the flag (the player's radius included). */
  touchRadius: 24,
  returnMs: 15e3,
  /** Match points for the player. */
  capturePoints: 6,
  returnPoints: 2,
  takePoints: 1,
  /** Bonus for eliminating the enemy carrier. */
  carrierKillPoints: 1
});
var BASE_RULES = Object.freeze({
  radius: 56,
  captureMs: 6e3,
  extraPlayerRate: 0.5,
  maxRate: 2.5,
  decayRate: 0.5,
  tickMs: 1e3,
  /** Match points for every capturer inside the base. */
  capturePoints: 3
});
var MAX_PLAYERS = 10;
var SCORING = Object.freeze({
  killPoints: 2,
  assistPoints: 1,
  assistWindowMs: 6e3,
  assistMinDamage: 20
});
var DEFAULT_MATCH_CONFIG = {
  mode: "ffa",
  minPlayers: 2,
  maxPlayers: MAX_PLAYERS,
  durationMs: 4 * 6e4,
  /** Points: an elimination is 2, an assist 1 (≈25 eliminations). */
  scoreLimit: 50,
  teamScoreLimit: 40,
  captureLimit: 3,
  baseScoreLimit: 250,
  readyMs: 1200,
  countdownMs: 3e3,
  finishedMs: 15e3,
  respawnDelayMs: 2500,
  spawnProtectionMs: 1500,
  allowJoinInProgress: true,
  reconnectGraceMs: 3e4,
  emptyRoomTtlMs: 6e4,
  supplyFirstMs: 25e3,
  supplyIntervalMs: 35e3,
  supplyTtlMs: 3e4
};

// packages/shared/src/game-rules/progression.ts
var XP_RULES = Object.freeze({
  completion: 50,
  perKill: 10,
  perAssist: 5,
  /** Capture the flag: a flag captured; base capture: a base captured. */
  perObjective: 15,
  placement: [100, 50, 25],
  /** Team matches: every player of the winning team (a draw gives both teams the smaller bonus). */
  teamWin: 75,
  teamDraw: 25,
  playedWithFriends: 20,
  maxPerMatch: 400
});
var RATING_RULES = Object.freeze({ start: 1e3, k: 32, team: 16, leaver: -16, floor: 0 });
function ratingDelta(p) {
  if (!p.completed) return RATING_RULES.leaver;
  if (p.teamOutcome) return p.teamOutcome === "win" ? RATING_RULES.team : p.teamOutcome === "loss" ? -RATING_RULES.team : 0;
  if (p.playersAtEnd < 2) return 0;
  const score = Math.min(1, Math.max(0, (p.playersAtEnd - p.place) / (p.playersAtEnd - 1)));
  return Math.round(RATING_RULES.k * (score - 0.5));
}
var WIN_STREAK_TARGET = 3;
var MULTI_KILL_TARGET = 5;
var ACHIEVEMENT_TARGETS = Object.freeze({ matches: [50, 100], wins: [10, 50], longStreak: 5, bigKill: 10, assists: 5, comebackDeaths: 5, objectives: 3, levels: [10, 25] });
var ACHIEVEMENTS = {
  first_match: { id: "first_match", title: "First Job", description: "Finish your first match.", xpReward: 25 },
  first_win: { id: "first_win", title: "Avtoritet", description: "Win a match.", xpReward: 50 },
  ten_matches: { id: "ten_matches", title: "One of Us", description: "Finish 10 matches.", xpReward: 75 },
  win_streak: {
    id: "win_streak",
    title: "Runs the District",
    description: `Win ${WIN_STREAK_TARGET} matches in a row.`,
    xpReward: 100
  },
  multi_kill: {
    id: "multi_kill",
    title: "Showdown",
    description: `${MULTI_KILL_TARGET} eliminations in one match.`,
    xpReward: 50
  },
  played_with_friends: {
    id: "played_with_friends",
    title: "Our Crowd",
    description: "Play a match with friends you invited.",
    xpReward: 25
  },
  matches_50: { id: "matches_50", title: "Regular", description: `Finish ${ACHIEVEMENT_TARGETS.matches[0]} matches.`, xpReward: 150 },
  matches_100: { id: "matches_100", title: "Old Hand", description: `Finish ${ACHIEVEMENT_TARGETS.matches[1]} matches.`, xpReward: 250 },
  wins_10: { id: "wins_10", title: "Respected", description: `Win ${ACHIEVEMENT_TARGETS.wins[0]} matches.`, xpReward: 150 },
  wins_50: { id: "wins_50", title: "District Legend", description: `Win ${ACHIEVEMENT_TARGETS.wins[1]} matches.`, xpReward: 300 },
  streak_5: { id: "streak_5", title: "Unstoppable", description: `Win ${ACHIEVEMENT_TARGETS.longStreak} matches in a row.`, xpReward: 200 },
  kills_10: { id: "kills_10", title: "No Limits", description: `${ACHIEVEMENT_TARGETS.bigKill} eliminations in one match.`, xpReward: 100 },
  flawless: { id: "flawless", title: "Untouchable", description: "Win a match without being eliminated once.", xpReward: 100 },
  comeback: { id: "comeback", title: "Second Wind", description: `Win a match after being eliminated ${ACHIEVEMENT_TARGETS.comebackDeaths} times.`, xpReward: 100 },
  assists_5: { id: "assists_5", title: "Helping Hand", description: `${ACHIEVEMENT_TARGETS.assists} assists in one match.`, xpReward: 50 },
  team_win: { id: "team_win", title: "All for One", description: "Win a team match.", xpReward: 50 },
  objective: { id: "objective", title: "Job Done", description: "Capture a flag or a base.", xpReward: 50 },
  objectives_3: { id: "objectives_3", title: "Raider", description: `Capture ${ACHIEVEMENT_TARGETS.objectives} flags or bases in one match.`, xpReward: 100 },
  level_10: { id: "level_10", title: "Big Name", description: `Reach level ${ACHIEVEMENT_TARGETS.levels[0]}.`, xpReward: 100 },
  level_25: { id: "level_25", title: "Boss of the District", description: `Reach level ${ACHIEVEMENT_TARGETS.levels[1]}.`, xpReward: 250 },
  story_petya_1: { id: "story_petya_1", title: "Master of the Yard", description: "Story: finish chapter 1 of \xABMy Yard\xBB.", xpReward: 100 },
  story_uchastkovy_1: { id: "story_uchastkovy_1", title: "First Report", description: "Story: finish chapter 1 of \xABThe Report\xBB.", xpReward: 100 },
  story_petya_2: { id: "story_petya_2", title: "Garage Authority", description: "Story: finish chapter 2 of \xABMy Yard\xBB.", xpReward: 150 },
  story_uchastkovy_2: { id: "story_uchastkovy_2", title: "Market Watch", description: "Story: finish chapter 2 of \xABThe Report\xBB.", xpReward: 150 },
  story_petya_3: { id: "story_petya_3", title: "Night Shift", description: "Story: finish chapter 3 of \xABMy Yard\xBB.", xpReward: 200 },
  story_uchastkovy_3: { id: "story_uchastkovy_3", title: "Key Witness", description: "Story: finish chapter 3 of \xABThe Report\xBB.", xpReward: 200 }
};
var LEVEL_ACHIEVEMENTS = [
  ["level_10", ACHIEVEMENT_TARGETS.levels[0]],
  ["level_25", ACHIEVEMENT_TARGETS.levels[1]]
];

// ../../../opt/npm-tools/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../../opt/npm-tools/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../../opt/npm-tools/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../../opt/npm-tools/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../../opt/npm-tools/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../../opt/npm-tools/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../../opt/npm-tools/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../../opt/npm-tools/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types2, params) => {
  return new ZodUnion({
    options: types2,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b2) {
  const aType = getParsedType(a);
  const bType = getParsedType(b2);
  if (a === b2) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b2);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b2 };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b2[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b2.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b2[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b2) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size2, message) {
    return this.min(size2, message).max(size2, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values2, params) {
  return new ZodEnum({
    values: values2,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values2, newDef = this._def) {
    return _ZodEnum.create(values2, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values2, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values2.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values2, params) => {
  return new ZodNativeEnum({
    values: values2,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base2 = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base2))
          return INVALID;
        const result = effect.transform(base2.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base2) => {
          if (!isValid(base2))
            return INVALID;
          return Promise.resolve(effect.transform(base2.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b2) {
    return new _ZodPipeline({
      in: a,
      out: b2,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// packages/shared/src/game-rules/clubs.ts
var CLUB_PALETTE = Object.freeze([
  "#c8312a",
  // red
  "#6e1f22",
  // burgundy
  "#16120f",
  // black
  "#d9c39a",
  // tobacco
  "#5b6b3a",
  // olive
  "#2f5d8a",
  // industrial blue
  "#9a4b24",
  // rust
  "#e08a2e",
  // sodium orange
  "#efe8da",
  // white
  "#d8a93c",
  // gold
  "#2e7d4f",
  // green
  "#7fb2d6"
  // sky
]);
var CLUB_COLORS = CLUB_PALETTE.length;
var FLAG_PATTERNS = ["solid", "h2", "h3", "v2", "v3", "diag", "band", "frame", "corner", "wedge"];
var EMBLEM_ICONS = ["none", "star", "gear", "wrench", "cassette", "bolt", "rocket", "satellite", "anchor", "key", "ball", "flame", "paw", "crosshair", "tower", "eye", "sun"];
var colorIndex = external_exports.number().int().min(0).max(CLUB_COLORS - 1);
var ClubFlagSchema = external_exports.object({ pattern: external_exports.enum(FLAG_PATTERNS), colors: external_exports.tuple([colorIndex, colorIndex, colorIndex]) }).strict();
var ClubEmblemSchema = external_exports.object({ icon: external_exports.enum(EMBLEM_ICONS), color: colorIndex }).strict();
var CLUB_RULES = Object.freeze({
  nameMin: 3,
  nameMax: 24,
  tagMin: 2,
  tagMax: 4,
  mottoMax: 60,
  maxMembers: 50,
  /** Open join requests a player may have at once (to different clubs). */
  maxOutgoingRequests: 3,
  /** Requests waiting for one club's head. */
  maxIncomingRequests: 50,
  /**
   * Starting a gang (v0.2.8, the owner: «anyone can start one»): from level 1 and free. One gang per
   * player and a limit on startings per hour keep the table tidy; raise these to bring a fee back.
   */
  createLevel: 1,
  createTokens: 0,
  startRating: 1e3
});
var clubNameSchema = external_exports.string().transform((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim()).pipe(
  external_exports.string().min(CLUB_RULES.nameMin).max(CLUB_RULES.nameMax).regex(/^[A-Za-z0-9 _.\-’'#!&]+$/, "A gang name may contain Latin letters (A\u2013Z), digits, spaces and _ . - # ! &").regex(/[A-Za-z0-9]/, "A gang name needs a letter or a digit")
);
var clubTagSchema = external_exports.string().transform((s) => s.normalize("NFKC").trim().toUpperCase()).pipe(
  external_exports.string().min(CLUB_RULES.tagMin).max(CLUB_RULES.tagMax).regex(/^[A-Z0-9]+$/, "A tag is 2\u20134 Latin letters or digits")
);
var clubMottoSchema = external_exports.string().transform((s) => s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim()).pipe(
  external_exports.string().max(CLUB_RULES.mottoMax).regex(/^[\x20-\x7E’‘“”«»—–…]*$/, "A motto is written in Latin letters")
);
var CreateClubBody = external_exports.object({ name: clubNameSchema, tag: clubTagSchema, motto: clubMottoSchema.optional(), flag: ClubFlagSchema, emblem: ClubEmblemSchema }).strict();
var UpdateClubBody = external_exports.object({ motto: clubMottoSchema.optional(), flag: ClubFlagSchema.optional(), emblem: ClubEmblemSchema.optional() }).strict();

// packages/shared/src/game-rules/blat.ts
var BLAT_LIMITS = Object.freeze({ maxBalance: 2e9, maxCredit: 1e6 });
var BLAT_LEVEL_STEPS = Object.freeze([
  { upTo: 10, step: 50 },
  { upTo: 20, step: 100 },
  { upTo: 30, step: 200 },
  { upTo: 40, step: 300 },
  { upTo: 50, step: 325 }
]);
var REFERRAL_TIERS = Object.freeze([
  { from: 1, reward: 1500 },
  { from: 5, reward: 3e3 },
  { from: 10, reward: 5e3 },
  { from: 25, reward: 7500 },
  { from: 50, reward: 1e4 },
  { from: 100, reward: 12500 },
  { from: 250, reward: 15e3 },
  { from: 500, reward: 2e4 }
]);
var REFERRAL_RULES = Object.freeze({ minMatchSec: 60, dailyCap: 20 });
var BLAT_POOLS = Object.freeze({ players: 126e7, founder: 32e7, influencers: 3e8, friends: 1e8, reserve: 2e7 });
var BLAT_POOL_IDS = Object.keys(BLAT_POOLS);
var BLAT_FOUNDER_HOLDING = BLAT_POOLS.founder;

// packages/shared/src/game-rules/kon.ts
var KON_FORMATS = ["1x1", "2x2", "3x3", "5x5"];
var KON_RULES = Object.freeze({
  "1x1": { size: 1, teamScoreLimit: 10, durationScale: 0.75 },
  "2x2": { size: 2, teamScoreLimit: 15, durationScale: 1 },
  "3x3": { size: 3, teamScoreLimit: 20, durationScale: 1 },
  "5x5": { size: 5, teamScoreLimit: 30, durationScale: 1.25 }
});
var KON_RATING = Object.freeze({ start: 1e3, floor: 100, k: 24, kNew: 40, newMatches: 10 });

// packages/shared/src/game-rules/konStakes.ts
var KON_STAKE_AMOUNTS = [100, 500, 1e3, 5e3];
var KON_STAKES = Object.freeze({
  amounts: KON_STAKE_AMOUNTS,
  /** At most this much staked in 24 hours (stakes that came back don't count). */
  dailyLimit: 2e4,
  /** An account stakes from its second day on. */
  minAccountAgeMs: 24 * 36e5
});
function isKonStake(v) {
  return v === 0 || KON_STAKE_AMOUNTS.includes(v);
}

// packages/shared/src/maps/types.ts
var MAP_IDS = ["factory", "garages", "yard", "stroyka", "dk", "gastronom", "hospital", "cemetery", "square", "camp"];

// packages/shared/src/game-rules/gangBattle.ts
var GANG_BATTLE_FORMATS = ["2x2", "3x3", "5x5"];
var GangBattleBody = external_exports.object({ kon: external_exports.enum(GANG_BATTLE_FORMATS), mapId: external_exports.enum(MAP_IDS).optional() }).strict();

// packages/shared/src/story/missions.ts
var STORY_RULES = Object.freeze({ heroDamage: 0.5, lives: 3, surviveRespawnMs: 7e3 });
var STORY_TICKET_TTL_MS = 3 * 36e5;
var kit = (sidearm2, melee2, primary2 = null, gadget = null) => ({ sidearm: sidearm2, melee: melee2, primary: primary2, gadget });
var enemy = (character, role2, k, difficulty = "normal", extra = {}) => ({ character, role: role2, side: "enemy", kit: k, difficulty, ...extra });
var ally = (character, k, difficulty = "normal", role2 = "self") => ({ character, role: role2, side: "ally", kit: k, difficulty });
var STORY_MISSIONS = [
  // ── Petya «My Yard», chapter 1 «The Yard» ─────────────────────────────────
  {
    id: "a1",
    campaign: "petya",
    chapter: 1,
    n: 1,
    map: "yard",
    hero: "petya",
    kit: kit("pistol", "montirovka"),
    objective: { kind: "clear" },
    timeLimitMs: 24e4,
    meets: ["vorona"],
    talons: 60,
    xp: 40,
    npcs: [enemy("golub", "loafer", kit("pistol", "bita"), "easy"), enemy("krysa", "loafer", kit("pistol", "bita"), "easy"), enemy("tarakan", "loafer", kit("pistol", "nozh"), "easy")]
  },
  {
    id: "a2",
    campaign: "petya",
    chapter: 1,
    n: 2,
    map: "gastronom",
    hero: "petya",
    kit: kit("pistol", "montirovka", "obrez"),
    objective: { kind: "team", limit: 10 },
    timeLimitMs: 3e5,
    meets: ["mihalych"],
    talons: 80,
    xp: 50,
    npcs: [ally("mihalych", kit("pistol", "montirovka", "avtomat", "f1")), enemy("svinya", "queue", kit("pistol", "bita", "ksyuha")), enemy("buyvol", "queue", kit("pistol", "montirovka", "obrez")), enemy("krysa", "queue", kit("tt", "nozh", "uzi"))]
  },
  {
    id: "a3",
    campaign: "petya",
    chapter: 1,
    n: 3,
    map: "garages",
    hero: "petya",
    kit: kit("pistol", "montirovka", "ksyuha", "f1"),
    objective: { kind: "clear" },
    timeLimitMs: 3e5,
    waveGapMs: 1500,
    meets: ["valuta"],
    talons: 90,
    xp: 60,
    npcs: [
      enemy("popugay", "speculator", kit("pistol", "bita"), "easy"),
      enemy("lobster", "speculator", kit("pistol", "nozh"), "easy"),
      enemy("zmeya", "speculator", kit("tt", "nozh", "ksyuha"), "easy", { wave: 1 }),
      enemy("tarakan", "speculator", kit("pistol", "montirovka", "obrez"), "easy", { wave: 1 }),
      enemy("krysa", "speculator", kit("tt", "bita", "avtomat"), "normal", { wave: 2 })
    ]
  },
  {
    id: "a4",
    campaign: "petya",
    chapter: 1,
    n: 4,
    map: "yard",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "f1"),
    objective: { kind: "flag", limit: 2 },
    timeLimitMs: 36e4,
    meets: [],
    talons: 100,
    xp: 70,
    npcs: [
      ally("mihalych", kit("pistol", "montirovka", "avtomat", "f1")),
      ally("vorona", kit("pistol", "nozh", "ksyuha", "smoke")),
      enemy("svinya", "reseller", kit("pistol", "bita", "obrez")),
      enemy("popugay", "reseller", kit("tt", "nozh", "mp5")),
      enemy("krysa", "reseller", kit("pistol", "montirovka", "avtomat"))
    ]
  },
  {
    id: "a5",
    campaign: "petya",
    chapter: 1,
    n: 5,
    map: "yard",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "f1"),
    objective: { kind: "team", limit: 5 },
    timeLimitMs: 3e5,
    meets: ["uchastkovy"],
    talons: 120,
    xp: 80,
    npcs: [enemy("uchastkovy", "self", kit("pistol", "bita", "avtomat", "flash"), "hard", { boss: true })]
  },
  // ── Uchastkovy «The Report», chapter 1 «The Beat» ─────────────────────────
  {
    id: "b1",
    campaign: "uchastkovy",
    chapter: 1,
    n: 1,
    map: "gastronom",
    hero: "uchastkovy",
    kit: kit("pistol", "bita"),
    objective: { kind: "clear" },
    timeLimitMs: 24e4,
    meets: ["koshka"],
    talons: 60,
    xp: 40,
    npcs: [enemy("krysa", "pilferer", kit("pistol", "montirovka"), "easy"), enemy("tarakan", "pilferer", kit("pistol", "nozh"), "easy"), enemy("svinya", "pilferer", kit("pistol", "bita"), "easy"), enemy("popugay", "pilferer", kit("tt", "nozh"), "easy")]
  },
  {
    id: "b2",
    campaign: "uchastkovy",
    chapter: 1,
    n: 2,
    map: "dk",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "ksyuha", "flash"),
    objective: { kind: "team", limit: 4 },
    timeLimitMs: 24e4,
    meets: ["lisa"],
    talons: 80,
    xp: 50,
    npcs: [enemy("lisa", "self", kit("p92", "nozh", "uzi", "smoke"), "normal", { boss: true })]
  },
  {
    id: "b3",
    campaign: "uchastkovy",
    chapter: 1,
    n: 3,
    map: "dk",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "ksyuha", "f1"),
    objective: { kind: "clear" },
    timeLimitMs: 3e5,
    waveGapMs: 1500,
    meets: ["piranya"],
    talons: 90,
    xp: 60,
    npcs: [
      enemy("krysa", "dancer", kit("pistol", "bita"), "easy"),
      enemy("svinya", "dancer", kit("pistol", "topor"), "easy"),
      enemy("tarakan", "dancer", kit("tt", "nozh"), "easy", { wave: 1 }),
      enemy("golub", "dancer", kit("pistol", "bita"), "easy", { wave: 1 }),
      enemy("piranya", "self", kit("pistol", "topor", "obrez", "molotov"), "normal", { wave: 2, boss: true })
    ]
  },
  {
    id: "b4",
    campaign: "uchastkovy",
    chapter: 1,
    n: 4,
    map: "garages",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "f1"),
    objective: { kind: "bases", limit: 100 },
    timeLimitMs: 36e4,
    meets: [],
    talons: 100,
    xp: 70,
    npcs: [ally("koshka", kit("p92", "nozh", "mp5", "smoke")), enemy("varan", "garage", kit("pistol", "montirovka", "obrez"), "easy"), enemy("buyvol", "garage", kit("tt", "bita", "avtomat"), "easy"), enemy("gorilla", "garage", kit("pistol", "montirovka", "uzi"), "easy")]
  },
  {
    id: "b5",
    campaign: "uchastkovy",
    chapter: 1,
    n: 5,
    map: "yard",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "flash"),
    objective: { kind: "team", limit: 5 },
    timeLimitMs: 3e5,
    meets: ["petya"],
    talons: 120,
    xp: 80,
    npcs: [enemy("petya", "self", kit("pistol", "montirovka", "avtomat", "f1"), "hard", { boss: true })]
  },
  // ── Petya «My Yard», chapter 2 «The Garages» ──────────────────────────────
  {
    id: "a6",
    campaign: "petya",
    chapter: 2,
    n: 6,
    map: "garages",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "f1"),
    objective: { kind: "team", limit: 10 },
    timeLimitMs: 3e5,
    meets: ["varan"],
    talons: 110,
    xp: 70,
    npcs: [
      ally("varan", kit("pistol", "montirovka", "obrez")),
      enemy("buyvol", "scrapper", kit("pistol", "montirovka", "obrez")),
      enemy("svinya", "scrapper", kit("pistol", "bita"), "easy"),
      enemy("gorilla", "scrapper", kit("tt", "kuvalda", "uzi"), "easy")
    ]
  },
  {
    id: "a7",
    campaign: "petya",
    chapter: 2,
    n: 7,
    map: "factory",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "molotov"),
    objective: { kind: "survive" },
    timeLimitMs: 75e3,
    meets: ["tarakan"],
    talons: 120,
    xp: 75,
    npcs: [
      ally("tarakan", kit("pistol", "nozh", "ppsh")),
      enemy("krysa", "patrol", kit("pistol", "bita"), "easy"),
      enemy("golub", "patrol", kit("pistol", "bita"), "easy"),
      enemy("slon", "patrol", kit("tt", "montirovka", "obrez"), "easy"),
      enemy("nosorog", "patrol", kit("pistol", "bita"))
    ]
  },
  {
    id: "a8",
    campaign: "petya",
    chapter: 2,
    n: 8,
    map: "camp",
    hero: "petya",
    kit: kit("pistol", "montirovka", "ksyuha", "smoke"),
    objective: { kind: "flag", limit: 2 },
    timeLimitMs: 36e4,
    meets: ["popugay"],
    talons: 130,
    xp: 80,
    npcs: [
      ally("popugay", kit("pistol", "nozh", "mp5")),
      enemy("leopard", "courier", kit("pistol", "nozh", "uzi")),
      enemy("krysa", "courier", kit("tt", "bita", "ksyuha"), "easy"),
      enemy("svinya", "courier", kit("pistol", "montirovka", "obrez"), "easy")
    ]
  },
  {
    id: "a9",
    campaign: "petya",
    chapter: 2,
    n: 9,
    map: "gastronom",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "f1"),
    objective: { kind: "clear" },
    timeLimitMs: 3e5,
    waveGapMs: 1500,
    meets: ["zmeya"],
    talons: 140,
    xp: 90,
    npcs: [
      enemy("golub", "suitor", kit("pistol", "bita"), "easy"),
      enemy("buyvol", "suitor", kit("pistol", "nozh"), "easy"),
      enemy("krysa", "suitor", kit("tt", "bita", "ksyuha"), "easy", { wave: 1 }),
      enemy("gorilla", "suitor", kit("pistol", "montirovka", "obrez"), "easy", { wave: 1 }),
      enemy("zmeya", "self", kit("p92", "nozh", "uzi", "smoke"), "normal", { wave: 2, boss: true })
    ]
  },
  {
    id: "a10",
    campaign: "petya",
    chapter: 2,
    n: 10,
    map: "garages",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "mine"),
    objective: { kind: "bases", limit: 100 },
    timeLimitMs: 36e4,
    meets: [],
    talons: 160,
    xp: 100,
    npcs: [
      ally("mihalych", kit("pistol", "montirovka", "avtomat", "f1")),
      ally("varan", kit("pistol", "montirovka", "obrez")),
      enemy("slon", "workshop", kit("tt", "bita", "avtomat")),
      enemy("nosorog", "workshop", kit("pistol", "montirovka", "obrez")),
      enemy("leopard", "workshop", kit("pistol", "nozh", "mp5"), "easy"),
      enemy("gorilla", "workshop", kit("pistol", "bita", "ksyuha"), "easy")
    ]
  },
  // ── Uchastkovy «The Report», chapter 2 «The Black Market» ─────────────────
  {
    id: "b6",
    campaign: "uchastkovy",
    chapter: 2,
    n: 6,
    map: "square",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "ksyuha", "flash"),
    objective: { kind: "clear" },
    timeLimitMs: 3e5,
    waveGapMs: 1500,
    meets: ["lobster"],
    talons: 110,
    xp: 70,
    npcs: [
      enemy("svinya", "fence", kit("pistol", "bita"), "easy"),
      enemy("golub", "fence", kit("tt", "nozh"), "easy"),
      enemy("krysa", "fence", kit("pistol", "montirovka", "uzi"), "easy", { wave: 1 }),
      enemy("buyvol", "fence", kit("pistol", "bita", "obrez"), "easy", { wave: 1 }),
      enemy("lobster", "self", kit("tt", "nozh", "tulka", "molotov"), "normal", { wave: 2, boss: true })
    ]
  },
  {
    id: "b7",
    campaign: "uchastkovy",
    chapter: 2,
    n: 7,
    map: "hospital",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "f1"),
    objective: { kind: "team", limit: 10 },
    timeLimitMs: 3e5,
    meets: ["akula"],
    talons: 120,
    xp: 75,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      enemy("gorilla", "guard", kit("pistol", "montirovka", "avtomat")),
      enemy("slon", "guard", kit("tt", "bita", "uzi"), "easy"),
      enemy("akula", "self", kit("p92", "nozh", "mp5"), "normal", { boss: true })
    ]
  },
  {
    id: "b8",
    campaign: "uchastkovy",
    chapter: 2,
    n: 8,
    map: "factory",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "ksyuha", "smoke"),
    objective: { kind: "flag", limit: 2 },
    timeLimitMs: 36e4,
    meets: ["oryol"],
    talons: 130,
    xp: 80,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      enemy("krysa", "smuggler", kit("pistol", "montirovka", "ksyuha"), "easy"),
      enemy("buyvol", "smuggler", kit("tt", "bita", "obrez"), "easy"),
      enemy("oryol", "self", kit("p92", "nozh", "m4"), "normal", { boss: true })
    ]
  },
  {
    id: "b9",
    campaign: "uchastkovy",
    chapter: 2,
    n: 9,
    map: "cemetery",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "flash"),
    objective: { kind: "survive" },
    timeLimitMs: 75e3,
    meets: [],
    talons: 140,
    xp: 90,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      enemy("golub", "smuggler", kit("pistol", "bita"), "easy"),
      enemy("svinya", "smuggler", kit("pistol", "montirovka", "obrez"), "easy"),
      enemy("leopard", "smuggler", kit("pistol", "nozh")),
      enemy("krysa", "smuggler", kit("tt", "bita"), "easy")
    ]
  },
  {
    id: "b10",
    campaign: "uchastkovy",
    chapter: 2,
    n: 10,
    map: "camp",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "f1"),
    objective: { kind: "bases", limit: 100 },
    timeLimitMs: 36e4,
    meets: [],
    talons: 160,
    xp: 100,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      ally("golub", kit("pistol", "bita", "ksyuha"), "normal", "patrol"),
      enemy("slon", "smuggler", kit("tt", "bita", "avtomat"), "easy"),
      enemy("nosorog", "smuggler", kit("pistol", "montirovka", "obrez"), "easy"),
      enemy("gorilla", "smuggler", kit("pistol", "bita", "uzi"), "easy"),
      enemy("oryol", "self", kit("p92", "nozh", "m4"), "normal", { boss: true })
    ]
  },
  // ── Petya «My Yard», chapter 3 «The Industrial Zone» (v0.2.15: two missions; the story goes on in updates) ──
  {
    id: "a11",
    campaign: "petya",
    chapter: 3,
    n: 11,
    map: "factory",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "f1"),
    objective: { kind: "clear" },
    timeLimitMs: 3e5,
    waveGapMs: 1500,
    meets: ["krysa", "buyvol"],
    talons: 170,
    xp: 105,
    npcs: [
      ally("krysa", kit("pistol", "bita", "ksyuha")),
      enemy("nosorog", "workshop", kit("pistol", "montirovka", "obrez")),
      enemy("slon", "workshop", kit("pistol", "bita", "uzi"), "easy"),
      enemy("leopard", "workshop", kit("pistol", "nozh", "mp5")),
      enemy("gorilla", "workshop", kit("tt", "kuvalda", "avtomat"), "normal", { wave: 1 }),
      enemy("lobster", "workshop", kit("pistol", "bita", "obrez"), "easy", { wave: 1 }),
      enemy("oryol", "workshop", kit("pistol", "nozh", "uzi"), "easy", { wave: 1 }),
      enemy("buyvol", "self", kit("tt", "kuvalda", "obrez"), "normal", { wave: 2, boss: true }),
      enemy("akula", "workshop", kit("pistol", "montirovka", "ksyuha"), "easy", { wave: 2 })
    ]
  },
  {
    id: "a12",
    campaign: "petya",
    chapter: 3,
    n: 12,
    map: "stroyka",
    hero: "petya",
    kit: kit("pistol", "montirovka", "avtomat", "mine"),
    objective: { kind: "bases", limit: 100 },
    timeLimitMs: 36e4,
    meets: ["svinya", "golub"],
    talons: 190,
    xp: 115,
    npcs: [
      ally("mihalych", kit("pistol", "montirovka", "avtomat", "f1")),
      ally("golub", kit("pistol", "bita", "ksyuha", "molotov")),
      ally("svinya", kit("pistol", "montirovka", "obrez"), "easy"),
      enemy("gorilla", "workshop", kit("tt", "kuvalda", "avtomat")),
      enemy("slon", "workshop", kit("pistol", "bita", "obrez")),
      enemy("leopard", "workshop", kit("pistol", "nozh", "mp5")),
      enemy("nosorog", "workshop", kit("pistol", "montirovka", "uzi"), "easy"),
      enemy("lobster", "workshop", kit("pistol", "bita", "obrez"), "easy")
    ]
  },
  // ── Uchastkovy «The Report», chapter 3 «Downtown» (v0.2.15: two missions; the story goes on in updates) ──
  {
    id: "b11",
    campaign: "uchastkovy",
    chapter: 3,
    n: 11,
    map: "gastronom",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "flash"),
    objective: { kind: "team", limit: 10 },
    timeLimitMs: 3e5,
    meets: ["leopard", "slon"],
    talons: 170,
    xp: 105,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      enemy("slon", "self", kit("tt", "bita", "uzi")),
      enemy("gorilla", "guard", kit("pistol", "montirovka", "obrez")),
      enemy("buyvol", "guard", kit("pistol", "bita", "obrez"), "easy"),
      enemy("leopard", "self", kit("p92", "nozh", "avtomat"), "normal", { boss: true })
    ]
  },
  {
    id: "b12",
    campaign: "uchastkovy",
    chapter: 3,
    n: 12,
    map: "hospital",
    hero: "uchastkovy",
    kit: kit("pistol", "bita", "avtomat", "f1"),
    objective: { kind: "survive" },
    timeLimitMs: 75e3,
    meets: ["nosorog", "gorilla"],
    talons: 190,
    xp: 115,
    npcs: [
      ally("koshka", kit("p92", "nozh", "mp5", "smoke")),
      ally("nosorog", kit("pistol", "bita", "obrez")),
      enemy("gorilla", "self", kit("tt", "kuvalda", "avtomat"), "normal", { boss: true }),
      enemy("buyvol", "workshop", kit("pistol", "montirovka", "obrez"), "easy"),
      enemy("svinya", "workshop", kit("pistol", "bita"), "easy"),
      enemy("krysa", "workshop", kit("tt", "bita", "ksyuha"), "easy")
    ]
  }
];
var STORY_CARD_INDEX = CHARACTER_IDS.filter((c) => c !== "petya" && c !== "uchastkovy");
var BY_ID = new Map(STORY_MISSIONS.map((m) => [m.id, m]));

// packages/shared/src/maps/props.ts
var P = (w, h, shape, layer, blocksShot, label, extra = {}) => ({ w, h, shape, layer, blocksMove: shape !== "none", blocksShot: shape !== "none" && blocksShot, label, ...extra });
var PROP_DEFS = {
  // generic industrial
  crate_wood: P(16, 16, "rect", "low", true, "Crate"),
  crate_stack: P(32, 32, "rect", "high", true, "Stack of crates"),
  crate_green: P(20, 14, "rect", "low", true, "Army crate"),
  barrel_red: P(14, 14, "circle", "low", true, "Barrel", { radius: 7 }),
  barrel_blue: P(14, 14, "circle", "low", true, "Barrel", { radius: 7 }),
  barrel_rust: P(14, 14, "circle", "low", true, "Rusty barrel", { radius: 7 }),
  pallet: P(26, 20, "none", "floor", false, "Pallet"),
  sandbags: P(40, 12, "rect", "low", true, "Sandbags"),
  forklift: P(26, 52, "rect", "high", true, "Forklift", { inset: 1 }),
  truck: P(50, 144, "rect", "high", true, "Lorry", { inset: 2 }),
  machine_lathe: P(40, 22, "rect", "high", true, "Lathe"),
  machine_press: P(32, 32, "rect", "high", true, "Press"),
  tank_vertical: P(32, 32, "circle", "high", true, "Tank", { radius: 16 }),
  tank_horizontal: P(30, 68, "rect", "high", true, "Vessel", { inset: 2 }),
  turbine: P(76, 76, "circle", "high", true, "Plant unit", { radius: 34 }),
  locker_row: P(52, 12, "rect", "high", true, "Lockers"),
  desk: P(30, 16, "rect", "low", false, "Desk"),
  chair: P(9, 9, "none", "floor", false, "Chair"),
  file_cabinet: P(18, 12, "rect", "high", true, "Cabinet"),
  plant_pot: P(14, 14, "circle", "low", false, "Ficus", { radius: 5 }),
  turnstile: P(8, 22, "rect", "low", false, "Turnstile"),
  boom_barrier: P(60, 6, "none", "floor", false, "Boom barrier"),
  conveyor: P(88, 22, "rect", "low", false, "Conveyor"),
  electric_box: P(16, 8, "rect", "high", true, "Fuse box"),
  cable_reel: P(18, 18, "circle", "low", true, "Cable drum", { radius: 9 }),
  tire_stack: P(16, 16, "circle", "low", true, "Tyres", { radius: 8 }),
  workbench: P(36, 14, "rect", "low", false, "Workbench"),
  scrap_pile: P(30, 26, "rect", "low", true, "Scrap metal", { inset: 3 }),
  container: P(48, 116, "rect", "high", true, "Container"),
  // vehicles
  car_zhiguli: P(34, 80, "rect", "low", true, "Zhiguli", { inset: 1 }),
  car_volga: P(36, 92, "rect", "low", true, "Volga", { inset: 1 }),
  car_wreck: P(34, 80, "rect", "low", true, "Car wreck", { inset: 2 }),
  bus_paz: P(50, 136, "rect", "high", true, "Bus", { inset: 1 }),
  // garages & yard
  garage: P(64, 112, "rect", "high", true, "Garage"),
  garage_shell: P(46, 92, "rect", "high", true, "Shell garage", { inset: 1 }),
  trash_container: P(34, 20, "rect", "low", true, "Rubbish skip"),
  bench: P(38, 11, "rect", "low", false, "Bench"),
  domino_table: P(22, 22, "rect", "low", false, "Dominoes table", { inset: 3 }),
  swing: P(50, 14, "rect", "low", false, "Swing", { inset: 4 }),
  slide: P(16, 44, "rect", "low", false, "Slide", { inset: 2 }),
  carousel: P(34, 34, "circle", "low", false, "Roundabout", { radius: 14 }),
  sandbox: P(44, 44, "none", "floor", false, "Sandpit"),
  monkey_bars: P(40, 10, "rect", "low", false, "Pull-up bar", { inset: 2 }),
  kiosk: P(40, 30, "rect", "high", true, "Kiosk"),
  lamp_post: P(8, 8, "circle", "low", true, "Street lamp", { radius: 3 }),
  tree_trunk: P(10, 10, "circle", "low", true, "Tree", { radius: 4 }),
  phone_booth: P(18, 18, "rect", "high", true, "Phone box"),
  water_pump: P(12, 12, "circle", "low", true, "Water pump", { radius: 4 }),
  // construction site «Стройка»
  brick_pallet: P(24, 20, "rect", "low", true, "Brick pallet"),
  cinder_blocks: P(24, 24, "rect", "high", true, "Cinder blocks"),
  concrete_pipes: P(66, 40, "rect", "high", true, "Concrete pipes", { inset: 2 }),
  timber: P(46, 16, "rect", "low", true, "Timber"),
  cement_bags: P(26, 18, "rect", "low", true, "Cement bags"),
  mixer_truck: P(46, 116, "rect", "high", true, "Mixer truck", { inset: 2 }),
  excavator: P(58, 92, "rect", "high", true, "Excavator", { inset: 3 }),
  sand_pile: P(64, 52, "circle", "low", true, "Sand pile", { radius: 23 }),
  crane_mast: P(28, 28, "rect", "high", true, "Tower crane"),
  scaffold: P(64, 14, "rect", "high", false, "Scaffolding", { inset: 2 }),
  rebar: P(40, 12, "none", "floor", false, "Rebar"),
  wheelbarrow: P(14, 24, "none", "floor", false, "Wheelbarrow"),
  // shop «Гастроном» (shelves also serve the pharmacy and the library)
  shelf: P(44, 14, "rect", "high", true, "Shelving"),
  fridge_case: P(46, 18, "rect", "low", true, "Fridge counter"),
  counter: P(50, 14, "rect", "low", true, "Counter"),
  cash_desk: P(34, 16, "rect", "low", true, "Cash desk"),
  produce_stall: P(40, 24, "rect", "low", true, "Produce stall"),
  sacks: P(26, 20, "rect", "low", true, "Sacks"),
  soda_machine: P(16, 14, "rect", "high", true, "Soda machine"),
  // house of culture «Дом культуры»
  theater_seats: P(54, 12, "rect", "low", false, "Row of seats"),
  stage_speaker: P(14, 14, "rect", "high", true, "Water pump"),
  drum_kit: P(28, 22, "rect", "low", false, "Drum kit", { inset: 2 }),
  pool_table: P(46, 26, "rect", "low", true, "Pool table"),
  cafe_table: P(20, 20, "circle", "low", false, "Caf\xE9 table", { radius: 7 }),
  piano: P(34, 14, "rect", "high", true, "Piano"),
  statue: P(30, 30, "rect", "high", true, "Monument"),
  bust: P(18, 18, "rect", "high", true, "Bust"),
  planter: P(32, 32, "rect", "low", true, "Flower bed"),
  column: P(18, 18, "circle", "high", true, "Column", { radius: 8 }),
  coat_rack: P(44, 10, "rect", "high", false, "Coat rack"),
  sofa: P(36, 14, "rect", "low", false, "Sofa"),
  curtain: P(48, 8, "rect", "high", false, "Stage curtain"),
  mixing_desk: P(30, 14, "rect", "low", true, "Mixing desk"),
  // hospital «Больница»
  hospital_bed: P(22, 40, "rect", "low", false, "Hospital bed"),
  operating_table: P(20, 40, "rect", "low", false, "Operating table"),
  med_screen: P(36, 6, "rect", "high", false, "Screen"),
  med_cabinet: P(32, 12, "rect", "high", true, "Medicine cabinet"),
  xray: P(40, 32, "rect", "high", true, "X-ray machine"),
  bench_row: P(54, 12, "rect", "low", false, "Row of seats"),
  wheelchair: P(14, 16, "none", "floor", false, "Wheelchair"),
  stretcher: P(16, 36, "rect", "low", false, "Stretcher"),
  ambulance: P(36, 80, "rect", "high", true, "Ambulance", { inset: 1 }),
  tent: P(52, 52, "rect", "high", true, "Tent"),
  iv_stand: P(8, 8, "none", "floor", false, "IV stand"),
  // v0.23: the cemetery, the square and the pioneer camp (shared: flagpole)
  flagpole: P(30, 10, "circle", "high", false, "Flagpole", { radius: 2 }),
  grave: P(16, 8, "rect", "low", true, "Gravestone"),
  grave_mound: P(16, 26, "none", "floor", false, "Grave"),
  tomb: P(20, 34, "rect", "low", true, "Tomb"),
  wreath: P(14, 14, "none", "floor", false, "Wreath"),
  mourner: P(24, 24, "rect", "high", true, "Statue"),
  memorial: P(44, 44, "rect", "high", true, "Memorial", { inset: 2 }),
  dome: P(48, 48, "none", "high", false, "Dome"),
  dome_small: P(28, 28, "none", "high", false, "Dome"),
  spire: P(56, 56, "none", "high", false, "Tower roof"),
  btr: P(40, 92, "rect", "high", true, "Armoured carrier", { inset: 1 }),
  hedgehog: P(20, 20, "rect", "low", false, "Anti-tank hedgehog", { inset: 3 }),
  barrier: P(44, 6, "rect", "low", false, "Barrier"),
  campfire: P(30, 30, "circle", "low", false, "Campfire", { radius: 9 }),
  watchtower: P(36, 36, "rect", "high", true, "Watchtower", { inset: 4 }),
  goal: P(12, 44, "rect", "low", false, "Goal", { inset: 1 }),
  boat: P(18, 44, "rect", "low", false, "Boat", { inset: 2 }),
  bunk_bed: P(18, 38, "rect", "low", false, "Bunk bed"),
  long_table: P(70, 26, "rect", "low", false, "Dining table", { inset: 1 }),
  bugler: P(26, 26, "rect", "high", true, "Pioneer statue"),
  rock: P(34, 26, "circle", "low", true, "Rock", { radius: 11 })
};
var PROP_TYPES = Object.keys(PROP_DEFS);

// packages/shared/src/sim/math.ts
var TAU = Math.PI * 2;

// packages/shared/src/sim/bots.ts
var BOT_EASE = Object.freeze({ reaction: 1.35, aimError: 1.45, turnRate: 0.78, vision: 0.9, fireDuty: 0.75 });

// packages/shared/src/sim/fill.ts
var FILL_RULES = Object.freeze({
  /** Free-for-all: at least this many players in a match. */
  ffaPlayers: 4,
  /** Team modes: at least this many players on each side (the sides are always even). */
  teamPlayers: 3,
  /** Quick Match: how long the first person waits for others before players start arriving. */
  waitMs: 5e3,
  /** …then one more player arrives every arriveMinMs–arriveMaxMs (lobby). */
  arriveMinMs: 700,
  arriveMaxMs: 2200,
  /** During a match an empty place is taken after joinMinMs–joinMaxMs (like someone joining in progress). */
  joinMinMs: 2500,
  joinMaxMs: 6e3,
  /** A player beyond the lineup (a person took the place) leaves after leaveMinMs–leaveMaxMs. */
  leaveMinMs: 500,
  leaveMaxMs: 2e3
});

// packages/shared/src/net/protocol.ts
var PROTOCOL_VERSION = 8;
var CHAT_RULES = Object.freeze({ maxLength: 140, maxRaw: 400, burst: 4, refillMs: 2500, repeatMs: 4e3 });
var roomId = external_exports.string().regex(/^[A-Za-z0-9_-]{4,32}$/);
var ClientMessageSchema = external_exports.discriminatedUnion("type", [
  external_exports.object({
    type: external_exports.literal("hello"),
    protocol: external_exports.literal(PROTOCOL_VERSION),
    token: external_exports.string().min(16).max(256),
    roomId,
    character: external_exports.enum(CHARACTER_IDS),
    reconnectToken: external_exports.string().min(16).max(128).optional(),
    clientVersion: external_exports.string().max(32).optional(),
    /** v0.2.17: the $BLAT Tournament stake the player agreed to (must equal the room's to come in). */
    stake: external_exports.number().int().min(0).max(1e5).optional()
  }),
  external_exports.object({ type: external_exports.literal("ready"), ready: external_exports.boolean() }),
  external_exports.object({ type: external_exports.literal("character"), character: external_exports.enum(CHARACTER_IDS) }),
  external_exports.object({ type: external_exports.literal("map"), mapId: external_exports.enum(MAP_IDS) }),
  /** Host: the game mode (lobby only). */
  external_exports.object({ type: external_exports.literal("mode"), mode: external_exports.enum(GAME_MODES) }),
  /** Team matches: move to the other team (lobby only, while the teams stay even). */
  external_exports.object({ type: external_exports.literal("team"), team: external_exports.union([external_exports.literal(0), external_exports.literal(1)]) }),
  external_exports.object({ type: external_exports.literal("start") }),
  external_exports.object({ type: external_exports.literal("rematch") }),
  /** The player changed their loadout over the API: the server re-reads it (applies from the next spawn). */
  external_exports.object({ type: external_exports.literal("loadout") }),
  external_exports.object({ type: external_exports.literal("leave") }),
  external_exports.object({ type: external_exports.literal("ping"), t: external_exports.number().finite() }),
  /** Text chat in the room (lobby and match); `team`: only to your own team (team modes). */
  external_exports.object({ type: external_exports.literal("chat"), text: external_exports.string().max(CHAT_RULES.maxRaw), team: external_exports.boolean().optional() })
]);

// packages/shared/src/events/analytics.ts
var CLIENT_EVENTS = [
  "app_opened",
  "session_ended",
  "tutorial_completed",
  "character_selected",
  "invite_opened",
  "connection_error",
  "reconnect_attempted",
  "reconnect_succeeded",
  "client_error"
];
var short = external_exports.string().max(120);
var platform = external_exports.enum(["telegram_ios", "telegram_android", "telegram_desktop", "telegram_web", "telegram_other", "browser_mobile", "browser_desktop", "unknown"]);
var PlatformSchema = platform;
var CLIENT_EVENT_PROPS = {
  app_opened: external_exports.object({ platform, startParam: external_exports.string().max(64).optional(), referrer: short.optional() }).strict(),
  session_ended: external_exports.object({ durationMs: external_exports.number().int().min(0).max(864e5) }).strict(),
  tutorial_completed: external_exports.object({ step: external_exports.string().max(32).optional() }).strict(),
  character_selected: external_exports.object({ character: external_exports.enum(CHARACTER_IDS) }).strict(),
  invite_opened: external_exports.object({ code: external_exports.string().max(32), result: external_exports.enum(["joinable", "full", "in_progress", "finished", "expired", "not_found"]) }).strict(),
  connection_error: external_exports.object({ stage: external_exports.enum(["connect", "auth", "join", "gameplay"]), code: external_exports.string().max(40).optional() }).strict(),
  reconnect_attempted: external_exports.object({ attempt: external_exports.number().int().min(1).max(100) }).strict(),
  reconnect_succeeded: external_exports.object({ attempt: external_exports.number().int().min(1).max(100), downtimeMs: external_exports.number().int().min(0).max(6e5) }).strict(),
  client_error: external_exports.object({
    component: external_exports.string().max(40),
    category: external_exports.string().max(40),
    message: external_exports.string().max(300),
    clientVersion: external_exports.string().max(32).optional()
  }).strict()
};
var SERVER_EVENT_PROPS = {
  session_started: external_exports.object({ platform, method: external_exports.enum(["telegram", "dev", "guest", "email", "oauth"]) }),
  profile_created: external_exports.object({ method: external_exports.enum(["telegram", "dev", "guest", "oauth"]) }),
  lobby_created: external_exports.object({ roomId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), isPrivate: external_exports.boolean(), mode: external_exports.enum(GAME_MODES).optional() }),
  lobby_joined: external_exports.object({ roomId: external_exports.string(), viaInvite: external_exports.boolean() }),
  lobby_left: external_exports.object({ roomId: external_exports.string(), phase: external_exports.string() }),
  /** players: people; fill: players the server added to complete the lineup. */
  match_started: external_exports.object({ matchId: external_exports.string(), roomId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), players: external_exports.number().int(), fill: external_exports.number().int().optional(), mode: external_exports.enum(GAME_MODES).optional() }),
  match_completed: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), durationMs: external_exports.number().int(), players: external_exports.number().int(), fill: external_exports.number().int().optional(), reason: external_exports.string(), mode: external_exports.enum(GAME_MODES).optional() }),
  match_abandoned: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), phase: external_exports.string() }),
  map_played: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS) }),
  invite_created: external_exports.object({ code: external_exports.string(), roomId: external_exports.string() }),
  shop_purchase: external_exports.object({ kind: external_exports.enum(["weapon", "character", "gadget"]), item: external_exports.string(), currency: external_exports.enum(["tokens", "diamonds"]), amount: external_exports.number().int() }),
  mod_bought: external_exports.object({ weapon: external_exports.string(), mod: external_exports.string(), cost: external_exports.number().int() }),
  /** The weapon case and (v0.23) the skin case: `kind` skin carries the finish. */
  case_opened: external_exports.object({ weapon: external_exports.string(), rarity: external_exports.enum(["common", "rare", "epic", "legendary"]), price: external_exports.number().int(), kind: external_exports.enum(["weapon", "skin"]).optional(), finish: external_exports.string().max(24).optional() }),
  payment_completed: external_exports.object({ provider: external_exports.string(), packId: external_exports.string(), diamonds: external_exports.number().int(), amountCents: external_exports.number().int() }),
  email_linked: external_exports.object({}),
  /** v0.3: a provider attached to an account (google, facebook, discord, reddit, telegram). */
  identity_linked: external_exports.object({ provider: external_exports.enum(["google", "facebook", "discord", "reddit", "telegram"]), via: external_exports.enum(["code", "email", "widget"]).optional(), merged: external_exports.boolean().optional() }),
  /** v0.3 part 4: a story mission started / reported done (first: its rewards were paid now). */
  story_started: external_exports.object({ mission: external_exports.string().max(16) }),
  story_completed: external_exports.object({ mission: external_exports.string().max(16), ms: external_exports.number().int(), first: external_exports.boolean() })
};
var ClientEventEnvelopeSchema = external_exports.object({
  id: external_exports.string().uuid(),
  name: external_exports.enum(CLIENT_EVENTS),
  ts: external_exports.number().int().positive(),
  props: external_exports.record(external_exports.unknown()).default({})
}).strict();
var EventsBatchSchema = external_exports.object({ events: external_exports.array(ClientEventEnvelopeSchema).min(1).max(50) }).strict();

// packages/shared/src/schemas/api.ts
var displayNameSchema = external_exports.string().trim().min(2).max(MAX_NAME_LENGTH).regex(LATIN_NAME_RE, "A name may contain Latin letters (A\u2013Z), digits, spaces and _ . -");
var signupNameSchema = external_exports.string().trim().min(1).max(64);
var refSchema = external_exports.string().regex(/^[A-Za-z0-9_-]{4,32}$/);
var partnerCodeSchema = external_exports.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "A partner code: 3\u201324 Latin letters, digits or _");
var utmValueSchema = external_exports.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z0-9 ._+-]+$/);
var FirstTouchSchema = external_exports.object({
  partner: partnerCodeSchema.optional(),
  utmSource: utmValueSchema.optional(),
  utmMedium: utmValueSchema.optional(),
  utmCampaign: utmValueSchema.optional(),
  invite: external_exports.boolean().optional(),
  referrer: external_exports.string().max(80).regex(/^[a-z0-9.-]+$/).optional()
}).strict();
var telegramLinkCodeSchema = external_exports.string().regex(/^[A-Za-z0-9_-]{16,32}$/);
var TelegramAuthRequest = external_exports.object({
  initData: external_exports.string().min(10).max(8192),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional(),
  /** Optional anonymous browser id (see VisitRequest) that links a new player to the visitor funnel. */
  visitorId: external_exports.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  ref: refSchema.optional(),
  /** V2.0 part E: the one-time code from the bot's link (`?tglink=`): Telegram is attached to the code's account. */
  link: telegramLinkCodeSchema.optional(),
  /** V2.0 part F: the first touch, kept with a new account. */
  source: FirstTouchSchema.optional()
}).strict();
var DevAuthRequest = external_exports.object({
  name: signupNameSchema,
  deviceId: external_exports.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional(),
  ref: refSchema.optional(),
  source: FirstTouchSchema.optional()
}).strict();
var GuestAuthRequest = external_exports.object({
  name: signupNameSchema,
  deviceId: external_exports.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional(),
  visitorId: external_exports.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  ref: refSchema.optional(),
  source: FirstTouchSchema.optional()
}).strict();
var visitorIdSchema = external_exports.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
var emailSchema = external_exports.string().trim().toLowerCase().max(254).email("That is not a valid email address");
var passwordSchema = external_exports.string().min(8, "The password needs at least 8 characters").max(128);
var EmailLoginRequest = external_exports.object({
  email: emailSchema,
  password: external_exports.string().min(1).max(128),
  deviceId: external_exports.string().regex(/^[A-Za-z0-9_-]{20,64}$/).optional(),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional(),
  /** V2.0 part E: inside Telegram, the signed launch data — this Telegram account gets attached to the email's account. */
  initData: external_exports.string().min(10).max(8192).optional()
}).strict();
var EmailLinkRequest = external_exports.object({ email: emailSchema, password: passwordSchema }).strict();
var PasswordChangeRequest = external_exports.object({ current: external_exports.string().min(1).max(128), password: passwordSchema }).strict();
var PasswordResetRequest = external_exports.object({ email: emailSchema }).strict();
var PasswordResetConfirm = external_exports.object({ token: external_exports.string().regex(/^[A-Za-z0-9_-]{20,64}$/), password: passwordSchema }).strict();
var VisitRequest = external_exports.object({ visitorId: visitorIdSchema, platform: PlatformSchema.optional(), referrer: external_exports.string().max(120).optional(), source: FirstTouchSchema.optional() }).strict();
var BuyRequest = external_exports.object({ kind: external_exports.enum(["weapon", "character", "gadget"]), id: external_exports.string().regex(/^[a-z0-9_]{2,24}$/) }).strict();
var ModBuyRequest = external_exports.object({ weapon: external_exports.enum(WEAPON_IDS), mod: external_exports.enum(MOD_IDS) }).strict();
var LoadoutRequest = external_exports.object({
  sidearm: external_exports.enum(WEAPON_IDS),
  melee: external_exports.enum(WEAPON_IDS),
  primary: external_exports.enum(WEAPON_IDS).nullable(),
  gadget: external_exports.enum(GADGET_IDS).nullable().optional(),
  /** Equipped modifications per weapon (validated against ownership and mounts). */
  mods: external_exports.record(external_exports.enum(WEAPON_IDS), external_exports.array(external_exports.enum(MOD_IDS)).max(4)).optional(),
  /** Equipped skins per weapon (validated against ownership). */
  skins: external_exports.record(external_exports.enum(WEAPON_IDS), external_exports.enum(FINISH_IDS)).optional()
}).strict();
var CaseOpenRequest = external_exports.object({ confirmAge: external_exports.literal(true).optional() }).strict();
var CheckoutRequest = external_exports.object({ packId: external_exports.string().regex(/^[a-z0-9]{2,16}$/), method: external_exports.enum(["card", "crypto"]) }).strict();
var UpdateProfileRequest = external_exports.object({
  displayName: displayNameSchema.optional(),
  preferredCharacter: external_exports.enum(CHARACTER_IDS).optional(),
  /** A profile avatar (game-rules/avatars.ts); null removes it. */
  avatar: external_exports.enum(AVATAR_IDS).nullable().optional()
}).strict();
var KonStakeField = external_exports.number().int().refine((v) => isKonStake(v), { message: "not one of the stakes" });
var CreateRoomRequest = external_exports.object({ mapId: external_exports.enum(MAP_IDS), isPrivate: external_exports.boolean().default(true), mode: external_exports.enum(GAME_MODES).default("ffa"), kon: external_exports.enum(KON_FORMATS).optional(), stake: KonStakeField.optional() }).strict();
var QuickMatchRequest = external_exports.object({ mapId: external_exports.enum(MAP_IDS).optional(), mode: external_exports.enum(GAME_MODES).default("ffa"), kon: external_exports.enum(KON_FORMATS).optional(), stake: KonStakeField.optional() }).strict();
var AdminLoginRequest = external_exports.object({ username: external_exports.string().min(3).max(32), password: external_exports.string().min(1).max(256) }).strict();
var AdminCreateUserRequest = external_exports.object({
  username: external_exports.string().regex(/^[a-z0-9_.-]{3,32}$/),
  password: external_exports.string().min(12).max(256),
  role: external_exports.enum(["admin", "viewer"])
}).strict();
var AdminBlatAllocationRequest = external_exports.object({
  pool: external_exports.enum(["influencers", "friends", "reserve"]),
  amount: external_exports.number().int().min(1).max(1e8),
  note: external_exports.string().trim().min(3).max(120)
}).strict();
var AdminReferralDecision = external_exports.object({ action: external_exports.enum(["confirm", "reject"]), note: external_exports.string().trim().max(200).optional() }).strict();
var AdminBlatDropRequest = external_exports.object({ announceAt: external_exports.string().datetime({ offset: true }).nullable() }).strict();
var AdminBlatSnapshotRequest = external_exports.object({ note: external_exports.string().trim().max(200).optional() }).strict();
var AdminBlatFlagRequest = external_exports.object({ flag: external_exports.string().trim().min(1).max(200).nullable() }).strict();
var AdminGrantRequest = external_exports.object({
  currency: external_exports.enum(["tokens", "diamonds"]),
  amount: external_exports.number().int().min(-1e6).max(1e6).refine((v) => v !== 0, "amount must not be 0"),
  note: external_exports.string().trim().min(3).max(120)
}).strict();
var AdminStoryOpenRequest = external_exports.object({ mission: external_exports.string().regex(/^[a-z0-9_]{1,16}$/) }).strict();
var AdminPartnerCreate = external_exports.object({ name: external_exports.string().trim().min(1).max(60), code: partnerCodeSchema.optional(), note: external_exports.string().trim().max(300).optional() }).strict();
var AdminPartnerUpdate = external_exports.object({ name: external_exports.string().trim().min(1).max(60).optional(), note: external_exports.string().trim().max(300).nullable().optional(), active: external_exports.boolean().optional() }).strict();

// packages/shared/src/schemas/social.ts
var FriendRequestBody = external_exports.object({ name: displayNameSchema }).strict();
var DM_MAX_LENGTH = 500;
var DirectMessageBody = external_exports.object({
  text: external_exports.string().transform((s) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim()).pipe(external_exports.string().min(1).max(DM_MAX_LENGTH))
}).strict();
var InviteFriendBody = external_exports.object({ roomId: external_exports.string().regex(/^[A-Za-z0-9]{6,16}$/) }).strict();
var SocialClientMessage = external_exports.discriminatedUnion("type", [
  external_exports.object({ type: external_exports.literal("auth"), token: external_exports.string().min(16).max(256) }).strict(),
  external_exports.object({ type: external_exports.literal("ping"), t: external_exports.number().finite() }).strict()
]);

// packages/shared/src/schemas/story.ts
var StoryStartBody = external_exports.object({ mission: external_exports.string().regex(/^[a-z0-9_]{1,16}$/) }).strict();
var StoryCompleteBody = external_exports.object({
  ticket: external_exports.string().min(10).max(600),
  /** Time in the mission (the best time of the mission is kept). */
  ms: external_exports.number().int().min(0).max(3 * 36e5),
  kills: external_exports.number().int().min(0).max(999),
  deaths: external_exports.number().int().min(0).max(999)
}).strict();

// apps/server/src/database/codeSteps.ts
async function uniqueAliases(tx) {
  const rows = await tx`
    SELECT id, display_name, deleted_at IS NULL AS living FROM users ORDER BY created_at, id`;
  const taken = /* @__PURE__ */ new Set();
  const final = /* @__PURE__ */ new Map();
  const later = [];
  for (const r of rows) {
    const key = nameKey(r.display_name);
    if (!r.living) final.set(r.id, { name: r.display_name, key });
    else if (taken.has(key)) later.push(r);
    else {
      taken.add(key);
      final.set(r.id, { name: r.display_name, key });
    }
  }
  for (const r of later) {
    let name = r.display_name;
    let key = nameKey(name);
    for (let n = 2; taken.has(key); n++) {
      name = numberedAlias(r.display_name, n);
      key = nameKey(name);
    }
    taken.add(key);
    final.set(r.id, { name, key });
  }
  const ids = [...final.keys()];
  const names = ids.map((id) => final.get(id).name);
  const keys = ids.map((id) => final.get(id).key);
  for (let i = 0; i < ids.length; i += 500) {
    await tx`
      UPDATE users u SET display_name = v.name, name_key = v.key
      FROM unnest(${tx.array(ids.slice(i, i + 500))}::uuid[], ${tx.array(names.slice(i, i + 500))}::text[], ${tx.array(keys.slice(i, i + 500))}::text[]) AS v(id, name, key)
      WHERE u.id = v.id`;
  }
  await tx`CREATE UNIQUE INDEX IF NOT EXISTS users_name_key_unique ON users (name_key) WHERE deleted_at IS NULL`;
}
async function replayRatings(tx) {
  const rows = await tx`
    SELECT mp.match_id, mp.user_id, mp.place, mp.completed, mp.team, m.mode, m.winner_team, (m.player_count + m.bot_count)::int AS players
    FROM match_participants mp JOIN matches m ON m.id = mp.match_id
    WHERE m.results_processed_at IS NOT NULL
    ORDER BY m.ended_at NULLS LAST, m.results_processed_at, m.id, mp.user_id`;
  const rating = /* @__PURE__ */ new Map();
  const matchIds = [];
  const userIds = [];
  const deltas = [];
  for (const r of rows) {
    const teamOutcome = r.mode !== "ffa" && r.team !== null ? r.winner_team === null ? "draw" : r.winner_team === r.team ? "win" : "loss" : void 0;
    const d = ratingDelta({ place: r.place ?? r.players, playersAtEnd: r.players, completed: r.completed, ...teamOutcome ? { teamOutcome } : {} });
    const before = rating.get(r.user_id) ?? RATING_RULES.start;
    const after = Math.max(RATING_RULES.floor, before + d);
    rating.set(r.user_id, after);
    matchIds.push(r.match_id);
    userIds.push(r.user_id);
    deltas.push(after - before);
  }
  for (let i = 0; i < matchIds.length; i += 1e3) {
    await tx`
      UPDATE match_participants mp SET rating_delta = v.d
      FROM unnest(${tx.array(matchIds.slice(i, i + 1e3))}::uuid[], ${tx.array(userIds.slice(i, i + 1e3))}::uuid[], ${tx.array(deltas.slice(i, i + 1e3))}::int[]) AS v(m, u, d)
      WHERE mp.match_id = v.m AND mp.user_id = v.u`;
  }
  const users = [...rating.keys()];
  for (let i = 0; i < users.length; i += 1e3) {
    const part = users.slice(i, i + 1e3);
    await tx`
      UPDATE profiles p SET rating = v.r
      FROM unnest(${tx.array(part)}::uuid[], ${tx.array(part.map((u) => rating.get(u)))}::int[]) AS v(u, r)
      WHERE p.user_id = v.u`;
  }
}
async function latinNames(tx) {
  const users = await tx`SELECT id, display_name, name_key FROM users WHERE deleted_at IS NULL ORDER BY created_at, id`;
  const taken = new Set(users.filter((u) => LATIN_NAME_RE.test(u.display_name)).map((u) => nameKey(u.display_name)));
  for (const u of users) {
    if (LATIN_NAME_RE.test(u.display_name)) continue;
    const base2 = latinName(u.display_name, `Comrade ${u.id.replace(/\D/g, "").slice(-4).padStart(4, "0")}`);
    let name = base2;
    for (let n = 2; taken.has(nameKey(name)); n++) name = numberedAlias(base2, n);
    taken.add(nameKey(name));
    await tx`UPDATE users SET display_name = ${name}, name_key = ${nameKey(name)} WHERE id = ${u.id}`;
  }
  const clubs = await tx`SELECT id, name, tag, motto FROM clubs ORDER BY created_at, id`;
  const names = new Set(clubs.filter((c) => LATIN_NAME_RE.test(c.name)).map((c) => nameKey(c.name)));
  const tags = new Set(clubs.filter((c) => /^[A-Z0-9]+$/.test(c.tag)).map((c) => nameKey(c.tag)));
  for (const c of clubs) {
    const okName = LATIN_NAME_RE.test(c.name);
    const okTag = /^[A-Z0-9]+$/.test(c.tag);
    const okMotto = /^[\x20-\x7E’‘“”«»—–…]*$/.test(c.motto);
    if (okName && okTag && okMotto) continue;
    let name = c.name;
    if (!okName) {
      const base2 = latinName(c.name, "Club").slice(0, MAX_NAME_LENGTH).padEnd(3, "0");
      name = base2;
      for (let n = 2; names.has(nameKey(name)); n++) name = numberedAlias(base2, n);
      names.add(nameKey(name));
    }
    let tag = c.tag;
    if (!okTag) {
      const base2 = toLatin(c.tag).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      tag = base2.length >= 2 ? base2 : "C" + c.id.replace(/\D/g, "").slice(0, 3);
      for (let n = 1; tags.has(nameKey(tag)); n++) tag = `C${(n * 37 + c.id.length) % 1e3}`.slice(0, 4);
      tags.add(nameKey(tag));
    }
    const motto = okMotto ? c.motto : transliterate(c.motto).replace(/[^\x20-\x7E’‘“”«»—–…]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    await tx`UPDATE clubs SET name = ${name}, name_key = ${nameKey(name)}, tag = ${tag}, tag_key = ${nameKey(tag)}, motto = ${motto}, updated_at = now() WHERE id = ${c.id}`;
  }
}
var CODE_STEPS = Object.freeze({
  "010_social.sql": async (tx) => {
    await uniqueAliases(tx);
    await replayRatings(tx);
  },
  "014_latin_names.sql": latinNames
});

// apps/server/src/database/migrate.ts
var DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));
var LOCK_ID = 891989;
function listFiles(dir) {
  return readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
}
async function ensureLedger(sql2) {
  await sql2`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
}
async function migrate(sql2, dir = DEFAULT_MIGRATIONS_DIR) {
  await ensureLedger(sql2);
  const done = [];
  await sql2.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    const rows = await tx`SELECT version FROM schema_migrations`;
    const applied = new Set(rows.map((r) => r.version));
    for (const file of listFiles(dir)) {
      if (applied.has(file)) continue;
      await tx.unsafe(readFileSync(`${dir}/${file}`, "utf8"));
      await CODE_STEPS[file]?.(tx);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      done.push(file);
    }
  });
  return done;
}

// apps/server/src/logging/logger.ts
var ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
var REDACT = /token|password|secret|initdata|authorization|cookie/i;
function sanitize(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message, stack: v.stack?.split("\n").slice(0, 6).join("\n") };
    else out[k] = v;
  }
  return out;
}
function createLogger(level = "info", base2 = {}, sink = (l) => process.stdout.write(l + "\n")) {
  const min = ORDER[level];
  const write = (lvl, msg, fields) => {
    if (ORDER[lvl] < min) return;
    sink(JSON.stringify({ t: (/* @__PURE__ */ new Date()).toISOString(), level: lvl, msg, ...base2, ...fields ? sanitize(fields) : {} }));
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(level, { ...base2, ...fields }, sink)
  };
}
var silentLogger = createLogger("error", {}, () => {
});

// apps/server/src/admin/auth.ts
import { createHmac as createHmac2 } from "node:crypto";

// apps/server/src/auth/tokens.ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function hashToken(secret, token, purpose = "session") {
  return createHmac("sha256", secret).update(`${purpose}:${token}`).digest();
}
function safeEqualStr(a, b2) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b2);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// apps/server/src/admin/password.ts
import { randomBytes as randomBytes2, scrypt as scryptCb, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var N = 16384;
var R = 8;
var P2 = 1;
var KEYLEN = 64;
function scrypt(password2, salt, n, r, p) {
  return new Promise(
    (resolve, reject) => scryptCb(password2.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key))
  );
}
async function hashPassword(password2) {
  const salt = randomBytes2(16);
  const key = await scrypt(password2, salt, N, R, P2);
  return `scrypt$${N}$${R}$${P2}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
async function verifyPassword(password2, stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n > 1 << 20) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const key = await scrypt(password2, salt, n, r, p);
  return key.length === expected.length && timingSafeEqual2(key, expected);
}
var DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + Buffer.alloc(64).toString("base64url");
function passwordProblems(password2) {
  if (password2.length < 12) return "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043A\u043E\u0440\u043E\u0447\u0435 12 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432";
  if (/^(.)\1+$/.test(password2)) return "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043F\u0440\u043E\u0441\u0442\u043E\u0439";
  return null;
}

// apps/server/src/http/router.ts
var HttpError = class extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
  status;
  code;
  headers;
};
function serializeCookie(name, value, opts) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? "/"}`;
  if (opts.maxAge !== void 0) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.httpOnly !== false) s += "; HttpOnly";
  if (opts.secure) s += "; Secure";
  s += `; SameSite=${opts.sameSite ?? "Strict"}`;
  return s;
}

// apps/server/src/admin/auth.ts
var ADMIN_COOKIE = "blk_admin";
var AdminAuth = class {
  constructor(sql2, secret, ttlHours, secureCookie, allowedOrigins) {
    this.sql = sql2;
    this.secret = secret;
    this.ttlHours = ttlHours;
    this.secureCookie = secureCookie;
    this.allowedOrigins = allowedOrigins;
  }
  sql;
  secret;
  ttlHours;
  secureCookie;
  allowedOrigins;
  csrfFor(token) {
    return createHmac2("sha256", this.secret).update(`csrf:${token}`).digest("base64url");
  }
  async createAdmin(username2, password2, role2) {
    const hash = await hashPassword(password2);
    const rows = await this.sql`
      INSERT INTO admin_users (username, password_hash, role) VALUES (${username2.toLowerCase()}, ${hash}, ${role2}) RETURNING id`;
    return rows[0].id;
  }
  async adminCount() {
    const [r] = await this.sql`SELECT count(*)::int AS n FROM admin_users`;
    return r.n;
  }
  /** Returns a new session or null for bad credentials (constant-ish time for unknown users). */
  async login(username2, password2, ip, userAgent) {
    const rows = await this.sql`
      SELECT id, username, role, password_hash, disabled_at FROM admin_users WHERE username = ${username2.toLowerCase()}`;
    const row = rows[0];
    const ok = await verifyPassword(password2, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok || row.disabled_at) return null;
    const token = newToken(32);
    const csrf = this.csrfFor(token);
    const expiresAt = new Date(Date.now() + this.ttlHours * 36e5);
    const s = await this.sql`
      INSERT INTO admin_sessions (admin_id, token_hash, csrf_hash, expires_at, ip, user_agent)
      VALUES (${row.id}, ${hashToken(this.secret, token, "admin")}, ${hashToken(this.secret, csrf, "csrf")}, ${expiresAt}, ${ip}, ${userAgent.slice(0, 200)})
      RETURNING id`;
    await this.sql`UPDATE admin_users SET last_login_at = now() WHERE id = ${row.id}`;
    return { token, csrf, admin: { id: row.id, username: row.username, role: row.role, sessionId: s[0].id } };
  }
  async verify(token) {
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) return null;
    const rows = await this.sql`
      SELECT s.id AS session_id, a.id, a.username, a.role
      FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
      WHERE s.token_hash = ${hashToken(this.secret, token, "admin")} AND s.revoked_at IS NULL AND s.expires_at > now() AND a.disabled_at IS NULL`;
    const r = rows[0];
    return r ? { id: r.id, username: r.username, role: r.role, sessionId: r.session_id } : null;
  }
  async logout(token) {
    await this.sql`UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(this.secret, token, "admin")} AND revoked_at IS NULL`;
  }
  sessionCookie(token) {
    return serializeCookie(ADMIN_COOKIE, token, { path: "/api/admin", httpOnly: true, secure: this.secureCookie, sameSite: "Strict", maxAge: this.ttlHours * 3600 });
  }
  clearCookie() {
    return serializeCookie(ADMIN_COOKIE, "", { path: "/api/admin", httpOnly: true, secure: this.secureCookie, sameSite: "Strict", maxAge: 0 });
  }
  /** Rejects requests whose Origin is present and not our own (defense in depth next to SameSite + CSRF). */
  checkOrigin(ctx) {
    const origin = ctx.req.headers.origin;
    if (!origin) return;
    const host = ctx.req.headers.host;
    let sameHost = false;
    try {
      sameHost = !!host && new URL(origin).host === host;
    } catch {
      sameHost = false;
    }
    if (!sameHost && !this.allowedOrigins.has(origin)) throw new HttpError(403, "bad_origin", "\u0417\u0430\u043F\u0440\u043E\u0441 \u0441 \u0447\u0443\u0436\u043E\u0433\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430");
  }
  /** Middleware: valid admin session (+ role) and CSRF token for state-changing methods. */
  require(role2 = null) {
    return async (ctx) => {
      const token = ctx.cookies[ADMIN_COOKIE];
      if (!token) throw new HttpError(401, "unauthorized", "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434");
      const admin = await this.verify(token);
      if (!admin) throw new HttpError(401, "unauthorized", "\u0421\u0435\u0441\u0441\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430");
      if (role2 === "admin" && admin.role !== "admin") throw new HttpError(403, "forbidden", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432");
      if (ctx.method !== "GET" && ctx.method !== "HEAD") {
        this.checkOrigin(ctx);
        const header = String(ctx.req.headers["x-csrf-token"] ?? "");
        if (!header || !safeEqualStr(header, this.csrfFor(token))) throw new HttpError(403, "csrf", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 CSRF-\u0442\u043E\u043A\u0435\u043D");
      }
      ctx.state.admin = admin;
      ctx.state.adminToken = token;
    };
  }
};

// apps/server/src/admin/audit.ts
async function audit(sql2, log2, e) {
  try {
    await sql2`
      INSERT INTO admin_audit_log (admin_id, action, target, details, ip)
      VALUES (${e.adminId}, ${e.action}, ${e.target ?? null}, ${sql2.json(e.details ?? {})}, ${e.ip ?? null})`;
  } catch (err) {
    log2.error("audit write failed", { err, action: e.action });
  }
}

// apps/server/src/admin/cli.ts
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const anyRl = rl;
      anyRl._writeToOutput = (s) => {
        if (s.includes(question)) anyRl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}
var cmd = process.argv[2];
if (cmd !== "create") {
  console.error("usage: admin:create   (env: DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE=admin|viewer)");
  process.exit(2);
}
var url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}
var username = (process.env.ADMIN_USERNAME || await ask("\u041B\u043E\u0433\u0438\u043D \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430: ")).toLowerCase();
var password = process.env.ADMIN_PASSWORD || await ask("\u041F\u0430\u0440\u043E\u043B\u044C (\u043C\u0438\u043D. 12 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432): ", true);
var role = process.env.ADMIN_ROLE === "viewer" ? "viewer" : "admin";
if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
  console.error("\u041B\u043E\u0433\u0438\u043D: 3\u201332 \u0441\u0438\u043C\u0432\u043E\u043B\u0430 a-z 0-9 _ . -");
  process.exit(1);
}
var problem = passwordProblems(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
var log = createLogger("warn");
var sql = createDb(url, { max: 1 });
try {
  await migrate(sql);
  const auth = new AdminAuth(sql, process.env.SESSION_SECRET ?? "cli-not-used-for-creation-0000000000", 12, false, /* @__PURE__ */ new Set());
  const id = await auth.createAdmin(username, password, role);
  await audit(sql, log, { adminId: id, action: "admin_created_cli", target: username, details: { role } });
  console.info(`created ${role} "${username}" (${id})`);
} catch (e) {
  const err = e;
  console.error(err.code === "23505" ? `\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 "${username}" \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442` : `failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
//# sourceMappingURL=admin-cli.js.map
