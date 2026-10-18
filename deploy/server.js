import { createRequire as __blatkomCreateRequire } from 'node:module';
const require = __blatkomCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b2) => (typeof require !== "undefined" ? require : a)[b2]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../opt/npm-tools/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer2, mask) {
      for (let i = 0; i < buffer2.length; i++) {
        buffer2[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer2, mask) {
          if (buffer2.length < 32) _unmask(buffer2, mask);
          else bufferUtil.unmask(buffer2, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler2, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler2 && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler2, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler2, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler2, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler2, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler2;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler2) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler2 && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse2(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values2 = params[k];
              if (!Array.isArray(values2)) values2 = [values2];
              return values2.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse: parse2 };
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net2 = __require("net");
    var tls2 = __require("tls");
    var { randomBytes: randomBytes7, createHash: createHash2 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse: parse2 } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler2) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler2 !== "function") return;
          this.addEventListener(method, handler2, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes7(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse2(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls2.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse2(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse: parse2 };
  }
});

// ../../../opt/npm-tools/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../../opt/npm-tools/node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash2 } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server2 = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server2.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server2, map) {
      for (const event of Object.keys(map)) server2.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server2.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server2) {
      server2._state = CLOSED;
      server2.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server2, req, socket, code, message, headers) {
      if (server2.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server2.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// apps/server/src/index.ts
import { createServer } from "node:http";

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

// apps/server/src/config/env.ts
var bool = external_exports.enum(["true", "false", "1", "0", "yes", "no"]).transform((v) => v === "true" || v === "1" || v === "yes");
var EnvSchema = external_exports.object({
  NODE_ENV: external_exports.enum(["development", "test", "production"]).default("development"),
  HOST: external_exports.string().default("0.0.0.0"),
  PORT: external_exports.coerce.number().int().min(1).max(65535).default(8080),
  PUBLIC_URL: external_exports.string().url().default("http://localhost:8080"),
  DATABASE_URL: external_exports.string().min(1),
  DATABASE_POOL_MAX: external_exports.coerce.number().int().min(1).max(100).default(10),
  /** Secret used to sign/derive tokens (min 32 chars). */
  SESSION_SECRET: external_exports.string().min(32),
  SESSION_TTL_HOURS: external_exports.coerce.number().int().min(1).max(24 * 90).default(24 * 14),
  TELEGRAM_BOT_TOKEN: external_exports.string().optional(),
  TELEGRAM_BOT_USERNAME: external_exports.string().optional(),
  TELEGRAM_MINIAPP_SHORT_NAME: external_exports.string().optional(),
  /** Maximum age of Telegram initData (seconds). */
  TELEGRAM_AUTH_MAX_AGE_SEC: external_exports.coerce.number().int().min(60).max(7 * 86400).default(86400),
  DEV_AUTH_ENABLED: bool.default("false"),
  /** Public website without Telegram: players sign in as guests with a nickname (device-bound). */
  GUEST_AUTH_ENABLED: bool.default("false"),
  CORS_ORIGINS: external_exports.string().default(""),
  TRUST_PROXY: bool.default("false"),
  ADMIN_BOOTSTRAP_USERNAME: external_exports.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: external_exports.string().optional(),
  ADMIN_SESSION_TTL_HOURS: external_exports.coerce.number().int().min(1).max(72).default(12),
  STATIC_DIR: external_exports.string().optional(),
  LOG_LEVEL: external_exports.enum(["debug", "info", "warn", "error"]).default("info"),
  SERVER_VERSION: external_exports.string().default("0.1.0"),
  MAX_ROOMS: external_exports.coerce.number().int().min(1).max(1e4).default(500),
  /** Match rules (free-for-all deathmatch). Defaults: 4 minutes, 50 points (elimination 2, assist 1), 2–6 players. */
  MATCH_DURATION_SEC: external_exports.coerce.number().int().min(30).max(900).default(240),
  MATCH_SCORE_LIMIT: external_exports.coerce.number().int().min(1).max(400).default(50),
  MATCH_MIN_PLAYERS: external_exports.coerce.number().int().min(2).max(6).default(2),
  MATCH_MAX_PLAYERS: external_exports.coerce.number().int().min(2).max(6).default(6)
});
function loadEnv(source = process.env) {
  const publicUrlSet = !!source.PUBLIC_URL || !!source.RENDER_EXTERNAL_URL;
  if (!source.PUBLIC_URL && source.RENDER_EXTERNAL_URL) source = { ...source, PUBLIC_URL: source.RENDER_EXTERNAL_URL };
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env2 = parsed.data;
  if (env2.MATCH_MIN_PLAYERS > env2.MATCH_MAX_PLAYERS) throw new Error("MATCH_MIN_PLAYERS must not exceed MATCH_MAX_PLAYERS");
  if (env2.NODE_ENV === "production") {
    if (env2.DEV_AUTH_ENABLED) throw new Error("DEV_AUTH_ENABLED must be false in production");
    if (!env2.TELEGRAM_BOT_TOKEN && !env2.GUEST_AUTH_ENABLED) throw new Error("TELEGRAM_BOT_TOKEN is required in production (or GUEST_AUTH_ENABLED=true for a public website)");
    if (!publicUrlSet) throw new Error("PUBLIC_URL is required in production (the https address players open)");
    if (/change-me|example|secret/i.test(env2.SESSION_SECRET)) throw new Error("SESSION_SECRET looks like a placeholder");
  }
  return env2;
}
function matchConfigFromEnv(env2) {
  return { durationMs: env2.MATCH_DURATION_SEC * 1e3, scoreLimit: env2.MATCH_SCORE_LIMIT, minPlayers: env2.MATCH_MIN_PLAYERS, maxPlayers: env2.MATCH_MAX_PLAYERS };
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

// ../vendor-src/postgres/src/index.js
import os from "os";
import fs from "fs";

// ../vendor-src/postgres/src/query.js
var originCache = /* @__PURE__ */ new Map();
var originStackCache = /* @__PURE__ */ new Map();
var originError = /* @__PURE__ */ Symbol("OriginError");
var CLOSE = {};
var Query = class extends Promise {
  constructor(strings, args, handler2, canceller, options = {}) {
    let resolve2, reject;
    super((a, b2) => {
      resolve2 = a;
      reject = b2;
    });
    this.tagged = Array.isArray(strings.raw);
    this.strings = strings;
    this.args = args;
    this.handler = handler2;
    this.canceller = canceller;
    this.options = options;
    this.state = null;
    this.statement = null;
    this.resolve = (x) => (this.active = false, resolve2(x));
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
          const promise = new Promise((resolve2, reject) => {
            this.cursorFn = (value) => {
              resolve2({ value, done: false });
              return new Promise((r) => prev = r);
            };
            this.resolve = () => (this.active = false, resolve2({ done: true }));
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
import { performance as performance2 } from "perf_hooks";

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
  async function cancel({ pid, secret }, resolve2, reject) {
    try {
      cancelMessage = bytes_default().i32(16).i32(80877102).i32(pid).i32(secret).end(16);
      await connect();
      socket.once("error", reject);
      socket.once("close", resolve2);
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
    setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance2.now()) : 0);
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
    closedTime = performance2.now();
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
  return new Promise(async (resolve2, reject) => {
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
      resolve2(lo);
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
  const sql2 = Sql(handler2);
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
  function Sql(handler3) {
    handler3.debug = options.debug;
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
      const query = strings && Array.isArray(strings.raw) ? new Query(strings, args, handler3, cancel) : typeof strings === "string" && !args.length ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings) : new Builder(strings, args);
      return query;
    }
    function unsafe(string, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([string], args, handler3, cancel, {
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
          handler3(query2);
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
    const c = open.length ? open.shift() : await new Promise((resolve2, reject) => {
      const query = { reserve: resolve2, reject };
      queries.push(query);
      closed.length && connect(closed.shift(), query);
    });
    move(c, reserved);
    c.reserved = () => queue.length ? c.execute(queue.shift()) : move(c, reserved);
    c.reserved.release = true;
    const sql3 = Sql(handler3);
    sql3.release = () => {
      c.reserved = null;
      onopen(c);
    };
    return sql3;
    function handler3(q) {
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
      const sql3 = Sql(handler3);
      sql3.savepoint = savepoint;
      sql3.prepare = (x) => prepare = x.replace(/[^a-z0-9$-_. ]/gi);
      let uncaughtError, result;
      name && await sql3`savepoint ${sql3(name)}`;
      try {
        result = await new Promise((resolve2, reject) => {
          const x = fn2(sql3);
          Promise.resolve(Array.isArray(x) ? Promise.all(x) : x).then(resolve2, reject);
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
      function handler3(q) {
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
  function handler2(query) {
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
    return new Promise((resolve2, reject) => {
      query.state ? query.active ? connection_default(options).cancel(query.state, resolve2, reject) : query.cancelled = { resolve: resolve2, reject } : (queries.remove(query), query.cancelled = true, query.reject(Errors.generic("57014", "canceling statement due to user request")), resolve2());
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
  async function destroy(resolve2) {
    await Promise.all(connections.map((c) => c.terminate()));
    while (queries.length)
      queries.shift().reject(Errors.connection("CONNECTION_DESTROYED", options));
    resolve2();
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
  const env2 = process.env, o = (!a || typeof a === "string" ? b2 : a) || {}, { url, multihost } = parseUrl(a), query = [...url.searchParams].reduce((a2, [b3, c]) => (a2[b3] = c, a2), {}), host = o.hostname || o.host || multihost || url.hostname || env2.PGHOST || "localhost", port = o.port || url.port || env2.PGPORT || 5432, user = o.user || o.username || url.username || env2.PGUSERNAME || env2.PGUSER || osUsername();
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
    database: o.database || o.db || (url.pathname || "").slice(1) || env2.PGDATABASE || user,
    user,
    pass: o.pass || o.password || url.password || env2.PGPASSWORD || "",
    ...Object.entries(defaults).reduce(
      (acc, [k, d]) => {
        const value = k in o ? o[k] : k in query ? query[k] === "disable" || query[k] === "false" ? false : query[k] : env2["PG" + k.toUpperCase()] || d;
        acc[k] = typeof value === "string" && ints.includes(k) ? +value : value;
        return acc;
      },
      {}
    ),
    connection: {
      application_name: env2.PGAPPNAME || "postgres.js",
      ...o.connection,
      ...Object.entries(query).reduce((acc, [k, v]) => (k in defaults || (acc[k] = v), acc), {})
    },
    types: o.types || {},
    target_session_attrs: tsa(o, url, env2),
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
function tsa(o, url, env2) {
  const x = o.target_session_attrs || url.searchParams.get("target_session_attrs") || env2.PGTARGETSESSIONATTRS;
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
function parseUrl(url) {
  if (!url || typeof url !== "string")
    return { url: { searchParams: /* @__PURE__ */ new Map() } };
  let host = url;
  host = host.slice(host.indexOf("://") + 3).split(/[?/]/)[0];
  host = decodeURIComponent(host.slice(host.indexOf("@") + 1));
  const urlObj = new URL(url.replace(host, host.split(",")[0]));
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
function createDb(url, opts = {}) {
  return src_default(url, {
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
    const applied2 = new Set(rows.map((r) => r.version));
    for (const file of listFiles(dir)) {
      if (applied2.has(file)) continue;
      await tx.unsafe(readFileSync(`${dir}/${file}`, "utf8"));
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      done.push(file);
    }
  });
  return done;
}

// apps/server/src/app.ts
import { randomUUID as randomUUID2 } from "node:crypto";

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
var Router = class {
  routes = [];
  add(method, path, ...handlers) {
    this.routes.push({ method, parts: path.split("/").filter(Boolean), handlers });
    return this;
  }
  get(path, ...h) {
    return this.add("GET", path, ...h);
  }
  post(path, ...h) {
    return this.add("POST", path, ...h);
  }
  patch(path, ...h) {
    return this.add("PATCH", path, ...h);
  }
  delete(path, ...h) {
    return this.add("DELETE", path, ...h);
  }
  match(method, path) {
    const segs = path.split("/").filter(Boolean);
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (r.method !== method && !(method === "HEAD" && r.method === "GET")) {
        methodMismatch = true;
        continue;
      }
      return { route: r, params };
    }
    if (methodMismatch) throw new HttpError(405, "method_not_allowed", "Method not allowed");
    return null;
  }
  /** Returns true when a route handled the request. */
  async handle(ctx) {
    const m = this.match(ctx.method, ctx.path);
    if (!m) return false;
    ctx.params = m.params;
    for (const h of m.route.handlers) {
      await h(ctx);
      if (ctx.res.writableEnded) break;
    }
    if (!ctx.res.writableEnded) ctx.json(204, null);
    return true;
  }
};
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}
function serializeCookie(name, value, opts) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? "/"}`;
  if (opts.maxAge !== void 0) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.httpOnly !== false) s += "; HttpOnly";
  if (opts.secure) s += "; Secure";
  s += `; SameSite=${opts.sameSite ?? "Strict"}`;
  return s;
}
async function readBody(req, limit) {
  const declared = Number(req.headers["content-length"] ?? "0");
  if (declared > limit) throw new HttpError(413, "payload_too_large", "Payload too large");
  const chunks = [];
  let size2 = 0;
  for await (const chunk of req) {
    size2 += chunk.length;
    if (size2 > limit) throw new HttpError(413, "payload_too_large", "Payload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function createCtx(req, res, opts) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const fwd = opts.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  const ip = fwd || req.socket.remoteAddress || "unknown";
  const ctx = {
    req,
    res,
    method: (req.method ?? "GET").toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    params: {},
    ip,
    cookies: parseCookies(req.headers.cookie),
    state: {},
    requestId: opts.requestId,
    async body(schema, limitBytes = 64 * 1024) {
      const ct = String(req.headers["content-type"] ?? "");
      if (!ct.includes("application/json")) throw new HttpError(415, "unsupported_media_type", "Expected application/json");
      const raw = await readBody(req, limitBytes);
      let data;
      try {
        data = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      } catch {
        throw new HttpError(400, "bad_json", "Malformed JSON");
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const msg = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
        throw new HttpError(400, "validation_error", msg);
      }
      return parsed.data;
    },
    json(status, data, headers = {}) {
      if (res.writableEnded) return;
      const body = status === 204 ? "" : JSON.stringify(data);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
      res.end(body);
    },
    send(status, body, contentType, headers = {}) {
      if (res.writableEnded) return;
      res.writeHead(status, { "content-type": contentType, ...headers });
      res.end(body);
    }
  };
  return ctx;
}

// apps/server/src/http/static.ts
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};
function securityHeaders(isHtml) {
  const h = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "cross-origin-opener-policy": "same-origin-allow-popups"
  };
  if (isHtml) {
    h["content-security-policy"] = [
      "default-src 'self'",
      "script-src 'self' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ");
  }
  return h;
}
function serveStatic(root) {
  const base2 = resolve(root);
  return (ctx) => {
    if (ctx.method !== "GET" && ctx.method !== "HEAD") return false;
    let rel = decodeURIComponent(ctx.path);
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(base2, rel));
    if (!file.startsWith(base2 + sep) && file !== base2) return false;
    let target = file;
    let st;
    try {
      st = statSync(target);
      if (st.isDirectory()) {
        target = join(target, "index.html");
        st = statSync(target);
      }
    } catch {
      if (extname(rel)) return false;
      target = join(base2, rel.startsWith("/admin") ? "admin.html" : "index.html");
      try {
        st = statSync(target);
      } catch {
        return false;
      }
    }
    const ext = extname(target).toLowerCase();
    const type = TYPES[ext] ?? "application/octet-stream";
    const immutable = /-[A-Z0-9]{8}\.(js|css|woff2?|png)$/.test(target) || /[?&]v=[0-9a-f]{6,}/.test(ctx.req.url ?? "");
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const isAdmin = target.endsWith(`${sep}admin.html`);
    const headers = {
      "content-type": type,
      "cache-control": ext === ".html" ? isAdmin ? "no-store" : "no-cache" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=300, must-revalidate",
      etag,
      ...securityHeaders(ext === ".html")
    };
    if (isAdmin) {
      headers["content-security-policy"] = headers["content-security-policy"].replace(/frame-ancestors [^;]+/, "frame-ancestors 'none'");
      headers["x-frame-options"] = "DENY";
    }
    if (ctx.req.headers["if-none-match"] === etag) {
      ctx.res.writeHead(304, headers);
      ctx.res.end();
      return true;
    }
    headers["content-length"] = String(st.size);
    ctx.res.writeHead(200, headers);
    if (ctx.method === "HEAD") {
      ctx.res.end();
      return true;
    }
    createReadStream(target).pipe(ctx.res);
    return true;
  };
}

// packages/shared/src/constants/game.ts
var TICK_RATE = 60;
var TICK_MS = 1e3 / TICK_RATE;
var TICK_DT = 1 / TICK_RATE;
var SNAPSHOT_EVERY_TICKS = 2;
var PLAYER_RADIUS = 10;
var MAX_HP = 100;
var RUN_SPEED = 140;
var WALK_SPEED = 72;
var ACCELERATION = 1400;
var DECELERATION = 1900;
var MAX_REWIND_MS = 250;
var HISTORY_MS = 600;
var PICKUP_RADIUS = 18;
var DROPPED_WEAPON_TTL_MS = 2e4;
var POS_SCALE = 4;
var VEL_SCALE = 8;
var MOVE_AXIS_MAX = 127;
var INPUT_BUCKET_MAX = 12;
var INPUT_QUEUE_MAX = 40;
var MAX_INPUTS_PER_TICK = 3;
var MAX_INPUTS_PER_MESSAGE = 8;
var MAX_NAME_LENGTH = 24;

// packages/shared/src/game-rules/characters.ts
var CHARACTER_IDS = ["petya", "valuta", "uchastkovy", "mihalych"];
var CHARACTER_BASE_STATS = Object.freeze({ maxHp: 100, speed: 1, radius: 10 });

// packages/shared/src/game-rules/weapons.ts
var WEAPON_IDS = ["pistol", "montirovka", "obrez", "avtomat"];
var base = {
  pellets: 1,
  falloffStart: 9999,
  minDamageFactor: 1,
  spreadPerShot: 0,
  spreadMax: 0,
  spreadRecovery: 0,
  meleeArc: 0,
  meleeRange: 0,
  reserveOnPickup: 0
};
var WEAPONS = {
  pistol: {
    ...base,
    id: "pistol",
    index: 0,
    name: "\u041F\u0438\u0441\u0442\u043E\u043B\u0435\u0442",
    slot: 1,
    kind: "hitscan",
    damage: 34,
    fireIntervalMs: 290,
    automatic: true,
    range: 520,
    falloffStart: 320,
    minDamageFactor: 0.75,
    spread: 0.028,
    magazine: 8,
    reserveMax: -1,
    reloadMs: 1100,
    muzzle: { forward: 19, side: 2 },
    shake: 0.15,
    sound: "pistol"
  },
  montirovka: {
    ...base,
    id: "montirovka",
    index: 1,
    name: "\u041C\u043E\u043D\u0442\u0438\u0440\u043E\u0432\u043A\u0430",
    slot: 2,
    kind: "melee",
    damage: 55,
    fireIntervalMs: 460,
    automatic: true,
    range: 36,
    spread: 0,
    magazine: 0,
    reserveMax: 0,
    reloadMs: 0,
    meleeArc: 115 * Math.PI / 180,
    meleeRange: 36,
    muzzle: { forward: 22, side: 6 },
    shake: 0.2,
    sound: "swing"
  },
  obrez: {
    ...base,
    id: "obrez",
    index: 2,
    name: "\u041E\u0431\u0440\u0435\u0437",
    slot: 3,
    kind: "hitscan",
    damage: 15,
    pellets: 7,
    fireIntervalMs: 620,
    automatic: true,
    range: 270,
    falloffStart: 70,
    minDamageFactor: 0.3,
    spread: 0.19,
    magazine: 2,
    reserveMax: 16,
    reserveOnPickup: 10,
    reloadMs: 1500,
    muzzle: { forward: 23, side: 2 },
    shake: 0.55,
    sound: "obrez"
  },
  avtomat: {
    ...base,
    id: "avtomat",
    index: 3,
    name: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442",
    slot: 3,
    kind: "hitscan",
    damage: 17,
    fireIntervalMs: 100,
    automatic: true,
    range: 620,
    falloffStart: 380,
    minDamageFactor: 0.7,
    spread: 0.03,
    spreadPerShot: 0.012,
    spreadMax: 0.12,
    spreadRecovery: 0.3,
    magazine: 30,
    reserveMax: 90,
    reserveOnPickup: 60,
    reloadMs: 1700,
    muzzle: { forward: 27, side: 2 },
    shake: 0.22,
    sound: "avtomat"
  }
};
var WEAPON_BY_INDEX = WEAPON_IDS.slice().sort(
  (a, b2) => WEAPONS[a].index - WEAPONS[b2].index
);
function isHeavy(id) {
  return id === "obrez" || id === "avtomat";
}
function damageFalloff(w, d) {
  if (d <= w.falloffStart) return 1;
  if (d >= w.range) return w.minDamageFactor;
  const t = (d - w.falloffStart) / (w.range - w.falloffStart);
  return 1 + (w.minDamageFactor - 1) * t;
}

// packages/shared/src/game-rules/match.ts
var MATCH_PHASES = ["waiting", "ready", "countdown", "active", "finished", "closed"];
var SCORING = Object.freeze({
  killPoints: 2,
  assistPoints: 1,
  assistWindowMs: 6e3,
  assistMinDamage: 20
});
var DEFAULT_MATCH_CONFIG = {
  minPlayers: 2,
  maxPlayers: 6,
  durationMs: 4 * 6e4,
  /** Points: an elimination is 2, an assist 1 (≈25 eliminations). */
  scoreLimit: 50,
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
  placement: [100, 50, 25],
  playedWithFriends: 20,
  maxPerMatch: 400
});
var LEVEL_CAP = 99;
function levelStepCost(level) {
  return 150 + 50 * (level - 1);
}
function levelForXp(xp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < LEVEL_CAP && remaining >= levelStepCost(level)) {
    remaining -= levelStepCost(level);
    level++;
  }
  return { level, intoLevel: remaining, nextLevelCost: level >= LEVEL_CAP ? 0 : levelStepCost(level) };
}
function isWin(p) {
  return p.completed && p.place === 1 && !p.sharedPlace && p.playersAtEnd >= 2;
}
function rankPlaces(sorted) {
  const places = [];
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    places.push(prev && prev.score === s.score && prev.kills === s.kills && prev.deaths === s.deaths ? places[i - 1] : i + 1);
  });
  return places;
}
function xpForMatch(p) {
  if (!p.completed) return 0;
  let xp = XP_RULES.completion + XP_RULES.perKill * p.kills + XP_RULES.perAssist * (p.assists ?? 0);
  if (p.playersAtEnd >= 2) {
    const bonus = XP_RULES.placement[p.place - 1];
    if (bonus && (p.place === 1 || p.playersAtEnd >= p.place + 1)) xp += bonus;
  }
  if (p.withFriends) xp += XP_RULES.playedWithFriends;
  return Math.min(xp, XP_RULES.maxPerMatch);
}
var ACHIEVEMENT_IDS = [
  "first_match",
  "first_win",
  "ten_matches",
  "win_streak",
  "multi_kill",
  "played_with_friends"
];
var WIN_STREAK_TARGET = 3;
var MULTI_KILL_TARGET = 5;
var ACHIEVEMENTS = {
  first_match: { id: "first_match", title: "\u041F\u0435\u0440\u0432\u043E\u0435 \u0434\u0435\u043B\u043E", description: "\u0414\u043E\u0438\u0433\u0440\u0430\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u0439 \u043C\u0430\u0442\u0447.", xpReward: 25 },
  first_win: { id: "first_win", title: "\u0410\u0432\u0442\u043E\u0440\u0438\u0442\u0435\u0442", description: "\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u044C \u0432 \u043C\u0430\u0442\u0447\u0435.", xpReward: 50 },
  ten_matches: { id: "ten_matches", title: "\u0421\u0432\u043E\u0439 \u0447\u0435\u043B\u043E\u0432\u0435\u043A", description: "\u0414\u043E\u0438\u0433\u0440\u0430\u0442\u044C 10 \u043C\u0430\u0442\u0447\u0435\u0439.", xpReward: 75 },
  win_streak: {
    id: "win_streak",
    title: "\u0414\u0435\u0440\u0436\u0438\u0442 \u0440\u0430\u0439\u043E\u043D",
    description: `\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u044C ${WIN_STREAK_TARGET} \u043C\u0430\u0442\u0447\u0430 \u043F\u043E\u0434\u0440\u044F\u0434.`,
    xpReward: 100
  },
  multi_kill: {
    id: "multi_kill",
    title: "\u0420\u0430\u0437\u0431\u043E\u0440\u043A\u0430",
    description: `${MULTI_KILL_TARGET} \u0443\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u0438\u0439 \u0437\u0430 \u043E\u0434\u0438\u043D \u043C\u0430\u0442\u0447.`,
    xpReward: 50
  },
  played_with_friends: {
    id: "played_with_friends",
    title: "\u0421\u0432\u043E\u0438 \u043B\u044E\u0434\u0438",
    description: "\u0421\u044B\u0433\u0440\u0430\u0442\u044C \u043C\u0430\u0442\u0447 \u0441 \u0434\u0440\u0443\u0437\u044C\u044F\u043C\u0438 \u043F\u043E \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044E.",
    xpReward: 25
  }
};
function evaluateAchievements(after, match, owned) {
  const out = [];
  const add = (id, cond) => {
    if (cond && !owned.has(id)) out.push(id);
  };
  add("first_match", match.completed && after.matchesCompleted >= 1);
  add("first_win", isWin(match));
  add("ten_matches", after.matchesCompleted >= 10);
  add("win_streak", after.currentWinStreak >= WIN_STREAK_TARGET);
  add("multi_kill", match.kills >= MULTI_KILL_TARGET);
  add("played_with_friends", match.completed && match.withFriends);
  return out;
}
function applyMatchProgress(prev, perf, owned) {
  const won = isWin(perf);
  const lost = perf.completed && !won && perf.playersAtEnd >= 2;
  const streak = won ? prev.currentWinStreak + 1 : perf.completed && perf.playersAtEnd < 2 ? prev.currentWinStreak : 0;
  const after = { matchesCompleted: prev.matchesCompleted + (perf.completed ? 1 : 0), wins: prev.wins + (won ? 1 : 0), currentWinStreak: streak };
  const unlocked = evaluateAchievements(after, perf, owned);
  const xpGained = xpForMatch(perf) + unlocked.reduce((sum, a) => sum + ACHIEVEMENTS[a].xpReward, 0);
  const totalXp = prev.xp + xpGained;
  const level = levelForXp(totalXp).level;
  return { won, lost, streak, unlocked, xpGained, totalXp, level, leveledUp: level > prev.level };
}

// packages/shared/src/maps/builder.ts
var MapBuilder = class {
  def;
  constructor(id, name, subtitle, description, width, height, baseFloor) {
    this.def = {
      id,
      name,
      subtitle,
      description,
      width,
      height,
      baseFloor,
      floors: [],
      walls: [],
      props: [],
      decals: [],
      lights: [],
      overhead: [],
      spawns: [],
      pickups: [],
      supplyPoints: [],
      ambient: { color: 2766160, level: 0.55 },
      minimapFloor: "#3a3632"
    };
  }
  ambient(color, level) {
    this.def.ambient = { color, level };
    return this;
  }
  minimap(color) {
    this.def.minimapFloor = color;
    return this;
  }
  floor(type, x, y, w, h) {
    this.def.floors.push({ type, x, y, w, h });
    return this;
  }
  wall(style, x, y, w, h, tag) {
    const r = { style, x, y, w, h };
    if (tag) r.tag = tag;
    this.def.walls.push(r);
    return this;
  }
  /** Horizontal wall from x0 to x1 at y with thickness t, with gaps [start, end) in absolute x. */
  hwall(style, x0, x1, y, t, gaps = []) {
    for (const [a, b2] of splitByGaps(x0, x1, gaps)) this.wall(style, a, y, b2 - a, t);
    return this;
  }
  vwall(style, x, y0, y1, t, gaps = []) {
    for (const [a, b2] of splitByGaps(y0, y1, gaps)) this.wall(style, x, a, t, b2 - a);
    return this;
  }
  /** Closed room outline (outer bounds x,y,w,h) with wall thickness t and door gaps. */
  room(style, x, y, w, h, t, doors = [], floor) {
    if (floor) this.floor(floor, x + t, y + t, w - 2 * t, h - 2 * t);
    const gaps = (side, origin) => doors.filter((d) => d.side === side).map((d) => [origin + d.at, origin + d.at + d.width]);
    this.hwall(style, x, x + w, y, t, gaps("n", x));
    this.hwall(style, x, x + w, y + h - t, t, gaps("s", x));
    this.vwall(style, x, y + t, y + h - t, t, gaps("w", y));
    this.vwall(style, x + w - t, y + t, y + h - t, t, gaps("e", y));
    return this;
  }
  prop(type, x, y, rot = 0, variant) {
    const p = { type, x, y, rot };
    if (variant !== void 0) p.variant = variant;
    this.def.props.push(p);
    return this;
  }
  /** Places `count` props in a line starting at x,y stepping by dx,dy. */
  row(type, x, y, count, dx, dy, rot = 0, variantSeed = 0) {
    for (let i = 0; i < count; i++) this.prop(type, x + dx * i, y + dy * i, rot, (variantSeed + i) % 4);
    return this;
  }
  decal(d) {
    this.def.decals.push(d);
    return this;
  }
  light(x, y, radius, color, intensity, extra = {}) {
    this.def.lights.push({ x, y, radius, color, intensity, fixture: "lamp", flicker: "none", ...extra });
    return this;
  }
  overhead(o) {
    this.def.overhead.push(o);
    return this;
  }
  tree(x, y, size2 = 40, seed = 0) {
    this.prop("tree_trunk", x, y);
    this.overhead({ kind: "tree", x: x - size2 / 2, y: y - size2 / 2, w: size2, h: size2, seed });
    return this;
  }
  spawn(x, y, angleDeg) {
    this.def.spawns.push({ x, y, angle: angleDeg * Math.PI / 180 });
    return this;
  }
  pickup(weapon, x, y, respawnMs = 18e3) {
    this.def.pickups.push({ weapon, x, y, respawnMs });
    return this;
  }
  /** A spot where a «дефицит» supply crate may appear during the match. */
  supply(x, y) {
    this.def.supplyPoints.push({ x, y });
    return this;
  }
  build() {
    return this.def;
  }
};
function splitByGaps(a0, a1, gaps) {
  const sorted = gaps.slice().sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = a0;
  for (const [g0, g1] of sorted) {
    if (g0 > cur) out.push([cur, Math.min(g0, a1)]);
    cur = Math.max(cur, g1);
  }
  if (cur < a1) out.push([cur, a1]);
  return out.filter(([p, q]) => q - p > 0.5);
}

// packages/shared/src/maps/factory.ts
function buildFactoryMap() {
  const W = 1440;
  const H = 1024;
  const SODIUM = 16756810;
  const WARM = 16764810;
  const COLD = 13625087;
  const RED = 16726570;
  const b2 = new MapBuilder(
    "factory",
    "\u0417\u0430\u0432\u043E\u0434\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0445\u043E\u0434\u043D\u0430\u044F",
    "\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u043C \u043A\u0440\u0443\u0433\u043B\u043E\u0441\u0443\u0442\u043E\u0447\u043D\u043E",
    "\u041F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0435 \u043F\u043E\u043C\u0435\u0449\u0435\u043D\u0438\u044F, \u043C\u0435\u0442\u0430\u043B\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438, \u043A\u043E\u0440\u0438\u0434\u043E\u0440\u044B \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043A\u0438. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u0445 \u0442\u043E\u0447\u0435\u043A.",
    W,
    H,
    "concrete_slab"
  ).ambient(1844278, 0.46).minimap("#3b3733");
  b2.floor("concrete_slab", 16, 252, 684, 290).floor("metal_plate", 700, 16, 724, 352).floor("concrete_dirty", 700, 380, 724, 160).floor("asphalt", 16, 552, 584, 456).floor("asphalt_cracked", 600, 600, 380, 408).floor("concrete_dirty", 992, 612, 432, 396).floor("concrete_dirty", 820, 552, 604, 48).floor("gravel", 110, 536, 60, 30);
  b2.hwall("brick", 0, W, 0, 16).hwall("brick", 0, W, H - 16, 16).vwall("brick", 0, 16, H - 16, 16).vwall("brick", W - 16, 16, H - 16, 16);
  b2.floor("linoleum_checker", 16, 16, 372, 232).hwall("brick", 16, 400, 248, 12, [
    [70, 118],
    [280, 330]
  ]).vwall("brick", 388, 16, 248, 12, [[150, 200]]).vwall("concrete", 196, 16, 248, 10, [[110, 160]]);
  b2.prop("desk", 100, 70).prop("chair", 100, 88).prop("file_cabinet", 26, 50, 90).prop("file_cabinet", 26, 74, 90).prop("plant_pot", 176, 32).prop("desk", 130, 196).prop("chair", 130, 212).prop("desk", 252, 70).prop("chair", 252, 88).prop("desk", 332, 70).prop("chair", 332, 88).prop("desk", 252, 150).prop("chair", 252, 168).prop("file_cabinet", 300, 26).prop("file_cabinet", 320, 26).prop("plant_pot", 370, 232);
  b2.light(106, 130, 150, WARM, 0.95).light(297, 130, 150, WARM, 0.9);
  b2.pickup("obrez", 310, 206);
  b2.floor("concrete_painted", 400, 16, 288, 212).hwall("concrete", 400, 700, 228, 12, [
    [470, 520],
    [600, 648]
  ]).vwall("brick", 688, 16, 380, 12, [
    [70, 120],
    [290, 340]
  ]);
  b2.row("locker_row", 440, 24, 3, 54, 0).prop("locker_row", 470, 120).prop("locker_row", 470, 132, 180).prop("locker_row", 586, 120).prop("locker_row", 586, 132, 180).prop("bench", 470, 80).prop("bench", 586, 80).prop("bench", 470, 180).prop("bench", 586, 180);
  b2.light(530, 108, 150, COLD, 0.8, { flicker: "soft" });
  b2.spawn(650, 52, 135);
  b2.hwall("brick", 700, W - 16, 368, 12, [
    [860, 956],
    [1240, 1296]
  ]);
  b2.prop("machine_lathe", 780, 80).prop("machine_lathe", 780, 140).prop("machine_lathe", 780, 200).prop("machine_press", 900, 70).prop("machine_press", 962, 70).prop("machine_press", 1024, 70).prop("conveyor", 1e3, 190).prop("conveyor", 1088, 190).prop("tank_horizontal", 1200, 80, 90).prop("tank_vertical", 1340, 64).prop("tank_vertical", 1388, 108).prop("tank_vertical", 1340, 140).prop("crate_stack", 1256, 300).prop("crate_stack", 1290, 300).prop("crate_wood", 1180, 322).prop("crate_wood", 1197, 322).prop("crate_wood", 1180, 339).prop("cable_reel", 880, 300).prop("cable_reel", 902, 318).prop("forklift", 1100, 296).prop("electric_box", 722, 260, 90);
  b2.decal({ kind: "hazard", x: 952, y: 172, w: 184, h: 6 }).decal({ kind: "hazard", x: 952, y: 204, w: 184, h: 6 }).decal({ kind: "line", x: 840, y: 24, w: 4, h: 336, color: "#c9a227", alpha: 0.5 }).decal({ kind: "line", x: 1140, y: 24, w: 4, h: 336, color: "#c9a227", alpha: 0.5 }).decal({ kind: "text", x: 1e3, y: 262, text: "\u0421\u041B\u0410\u0412\u0410 \u0422\u0420\u0423\u0414\u0423!", size: 26, color: "#c8312a", alpha: 0.6 }).decal({ kind: "star", x: 870, y: 262, r: 12, color: "#c8312a", alpha: 0.6 }).decal({ kind: "star", x: 1130, y: 262, r: 12, color: "#c8312a", alpha: 0.6 }).decal({ kind: "stain", x: 1120, y: 250, r: 22, color: "#14110e", alpha: 0.45, seed: 3 }).decal({ kind: "text", x: 1060, y: 352, text: "\u0411\u0415\u0420\u0415\u0413\u0418 \u041E\u0411\u041E\u0420\u0423\u0414\u041E\u0412\u0410\u041D\u0418\u0415 \u2014 \u042D\u0422\u041E \u041D\u0410\u0428\u0415 \u0411\u0423\u0414\u0423\u0429\u0415\u0415!", size: 8, color: "#d9c7a3", alpha: 0.45 }).decal({ kind: "stain", x: 790, y: 150, r: 18, color: "#0d0c0a", alpha: 0.5, seed: 21 });
  b2.overhead({ kind: "pipe", x: 700, y: 236, w: 724, h: 12 }).overhead({ kind: "pipe", x: 1150, y: 16, w: 12, h: 352 });
  b2.light(800, 110, 175, COLD, 0.85).light(1e3, 120, 175, COLD, 0.85, { flicker: "soft" }).light(1300, 210, 175, COLD, 0.8).light(908, 356, 70, RED, 0.9, { flicker: "broken", fixture: "neon" });
  b2.pickup("avtomat", 1060, 282);
  b2.spawn(1395, 345, -135);
  b2.prop("turbine", 330, 400).prop("sandbags", 520, 330).prop("sandbags", 566, 470, 90).prop("barrel_blue", 130, 300).prop("barrel_blue", 146, 312).prop("barrel_blue", 126, 322).prop("barrel_red", 600, 290).prop("barrel_red", 614, 304).prop("crate_wood", 220, 500).prop("crate_wood", 237, 500).prop("crate_wood", 220, 483).prop("crate_stack", 470, 500).prop("electric_box", 160, 266).prop("pallet", 640, 400).prop("lamp_post", 60, 500);
  b2.overhead({ kind: "pipe", x: 324, y: 260, w: 12, h: 104 });
  b2.decal({ kind: "stain", x: 280, y: 450, r: 30, color: "#12100d", alpha: 0.4, seed: 7 }).decal({ kind: "hazard", x: 280, y: 344, w: 100, h: 5, alpha: 0.7 }).decal({ kind: "text", x: 200, y: 522, text: "\u041D\u0410\u0428 \u0417\u0410\u0412\u041E\u0414 \u2014 \u041D\u0410\u0428\u0410 \u0413\u041E\u0420\u0414\u041E\u0421\u0422\u042C!", size: 11, color: "#d9c7a3", alpha: 0.45 }).decal({ kind: "line", x: 640, y: 456, w: 120, h: 34, color: "#9e2a22", alpha: 0.5 }).decal({ kind: "text", x: 700, y: 473, text: "\u0421\u0422\u041E\u0419! \u041F\u0420\u0415\u0414\u042A\u042F\u0412\u0418 \u041F\u0420\u041E\u041F\u0423\u0421\u041A", size: 8, color: "#e8dcc0", alpha: 0.65 });
  b2.light(180, 282, 190, SODIUM, 0.85, { fixture: "street" }).light(546, 420, 180, SODIUM, 0.8, { fixture: "street" });
  b2.spawn(40, 290, 0);
  b2.prop("forklift", 780, 460, 90).prop("barrel_red", 1040, 420).prop("barrel_red", 1056, 434).prop("barrel_red", 1040, 448).prop("barrel_rust", 1074, 418).prop("crate_stack", 1180, 470).prop("crate_stack", 1216, 470).prop("pallet", 1264, 500).prop("sandbags", 930, 486);
  b2.decal({ kind: "arrow", x: 908, y: 448, w: 150, h: 58, angle: -90, color: "#b3261e", text: "\u0412 \u0426\u0415\u0425", alpha: 0.8 }).decal({ kind: "text", x: 1268, y: 396, text: "\u0426\u0415\u0425 \u21163", size: 18, color: "#e8dcc0", alpha: 0.55 });
  b2.light(1e3, 400, 200, SODIUM, 0.85, { fixture: "street" }).light(1300, 456, 160, SODIUM, 0.7, { flicker: "soft" });
  b2.spawn(1395, 420, 180);
  b2.hwall("fence_concrete", 16, 600, 540, 12, [[110, 170]]).hwall("fence_concrete", 820, W - 16, 540, 12, [
    [860, 980],
    [1330, 1390]
  ]);
  b2.floor("concrete_painted", 612, 508, 196, 80).room("brick", 600, 496, 220, 104, 12, [
    { side: "n", at: 70, width: 60 },
    { side: "s", at: 70, width: 60 }
  ]).vwall("concrete", 760, 508, 588, 10, [[528, 568]]);
  b2.prop("turnstile", 640, 548, 90).prop("turnstile", 748, 548, 90).prop("desk", 789, 530, 90).prop("chair", 789, 560).prop("boom_barrier", 920, 546).prop("electric_box", 630, 576);
  b2.decal({ kind: "text", x: 710, y: 632, text: "\u041F\u0420\u041E\u0425\u041E\u0414\u041D\u0410\u042F", size: 22, color: "#e8dcc0", alpha: 0.7 }).decal({ kind: "star", x: 614, y: 632, r: 10, color: "#c8312a", alpha: 0.85 }).decal({ kind: "star", x: 806, y: 632, r: 10, color: "#c8312a", alpha: 0.85 }).decal({ kind: "hazard", x: 860, y: 536, w: 120, h: 6, alpha: 0.8 }).decal({ kind: "stain", x: 140, y: 548, r: 26, color: "#2b2722", alpha: 0.6, seed: 11 });
  b2.light(690, 548, 120, WARM, 0.95, { flicker: "broken" }).light(789, 548, 70, COLD, 0.7);
  b2.prop("container", 110, 690).prop("container", 230, 880, 90, 1).prop("truck", 420, 760).prop("crate_stack", 300, 640).prop("crate_stack", 336, 640).prop("crate_wood", 520, 950).prop("crate_wood", 537, 950).prop("crate_wood", 520, 933).prop("barrel_rust", 60, 960).prop("barrel_rust", 77, 972).prop("sandbags", 524, 650, 90).prop("tire_stack", 250, 980).prop("tire_stack", 270, 990).prop("pallet", 300, 700).prop("lamp_post", 200, 590);
  b2.decal({ kind: "line", x: 360, y: 600, w: 4, h: 260, color: "#d9c7a3", alpha: 0.35 }).decal({ kind: "line", x: 480, y: 600, w: 4, h: 260, color: "#d9c7a3", alpha: 0.35 }).decal({ kind: "stain", x: 420, y: 870, r: 24, color: "#0f0d0b", alpha: 0.5, seed: 5 });
  b2.light(200, 600, 200, SODIUM, 0.9, { fixture: "street" }).light(480, 920, 180, SODIUM, 0.8, { fixture: "street" }).light(330, 780, 160, SODIUM, 0.75, { fixture: "street", flicker: "soft" }).light(110, 880, 140, WARM, 0.7);
  b2.decal({ kind: "text", x: 420, y: 612, text: "\u041F\u041E\u0413\u0420\u0423\u0417\u041A\u0410", size: 16, color: "#d9c7a3", alpha: 0.4 }).decal({ kind: "hazard", x: 360, y: 860, w: 124, h: 6, alpha: 0.7 }).decal({ kind: "stain", x: 150, y: 800, r: 26, color: "#0f0d0b", alpha: 0.45, seed: 31 });
  b2.prop("pallet", 560, 760).prop("pallet", 560, 784, 90).prop("crate_green", 90, 780);
  b2.pickup("avtomat", 300, 784);
  b2.spawn(40, 985, -45);
  b2.prop("car_zhiguli", 660, 760, 0, 0).prop("car_volga", 900, 880, 90, 1).prop("bus_paz", 770, 930, 90).prop("lamp_post", 640, 660).prop("lamp_post", 920, 660).prop("trash_container", 870, 720).prop("phone_booth", 944, 640);
  b2.decal({ kind: "line", x: 620, y: 700, w: 80, h: 3, color: "#d9c7a3", alpha: 0.4 }).decal({ kind: "line", x: 620, y: 820, w: 80, h: 3, color: "#d9c7a3", alpha: 0.4 });
  b2.light(700, 700, 200, SODIUM, 0.85, { fixture: "street" }).light(880, 800, 190, SODIUM, 0.8, { fixture: "street" });
  b2.spawn(620, 985, -90);
  b2.vwall("brick", 980, 600, H - 16, 12, [[720, 780]]).hwall("brick", 980, W - 16, 600, 12, [[1100, 1160]]);
  b2.prop("crate_stack", 1080, 700).prop("crate_stack", 1080, 732).prop("crate_stack", 1080, 764).prop("crate_stack", 1220, 700).prop("crate_stack", 1220, 732).prop("crate_stack", 1330, 700).prop("crate_stack", 1330, 764).prop("sandbags", 1150, 900).prop("barrel_blue", 1384, 640).prop("barrel_red", 1398, 656).prop("crate_green", 1260, 900).prop("crate_green", 1260, 916).prop("pallet", 1300, 960).prop("scrap_pile", 1040, 960);
  b2.light(1150, 780, 180, WARM, 0.85, { flicker: "soft" }).light(1340, 880, 150, WARM, 0.75).light(1040, 660, 130, WARM, 0.6, { flicker: "broken" });
  b2.decal({ kind: "text", x: 1190, y: 850, text: "\u0421\u041A\u041B\u0410\u0414 \u21162", size: 24, color: "#d9c7a3", alpha: 0.3 }).decal({ kind: "hazard", x: 1100, y: 616, w: 60, h: 6, alpha: 0.75 }).decal({ kind: "line", x: 1004, y: 690, w: 4, h: 300, color: "#c9a227", alpha: 0.4 }).decal({ kind: "line", x: 1396, y: 690, w: 4, h: 300, color: "#c9a227", alpha: 0.4 });
  b2.prop("pallet", 1160, 690).prop("pallet", 1390, 760, 90).prop("workbench", 1050, 880);
  b2.pickup("obrez", 1150, 764);
  b2.spawn(1395, 985, -135);
  b2.pickup("obrez", 680, 536, 16e3).pickup("avtomat", 1280, 52, 2e4).pickup("obrez", 52, 616, 16e3).pickup("avtomat", 920, 960, 2e4).pickup("avtomat", 384, 496, 2e4).pickup("obrez", 952, 568, 16e3);
  b2.supply(784, 288).supply(544, 744).supply(792, 752).supply(544, 272).supply(920, 112).supply(128, 96);
  return b2.build();
}

// packages/shared/src/maps/garages.ts
function buildGaragesMap() {
  const W = 1472;
  const H = 992;
  const SODIUM = 16756810;
  const WARM = 16764810;
  const b2 = new MapBuilder(
    "garages",
    "\u0413\u0430\u0440\u0430\u0436\u043D\u044B\u0439 \u043A\u043E\u043E\u043F\u0435\u0440\u0430\u0442\u0438\u0432",
    "\u0421\u0432\u043E\u0438 \u0433\u0430\u0440\u0430\u0436\u0438 \u2014 \u0441\u0432\u043E\u0438 \u0437\u0430\u043A\u043E\u043D\u044B",
    "\u0420\u044F\u0434\u044B \u0433\u0430\u0440\u0430\u0436\u0435\u0439, \u0443\u0437\u043A\u0438\u0435 \u043F\u0440\u043E\u0445\u043E\u0434\u044B, \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u043F\u0440\u043E\u0435\u0437\u0434\u044B. \u0411\u043B\u0438\u0436\u043D\u0438\u0435 \u0434\u0438\u0441\u0442\u0430\u043D\u0446\u0438\u0438, \u0437\u0430\u0441\u0430\u0434\u044B \u0438 \u0432\u043D\u0435\u0437\u0430\u043F\u043D\u044B\u0435 \u0432\u0441\u0442\u0440\u0435\u0447\u0438.",
    W,
    H,
    "asphalt_cracked"
  ).ambient(1712694, 0.44).minimap("#34322f");
  b2.floor("dirt", 16, 128, 304, 736).floor("asphalt_cracked", 320, 128, 960, 256).floor("asphalt_cracked", 320, 608, 960, 256).floor("gravel", 1280, 128, 176, 736).floor("dirt", 640, 384, 64, 224).floor("dirt", 960, 384, 64, 224);
  b2.hwall("fence_concrete", 0, W, 0, 16).hwall("fence_concrete", 0, W, H - 16, 16).vwall("fence_concrete", 0, 16, H - 16, 16).vwall("fence_concrete", W - 16, 16, H - 16, 16);
  for (let i = 0; i < 20; i++) {
    b2.prop("garage", 192 + i * 64, 72, 0, i * 7 % 5);
    b2.prop("garage", 192 + i * 64, 920, 180, (i * 3 + 1) % 5);
  }
  const middle = [
    [352, 5],
    [736, 4],
    [1056, 4]
  ];
  let n = 0;
  for (const [x0, count] of middle) {
    for (let i = 0; i < count; i++) {
      b2.prop("garage", x0 + i * 64, 440, 180, (n * 5 + 2) % 5);
      b2.prop("garage", x0 + i * 64, 552, 0, (n * 2 + 3) % 5);
      n++;
    }
  }
  b2.decal({ kind: "text", x: 512, y: 496, text: "\u0421\u0412\u041E\u0418 \u0413\u0410\u0420\u0410\u0416\u0418", size: 20, color: "#e8dcc0", alpha: 0.7, layer: "roof", font: "hand" }).decal({ kind: "text", x: 1152, y: 496, text: "\u0421\u0412\u041E\u0418 \u0417\u0410\u041A\u041E\u041D\u042B", size: 20, color: "#e8dcc0", alpha: 0.7, layer: "roof", font: "hand" });
  b2.floor("wood", 16, 450, 114, 100).hwall("corrugated", 16, 140, 440, 10).hwall("corrugated", 16, 140, 550, 10).vwall("corrugated", 130, 450, 550, 10, [[478, 522]]);
  b2.prop("desk", 60, 470).prop("chair", 60, 486).prop("file_cabinet", 110, 534, 0).prop("electric_box", 24, 520, 90);
  b2.light(70, 500, 110, WARM, 0.9, { flicker: "soft" });
  b2.decal({ kind: "text", x: 70, y: 610, text: "\u0412\u042A\u0415\u0417\u0414", size: 16, color: "#e8dcc0", alpha: 0.5 }).decal({ kind: "hazard", x: 20, y: 590, w: 120, h: 5, alpha: 0.6 });
  b2.prop("car_zhiguli", 420, 256, 90, 2).prop("workbench", 560, 146).prop("tire_stack", 600, 300).prop("tire_stack", 618, 314).prop("tire_stack", 600, 326).prop("container", 900, 256, 90, 2).prop("car_wreck", 1120, 300, 90).prop("trash_container", 250, 180).prop("barrel_rust", 700, 160).prop("barrel_rust", 717, 172).prop("scrap_pile", 1220, 160).prop("crate_wood", 770, 340).prop("crate_wood", 787, 340).prop("crate_wood", 770, 323).prop("lamp_post", 300, 262).prop("lamp_post", 1200, 262);
  b2.decal({ kind: "stain", x: 520, y: 220, r: 26, color: "#1b2633", alpha: 0.6, seed: 2 }).decal({ kind: "stain", x: 1e3, y: 180, r: 16, color: "#0e0c0a", alpha: 0.5, seed: 4 }).decal({ kind: "stain", x: 330, y: 150, r: 14, color: "#0e0c0a", alpha: 0.5, seed: 9 });
  b2.light(300, 256, 200, SODIUM, 0.85, { fixture: "street" }).light(760, 220, 160, SODIUM, 0.7, { flicker: "broken", fixture: "street" }).light(1200, 256, 200, SODIUM, 0.85, { fixture: "street" }).light(512, 138, 70, WARM, 0.8, { fixture: "lamp" }).light(1024, 138, 70, WARM, 0.8, { fixture: "lamp" });
  b2.pickup("avtomat", 1e3, 330);
  b2.prop("container", 520, 736, 90, 0).prop("car_volga", 860, 700, 90, 3).prop("car_zhiguli", 1100, 780, 90, 1).prop("workbench", 330, 846).prop("tire_stack", 700, 820).prop("tire_stack", 718, 832).prop("barrel_red", 1e3, 640).prop("barrel_blue", 1016, 652).prop("barrel_red", 1e3, 666).prop("scrap_pile", 240, 700).prop("crate_stack", 1230, 680).prop("lamp_post", 300, 730).prop("lamp_post", 1200, 730);
  b2.decal({ kind: "stain", x: 640, y: 760, r: 30, color: "#1b2633", alpha: 0.6, seed: 6 }).decal({ kind: "stain", x: 980, y: 840, r: 14, color: "#0e0c0a", alpha: 0.5, seed: 8 });
  b2.light(300, 736, 200, SODIUM, 0.85, { fixture: "street" }).light(760, 760, 170, SODIUM, 0.75, { fixture: "street", flicker: "soft" }).light(1200, 736, 200, SODIUM, 0.85, { fixture: "street" }).light(448, 856, 70, WARM, 0.8).light(1088, 856, 70, WARM, 0.8);
  b2.pickup("avtomat", 440, 660);
  b2.prop("barrel_rust", 652, 420).prop("crate_wood", 1010, 590);
  b2.light(672, 496, 90, WARM, 0.7, { flicker: "broken" }).light(992, 496, 90, WARM, 0.6);
  b2.pickup("obrez", 672, 520);
  b2.vwall("fence_chain", 1338, 128, 864, 4, [
    [300, 364],
    [600, 664]
  ]);
  b2.prop("container", 1404, 300, 0, 1).prop("container", 1404, 720, 0, 3).prop("scrap_pile", 1396, 500).prop("car_wreck", 1306, 230, 0).prop("tire_stack", 1300, 470).prop("cable_reel", 1306, 800);
  b2.light(1400, 500, 180, SODIUM, 0.75, { fixture: "street" });
  b2.pickup("obrez", 1400, 590);
  b2.spawn(200, 160, 0).spawn(1420, 160, 180).spawn(200, 830, 0).spawn(1420, 830, 180).spawn(992, 496, 90).spawn(60, 380, 45);
  b2.pickup("obrez", 600, 152, 16e3).pickup("avtomat", 856, 840, 2e4).pickup("obrez", 1144, 736, 16e3).pickup("avtomat", 408, 360, 2e4).pickup("obrez", 1256, 360, 16e3).pickup("avtomat", 52, 632, 2e4);
  b2.supply(248, 528).supply(624, 800).supply(824, 192).supply(1144, 192).supply(960, 680).supply(688, 320);
  return b2.build();
}

// packages/shared/src/maps/yard.ts
function buildYardMap() {
  const W = 1408;
  const H = 1088;
  const SODIUM = 16756810;
  const WARM = 16765590;
  const WINDOW = 16762743;
  const b2 = new MapBuilder(
    "yard",
    "\u0421\u043E\u0432\u0435\u0442\u0441\u043A\u0438\u0439 \u0434\u0432\u043E\u0440",
    "\u0417\u0434\u0435\u0441\u044C \u0432\u0441\u0451 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F",
    "\u041F\u0430\u043D\u0435\u043B\u044C\u043A\u0438, \u043F\u0440\u043E\u0445\u043E\u0434\u044B, \u0434\u0435\u0442\u0441\u043A\u0430\u044F \u043F\u043B\u043E\u0449\u0430\u0434\u043A\u0430, \u043B\u0430\u0432\u043E\u0447\u043A\u0438, \u043C\u0443\u0441\u043E\u0440\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B. \u0411\u0430\u043B\u0430\u043D\u0441 \u0434\u043B\u044F \u0431\u044B\u0441\u0442\u0440\u044B\u0445 \u0438 \u0434\u0438\u043D\u0430\u043C\u0438\u0447\u043D\u044B\u0445 \u043C\u0430\u0442\u0447\u0435\u0439.",
    W,
    H,
    "asphalt"
  ).ambient(1976896, 0.56).minimap("#3a3936");
  b2.floor("asphalt_cracked", 256, 256, 896, 576).floor("grass", 256, 256, 160, 120).floor("grass", 1e3, 680, 152, 152).floor("dirt", 300, 330, 300, 260).floor("sand", 378, 398, 44, 44).floor("grass", 980, 256, 172, 90).floor("grass", 256, 690, 140, 142).floor("gravel", 640, 96, 120, 160).floor("gravel", 520, 832, 120, 160).floor("gravel", 1152, 496, 160, 96);
  b2.hwall("fence_concrete", 0, W, 0, 16).hwall("fence_concrete", 0, W, H - 16, 16).vwall("fence_concrete", 0, 16, H - 16, 16).vwall("fence_concrete", W - 16, 16, H - 16, 16);
  b2.hwall("roof_flat", 176, 1232, 96, 160, [[640, 760]]).hwall("roof_flat", 176, 1232, 832, 160, [[520, 640]]).vwall("roof_flat", 96, 336, 752, 160).vwall("roof_flat", 1152, 336, 752, 160, [[496, 592]]);
  b2.overhead({ kind: "canopy", x: 640, y: 96, w: 120, h: 160 }).overhead({ kind: "canopy", x: 520, y: 832, w: 120, h: 160 }).overhead({ kind: "canopy", x: 1152, y: 496, w: 160, h: 96 });
  const entrances = [
    [360, 264, 0],
    [930, 264, 0],
    [330, 824, 0],
    [1e3, 824, 0],
    [264, 470, 90],
    [264, 660, 90],
    [1144, 618, 90]
  ];
  for (const [x, y, rot] of entrances) {
    b2.light(x, y, 90, WARM, 0.85, { fixture: "lamp", flicker: x === 1e3 ? "broken" : "none" });
    b2.decal({ kind: "line", x: rot === 0 ? x - 16 : x - 4, y: rot === 0 ? y - 4 : y - 16, w: rot === 0 ? 32 : 8, h: rot === 0 ? 8 : 32, color: "#2a2622", alpha: 0.9 });
  }
  b2.prop("bench", 410, 276).prop("bench", 980, 276).prop("bench", 380, 812).prop("bench", 1050, 812);
  const windows = [
    [480, 268],
    [820, 268],
    [1090, 268],
    [450, 820],
    [760, 820],
    [1120, 820],
    [268, 400],
    [268, 580],
    [1140, 700]
  ];
  for (const [x, y] of windows) b2.light(x, y, 70, WINDOW, 0.45, { fixture: "window" });
  b2.prop("sandbox", 400, 420).prop("swing", 520, 360).prop("slide", 330, 520).prop("carousel", 480, 520).prop("monkey_bars", 570, 470, 90);
  b2.prop("domino_table", 900, 420).prop("bench", 900, 398).prop("bench", 900, 442);
  b2.prop("trash_container", 1010, 292).prop("trash_container", 1048, 292);
  b2.decal({ kind: "stain", x: 1030, y: 316, r: 18, color: "#1a1712", alpha: 0.55, seed: 12 });
  b2.prop("garage_shell", 1120, 400, 0, 1).prop("garage_shell", 1120, 690, 0, 2);
  b2.prop("car_zhiguli", 760, 792, 90, 0).prop("car_volga", 900, 792, 90, 2).prop("car_wreck", 400, 760, 0);
  b2.tree(320, 300, 76, 1).tree(700, 330, 84, 2).tree(1080, 360, 70, 3).tree(300, 770, 78, 4).tree(1090, 750, 84, 5).tree(760, 640, 72, 6);
  b2.overhead({ kind: "bush", x: 600, y: 268, w: 70, h: 26, seed: 1 }).overhead({ kind: "bush", x: 268, y: 600, w: 26, h: 60, seed: 2 }).overhead({ kind: "bush", x: 1110, y: 560, w: 30, h: 70, seed: 3 }).overhead({ kind: "bush", x: 820, y: 800, w: 60, h: 24, seed: 4 });
  b2.overhead({ kind: "wires", x: 820, y: 560, w: 200, h: 40, seed: 7 });
  b2.prop("lamp_post", 640, 300).prop("lamp_post", 860, 560).prop("lamp_post", 450, 700);
  b2.decal({ kind: "hopscotch", x: 640, y: 720, angle: 0 }).decal({ kind: "text", x: 700, y: 600, text: "\u041D\u0410\u0428 \u0414\u0412\u041E\u0420 \u2014 \u041D\u0410\u0428\u0418 \u041F\u0420\u0410\u0412\u0418\u041B\u0410", size: 18, color: "#e8dcc0", alpha: 0.6, font: "hand" }).decal({ kind: "manhole", x: 980, y: 520 }).decal({ kind: "manhole", x: 180, y: 60 });
  b2.light(640, 300, 200, SODIUM, 0.85, { fixture: "street" }).light(860, 560, 200, SODIUM, 0.85, { fixture: "street" }).light(450, 700, 190, SODIUM, 0.8, { fixture: "street", flicker: "soft" });
  b2.pickup("avtomat", 720, 480);
  b2.prop("kiosk", 1320, 1040, 0).prop("phone_booth", 52, 600).prop("water_pump", 1370, 260).prop("lamp_post", 56, 56).prop("lamp_post", 1352, 56).prop("lamp_post", 56, 1032).prop("lamp_post", 1352, 1032).prop("car_zhiguli", 52, 300, 0, 3).prop("car_volga", 1356, 820, 0, 1).prop("trash_container", 900, 48).prop("bench", 1e3, 1048).prop("tire_stack", 140, 1050);
  b2.tree(1360, 140, 60, 7).tree(48, 760, 60, 8).tree(1e3, 40, 56, 9);
  b2.light(56, 56, 210, SODIUM, 0.8, { fixture: "street" }).light(1352, 56, 210, SODIUM, 0.8, { fixture: "street" }).light(56, 1032, 210, SODIUM, 0.8, { fixture: "street" }).light(1352, 1032, 210, SODIUM, 0.8, { fixture: "street" }).light(700, 48, 160, SODIUM, 0.7, { fixture: "street", flicker: "broken" }).light(1360, 544, 170, SODIUM, 0.7, { fixture: "street" }).light(48, 544, 170, SODIUM, 0.7, { fixture: "street" }).light(580, 1050, 160, SODIUM, 0.75, { fixture: "street" });
  b2.pickup("avtomat", 1360, 600).pickup("obrez", 48, 470).pickup("obrez", 580, 1040);
  b2.spawn(290, 290, 45).spawn(1118, 296, 135).spawn(296, 798, -45).spawn(1100, 808, -135).spawn(44, 44, 45).spawn(1364, 44, 135).spawn(44, 1044, -45).spawn(1364, 1044, -135);
  b2.pickup("obrez", 664, 52, 16e3).pickup("avtomat", 592, 744, 2e4).pickup("obrez", 992, 544, 16e3).pickup("avtomat", 400, 544, 2e4).pickup("obrez", 552, 280, 16e3).pickup("avtomat", 52, 728, 2e4);
  b2.supply(848, 752).supply(888, 320).supply(1328, 256).supply(1312, 840).supply(88, 248).supply(728, 232);
  return b2.build();
}

// packages/shared/src/maps/props.ts
var P = (w, h, shape, layer, blocksShot, label, extra = {}) => ({ w, h, shape, layer, blocksMove: shape !== "none", blocksShot: shape !== "none" && blocksShot, label, ...extra });
var PROP_DEFS = {
  // generic industrial
  crate_wood: P(16, 16, "rect", "low", true, "\u042F\u0449\u0438\u043A"),
  crate_stack: P(32, 32, "rect", "high", true, "\u0428\u0442\u0430\u0431\u0435\u043B\u044C \u044F\u0449\u0438\u043A\u043E\u0432"),
  crate_green: P(20, 14, "rect", "low", true, "\u0410\u0440\u043C\u0435\u0439\u0441\u043A\u0438\u0439 \u044F\u0449\u0438\u043A"),
  barrel_red: P(14, 14, "circle", "low", true, "\u0411\u043E\u0447\u043A\u0430", { radius: 7 }),
  barrel_blue: P(14, 14, "circle", "low", true, "\u0411\u043E\u0447\u043A\u0430", { radius: 7 }),
  barrel_rust: P(14, 14, "circle", "low", true, "\u0420\u0436\u0430\u0432\u0430\u044F \u0431\u043E\u0447\u043A\u0430", { radius: 7 }),
  pallet: P(26, 20, "none", "floor", false, "\u041F\u043E\u0434\u0434\u043E\u043D"),
  sandbags: P(40, 12, "rect", "low", true, "\u041C\u0435\u0448\u043A\u0438 \u0441 \u043F\u0435\u0441\u043A\u043E\u043C"),
  forklift: P(26, 52, "rect", "high", true, "\u041F\u043E\u0433\u0440\u0443\u0437\u0447\u0438\u043A", { inset: 1 }),
  truck: P(50, 144, "rect", "high", true, "\u0413\u0440\u0443\u0437\u043E\u0432\u0438\u043A", { inset: 2 }),
  machine_lathe: P(40, 22, "rect", "high", true, "\u0421\u0442\u0430\u043D\u043E\u043A"),
  machine_press: P(32, 32, "rect", "high", true, "\u041F\u0440\u0435\u0441\u0441"),
  tank_vertical: P(32, 32, "circle", "high", true, "\u0426\u0438\u0441\u0442\u0435\u0440\u043D\u0430", { radius: 16 }),
  tank_horizontal: P(30, 68, "rect", "high", true, "\u0401\u043C\u043A\u043E\u0441\u0442\u044C", { inset: 2 }),
  turbine: P(76, 76, "circle", "high", true, "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430", { radius: 34 }),
  locker_row: P(52, 12, "rect", "high", true, "\u0428\u043A\u0430\u0444\u0447\u0438\u043A\u0438"),
  desk: P(30, 16, "rect", "low", false, "\u0421\u0442\u043E\u043B"),
  chair: P(9, 9, "none", "floor", false, "\u0421\u0442\u0443\u043B"),
  file_cabinet: P(18, 12, "rect", "high", true, "\u0428\u043A\u0430\u0444"),
  plant_pot: P(14, 14, "circle", "low", false, "\u0424\u0438\u043A\u0443\u0441", { radius: 5 }),
  turnstile: P(8, 22, "rect", "low", false, "\u0422\u0443\u0440\u043D\u0438\u043A\u0435\u0442"),
  boom_barrier: P(60, 6, "none", "floor", false, "\u0428\u043B\u0430\u0433\u0431\u0430\u0443\u043C"),
  conveyor: P(88, 22, "rect", "low", false, "\u041A\u043E\u043D\u0432\u0435\u0439\u0435\u0440"),
  electric_box: P(16, 8, "rect", "high", true, "\u0429\u0438\u0442\u043E\u043A"),
  cable_reel: P(18, 18, "circle", "low", true, "\u041A\u0430\u0442\u0443\u0448\u043A\u0430 \u043A\u0430\u0431\u0435\u043B\u044F", { radius: 9 }),
  tire_stack: P(16, 16, "circle", "low", true, "\u041F\u043E\u043A\u0440\u044B\u0448\u043A\u0438", { radius: 8 }),
  workbench: P(36, 14, "rect", "low", false, "\u0412\u0435\u0440\u0441\u0442\u0430\u043A"),
  scrap_pile: P(30, 26, "rect", "low", true, "\u041C\u0435\u0442\u0430\u043B\u043B\u043E\u043B\u043E\u043C", { inset: 3 }),
  container: P(48, 116, "rect", "high", true, "\u041A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440"),
  // vehicles
  car_zhiguli: P(34, 80, "rect", "low", true, "\u0416\u0438\u0433\u0443\u043B\u0438", { inset: 1 }),
  car_volga: P(36, 92, "rect", "low", true, "\u0412\u043E\u043B\u0433\u0430", { inset: 1 }),
  car_wreck: P(34, 80, "rect", "low", true, "\u041E\u0441\u0442\u043E\u0432 \u043C\u0430\u0448\u0438\u043D\u044B", { inset: 2 }),
  bus_paz: P(50, 136, "rect", "high", true, "\u0410\u0432\u0442\u043E\u0431\u0443\u0441", { inset: 1 }),
  // garages & yard
  garage: P(64, 112, "rect", "high", true, "\u0413\u0430\u0440\u0430\u0436"),
  garage_shell: P(46, 92, "rect", "high", true, "\u0413\u0430\u0440\u0430\u0436-\u0440\u0430\u043A\u0443\u0448\u043A\u0430", { inset: 1 }),
  trash_container: P(34, 20, "rect", "low", true, "\u041C\u0443\u0441\u043E\u0440\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440"),
  bench: P(38, 11, "rect", "low", false, "\u041B\u0430\u0432\u043E\u0447\u043A\u0430"),
  domino_table: P(22, 22, "rect", "low", false, "\u0421\u0442\u043E\u043B \u0434\u043E\u043C\u0438\u043D\u043E\u0448\u043D\u0438\u043A\u043E\u0432", { inset: 3 }),
  swing: P(50, 14, "rect", "low", false, "\u041A\u0430\u0447\u0435\u043B\u0438", { inset: 4 }),
  slide: P(16, 44, "rect", "low", false, "\u0413\u043E\u0440\u043A\u0430", { inset: 2 }),
  carousel: P(34, 34, "circle", "low", false, "\u041A\u0430\u0440\u0443\u0441\u0435\u043B\u044C", { radius: 14 }),
  sandbox: P(44, 44, "none", "floor", false, "\u041F\u0435\u0441\u043E\u0447\u043D\u0438\u0446\u0430"),
  monkey_bars: P(40, 10, "rect", "low", false, "\u0422\u0443\u0440\u043D\u0438\u043A", { inset: 2 }),
  kiosk: P(40, 30, "rect", "high", true, "\u041A\u0438\u043E\u0441\u043A"),
  lamp_post: P(8, 8, "circle", "low", true, "\u0424\u043E\u043D\u0430\u0440\u044C", { radius: 3 }),
  tree_trunk: P(10, 10, "circle", "low", true, "\u0414\u0435\u0440\u0435\u0432\u043E", { radius: 4 }),
  phone_booth: P(18, 18, "rect", "high", true, "\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u0430\u044F \u0431\u0443\u0434\u043A\u0430"),
  water_pump: P(12, 12, "circle", "low", true, "\u041A\u043E\u043B\u043E\u043D\u043A\u0430", { radius: 4 })
};
var PROP_TYPES = Object.keys(PROP_DEFS);

// packages/shared/src/maps/collision.ts
var CELL = 64;
var BOUNDS_THICKNESS = 64;
function propFootprint(def, rot) {
  return rot === 90 || rot === 270 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}
var CollisionWorld = class {
  width;
  height;
  shapes = [];
  cols;
  rows;
  cells;
  stamp;
  stampId = 1;
  constructor(map) {
    this.width = map.width;
    this.height = map.height;
    for (const w of map.walls) {
      const shootThrough = w.style === "fence_chain";
      this.addRect(w.x, w.y, w.w, w.h, true, !shootThrough, "wall");
    }
    for (const p of map.props) {
      const def = PROP_DEFS[p.type];
      if (def.shape === "none" || !def.blocksMove) continue;
      if (def.shape === "circle") {
        const r = def.radius ?? Math.min(def.w, def.h) / 2;
        this.addCircle(p.x, p.y, r, true, def.blocksShot, "prop");
      } else {
        const fp = propFootprint(def, p.rot);
        const inset = def.inset ?? 0;
        this.addRect(
          p.x - fp.w / 2 + inset,
          p.y - fp.h / 2 + inset,
          fp.w - inset * 2,
          fp.h - inset * 2,
          true,
          def.blocksShot,
          "prop"
        );
      }
    }
    const T = BOUNDS_THICKNESS;
    this.addRect(-T, -T, this.width + 2 * T, T, true, true, "bounds");
    this.addRect(-T, this.height, this.width + 2 * T, T, true, true, "bounds");
    this.addRect(-T, 0, T, this.height, true, true, "bounds");
    this.addRect(this.width, 0, T, this.height, true, true, "bounds");
    this.cols = Math.ceil((this.width + 2 * T) / CELL);
    this.rows = Math.ceil((this.height + 2 * T) / CELL);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.stamp = new Uint32Array(this.shapes.length);
    this.shapes.forEach((s, i) => {
      const [c0, r0, c1, r1] = this.cellRange(s.x, s.y, s.x + s.w, s.y + s.h);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(i);
    });
  }
  addRect(x, y, w, h, move, shot, source) {
    if (w <= 0 || h <= 0) return;
    this.shapes.push({ kind: "rect", x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: 0, blocksMove: move, blocksShot: shot, source });
  }
  addCircle(cx, cy, r, move, shot, source) {
    this.shapes.push({ kind: "circle", x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, cx, cy, r, blocksMove: move, blocksShot: shot, source });
  }
  cellRange(x0, y0, x1, y1) {
    const T = BOUNDS_THICKNESS;
    const c0 = Math.max(0, Math.floor((x0 + T) / CELL));
    const r0 = Math.max(0, Math.floor((y0 + T) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((x1 + T) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((y1 + T) / CELL));
    return [c0, r0, c1, r1];
  }
  /** Collects unique shape indices whose cells overlap the box. */
  candidates(x0, y0, x1, y1, out) {
    out.length = 0;
    const id = ++this.stampId;
    if (id === 4294967295) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const [c0, r0, c1, r1] = this.cellRange(x0, y0, x1, y1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const i of this.cells[r * this.cols + c]) {
          if (this.stamp[i] !== id) {
            this.stamp[i] = id;
            out.push(i);
          }
        }
      }
    }
    return out;
  }
  scratch = [];
  /**
   * Pushes a circle out of every movement-blocking shape. Mutates `pos`.
   * Returns the number of contacts and writes accumulated contact normals into `normals`.
   */
  resolveCircle(pos, r, normals) {
    let contacts = 0;
    if (normals) normals.length = 0;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const cand = this.candidates(pos.x - r, pos.y - r, pos.x + r, pos.y + r, this.scratch);
      for (const i of cand) {
        const s = this.shapes[i];
        if (!s.blocksMove) continue;
        let nx = 0;
        let ny = 0;
        let push = 0;
        if (s.kind === "rect") {
          const qx = pos.x < s.x ? s.x : pos.x > s.x + s.w ? s.x + s.w : pos.x;
          const qy = pos.y < s.y ? s.y : pos.y > s.y + s.h ? s.y + s.h : pos.y;
          const dx = pos.x - qx;
          const dy = pos.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            push = r - d;
          } else {
            const left = pos.x - s.x;
            const right = s.x + s.w - pos.x;
            const top = pos.y - s.y;
            const bottom = s.y + s.h - pos.y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) nx = -1;
            else if (m === right) nx = 1;
            else if (m === top) ny = -1;
            else ny = 1;
            push = m + r;
          }
        } else {
          const dx = pos.x - s.cx;
          const dy = pos.y - s.cy;
          const rr = r + s.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            push = rr - d;
          } else {
            nx = 1;
            push = rr;
          }
        }
        pos.x += nx * push;
        pos.y += ny * push;
        contacts++;
        moved = true;
        if (normals) normals.push(nx, ny);
      }
      if (!moved) break;
    }
    return contacts;
  }
  overlapsCircle(x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r > this.width || y + r > this.height) return true;
    const cand = this.candidates(x - r, y - r, x + r, y + r, this.scratch);
    for (const i of cand) {
      const s = this.shapes[i];
      if (!s.blocksMove) continue;
      if (s.kind === "rect") {
        const qx = x < s.x ? s.x : x > s.x + s.w ? s.x + s.w : x;
        const qy = y < s.y ? s.y : y > s.y + s.h ? s.y + s.h : y;
        const dx = x - qx;
        const dy = y - qy;
        if (dx * dx + dy * dy < r * r) return true;
      } else {
        const dx = x - s.cx;
        const dy = y - s.cy;
        const rr = r + s.r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
    }
    return false;
  }
  /**
   * Casts a ray against shot-blocking (or move-blocking) geometry.
   * `dx, dy` must be a unit vector. Returns null when nothing is hit within `maxDist`.
   */
  raycast(ox, oy, dx, dy, maxDist, mode = "shot") {
    const ex = ox + dx * maxDist;
    const ey = oy + dy * maxDist;
    const cand = this.candidates(Math.min(ox, ex), Math.min(oy, ey), Math.max(ox, ex), Math.max(oy, ey), this.scratch);
    let best = null;
    let bestT = maxDist;
    for (const i of cand) {
      const s = this.shapes[i];
      if (mode === "shot" ? !s.blocksShot : !s.blocksMove) continue;
      if (s.kind === "rect") {
        let tmin = -Infinity;
        let tmax = Infinity;
        let nx = 0;
        let ny = 0;
        if (Math.abs(dx) < 1e-12) {
          if (ox < s.x || ox > s.x + s.w) continue;
        } else {
          const inv = 1 / dx;
          let t1 = (s.x - ox) * inv;
          let t2 = (s.x + s.w - ox) * inv;
          let n = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            n = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            nx = n;
            ny = 0;
          }
          tmax = Math.min(tmax, t2);
        }
        if (Math.abs(dy) < 1e-12) {
          if (oy < s.y || oy > s.y + s.h) continue;
        } else {
          const inv = 1 / dy;
          let t1 = (s.y - oy) * inv;
          let t2 = (s.y + s.h - oy) * inv;
          let n = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            n = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            nx = 0;
            ny = n;
          }
          tmax = Math.min(tmax, t2);
        }
        if (tmax < tmin || tmax < 0) continue;
        const t = Math.max(0, tmin);
        if (t < bestT) {
          bestT = t;
          best = { t, nx, ny, shape: i };
        }
      } else {
        const t = rayCircle(ox, oy, dx, dy, s.cx, s.cy, s.r);
        if (t !== null && t < bestT) {
          bestT = t;
          const hx = ox + dx * t - s.cx;
          const hy = oy + dy * t - s.cy;
          const l = Math.sqrt(hx * hx + hy * hy) || 1;
          best = { t, nx: hx / l, ny: hy / l, shape: i };
        }
      }
    }
    return best;
  }
  lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return true;
    return this.raycast(ax, ay, dx / d, dy / d, d, "shot") === null;
  }
};
function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx;
  const fy = oy - cy;
  const b2 = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (b2 > 0) return null;
  const disc = b2 * b2 - c;
  if (disc < 0) return null;
  const t = -b2 - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

// packages/shared/src/maps/types.ts
var MAP_IDS = ["factory", "garages", "yard"];

// packages/shared/src/maps/index.ts
var builders2 = {
  factory: buildFactoryMap,
  garages: buildGaragesMap,
  yard: buildYardMap
};
var mapCache = /* @__PURE__ */ new Map();
var collisionCache = /* @__PURE__ */ new Map();
function getMap(id) {
  let m = mapCache.get(id);
  if (!m) {
    m = builders2[id]();
    mapCache.set(id, m);
  }
  return m;
}
function getCollision(id) {
  let c = collisionCache.get(id);
  if (!c) {
    c = new CollisionWorld(getMap(id));
    collisionCache.set(id, c);
  }
  return c;
}
function isMapId(v) {
  return typeof v === "string" && MAP_IDS.includes(v);
}
var MAP_ORDER = ["factory", "garages", "yard"];

// packages/shared/src/sim/math.ts
var TAU = Math.PI * 2;
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function angleDiff(a, b2) {
  return wrapAngle(b2 - a);
}
function quantizeAngle(a) {
  const w = wrapAngle(a) + Math.PI;
  return Math.round(w / TAU * 65535) & 65535;
}
function dequantizeAngle(q) {
  return q / 65535 * TAU - Math.PI;
}

// packages/shared/src/sim/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash32(...values2) {
  let h = 2166136261;
  for (const v of values2) {
    h ^= v >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}
function spreadNoise(seed, shot, pellet) {
  return mulberry32(hash32(seed, shot, pellet))() * 2 - 1;
}

// packages/shared/src/sim/world.ts
var BTN = {
  FIRE: 1,
  RELOAD: 2,
  WALK: 4,
  INTERACT: 8,
  NEXT_WEAPON: 16
};
var MAX_SLOTS = 8;
function createPlayerState(id, slot, name, character, isBot, now, seed) {
  return {
    id,
    slot,
    name,
    character,
    isBot,
    connected: true,
    joinedAt: now,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    aim: 0,
    hp: MAX_HP,
    alive: false,
    spawned: false,
    diedAt: 0,
    respawnAt: 0,
    invulnUntil: 0,
    weapon: "pistol",
    pistolMag: WEAPONS.pistol.magazine,
    heavy: null,
    heavyMag: 0,
    heavyReserve: 0,
    clock: 0,
    reloadUntil: 0,
    reloadWeapon: null,
    nextFireAt: 0,
    spreadHeat: 0,
    shotCounter: 0,
    seed,
    kills: 0,
    deaths: 0,
    score: 0,
    damageDealt: 0,
    streak: 0,
    bestStreak: 0,
    lastKillAt: 0,
    lastSeq: 0,
    lastButtons: 0,
    walking: false,
    lastShotAt: -1e9,
    lastHitAt: -1e9,
    lastDamagedBy: null,
    assists: 0,
    recentDamage: []
  };
}
function stepMovement(p, input, collision, normals) {
  let mx = input.moveX / MOVE_AXIS_MAX;
  let my = input.moveY / MOVE_AXIS_MAX;
  let mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
    mag = 1;
  }
  const walking = (input.buttons & BTN.WALK) !== 0;
  const maxSpeed = walking ? WALK_SPEED : RUN_SPEED;
  const tx = mx * maxSpeed;
  const ty = my * maxSpeed;
  let dvx = tx - p.vx;
  let dvy = ty - p.vy;
  const dvl = Math.sqrt(dvx * dvx + dvy * dvy);
  const rate = mag > 0.01 ? ACCELERATION : DECELERATION;
  const maxDv = rate * TICK_DT;
  if (dvl > maxDv) {
    dvx = dvx / dvl * maxDv;
    dvy = dvy / dvl * maxDv;
  }
  p.vx += dvx;
  p.vy += dvy;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;
  p.x += p.vx * TICK_DT;
  p.y += p.vy * TICK_DT;
  const contacts = collision.resolveCircle(p, PLAYER_RADIUS, normals);
  if (contacts > 0) {
    for (let i = 0; i < normals.length; i += 2) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }
  p.walking = walking || mag > 0.01 && mag < 0.6;
}
function weaponAmmo(p, w) {
  if (w === "pistol") return { mag: p.pistolMag, reserve: -1 };
  if (w === "montirovka") return { mag: 0, reserve: 0 };
  if (p.heavy === w) return { mag: p.heavyMag, reserve: p.heavyReserve };
  return { mag: 0, reserve: 0 };
}
function availableWeapons(p) {
  const out = ["pistol", "montirovka"];
  if (p.heavy) out.push(p.heavy);
  return out;
}
function pelletAngles(p, w, spread) {
  const out = [];
  for (let k = 0; k < w.pellets; k++) out.push(wrapAngle(p.aim + spreadNoise(p.seed, p.shotCounter, k) * spread));
  return out;
}
function setWeapon(p, w) {
  p.weapon = w;
  p.reloadWeapon = null;
  p.reloadUntil = 0;
  p.spreadHeat = 0;
  p.nextFireAt = Math.max(p.nextFireAt, p.clock + 150);
}
function switchToSlot(p, slot) {
  const target = slot === 1 ? "pistol" : slot === 2 ? "montirovka" : p.heavy;
  if (!target || target === p.weapon) return;
  setWeapon(p, target);
}
function cycleWeapon(p) {
  const list = availableWeapons(p);
  const i = list.indexOf(p.weapon);
  setWeapon(p, list[(i + 1) % list.length]);
}
function startReload(p, emit) {
  const w = WEAPONS[p.weapon];
  if (w.kind !== "hitscan" || p.reloadWeapon) return false;
  const ammo = weaponAmmo(p, p.weapon);
  if (ammo.mag >= w.magazine) return false;
  if (ammo.reserve === 0) return false;
  p.reloadWeapon = p.weapon;
  p.reloadUntil = p.clock + w.reloadMs;
  emit?.({ t: "reload", slot: p.slot, weapon: p.weapon });
  return true;
}
function finishReload(p) {
  if (!p.reloadWeapon) return;
  const w = WEAPONS[p.reloadWeapon];
  if (p.reloadWeapon === "pistol") p.pistolMag = w.magazine;
  else if (p.heavy === p.reloadWeapon) {
    const take = Math.min(w.magazine - p.heavyMag, p.heavyReserve);
    p.heavyMag += take;
    p.heavyReserve -= take;
  }
  p.reloadWeapon = null;
  p.reloadUntil = 0;
}
function stepWeapons(p, input, pressed, hooks) {
  const w = WEAPONS[p.weapon];
  if (w.spreadRecovery > 0 && p.clock - p.lastShotAt > w.fireIntervalMs * 1.5) {
    p.spreadHeat = Math.max(0, p.spreadHeat - w.spreadRecovery * TICK_DT);
  }
  if (p.reloadWeapon && p.clock + 1e-6 >= p.reloadUntil) finishReload(p);
  if (input.slot >= 1 && input.slot <= 3) switchToSlot(p, input.slot);
  if (pressed & BTN.NEXT_WEAPON) cycleWeapon(p);
  if (pressed & BTN.RELOAD) startReload(p, hooks.event);
  if ((input.buttons & BTN.FIRE) === 0) return;
  const cur = WEAPONS[p.weapon];
  if (p.reloadWeapon) return;
  if (p.clock + 1e-6 < p.nextFireAt) return;
  if (!cur.automatic && (pressed & BTN.FIRE) === 0) return;
  if (cur.kind === "melee") {
    p.shotCounter++;
    p.lastShotAt = p.clock;
    hooks.melee(p, cur);
    p.nextFireAt = p.clock + cur.fireIntervalMs;
    return;
  }
  const ammo = weaponAmmo(p, p.weapon);
  if (ammo.mag <= 0) {
    if (!startReload(p, hooks.event) && pressed & BTN.FIRE) hooks.event({ t: "dry", slot: p.slot });
    return;
  }
  if (p.weapon === "pistol") p.pistolMag--;
  else p.heavyMag--;
  p.shotCounter++;
  p.lastShotAt = p.clock;
  const spread = cur.spread + p.spreadHeat;
  p.spreadHeat = Math.min(cur.spreadMax, p.spreadHeat + cur.spreadPerShot);
  hooks.shot(p, cur, spread);
  p.nextFireAt = p.clock + cur.fireIntervalMs;
  if (weaponAmmo(p, p.weapon).mag <= 0) startReload(p, hooks.event);
}
var World = class {
  map;
  collision;
  config;
  lagCompensation;
  time = 0;
  tick = 0;
  phase = "waiting";
  phaseEndsAt = 0;
  matchStartedAt = 0;
  matchEndsAt = 0;
  endReason = null;
  players = /* @__PURE__ */ new Map();
  pickups = [];
  events = [];
  nextPickupId = 1;
  /** World time of the next «дефицит» supply drop (active phase only). */
  nextSupplyAt = 0;
  history = [];
  rng;
  normals = [];
  constructor(map, collision, options = {}) {
    this.map = map;
    this.collision = collision;
    this.config = { ...DEFAULT_MATCH_CONFIG, ...options.config };
    this.lagCompensation = options.lagCompensation ?? true;
    this.rng = mulberry32(options.seed ?? 24301);
    map.pickups.forEach((ps, i) => {
      this.pickups.push({
        id: this.nextPickupId++,
        weapon: ps.weapon,
        x: ps.x,
        y: ps.y,
        active: true,
        dropped: false,
        mag: WEAPONS[ps.weapon].magazine,
        reserve: WEAPONS[ps.weapon].reserveOnPickup,
        respawnAt: 0,
        expiresAt: 0,
        spawnIndex: i,
        supply: false
      });
    });
  }
  // ── Roster ──────────────────────────────────────────────────────────────
  freeSlot() {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let s = 0; s < MAX_SLOTS; s++) if (!used.has(s)) return s;
    return -1;
  }
  addPlayer(id, name, character, isBot = false) {
    const existing = this.players.get(id);
    if (existing) return existing;
    const slot = this.freeSlot();
    if (slot < 0) throw new Error("room full");
    const p = createPlayerState(id, slot, name, character, isBot, this.time, hash32(slot + 1, Math.floor(this.rng() * 4294967295)));
    this.players.set(id, p);
    if (this.phase === "countdown" || this.phase === "active") this.spawnPlayer(p, this.phase === "countdown");
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive && p.heavy) this.dropHeavy(p);
    this.players.delete(id);
  }
  playerBySlot(slot) {
    for (const p of this.players.values()) if (p.slot === slot) return p;
    return void 0;
  }
  // ── Phases ──────────────────────────────────────────────────────────────
  setPhase(phase, duration) {
    this.phase = phase;
    this.phaseEndsAt = duration > 0 ? this.time + duration : 0;
    this.events.push({ t: "phase", phase });
  }
  /** Lobby → ready → countdown → active. */
  beginMatch(skipReady = false) {
    if (this.phase !== "waiting") return;
    this.resetScores();
    if (skipReady) this.startCountdown();
    else this.setPhase("ready", this.config.readyMs);
  }
  startCountdown() {
    this.setPhase("countdown", this.config.countdownMs);
    this.resetPickups();
    const order = [...this.players.values()].sort((a, b2) => a.slot - b2.slot);
    const spawns = this.shuffledSpawnIndices();
    order.forEach((p, i) => this.spawnPlayer(p, true, spawns[i % spawns.length]));
  }
  startActive() {
    this.setPhase("active", this.config.durationMs);
    this.matchStartedAt = this.time;
    this.matchEndsAt = this.time + this.config.durationMs;
    this.nextSupplyAt = this.time + this.config.supplyFirstMs;
    for (const p of this.players.values()) {
      if (!p.alive) this.spawnPlayer(p, false);
      p.invulnUntil = this.time + this.config.spawnProtectionMs;
    }
  }
  finish(reason) {
    if (this.phase === "finished" || this.phase === "closed") return;
    this.endReason = reason;
    this.setPhase("finished", this.config.finishedMs);
    this.events.push({ t: "matchEnd", reason });
    for (const p of this.players.values()) {
      p.vx = 0;
      p.vy = 0;
    }
  }
  /** Back to the lobby for a rematch, keeping the roster. */
  resetToLobby() {
    this.setPhase("waiting", 0);
    this.endReason = null;
    for (const p of this.players.values()) {
      p.alive = false;
      p.spawned = false;
      p.heavy = null;
    }
    this.pickups.splice(0, this.pickups.length, ...this.pickups.filter((pk) => !pk.dropped));
    this.resetPickups();
  }
  close() {
    this.setPhase("closed", 0);
  }
  resetScores() {
    for (const p of this.players.values()) {
      p.kills = 0;
      p.assists = 0;
      p.deaths = 0;
      p.score = 0;
      p.damageDealt = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.lastKillAt = 0;
    }
  }
  resetPickups() {
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].dropped) this.pickups.splice(i, 1);
    for (const pk of this.pickups) {
      pk.active = true;
      pk.mag = WEAPONS[pk.weapon].magazine;
      pk.reserve = WEAPONS[pk.weapon].reserveOnPickup;
    }
  }
  get matchTimeLeftMs() {
    if (this.phase === "active") return Math.max(0, this.matchEndsAt - this.time);
    if (this.phase === "countdown" || this.phase === "ready") return this.config.durationMs;
    return 0;
  }
  // ── Spawning ────────────────────────────────────────────────────────────
  shuffledSpawnIndices() {
    const idx = this.map.spawns.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }
  /** Picks the spawn farthest from living opponents, penalizing spawns they can see. */
  chooseSpawn(forId) {
    const enemies = [...this.players.values()].filter((p) => p.alive && p.id !== forId);
    let best = 0;
    let bestScore = -Infinity;
    this.map.spawns.forEach((s, i) => {
      if (this.collision.overlapsCircle(s.x, s.y, PLAYER_RADIUS)) return;
      let minD = 1200;
      let seen = false;
      for (const e of enemies) {
        const d = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
        minD = Math.min(minD, d);
        if (d < 700 && this.collision.lineOfSight(e.x, e.y, s.x, s.y)) seen = true;
      }
      const score = minD - (seen ? 400 : 0) + this.rng() * 60;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }
  spawnPlayer(p, frozen, spawnIndex) {
    const i = spawnIndex ?? this.chooseSpawn(p.id);
    const s = this.map.spawns[i] ?? this.map.spawns[0];
    p.x = s.x;
    p.y = s.y;
    p.vx = 0;
    p.vy = 0;
    p.aim = s.angle;
    p.hp = MAX_HP;
    p.alive = true;
    p.spawned = true;
    p.invulnUntil = this.time + (frozen ? this.config.countdownMs + this.config.spawnProtectionMs : this.config.spawnProtectionMs);
    p.weapon = "pistol";
    p.pistolMag = WEAPONS.pistol.magazine;
    p.heavy = null;
    p.heavyMag = 0;
    p.heavyReserve = 0;
    p.reloadUntil = 0;
    p.reloadWeapon = null;
    p.nextFireAt = p.clock;
    p.spreadHeat = 0;
    p.lastDamagedBy = null;
    p.recentDamage = [];
    this.events.push({ t: "respawn", slot: p.slot, x: p.x, y: p.y });
  }
  // ── Inputs ──────────────────────────────────────────────────────────────
  /** Applies one fixed-step input (TICK_MS) for a player. */
  applyInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeq = input.seq;
    p.clock += TICK_MS;
    const pressed = input.buttons & ~p.lastButtons;
    p.lastButtons = input.buttons;
    if (!p.alive) return;
    p.aim = dequantizeAngle(input.aim);
    if (this.phase !== "active") return;
    stepMovement(p, input, this.collision, this.normals);
    this.applyWeaponInput(p, input, pressed);
    this.checkPickups(p, (pressed & BTN.INTERACT) !== 0);
  }
  applyWeaponInput(p, input, pressed) {
    stepWeapons(p, input, pressed, {
      shot: (pl, w, spread) => this.doShot(pl, w, spread, input.viewTime),
      melee: (pl, w) => this.doMelee(pl, w, input.viewTime),
      event: (e) => this.events.push(e)
    });
  }
  // ── Combat ──────────────────────────────────────────────────────────────
  targetsAt(viewTime, exclude) {
    const out = [];
    const frame = this.lagCompensation ? this.sampleHistory(viewTime) : null;
    for (const q of this.players.values()) {
      if (q === exclude || !q.alive) continue;
      let x = q.x;
      let y = q.y;
      if (frame) {
        const k = q.slot * 3;
        if (frame[k + 2] > 0.5) {
          x = frame[k];
          y = frame[k + 1];
        }
      }
      out.push({ p: q, x, y });
    }
    return out;
  }
  doShot(p, w, spread, viewTime) {
    p.invulnUntil = Math.min(p.invulnUntil, this.time);
    const targets = this.targetsAt(viewTime, p);
    const pellets = [];
    const dmgByVictim = /* @__PURE__ */ new Map();
    for (const a of pelletAngles(p, w, spread)) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const wallHit = this.collision.raycast(p.x, p.y, dx, dy, w.range, "shot");
      let maxT = wallHit ? wallHit.t : w.range;
      let victim = null;
      for (const tgt of targets) {
        const t = rayCircle(p.x, p.y, dx, dy, tgt.x, tgt.y, PLAYER_RADIUS);
        if (t !== null && t < maxT) {
          maxT = t;
          victim = tgt.p;
        }
      }
      if (victim) {
        const dmg = w.damage * damageFalloff(w, maxT);
        dmgByVictim.set(victim, (dmgByVictim.get(victim) ?? 0) + dmg);
        pellets.push({ angle: a, dist: maxT, hit: victim.slot, kind: 2 });
      } else {
        pellets.push({ angle: a, dist: maxT, hit: -1, kind: wallHit ? 1 : 0 });
      }
    }
    this.events.push({ t: "shot", shooter: p.slot, weapon: w.id, shotId: p.shotCounter, ox: p.x, oy: p.y, pellets });
    for (const [victim, dmg] of dmgByVictim) this.applyDamage(victim, p, Math.round(dmg), w.id);
  }
  doMelee(p, w, viewTime) {
    p.invulnUntil = Math.min(p.invulnUntil, this.time);
    const targets = this.targetsAt(viewTime, p);
    let best = null;
    let bestD = Infinity;
    for (const tgt of targets) {
      const dx = tgt.x - p.x;
      const dy = tgt.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > w.meleeRange + PLAYER_RADIUS) continue;
      const a = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(p.aim, a)) > w.meleeArc / 2 && d > PLAYER_RADIUS * 1.6) continue;
      if (!this.collision.lineOfSight(p.x, p.y, tgt.x, tgt.y)) continue;
      if (d < bestD) {
        bestD = d;
        best = tgt.p;
      }
    }
    this.events.push({ t: "melee", shooter: p.slot, angle: p.aim, hit: best ? best.slot : -1 });
    if (best) this.applyDamage(best, p, w.damage, w.id);
  }
  applyDamage(victim, attacker, amount, weapon) {
    if (!victim.alive || amount <= 0) return;
    if (this.time < victim.invulnUntil) return;
    if (this.phase !== "active") return;
    victim.hp = Math.max(0, victim.hp - amount);
    victim.lastHitAt = this.time;
    if (attacker) {
      victim.lastDamagedBy = attacker.id;
      attacker.damageDealt += amount;
      if (attacker !== victim) {
        const rec = victim.recentDamage.find((r) => r.id === attacker.id);
        if (rec) {
          rec.amount += amount;
          rec.at = this.time;
        } else victim.recentDamage.push({ id: attacker.id, at: this.time, amount });
      }
    }
    this.events.push({ t: "damage", victim: victim.slot, attacker: attacker ? attacker.slot : -1, amount, hp: victim.hp, weapon });
    if (victim.hp <= 0) this.kill(victim, attacker, weapon);
  }
  kill(victim, killer, weapon) {
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.diedAt = this.time;
    victim.respawnAt = this.time + this.config.respawnDelayMs;
    victim.vx = 0;
    victim.vy = 0;
    victim.reloadWeapon = null;
    if (victim.heavy) this.dropHeavy(victim);
    const scorers = [];
    if (killer && killer !== victim) {
      killer.kills++;
      killer.score += SCORING.killPoints;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      killer.lastKillAt = this.time;
      scorers.push(killer);
    }
    const assists = [];
    for (const rec of victim.recentDamage) {
      if (rec.id === killer?.id || rec.id === victim.id) continue;
      if (this.time - rec.at > SCORING.assistWindowMs || rec.amount < SCORING.assistMinDamage) continue;
      const helper = this.players.get(rec.id);
      if (!helper) continue;
      helper.assists++;
      helper.score += SCORING.assistPoints;
      assists.push(helper.slot);
      scorers.push(helper);
    }
    victim.recentDamage = [];
    this.events.push({ t: "kill", killer: killer ? killer.slot : -1, victim: victim.slot, weapon, assists });
    if (scorers.some((p) => p.score >= this.config.scoreLimit)) this.finish("score");
  }
  // ── Pickups ─────────────────────────────────────────────────────────────
  dropHeavy(p) {
    if (!p.heavy) return;
    const total = p.heavyMag + p.heavyReserve;
    if (total > 0) {
      this.pickups.push({
        id: this.nextPickupId++,
        weapon: p.heavy,
        x: p.x,
        y: p.y,
        active: true,
        dropped: true,
        mag: p.heavyMag,
        reserve: p.heavyReserve,
        respawnAt: 0,
        expiresAt: this.time + DROPPED_WEAPON_TTL_MS,
        spawnIndex: -1,
        supply: false
      });
      this.events.push({ t: "drop", slot: p.slot, weapon: p.heavy });
    }
    p.heavy = null;
    p.heavyMag = 0;
    p.heavyReserve = 0;
    if (isHeavy(p.weapon)) p.weapon = "pistol";
  }
  checkPickups(p, interact) {
    for (const pk of this.pickups) {
      if (!pk.active) continue;
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      if (dx * dx + dy * dy > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      const def = WEAPONS[pk.weapon];
      if (!p.heavy) {
        p.heavy = pk.weapon;
        p.heavyMag = pk.mag;
        p.heavyReserve = pk.reserve;
        setWeapon(p, pk.weapon);
        this.consumePickup(pk);
        this.events.push({ t: "pickup", slot: p.slot, weapon: pk.weapon, ammoOnly: false });
        return;
      }
      if (p.heavy === pk.weapon && p.heavyReserve < def.reserveMax) {
        p.heavyReserve = Math.min(def.reserveMax, p.heavyReserve + pk.mag + pk.reserve);
        this.consumePickup(pk);
        this.events.push({ t: "pickup", slot: p.slot, weapon: pk.weapon, ammoOnly: true });
        return;
      }
      if (interact && p.heavy !== pk.weapon) {
        const old = { weapon: p.heavy, mag: p.heavyMag, reserve: p.heavyReserve };
        p.heavy = pk.weapon;
        p.heavyMag = pk.mag;
        p.heavyReserve = pk.reserve;
        setWeapon(p, pk.weapon);
        this.consumePickup(pk);
        this.pickups.push({
          id: this.nextPickupId++,
          weapon: old.weapon,
          x: p.x,
          y: p.y,
          active: true,
          dropped: true,
          mag: old.mag,
          reserve: old.reserve,
          respawnAt: 0,
          expiresAt: this.time + DROPPED_WEAPON_TTL_MS,
          spawnIndex: -1,
          supply: false
        });
        this.events.push({ t: "pickup", slot: p.slot, weapon: pk.weapon, ammoOnly: false });
        return;
      }
    }
  }
  consumePickup(pk) {
    pk.active = false;
    if (!pk.dropped) {
      const spec = this.map.pickups[pk.spawnIndex];
      pk.respawnAt = this.time + (spec ? spec.respawnMs : 2e4);
    }
  }
  // ── Tick ────────────────────────────────────────────────────────────────
  /** Advances world time by one tick: timers, respawns, pickups, phases, lag-compensation history. */
  update() {
    this.time += TICK_MS;
    this.tick++;
    switch (this.phase) {
      case "ready":
        if (this.time >= this.phaseEndsAt) this.startCountdown();
        break;
      case "countdown":
        if (this.time >= this.phaseEndsAt) this.startActive();
        break;
      case "active":
        if (this.time >= this.matchEndsAt) this.finish("time");
        break;
      default:
        break;
    }
    if (this.phase === "active") {
      for (const p of this.players.values()) {
        if (!p.alive && p.spawned && this.time >= p.respawnAt && p.connected) this.spawnPlayer(p, false);
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        if (pk.dropped) {
          if (!pk.active || this.time >= pk.expiresAt) this.pickups.splice(i, 1);
        } else if (!pk.active && this.time >= pk.respawnAt) {
          pk.active = true;
          pk.mag = WEAPONS[pk.weapon].magazine;
          pk.reserve = WEAPONS[pk.weapon].reserveOnPickup;
        }
      }
      if (this.nextSupplyAt > 0 && this.time >= this.nextSupplyAt) {
        this.nextSupplyAt = this.time + this.config.supplyIntervalMs;
        this.dropSupply();
      }
    }
    this.recordHistory();
  }
  /**
   * «Дефицит завезли»: a crate with a full heavy weapon appears at a free supply point away from
   * players (deterministic: world RNG). Unclaimed crates expire after `supplyTtlMs`.
   */
  dropSupply() {
    const points = this.map.supplyPoints;
    if (points.length === 0) return null;
    const free = points.filter((pt2) => {
      for (const pk of this.pickups) if (pk.active && Math.hypot(pk.x - pt2.x, pk.y - pt2.y) < 48) return false;
      for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - pt2.x, p.y - pt2.y) < 110) return false;
      return true;
    });
    if (free.length === 0) return null;
    const pt = free[Math.floor(this.rng() * free.length)];
    const weapon = this.rng() < 0.5 ? "obrez" : "avtomat";
    const def = WEAPONS[weapon];
    const crate = {
      id: this.nextPickupId++,
      weapon,
      x: pt.x,
      y: pt.y,
      active: true,
      dropped: true,
      mag: def.magazine,
      reserve: def.reserveMax,
      respawnAt: 0,
      expiresAt: this.time + this.config.supplyTtlMs,
      spawnIndex: -1,
      supply: true
    };
    this.pickups.push(crate);
    this.events.push({ t: "supply", x: pt.x, y: pt.y, weapon });
    return crate;
  }
  recordHistory() {
    if (!this.lagCompensation) return;
    const data = new Float32Array(MAX_SLOTS * 3);
    for (const p of this.players.values()) {
      data[p.slot * 3] = p.x;
      data[p.slot * 3 + 1] = p.y;
      data[p.slot * 3 + 2] = p.alive ? 1 : 0;
    }
    this.history.push({ time: this.time, data });
    const cutoff = this.time - HISTORY_MS;
    while (this.history.length > 0 && this.history[0].time < cutoff) this.history.shift();
  }
  /** Interpolated positions of all slots at `t` (clamped to the rewind window). */
  sampleHistory(t) {
    if (this.history.length === 0) return null;
    const target = Math.min(this.time, Math.max(this.time - MAX_REWIND_MS, t));
    if (target >= this.time - 0.5) return null;
    let i = this.history.length - 1;
    while (i > 0 && this.history[i].time > target) i--;
    const a = this.history[i];
    const b2 = this.history[Math.min(i + 1, this.history.length - 1)];
    if (a === b2 || b2.time === a.time) return a.data;
    const f = (target - a.time) / (b2.time - a.time);
    const out = new Float32Array(a.data.length);
    for (let k = 0; k < out.length; k += 3) {
      const aliveA = a.data[k + 2];
      const aliveB = b2.data[k + 2];
      if (aliveA > 0.5 && aliveB > 0.5) {
        out[k] = a.data[k] + (b2.data[k] - a.data[k]) * f;
        out[k + 1] = a.data[k + 1] + (b2.data[k + 1] - a.data[k + 1]) * f;
        out[k + 2] = 1;
      } else {
        out[k] = b2.data[k];
        out[k + 1] = b2.data[k + 1];
        out[k + 2] = 0;
      }
    }
    return out;
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  standings() {
    const list = [...this.players.values()].sort(
      (a, b2) => b2.score - a.score || b2.kills - a.kills || a.deaths - b2.deaths || b2.damageDealt - a.damageDealt || a.joinedAt - b2.joinedAt
    );
    const places = rankPlaces(list);
    return list.map((p, i) => ({
      id: p.id,
      slot: p.slot,
      name: p.name,
      character: p.character,
      isBot: p.isBot,
      kills: p.kills,
      assists: p.assists,
      deaths: p.deaths,
      score: p.score,
      damageDealt: p.damageDealt,
      bestStreak: p.bestStreak,
      place: places[i]
    }));
  }
};

// packages/shared/src/net/codec.ts
var MSG_INPUT = 1;
var MSG_SNAPSHOT = 2;
var ProtocolError = class extends Error {
};
var INPUT_BYTES = 14;
function decodeInputs(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength < 2) throw new ProtocolError("short input message");
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (v.getUint8(0) !== MSG_INPUT) throw new ProtocolError("not an input message");
  const n = v.getUint8(1);
  if (n === 0 || n > MAX_INPUTS_PER_MESSAGE) throw new ProtocolError("bad input count");
  if (u8.byteLength !== 2 + n * INPUT_BYTES) throw new ProtocolError("bad input length");
  const out = [];
  let o = 2;
  for (let i = 0; i < n; i++) {
    const buttons = v.getUint8(o + 8);
    const slot = v.getUint8(o + 9);
    if (buttons > 31 || slot > 3) throw new ProtocolError("bad input flags");
    const mx = v.getInt8(o + 4);
    const my = v.getInt8(o + 5);
    if (mx === -128 || my === -128) throw new ProtocolError("bad move axis");
    out.push({
      seq: v.getUint32(o, true),
      moveX: mx,
      moveY: my,
      aim: v.getUint16(o + 6, true),
      buttons,
      slot,
      viewTime: v.getUint32(o + 10, true)
    });
    o += INPUT_BYTES;
  }
  return out;
}
var PLAYER_BYTES = 40;
var u16 = (x) => clamp(Math.round(x), 0, 65535);
var i16 = (x) => clamp(Math.round(x), -32768, 32767);
var u8c = (x) => clamp(Math.round(x), 0, 255);
function encodeSnapshot(src) {
  const players = [...src.players];
  const shots = src.events.filter((e) => e.t === "shot");
  const melees = src.events.filter((e) => e.t === "melee");
  const pickups = src.pickups.filter((p) => p.active || !p.dropped);
  let size2 = 1 + 4 + 4 + 1 + 4 + 1 + players.length * PLAYER_BYTES + 1 + pickups.length * 8 + 2 + 1;
  for (const s of shots) size2 += 10 + s.pellets.length * 6;
  size2 += melees.length * 4;
  const buf = new ArrayBuffer(size2);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT);
  v.setUint32(o + 1, src.tick >>> 0, true);
  v.setUint32(o + 5, Math.max(0, Math.round(src.time)) >>> 0, true);
  v.setUint8(o + 9, MATCH_PHASES.indexOf(src.phase));
  v.setUint32(o + 10, Math.max(0, Math.round(src.phaseRemaining)) >>> 0, true);
  v.setUint8(o + 14, players.length);
  o += 15;
  for (const p of players) {
    const flags = (p.alive ? 1 : 0) | (p.connected ? 2 : 0) | (p.reloadWeapon ? 4 : 0) | (src.now < p.invulnUntil ? 8 : 0) | (p.walking ? 16 : 0) | (p.heavy ? 32 : 0);
    v.setUint8(o, p.slot);
    v.setUint8(o + 1, flags);
    v.setUint16(o + 2, u16(p.x * POS_SCALE), true);
    v.setUint16(o + 4, u16(p.y * POS_SCALE), true);
    v.setInt16(o + 6, i16(p.vx * VEL_SCALE), true);
    v.setInt16(o + 8, i16(p.vy * VEL_SCALE), true);
    v.setUint16(o + 10, quantizeAngle(p.aim), true);
    v.setUint8(o + 12, u8c(p.hp));
    v.setUint8(o + 13, WEAPONS[p.weapon].index);
    v.setUint8(o + 14, u8c(p.pistolMag));
    v.setUint8(o + 15, p.heavy ? WEAPONS[p.heavy].index : 255);
    v.setUint8(o + 16, u8c(p.heavyMag));
    v.setUint8(o + 17, u8c(p.heavyReserve));
    v.setUint16(o + 18, u16(p.kills), true);
    v.setUint16(o + 20, u16(p.deaths), true);
    v.setUint16(o + 22, u16(p.score), true);
    v.setUint32(o + 24, p.lastSeq >>> 0, true);
    v.setUint16(o + 28, u16(p.reloadWeapon ? p.reloadUntil - p.clock : 0), true);
    v.setUint16(o + 30, u16(Math.max(0, p.nextFireAt - p.clock)), true);
    v.setUint16(o + 32, u16(p.spreadHeat * 1e4), true);
    v.setUint16(o + 34, p.shotCounter & 65535, true);
    v.setUint16(o + 36, u16(p.alive ? 0 : Math.max(0, p.respawnAt - src.time)), true);
    v.setUint16(o + 38, u16(p.assists), true);
    o += PLAYER_BYTES;
  }
  v.setUint8(o, pickups.length);
  o += 1;
  for (const pk of pickups) {
    v.setUint16(o, pk.id & 65535, true);
    v.setUint8(o + 2, WEAPONS[pk.weapon].index);
    v.setUint8(o + 3, (pk.active ? 1 : 0) | (pk.dropped ? 2 : 0) | (pk.supply ? 4 : 0));
    v.setUint16(o + 4, u16(pk.x * POS_SCALE), true);
    v.setUint16(o + 6, u16(pk.y * POS_SCALE), true);
    o += 8;
  }
  v.setUint16(o, shots.length, true);
  o += 2;
  for (const s of shots) {
    v.setUint8(o, s.shooter);
    v.setUint8(o + 1, WEAPONS[s.weapon].index);
    v.setUint16(o + 2, s.shotId & 65535, true);
    v.setUint16(o + 4, u16(s.ox * POS_SCALE), true);
    v.setUint16(o + 6, u16(s.oy * POS_SCALE), true);
    v.setUint8(o + 8, s.pellets.length);
    v.setUint8(o + 9, 0);
    o += 10;
    for (const pl of s.pellets) {
      v.setUint16(o, quantizeAngle(pl.angle), true);
      v.setUint16(o + 2, u16(pl.dist * POS_SCALE), true);
      v.setUint8(o + 4, pl.hit < 0 ? 255 : pl.hit);
      v.setUint8(o + 5, pl.kind);
      o += 6;
    }
  }
  v.setUint8(o, melees.length);
  o += 1;
  for (const m of melees) {
    v.setUint8(o, m.shooter);
    v.setUint16(o + 1, quantizeAngle(m.angle), true);
    v.setUint8(o + 3, m.hit < 0 ? 255 : m.hit);
    o += 4;
  }
  if (o !== size2) throw new Error(`snapshot size mismatch ${o} != ${size2}`);
  return buf;
}

// packages/shared/src/net/protocol.ts
var PROTOCOL_VERSION = 2;
var roomId = external_exports.string().regex(/^[A-Za-z0-9_-]{4,32}$/);
var ClientMessageSchema = external_exports.discriminatedUnion("type", [
  external_exports.object({
    type: external_exports.literal("hello"),
    protocol: external_exports.literal(PROTOCOL_VERSION),
    token: external_exports.string().min(16).max(256),
    roomId,
    character: external_exports.enum(CHARACTER_IDS),
    reconnectToken: external_exports.string().min(16).max(128).optional(),
    clientVersion: external_exports.string().max(32).optional()
  }),
  external_exports.object({ type: external_exports.literal("ready"), ready: external_exports.boolean() }),
  external_exports.object({ type: external_exports.literal("character"), character: external_exports.enum(CHARACTER_IDS) }),
  external_exports.object({ type: external_exports.literal("map"), mapId: external_exports.enum(MAP_IDS) }),
  external_exports.object({ type: external_exports.literal("start") }),
  external_exports.object({ type: external_exports.literal("rematch") }),
  external_exports.object({ type: external_exports.literal("leave") }),
  external_exports.object({ type: external_exports.literal("ping"), t: external_exports.number().finite() })
]);
var WS_CLOSE = {
  NORMAL: 1e3,
  GOING_AWAY: 1001,
  POLICY: 1008,
  TOO_BIG: 1009,
  INTERNAL: 1011,
  UNAUTHORIZED: 4001,
  ROOM_NOT_FOUND: 4004,
  ROOM_FULL: 4005,
  REPLACED: 4009,
  ROOM_CLOSED: 4010,
  KICKED: 4011
};

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
  session_started: external_exports.object({ platform, method: external_exports.enum(["telegram", "dev", "guest"]) }),
  profile_created: external_exports.object({ method: external_exports.enum(["telegram", "dev", "guest"]) }),
  lobby_created: external_exports.object({ roomId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), isPrivate: external_exports.boolean() }),
  lobby_joined: external_exports.object({ roomId: external_exports.string(), viaInvite: external_exports.boolean() }),
  lobby_left: external_exports.object({ roomId: external_exports.string(), phase: external_exports.string() }),
  match_started: external_exports.object({ matchId: external_exports.string(), roomId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), players: external_exports.number().int() }),
  match_completed: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), durationMs: external_exports.number().int(), players: external_exports.number().int(), reason: external_exports.string() }),
  match_abandoned: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS), phase: external_exports.string() }),
  map_played: external_exports.object({ matchId: external_exports.string(), mapId: external_exports.enum(MAP_IDS) }),
  invite_created: external_exports.object({ code: external_exports.string(), roomId: external_exports.string() })
};
var ClientEventEnvelopeSchema = external_exports.object({
  id: external_exports.string().uuid(),
  name: external_exports.enum(CLIENT_EVENTS),
  ts: external_exports.number().int().positive(),
  props: external_exports.record(external_exports.unknown()).default({})
}).strict();
var EventsBatchSchema = external_exports.object({ events: external_exports.array(ClientEventEnvelopeSchema).min(1).max(50) }).strict();
function parseClientEventProps(name, props) {
  const r = CLIENT_EVENT_PROPS[name].safeParse(props);
  return r.success ? r.data : null;
}

// packages/shared/src/schemas/api.ts
var displayNameSchema = external_exports.string().trim().min(2).max(MAX_NAME_LENGTH).regex(/^[\p{L}\p{N} _.\-’']+$/u, "\u0418\u043C\u044F \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0431\u0443\u043A\u0432\u044B, \u0446\u0438\u0444\u0440\u044B, \u043F\u0440\u043E\u0431\u0435\u043B, _ . -");
var TelegramAuthRequest = external_exports.object({ initData: external_exports.string().min(10).max(8192), platform: PlatformSchema.optional(), clientVersion: external_exports.string().max(32).optional() }).strict();
var DevAuthRequest = external_exports.object({
  name: displayNameSchema,
  deviceId: external_exports.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional()
}).strict();
var GuestAuthRequest = external_exports.object({
  name: displayNameSchema,
  deviceId: external_exports.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  platform: PlatformSchema.optional(),
  clientVersion: external_exports.string().max(32).optional()
}).strict();
var UpdateProfileRequest = external_exports.object({ displayName: displayNameSchema.optional(), preferredCharacter: external_exports.enum(CHARACTER_IDS).optional() }).strict();
var CreateRoomRequest = external_exports.object({ mapId: external_exports.enum(MAP_IDS), isPrivate: external_exports.boolean().default(true) }).strict();
var QuickMatchRequest = external_exports.object({ mapId: external_exports.enum(MAP_IDS).optional() }).strict();
var AdminLoginRequest = external_exports.object({ username: external_exports.string().min(3).max(32), password: external_exports.string().min(1).max(256) }).strict();
var AdminCreateUserRequest = external_exports.object({
  username: external_exports.string().regex(/^[a-z0-9_.-]{3,32}$/),
  password: external_exports.string().min(12).max(256),
  role: external_exports.enum(["admin", "viewer"])
}).strict();

// apps/server/src/http/auth.ts
function bearerToken(ctx) {
  const h = String(ctx.req.headers.authorization ?? "");
  const m = /^Bearer ([A-Za-z0-9_\-.~+/=]{16,256})$/.exec(h);
  return m ? m[1] : null;
}
function requireUser(sessions) {
  return async (ctx) => {
    const token = bearerToken(ctx);
    if (!token) throw new HttpError(401, "unauthorized", "Authentication required");
    const user = await sessions.verify(token);
    if (!user) throw new HttpError(401, "unauthorized", "Session expired or invalid");
    ctx.state.user = user;
  };
}
function currentUser(ctx) {
  const u = ctx.state.user;
  if (!u) throw new HttpError(401, "unauthorized", "Authentication required");
  return u;
}

// apps/server/src/security/rateLimit.ts
var RateLimiter = class {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
  }
  capacity;
  refillPerSec;
  buckets = /* @__PURE__ */ new Map();
  lastSweep = Date.now();
  /** Consumes `cost` tokens; returns false when the key is over the limit. */
  take(key, cost = 1, now = Date.now()) {
    if (now - this.lastSweep > 6e4) this.sweep(now);
    let b2 = this.buckets.get(key);
    if (!b2) {
      b2 = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b2);
    }
    b2.tokens = Math.min(this.capacity, b2.tokens + (now - b2.updated) / 1e3 * this.refillPerSec);
    b2.updated = now;
    if (b2.tokens < cost) return false;
    b2.tokens -= cost;
    return true;
  }
  sweep(now) {
    this.lastSweep = now;
    for (const [k, b2] of this.buckets) if (now - b2.updated > 10 * 6e4) this.buckets.delete(k);
  }
};
function rateLimit(limiter, key = (ctx) => ctx.ip) {
  return (ctx) => {
    if (!limiter.take(key(ctx))) throw new HttpError(429, "rate_limited", "Too many requests", { "retry-after": "5" });
  };
}

// apps/server/src/api/rooms.ts
function inviteUrls(env2, code) {
  const web = `${env2.PUBLIC_URL.replace(/\/$/, "")}/?invite=${encodeURIComponent(code)}`;
  const tg = env2.TELEGRAM_BOT_USERNAME ? env2.TELEGRAM_MINIAPP_SHORT_NAME ? `https://t.me/${env2.TELEGRAM_BOT_USERNAME}/${env2.TELEGRAM_MINIAPP_SHORT_NAME}?startapp=${encodeURIComponent(code)}` : `https://t.me/${env2.TELEGRAM_BOT_USERNAME}?startapp=${encodeURIComponent(code)}` : null;
  return { web, tg };
}
var registerRoomRoutes = (router, { env: env2, services: services2, rooms: rooms2 }) => {
  const auth = requireUser(services2.sessions);
  const createLimiter = new RateLimiter(10, 0.2);
  const lookupLimiter = new RateLimiter(60, 2);
  router.post("/api/rooms", auth, rateLimit(createLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(CreateRoomRequest);
    let room;
    try {
      room = rooms2.create(body.mapId, body.isPrivate, user.userId);
    } catch {
      throw new HttpError(503, "capacity", "\u0421\u0435\u0440\u0432\u0435\u0440 \u043F\u0435\u0440\u0435\u043F\u043E\u043B\u043D\u0435\u043D, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435");
    }
    let inviteCode = null;
    let inviteUrl = null;
    let webUrl = `${env2.PUBLIC_URL.replace(/\/$/, "")}/?room=${room.id}`;
    if (body.isPrivate) {
      const inv = await services2.invites.create(room.id, user.userId);
      inviteCode = inv.code;
      room.inviteCode = inv.code;
      const urls = inviteUrls(env2, inv.code);
      inviteUrl = urls.tg ?? urls.web;
      webUrl = urls.web;
      services2.analytics.server("invite_created", { code: inv.code, roomId: room.id }, user);
    }
    const res = { roomId: room.id, inviteCode, inviteUrl, webUrl, mapId: room.mapId };
    ctx.json(201, res);
  });
  router.post("/api/rooms/quick", auth, rateLimit(lookupLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(QuickMatchRequest);
    const room = rooms2.quickMatch(user.userId, body.mapId);
    ctx.json(200, { roomId: room.id, mapId: room.mapId });
  });
  router.get("/api/rooms/:id", auth, (ctx) => {
    const room = rooms2.get(ctx.params.id ?? "");
    if (!room) throw new HttpError(404, "room_not_found", "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    const user = currentUser(ctx);
    ctx.json(200, { ...room.info(), joinable: room.isJoinable(user.userId), mapName: getMap(room.mapId).name });
  });
  router.get("/api/invites/:code", rateLimit(lookupLimiter), async (ctx) => {
    const code = ctx.params.code ?? "";
    if (!/^[A-Za-z0-9]{6,16}$/.test(code)) throw new HttpError(400, "bad_code", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434 \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F");
    const resolved = await services2.invites.resolve(code);
    let info = { code, status: "not_found", roomId: null, mapId: null, players: 0, maxPlayers: 0, hostName: null };
    if (resolved) {
      const room = rooms2.get(resolved.roomId);
      if (!room) info = { ...info, status: "expired" };
      else {
        const phase = room.phase;
        const status = room.occupancy >= room.config.maxPlayers ? "full" : phase === "finished" ? "finished" : phase === "waiting" ? "joinable" : room.isJoinable() ? "in_progress" : "full";
        info = { code, status, roomId: room.id, mapId: room.mapId, players: room.occupancy, maxPlayers: room.config.maxPlayers, hostName: room.hostName() };
      }
    }
    ctx.json(200, info);
  });
};

// apps/server/src/api/auth.ts
import { createHmac as createHmac4, randomBytes as randomBytes4 } from "node:crypto";

// apps/server/src/auth/telegram.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var UserSchema = external_exports.object({
  id: external_exports.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: external_exports.string().max(256).default(""),
  last_name: external_exports.string().max(256).optional(),
  language_code: external_exports.string().max(16).optional()
}).passthrough();
function telegramSecretKey(botToken) {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}
function dataCheckString(params) {
  const pairs = [];
  for (const [k, v] of params) if (k !== "hash") pairs.push(`${k}=${v}`);
  pairs.sort();
  return pairs.join("\n");
}
function validateInitData(initData, botToken, maxAgeSec, nowSec = Math.floor(Date.now() / 1e3)) {
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const seen = /* @__PURE__ */ new Set();
  for (const k of params.keys()) {
    if (seen.has(k)) return { ok: false, reason: "malformed" };
    seen.add(k);
  }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "missing_hash" };
  const expected = createHmac("sha256", telegramSecretKey(botToken)).update(dataCheckString(params)).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "malformed" };
  if (authDate > nowSec + 60) return { ok: false, reason: "future" };
  if (nowSec - authDate > maxAgeSec) return { ok: false, reason: "stale" };
  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no_user" };
  let user;
  try {
    const parsed = UserSchema.safeParse(JSON.parse(rawUser));
    if (!parsed.success) return { ok: false, reason: "no_user" };
    user = parsed.data;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const startParam = params.get("start_param");
  return {
    ok: true,
    authDate,
    startParam: startParam && /^[A-Za-z0-9_-]{1,64}$/.test(startParam) ? startParam : null,
    user: { id: user.id, firstName: user.first_name, lastName: user.last_name ?? null, languageCode: user.language_code ?? null }
  };
}
function displayNameFromTelegram(u) {
  const raw = `${u.firstName} ${u.lastName ?? ""}`.normalize("NFKC");
  const cleaned = raw.replace(/[^\p{L}\p{N} _.\-’']/gu, "").replace(/\s+/g, " ").trim().slice(0, 24).trim();
  return cleaned.length >= 2 ? cleaned : `\u0418\u0433\u0440\u043E\u043A ${String(u.id).slice(-4)}`;
}

// apps/server/src/services/persistence.ts
import { randomBytes as randomBytes3 } from "node:crypto";

// apps/server/src/auth/activity.ts
function utcDay(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().slice(0, 10);
}
var ActivityTracker = class {
  constructor(sql2, log2) {
    this.sql = sql2;
    this.log = log2;
  }
  sql;
  log;
  lastDay = /* @__PURE__ */ new Map();
  /** Records activity for today (UTC). Never throws. */
  async touch(userId, now = /* @__PURE__ */ new Date()) {
    const day = utcDay(now);
    if (this.lastDay.get(userId) === day) return;
    this.lastDay.set(userId, day);
    if (this.lastDay.size > 5e4) this.lastDay.clear();
    try {
      await this.sql`INSERT INTO user_daily_activity (user_id, day, first_seen_at) VALUES (${userId}, ${day}::date, ${now}) ON CONFLICT DO NOTHING`;
    } catch (e) {
      this.lastDay.delete(userId);
      this.log.warn("activity touch failed", { err: e });
    }
  }
  forget(userId) {
    this.lastDay.delete(userId);
  }
};

// apps/server/src/auth/users.ts
var UserRepo = class {
  constructor(sql2) {
    this.sql = sql2;
  }
  sql;
  async upsertTelegram(tg, platform2) {
    const name = displayNameFromTelegram(tg);
    const rows = await this.sql`
      INSERT INTO users (telegram_id, display_name, language_code, platform)
      VALUES (${String(tg.id)}::bigint, ${name}, ${tg.languageCode}, ${platform2})
      ON CONFLICT (telegram_id) DO UPDATE
        SET language_code = EXCLUDED.language_code,
            platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0];
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }
  /** Guest player of the public website, keyed by an HMAC of the browser's device secret. The name is set only on creation. */
  async findGuest(deviceKey) {
    const rows = await this.sql`SELECT id FROM users WHERE dev_device_id = ${deviceKey} AND deleted_at IS NULL`;
    return rows[0]?.id ?? null;
  }
  async upsertGuest(deviceKey, name, platform2) {
    const rows = await this.sql`
      INSERT INTO users (dev_device_id, display_name, platform)
      VALUES (${deviceKey}, ${name}, ${platform2})
      ON CONFLICT (dev_device_id) DO UPDATE
        SET platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0];
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }
  async upsertDev(deviceId, name, platform2) {
    const rows = await this.sql`
      INSERT INTO users (dev_device_id, display_name, platform)
      VALUES (${deviceId}, ${name}, ${platform2})
      ON CONFLICT (dev_device_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0];
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }
};

// apps/server/src/auth/tokens.ts
import { createHmac as createHmac2, randomBytes, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function hashToken(secret, token, purpose = "session") {
  return createHmac2("sha256", secret).update(`${purpose}:${token}`).digest();
}
function safeEqualStr(a, b2) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b2);
  return ba.length === bb.length && timingSafeEqual2(ba, bb);
}

// apps/server/src/auth/sessions.ts
var TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;
var LAST_SEEN_THROTTLE_MS = 5 * 6e4;
var SessionStore = class {
  constructor(sql2, secret, ttlHours, activity, log2) {
    this.sql = sql2;
    this.secret = secret;
    this.ttlHours = ttlHours;
    this.activity = activity;
    this.log = log2;
  }
  sql;
  secret;
  ttlHours;
  activity;
  log;
  lastSeenWrite = /* @__PURE__ */ new Map();
  async issue(userId, method, platform2, clientVersion) {
    const token = newToken(32);
    const expiresAt = new Date(Date.now() + this.ttlHours * 36e5);
    const rows = await this.sql`
      INSERT INTO sessions (user_id, token_hash, method, platform, client_version, expires_at)
      VALUES (${userId}, ${hashToken(this.secret, token)}, ${method}, ${platform2}, ${clientVersion}, ${expiresAt})
      RETURNING id`;
    await this.sql`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`;
    await this.activity.touch(userId);
    return { token, sessionId: rows[0].id, expiresAt };
  }
  async verify(token) {
    if (!TOKEN_RE.test(token)) return null;
    const rows = await this.sql`
      SELECT s.id AS session_id, s.user_id, s.platform, s.last_seen_at, u.display_name, p.level
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.token_hash = ${hashToken(this.secret, token)}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.deleted_at IS NULL`;
    const r = rows[0];
    if (!r) return null;
    const now = Date.now();
    const last = this.lastSeenWrite.get(r.session_id) ?? r.last_seen_at.getTime();
    if (now - last > LAST_SEEN_THROTTLE_MS) {
      this.lastSeenWrite.set(r.session_id, now);
      if (this.lastSeenWrite.size > 5e4) this.lastSeenWrite.clear();
      this.sql`UPDATE sessions SET last_seen_at = now() WHERE id = ${r.session_id}`.catch((e) => this.log.warn("session touch failed", { err: e }));
      this.sql`UPDATE users SET last_seen_at = now() WHERE id = ${r.user_id}`.catch((e) => this.log.warn("user touch failed", { err: e }));
    }
    void this.activity.touch(r.user_id);
    return { userId: r.user_id, sessionId: r.session_id, displayName: r.display_name, level: r.level ?? 1, platform: r.platform ?? null };
  }
  async revoke(token) {
    if (!TOKEN_RE.test(token)) return false;
    const rows = await this.sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(this.secret, token)} AND revoked_at IS NULL RETURNING id`;
    return rows.length > 0;
  }
  async revokeAllForUser(userId) {
    await this.sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
  }
};

// apps/server/src/profiles/repo.ts
function toPublicProfile(r) {
  const lv = levelForXp(r.xp);
  return {
    id: r.id,
    displayName: r.display_name,
    telegramLinked: r.telegram_id !== null,
    createdAt: r.created_at.toISOString(),
    level: lv.level,
    xp: r.xp,
    xpIntoLevel: lv.intoLevel,
    xpForNextLevel: lv.nextLevelCost,
    matchesPlayed: r.matches_played,
    matchesCompleted: r.matches_completed,
    wins: r.wins,
    losses: r.losses,
    kills: r.kills,
    assists: r.assists,
    deaths: r.deaths,
    playtimeSec: r.playtime_sec,
    currentWinStreak: r.current_win_streak,
    bestWinStreak: r.best_win_streak,
    preferredCharacter: r.preferred_character
  };
}
var ProfileRepo = class {
  constructor(sql2) {
    this.sql = sql2;
  }
  sql;
  async get(userId) {
    const rows = await this.sql`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp,
             COALESCE(p.matches_played, 0) AS matches_played, COALESCE(p.matches_completed, 0) AS matches_completed,
             COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
             COALESCE(p.assists, 0) AS assists,
             COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
             COALESCE(p.current_win_streak, 0) AS current_win_streak, COALESCE(p.best_win_streak, 0) AS best_win_streak,
             p.preferred_character
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
    return rows[0] ? toPublicProfile(rows[0]) : null;
  }
  async update(userId, patch) {
    await this.sql.begin(async (tx) => {
      if (patch.displayName !== void 0) await tx`UPDATE users SET display_name = ${patch.displayName} WHERE id = ${userId}`;
      if (patch.preferredCharacter !== void 0) {
        await tx`INSERT INTO profiles (user_id, preferred_character) VALUES (${userId}, ${patch.preferredCharacter})
                 ON CONFLICT (user_id) DO UPDATE SET preferred_character = EXCLUDED.preferred_character, updated_at = now()`;
      }
    });
  }
  async history(userId, limit) {
    const rows = await this.sql`
      SELECT mp.match_id, m.map_id, mp.character, m.ended_at, m.started_at, m.duration_ms, mp.place, m.player_count,
             mp.kills, mp.assists, mp.deaths, mp.xp_awarded, mp.won
      FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = ${userId} AND m.status = 'completed'
      ORDER BY m.ended_at DESC NULLS LAST
      LIMIT ${limit}`;
    return rows.map((r) => ({
      matchId: r.match_id,
      mapId: r.map_id,
      character: r.character,
      endedAt: (r.ended_at ?? r.started_at).toISOString(),
      durationMs: r.duration_ms ?? 0,
      place: r.place ?? 0,
      players: r.player_count,
      kills: r.kills,
      assists: r.assists,
      deaths: r.deaths,
      xpGained: r.xp_awarded,
      won: r.won
    }));
  }
  async achievements(userId) {
    const rows = await this.sql`
      SELECT achievement_id, unlocked_at FROM player_achievements WHERE user_id = ${userId}`;
    const got = new Map(rows.map((r) => [r.achievement_id, r.unlocked_at]));
    return ACHIEVEMENT_IDS.map((id) => ({
      id,
      title: ACHIEVEMENTS[id].title,
      description: ACHIEVEMENTS[id].description,
      unlockedAt: got.get(id)?.toISOString() ?? null
    }));
  }
  /**
   * Permanently deletes the account. Cascades remove profile, sessions, activity, match participation
   * and achievements; analytics events and error records keep no user reference (SET NULL).
   */
  async deleteUser(userId) {
    const rows = await this.sql`DELETE FROM users WHERE id = ${userId} RETURNING id`;
    return rows.length > 0;
  }
};

// apps/server/src/progression/recorder.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function seedAchievements(sql2) {
  for (const id of ACHIEVEMENT_IDS) {
    const a = ACHIEVEMENTS[id];
    await sql2`
      INSERT INTO achievements (id, title, description, xp_reward) VALUES (${a.id}, ${a.title}, ${a.description}, ${a.xpReward})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, xp_reward = EXCLUDED.xp_reward`;
  }
}
async function existingUsers(tx, ids) {
  const valid = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
  if (valid.length === 0) return /* @__PURE__ */ new Set();
  const rows = await tx`SELECT id FROM users WHERE id IN ${tx(valid)} AND deleted_at IS NULL`;
  return new Set(rows.map((r) => r.id));
}
var PgMatchRecorder = class {
  constructor(sql2, log2) {
    this.sql = sql2;
    this.log = log2;
  }
  sql;
  log;
  async matchStarted(m) {
    if (!UUID_RE.test(m.matchId)) return;
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO matches (id, room_id, map_id, is_private, status, started_at, player_count)
        VALUES (${m.matchId}, ${m.roomId}, ${m.mapId}, ${m.isPrivate}, 'active', ${m.startedAt}, ${m.players.length})
        ON CONFLICT (id) DO NOTHING`;
      const known = await existingUsers(tx, m.players.map((p) => p.userId));
      for (const p of m.players) {
        if (!known.has(p.userId)) continue;
        await tx`
          INSERT INTO match_participants (match_id, user_id, character, via_invite, joined_at)
          VALUES (${m.matchId}, ${p.userId}, ${p.character}, ${p.viaInvite}, ${m.startedAt})
          ON CONFLICT (match_id, user_id) DO NOTHING`;
      }
    });
  }
  async matchCompleted(m) {
    if (!UUID_RE.test(m.matchId)) throw new Error("matchId must be a UUID");
    return this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO matches (id, room_id, map_id, is_private, status, started_at, player_count)
        VALUES (${m.matchId}, ${m.roomId}, ${m.mapId}, ${m.isPrivate}, 'active', ${m.startedAt}, ${m.playersAtEnd})
        ON CONFLICT (id) DO NOTHING`;
      const locked = await tx`SELECT results_processed_at FROM matches WHERE id = ${m.matchId} FOR UPDATE`;
      const known = await existingUsers(tx, m.participants.map((p) => p.userId));
      const participants = m.participants.filter((p) => known.has(p.userId)).sort((a, b2) => a.userId < b2.userId ? -1 : 1);
      if (locked[0]?.results_processed_at) return this.readResults(tx, m.matchId, participants.map((p) => p.userId));
      const out = /* @__PURE__ */ new Map();
      for (const p of participants) {
        await tx`INSERT INTO profiles (user_id) VALUES (${p.userId}) ON CONFLICT DO NOTHING`;
        const [prof] = await tx`
          SELECT xp, level, matches_completed, wins, current_win_streak, best_win_streak FROM profiles WHERE user_id = ${p.userId} FOR UPDATE`;
        const withFriends = m.isPrivate && p.viaInvite && m.playersAtEnd >= 2;
        const sharedPlace = p.completed && m.participants.some((o) => o.userId !== p.userId && o.completed && o.place === p.place);
        const perf = { kills: p.kills, assists: p.assists, deaths: p.deaths, place: p.place, playersAtEnd: m.playersAtEnd, completed: p.completed, withFriends, sharedPlace };
        const ownedRows = await tx`SELECT achievement_id FROM player_achievements WHERE user_id = ${p.userId}`;
        const prev = { xp: prof.xp, level: prof.level, matchesCompleted: prof.matches_completed, wins: prof.wins, currentWinStreak: prof.current_win_streak };
        const { won, lost, streak, unlocked, xpGained: xp, totalXp, level } = applyMatchProgress(prev, perf, new Set(ownedRows.map((r) => r.achievement_id)));
        await tx`
          UPDATE profiles SET
            xp = ${totalXp},
            level = ${level},
            matches_played = matches_played + 1,
            matches_completed = matches_completed + ${p.completed ? 1 : 0},
            wins = wins + ${won ? 1 : 0},
            losses = losses + ${lost ? 1 : 0},
            kills = kills + ${p.kills},
            assists = assists + ${p.assists},
            deaths = deaths + ${p.deaths},
            playtime_sec = playtime_sec + ${Math.max(0, Math.round(p.playtimeMs / 1e3))},
            current_win_streak = ${streak},
            best_win_streak = GREATEST(best_win_streak, ${streak}),
            preferred_character = COALESCE(preferred_character, ${p.character}),
            updated_at = now()
          WHERE user_id = ${p.userId}`;
        for (const a of unlocked) {
          await tx`INSERT INTO player_achievements (user_id, achievement_id, match_id) VALUES (${p.userId}, ${a}, ${m.matchId}) ON CONFLICT DO NOTHING`;
        }
        await tx`
          INSERT INTO match_participants (match_id, user_id, character, place, kills, assists, deaths, score, damage_dealt, completed, won, via_invite, xp_awarded, joined_at, left_at)
          VALUES (${m.matchId}, ${p.userId}, ${p.character}, ${p.place}, ${p.kills}, ${p.assists}, ${p.deaths}, ${p.score}, ${p.damageDealt}, ${p.completed}, ${won}, ${p.viaInvite}, ${xp}, ${m.startedAt}, ${p.completed ? null : m.endedAt})
          ON CONFLICT (match_id, user_id) DO UPDATE SET
            character = EXCLUDED.character, place = EXCLUDED.place, kills = EXCLUDED.kills, assists = EXCLUDED.assists, deaths = EXCLUDED.deaths,
            score = EXCLUDED.score, damage_dealt = EXCLUDED.damage_dealt, completed = EXCLUDED.completed, won = EXCLUDED.won,
            via_invite = match_participants.via_invite OR EXCLUDED.via_invite, xp_awarded = EXCLUDED.xp_awarded, left_at = EXCLUDED.left_at`;
        out.set(p.userId, { xpGained: xp, totalXp, level, leveledUp: level > prof.level, newAchievements: unlocked });
      }
      await tx`
        UPDATE matches SET status = 'completed', ended_at = ${m.endedAt}, duration_ms = ${Math.max(0, Math.round(m.durationMs))},
          end_reason = ${m.endReason}, player_count = ${m.playersAtEnd}, results_processed_at = now()
        WHERE id = ${m.matchId}`;
      return out;
    });
  }
  async readResults(tx, matchId, userIds) {
    const out = /* @__PURE__ */ new Map();
    if (userIds.length === 0) return out;
    const rows = await tx`
      SELECT mp.user_id, mp.xp_awarded, p.xp, p.level
      FROM match_participants mp JOIN profiles p ON p.user_id = mp.user_id
      WHERE mp.match_id = ${matchId} AND mp.user_id IN ${tx(userIds)}`;
    const ach = await tx`
      SELECT user_id, achievement_id FROM player_achievements WHERE match_id = ${matchId} AND user_id IN ${tx(userIds)}`;
    for (const r of rows) {
      out.set(r.user_id, {
        xpGained: r.xp_awarded,
        totalXp: r.xp,
        level: r.level,
        leveledUp: false,
        newAchievements: ach.filter((a) => a.user_id === r.user_id).map((a) => a.achievement_id)
      });
    }
    return out;
  }
  async matchAbandoned(matchId, reason) {
    if (!UUID_RE.test(matchId)) return;
    await this.sql`
      UPDATE matches SET status = 'abandoned', ended_at = now(), end_reason = ${reason.slice(0, 40)}
      WHERE id = ${matchId} AND status = 'active'`;
    this.log.info("match abandoned", { matchId, reason });
  }
};

// apps/server/src/analytics/writer.ts
import { randomUUID } from "node:crypto";

// apps/server/src/analytics/sanitize.ts
import { createHash } from "node:crypto";
function sanitizeMessage(input, max = 300) {
  return String(input).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\b(bearer|token|hash|initdata|init_data|signature|password|secret|authorization|cookie)\b\s*[=:]?\s*[^\s,;]+/gi, "$1=[redacted]").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]").replace(/https?:\/\/[^\s?#]+[?#][^\s]*/g, (m) => m.replace(/[?#].*$/, "?\u2026")).replace(/[A-Za-z0-9_-]{24,}/g, "[id]").replace(/\d{6,}/g, "[num]").replace(/\s+/g, " ").trim().slice(0, max);
}
function sanitizeLabel(input, max = 40) {
  const s = String(input).replace(/[^\p{L}\p{N}_.:\-/ ]/gu, "").trim().slice(0, max);
  return s || "unknown";
}
function errorFingerprint(source, component, category, message) {
  const shape = message.toLowerCase().replace(/\[(?:num|id|email|redacted)\]/g, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 160);
  return createHash("sha1").update(`${source}|${component}|${category}|${shape}`).digest("hex").slice(0, 16);
}
var UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(v) {
  return typeof v === "string" && UUID_RE2.test(v) ? v : null;
}
function boundedProps(props) {
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (++n > 24) break;
    const key = k.slice(0, 40);
    if (typeof v === "string") out[key] = v.slice(0, 200);
    else if (typeof v === "number") out[key] = Number.isFinite(v) ? v : null;
    else if (typeof v === "boolean" || v === null) out[key] = v;
  }
  return out;
}

// apps/server/src/analytics/writer.ts
async function insertEvents(sql2, rows) {
  if (rows.length === 0) return [];
  const inserted = await sql2`
    INSERT INTO analytics_events (id, name, source, user_id, session_id, occurred_at, platform, props)
    SELECT r.id, r.name, r.source, u.id, s.id, r.occurred_at, r.platform, COALESCE(r.props, '{}'::jsonb)
    FROM jsonb_to_recordset(${sql2.json(rows)})
      AS r(id uuid, name text, source text, user_id uuid, session_id uuid, occurred_at timestamptz, platform text, props jsonb)
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN sessions s ON s.id = r.session_id
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return inserted.map((r) => r.id);
}
async function insertErrors(sql2, rows) {
  if (rows.length === 0) return;
  await sql2`
    INSERT INTO app_errors (occurred_at, source, component, category, message, fingerprint, client_version, server_version, session_id, user_id)
    SELECT r.occurred_at, r.source, r.component, r.category, r.message, r.fingerprint, r.client_version, r.server_version, r.session_id, u.id
    FROM jsonb_to_recordset(${sql2.json(rows)})
      AS r(occurred_at timestamptz, source text, component text, category text, message text, fingerprint text,
           client_version text, server_version text, session_id uuid, user_id uuid)
    LEFT JOIN users u ON u.id = r.user_id`;
}
function errorRow(e) {
  const component = sanitizeLabel(e.component);
  const category = sanitizeLabel(e.category);
  const message = sanitizeMessage(e.message) || "unknown";
  return {
    occurred_at: (e.at ?? /* @__PURE__ */ new Date()).toISOString(),
    source: e.source,
    component,
    category,
    message,
    fingerprint: errorFingerprint(e.source, component, category, message),
    client_version: e.clientVersion ? sanitizeLabel(e.clientVersion, 32) : null,
    server_version: e.serverVersion ? sanitizeLabel(e.serverVersion, 32) : null,
    session_id: uuidOrNull(e.sessionId),
    user_id: uuidOrNull(e.userId)
  };
}
var PgAnalytics = class {
  constructor(sql2, log2, serverVersion, flushMs = 1e3) {
    this.sql = sql2;
    this.log = log2;
    this.serverVersion = serverVersion;
    this.timer = setInterval(() => void this.flush(), flushMs);
    this.timer.unref?.();
  }
  sql;
  log;
  serverVersion;
  events = [];
  errors = [];
  timer;
  flushing = null;
  server(name, props, ctx = {}) {
    try {
      this.events.push({
        id: randomUUID(),
        name,
        source: "server",
        user_id: uuidOrNull(ctx.userId),
        session_id: uuidOrNull(ctx.sessionId),
        occurred_at: (/* @__PURE__ */ new Date()).toISOString(),
        platform: ctx.platform ? sanitizeLabel(ctx.platform, 32) : null,
        props: boundedProps(props)
      });
      if (this.events.length > 2e3) this.events.splice(0, this.events.length - 2e3);
      if (this.events.length >= 100) void this.flush();
    } catch (e) {
      this.log.warn("analytics enqueue failed", { err: e });
    }
  }
  error(e) {
    try {
      this.errors.push(errorRow({ ...e, serverVersion: this.serverVersion }));
      if (this.errors.length > 1e3) this.errors.splice(0, this.errors.length - 1e3);
      if (this.errors.length >= 50) void this.flush();
    } catch (err) {
      this.log.warn("error enqueue failed", { err });
    }
  }
  /** Writes buffered rows; failures are logged and the batch is dropped (never retried forever). */
  flush() {
    if (this.flushing) return this.flushing;
    const ev = this.events;
    const er = this.errors;
    if (ev.length === 0 && er.length === 0) return Promise.resolve();
    this.events = [];
    this.errors = [];
    this.flushing = (async () => {
      try {
        await insertEvents(this.sql, ev);
      } catch (e) {
        this.log.warn("analytics flush failed", { err: e, dropped: ev.length });
      }
      try {
        await insertErrors(this.sql, er);
      } catch (e) {
        this.log.warn("error flush failed", { err: e, dropped: er.length });
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  async close() {
    clearInterval(this.timer);
    await this.flush();
    if (this.events.length || this.errors.length) await this.flush();
  }
};

// apps/server/src/admin/auth.ts
import { createHmac as createHmac3 } from "node:crypto";

// apps/server/src/admin/password.ts
import { randomBytes as randomBytes2, scrypt as scryptCb, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
var N = 16384;
var R = 8;
var P2 = 1;
var KEYLEN = 64;
function scrypt(password, salt, n, r, p) {
  return new Promise(
    (resolve2, reject) => scryptCb(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve2(key))
  );
}
async function hashPassword(password) {
  const salt = randomBytes2(16);
  const key = await scrypt(password, salt, N, R, P2);
  return `scrypt$${N}$${R}$${P2}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n > 1 << 20) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const key = await scrypt(password, salt, n, r, p);
  return key.length === expected.length && timingSafeEqual3(key, expected);
}
var DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + Buffer.alloc(64).toString("base64url");
function passwordProblems(password) {
  if (password.length < 12) return "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043A\u043E\u0440\u043E\u0447\u0435 12 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432";
  if (/^(.)\1+$/.test(password)) return "\u041F\u0430\u0440\u043E\u043B\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043F\u0440\u043E\u0441\u0442\u043E\u0439";
  return null;
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
    return createHmac3("sha256", this.secret).update(`csrf:${token}`).digest("base64url");
  }
  async createAdmin(username, password, role) {
    const hash = await hashPassword(password);
    const rows = await this.sql`
      INSERT INTO admin_users (username, password_hash, role) VALUES (${username.toLowerCase()}, ${hash}, ${role}) RETURNING id`;
    return rows[0].id;
  }
  async adminCount() {
    const [r] = await this.sql`SELECT count(*)::int AS n FROM admin_users`;
    return r.n;
  }
  /** Returns a new session or null for bad credentials (constant-ish time for unknown users). */
  async login(username, password, ip, userAgent) {
    const rows = await this.sql`
      SELECT id, username, role, password_hash, disabled_at FROM admin_users WHERE username = ${username.toLowerCase()}`;
    const row = rows[0];
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
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
  require(role = null) {
    return async (ctx) => {
      const token = ctx.cookies[ADMIN_COOKIE];
      if (!token) throw new HttpError(401, "unauthorized", "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434");
      const admin = await this.verify(token);
      if (!admin) throw new HttpError(401, "unauthorized", "\u0421\u0435\u0441\u0441\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430");
      if (role === "admin" && admin.role !== "admin") throw new HttpError(403, "forbidden", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432");
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
function currentAdmin(ctx) {
  const a = ctx.state.admin;
  if (!a) throw new HttpError(401, "unauthorized", "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434");
  return a;
}

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

// apps/server/src/admin/bootstrap.ts
async function bootstrapAdmin(sql2, auth, log2, username, password) {
  if (!username || !password) return "skipped";
  if (await auth.adminCount() > 0) {
    log2.warn("ADMIN_BOOTSTRAP_* is set but an admin already exists \u2014 remove these variables");
    return "skipped";
  }
  const problem = passwordProblems(password);
  if (problem || !/^[a-z0-9_.-]{3,32}$/.test(username.toLowerCase())) {
    log2.error("admin bootstrap refused: weak password or invalid username", { problem });
    return "invalid";
  }
  const id = await auth.createAdmin(username, password, "admin");
  await audit(sql2, log2, { adminId: id, action: "admin_bootstrap", target: username.toLowerCase() });
  log2.warn("bootstrap admin created \u2014 remove ADMIN_BOOTSTRAP_PASSWORD from the environment now", { username: username.toLowerCase() });
  return "created";
}

// apps/server/src/analytics/retention.ts
var RETENTION_DAYS = {
  /** analytics_events, by occurred_at (≈13 months: year-over-year comparisons). */
  analyticsEvents: 400,
  /** user_daily_activity (DAU/WAU/MAU/retention index), by day. */
  dailyActivity: 400,
  /** app_errors, by occurred_at. */
  appErrors: 90,
  /** Player sessions, counted from expiry or revocation (keeps every session created in the last 90 days). */
  sessions: 90,
  /** Admin sessions (store IP and user agent), counted from expiry or revocation. */
  adminSessions: 90,
  /** Invitations, counted from expiry. */
  invitations: 7,
  /** Admin audit log, by created_at. */
  adminAudit: 365
};
var BATCH = 5e3;
var DAY_MS = 864e5;
async function batched(run) {
  let total = 0;
  for (let i = 0; i < 1e4; i++) {
    const n = await run();
    total += n;
    if (n < BATCH) break;
  }
  return total;
}
async function purgeExpired(sql2, now = /* @__PURE__ */ new Date(), days = RETENTION_DAYS) {
  const cutoff = (d) => new Date(now.getTime() - d * DAY_MS);
  const events = cutoff(days.analyticsEvents);
  const activityDay = cutoff(days.dailyActivity).toISOString().slice(0, 10);
  const errors = cutoff(days.appErrors);
  const sessions = cutoff(days.sessions);
  const adminSessions = cutoff(days.adminSessions);
  const invitations = cutoff(days.invitations);
  const audit2 = cutoff(days.adminAudit);
  return {
    analyticsEvents: await batched(
      async () => (await sql2`DELETE FROM analytics_events WHERE ctid IN (SELECT ctid FROM analytics_events WHERE occurred_at < ${events} LIMIT ${BATCH})`).count
    ),
    dailyActivity: await batched(
      async () => (await sql2`DELETE FROM user_daily_activity WHERE ctid IN (SELECT ctid FROM user_daily_activity WHERE day < ${activityDay}::date LIMIT ${BATCH})`).count
    ),
    appErrors: await batched(async () => (await sql2`DELETE FROM app_errors WHERE ctid IN (SELECT ctid FROM app_errors WHERE occurred_at < ${errors} LIMIT ${BATCH})`).count),
    sessions: await batched(
      async () => (await sql2`DELETE FROM sessions WHERE ctid IN (
          SELECT ctid FROM sessions WHERE expires_at < ${sessions} OR revoked_at < ${sessions} LIMIT ${BATCH})`).count
    ),
    adminSessions: await batched(
      async () => (await sql2`DELETE FROM admin_sessions WHERE ctid IN (
          SELECT ctid FROM admin_sessions WHERE expires_at < ${adminSessions} OR revoked_at < ${adminSessions} LIMIT ${BATCH})`).count
    ),
    invitations: await batched(async () => (await sql2`DELETE FROM invitations WHERE ctid IN (SELECT ctid FROM invitations WHERE expires_at < ${invitations} LIMIT ${BATCH})`).count),
    adminAudit: await batched(async () => (await sql2`DELETE FROM admin_audit_log WHERE ctid IN (SELECT ctid FROM admin_audit_log WHERE created_at < ${audit2} LIMIT ${BATCH})`).count)
  };
}
function scheduleRetention(sql2, log2, opts = {}) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const r = await purgeExpired(sql2);
      const total = Object.values(r).reduce((a, b2) => a + b2, 0);
      if (total > 0) log2.info("retention purge", r);
    } catch (e) {
      log2.warn("retention purge failed", { err: e.message });
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), opts.firstRunMs ?? 5 * 6e4);
  const every = setInterval(() => void run(), opts.everyMs ?? DAY_MS);
  first.unref();
  every.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(every);
  };
}

// apps/server/src/services/persistence.ts
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
var INVITE_TTL_MS = 24 * 36e5;
var PgInvites = class {
  constructor(sql2) {
    this.sql = sql2;
  }
  sql;
  async create(roomId2, createdBy) {
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = randomBytes3(8);
      let code = "";
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      const rows = await this.sql`
        INSERT INTO invitations (code, room_id, created_by, expires_at)
        SELECT ${code}, ${roomId2}, (SELECT id FROM users WHERE id::text = ${createdBy ?? ""}), ${expiresAt}
        ON CONFLICT (code) DO NOTHING
        RETURNING code`;
      if (rows.length) return { code, expiresAt };
    }
    throw new Error("could not allocate invite code");
  }
  async resolve(code) {
    if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
    const rows = await this.sql`
      UPDATE invitations SET opened = opened + 1 WHERE code = ${code} AND expires_at > now() RETURNING room_id`;
    return rows[0] ? { roomId: rows[0].room_id } : null;
  }
};
var contexts = /* @__PURE__ */ new WeakMap();
function pgContext(sql2, env2, log2) {
  const existing = contexts.get(sql2);
  if (existing) return existing;
  const activity = new ActivityTracker(sql2, log2);
  const analytics = new PgAnalytics(sql2, log2, env2.SERVER_VERSION);
  const origins = /* @__PURE__ */ new Set([new URL(env2.PUBLIC_URL).origin, ...env2.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)]);
  const ctx = {
    sql: sql2,
    env: env2,
    log: log2,
    activity,
    users: new UserRepo(sql2),
    sessions: new SessionStore(sql2, env2.SESSION_SECRET, env2.SESSION_TTL_HOURS, activity, log2),
    profiles: new ProfileRepo(sql2),
    recorder: new PgMatchRecorder(sql2, log2),
    invites: new PgInvites(sql2),
    analytics,
    adminAuth: new AdminAuth(sql2, env2.SESSION_SECRET, env2.ADMIN_SESSION_TTL_HOURS, env2.PUBLIC_URL.startsWith("https://"), origins)
  };
  contexts.set(sql2, ctx);
  return ctx;
}
async function createPersistence(deps) {
  const ctx = pgContext(deps.sql, deps.env, deps.log);
  await seedAchievements(deps.sql);
  await bootstrapAdmin(deps.sql, ctx.adminAuth, deps.log, deps.env.ADMIN_BOOTSTRAP_USERNAME, deps.env.ADMIN_BOOTSTRAP_PASSWORD);
  const stopRetention = deps.env.NODE_ENV === "test" ? () => {
  } : scheduleRetention(deps.sql, deps.log);
  return {
    services: { sessions: ctx.sessions, recorder: ctx.recorder, invites: ctx.invites, analytics: ctx.analytics },
    close: async () => {
      stopRetention();
      await ctx.analytics.close();
    }
  };
}

// apps/server/src/api/auth.ts
var REASONS = {
  malformed: "\u041F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
  missing_hash: "\u041D\u0435\u0442 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 Telegram",
  bad_signature: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C Telegram \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443",
  stale: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0438 \u2014 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043C\u0438\u043D\u0438-\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
  future: "\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
  no_user: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F Telegram"
};
var registerAuthRoutes = (router, deps) => {
  const { env: env2, services: services2 } = deps;
  const limiter = new RateLimiter(20, 20 / 60);
  const newGuestPerIp = new RateLimiter(10, 10 / 3600);
  const newGuestGlobal = new RateLimiter(200, 200 / 3600);
  const guestEnabled = env2.GUEST_AUTH_ENABLED || env2.DEV_AUTH_ENABLED && env2.NODE_ENV !== "production";
  const unavailable = () => {
    throw new HttpError(503, "persistence_unavailable", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
  };
  router.post("/api/auth/telegram", rateLimit(limiter), async (ctx) => {
    if (!deps.sql) return unavailable();
    const body = await ctx.body(TelegramAuthRequest, 16 * 1024);
    if (!env2.TELEGRAM_BOT_TOKEN) throw new HttpError(503, "telegram_not_configured", "\u0412\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435");
    const pg = pgContext(deps.sql, env2, deps.log);
    const v = validateInitData(body.initData, env2.TELEGRAM_BOT_TOKEN, env2.TELEGRAM_AUTH_MAX_AGE_SEC);
    if (!v.ok) {
      deps.log.info("telegram auth rejected", { reason: v.reason, ip: ctx.ip });
      throw new HttpError(401, "invalid_init_data", REASONS[v.reason] ?? "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
    }
    const platform2 = body.platform ?? null;
    const up = await pg.users.upsertTelegram(v.user, platform2);
    const s = await pg.sessions.issue(up.userId, "telegram", platform2, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform: platform2 };
    services2.analytics.server("session_started", { platform: platform2 ?? "unknown", method: "telegram" }, evCtx);
    if (up.isNew) services2.analytics.server("profile_created", { method: "telegram" }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, "internal", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const res = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew };
    ctx.json(200, res);
  });
  router.post("/api/auth/guest", rateLimit(limiter), async (ctx) => {
    if (!guestEnabled) throw new HttpError(403, "guest_auth_disabled", "\u0412\u0445\u043E\u0434 \u0431\u0435\u0437 Telegram \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D \u043D\u0430 \u044D\u0442\u043E\u043C \u0441\u0435\u0440\u0432\u0435\u0440\u0435");
    if (!deps.sql) return unavailable();
    const body = await ctx.body(GuestAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env2, deps.log);
    const deviceKey = "g1:" + createHmac4("sha256", env2.SESSION_SECRET).update(body.deviceId).digest("base64url");
    const existing = await pg.users.findGuest(deviceKey);
    if (!existing && (!newGuestPerIp.take(ctx.ip) || !newGuestGlobal.take("all"))) {
      deps.log.warn("guest sign-up rate limited", { ip: ctx.ip });
      throw new HttpError(429, "rate_limited", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043D\u043E\u0432\u044B\u0445 \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043F\u043E\u0434\u0440\u044F\u0434 \u2014 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0438\u043D\u0443\u0442", { "retry-after": "60" });
    }
    const platform2 = body.platform ?? null;
    const up = await pg.users.upsertGuest(deviceKey, body.name, platform2);
    const s = await pg.sessions.issue(up.userId, "guest", platform2, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform: platform2 };
    services2.analytics.server("session_started", { platform: platform2 ?? "unknown", method: "guest" }, evCtx);
    if (up.isNew) services2.analytics.server("profile_created", { method: "guest" }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, "internal", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const res = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew };
    ctx.json(200, res);
  });
  router.post("/api/auth/dev", rateLimit(limiter), async (ctx) => {
    if (!env2.DEV_AUTH_ENABLED || env2.NODE_ENV === "production") throw new HttpError(403, "dev_auth_disabled", "\u0412\u0445\u043E\u0434 \u0434\u043B\u044F \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D");
    if (!deps.sql) return unavailable();
    const body = await ctx.body(DevAuthRequest, 4 * 1024);
    const pg = pgContext(deps.sql, env2, deps.log);
    const deviceId = body.deviceId ?? randomBytes4(12).toString("base64url");
    const platform2 = body.platform ?? null;
    const up = await pg.users.upsertDev(deviceId, body.name, platform2);
    const s = await pg.sessions.issue(up.userId, "dev", platform2, body.clientVersion ?? null);
    const evCtx = { userId: up.userId, sessionId: s.sessionId, platform: platform2 };
    services2.analytics.server("session_started", { platform: platform2 ?? "unknown", method: "dev" }, evCtx);
    if (up.isNew) services2.analytics.server("profile_created", { method: "dev" }, evCtx);
    const profile = await pg.profiles.get(up.userId);
    if (!profile) throw new HttpError(500, "internal", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const res = { token: s.token, expiresAt: s.expiresAt.toISOString(), profile, isNew: up.isNew, deviceId };
    ctx.json(200, res);
  });
  router.post("/api/auth/logout", requireUser(services2.sessions), async (ctx) => {
    if (!deps.sql) return unavailable();
    currentUser(ctx);
    const token = bearerToken(ctx);
    if (token) await pgContext(deps.sql, env2, deps.log).sessions.revoke(token);
    ctx.json(200, { ok: true });
  });
};

// apps/server/src/api/profile.ts
var registerProfileRoutes = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const writeLimiter = new RateLimiter(10, 10 / 60);
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, "persistence_unavailable", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    return pgContext(deps.sql, deps.env, deps.log);
  };
  router.get("/api/me", auth, async (ctx) => {
    const user = currentUser(ctx);
    const profile = await pg().profiles.get(user.userId);
    if (!profile) throw new HttpError(404, "not_found", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    ctx.json(200, profile);
  });
  router.patch("/api/me", auth, rateLimit(writeLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(UpdateProfileRequest, 4 * 1024);
    await pg().profiles.update(user.userId, body);
    const profile = await pg().profiles.get(user.userId);
    ctx.json(200, profile);
  });
  router.get("/api/me/history", auth, async (ctx) => {
    const user = currentUser(ctx);
    const limit = Math.min(50, Math.max(1, Number(ctx.query.get("limit") ?? 20) || 20));
    const res = { matches: await pg().profiles.history(user.userId, limit) };
    ctx.json(200, res);
  });
  router.get("/api/me/achievements", auth, async (ctx) => {
    const user = currentUser(ctx);
    const res = { achievements: await pg().profiles.achievements(user.userId) };
    ctx.json(200, res);
  });
  router.delete("/api/me", auth, rateLimit(writeLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const p = pg();
    await p.sessions.revokeAllForUser(user.userId);
    await p.profiles.deleteUser(user.userId);
    p.activity.forget(user.userId);
    deps.log.info("account deleted", { userId: user.userId });
    ctx.json(200, { deleted: true });
  });
};

// apps/server/src/analytics/ingest.ts
var CLOCK_SKEW_MS = 24 * 36e5;
async function ingestClientEvents(sql2, user, events, now = Date.now()) {
  let rejected = 0;
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const e of events) {
    const id = e.id.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const props = parseClientEventProps(e.name, e.props);
    if (!props) {
      rejected++;
      continue;
    }
    if (e.name === "client_error") props.message = sanitizeMessage(String(props.message ?? ""));
    const ts = Math.min(now + CLOCK_SKEW_MS, Math.max(now - CLOCK_SKEW_MS, e.ts));
    rows.push({
      id,
      name: e.name,
      source: "client",
      user_id: user.userId,
      session_id: user.sessionId,
      occurred_at: new Date(ts).toISOString(),
      platform: user.platform,
      props
    });
  }
  const inserted = new Set(await insertEvents(sql2, rows));
  const errors = rows.filter((r) => r.name === "client_error" && inserted.has(r.id)).map(
    (r) => errorRow({
      source: "client",
      component: String(r.props.component ?? "client"),
      category: String(r.props.category ?? "error"),
      message: String(r.props.message ?? ""),
      clientVersion: typeof r.props.clientVersion === "string" ? r.props.clientVersion : null,
      sessionId: user.sessionId,
      userId: user.userId,
      at: new Date(r.occurred_at)
    })
  );
  await insertErrors(sql2, errors);
  return { accepted: inserted.size, duplicates: rows.length - inserted.size + (events.length - seen.size), rejected };
}

// apps/server/src/api/events.ts
var registerEventRoutes = (router, deps) => {
  const limiter = new RateLimiter(30, 30 / 60);
  router.post("/api/events", requireUser(deps.services.sessions), rateLimit(limiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    if (!deps.sql) throw new HttpError(503, "persistence_unavailable", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const user = currentUser(ctx);
    const body = await ctx.body(EventsBatchSchema, 64 * 1024);
    const result = await ingestClientEvents(deps.sql, user, body.events);
    ctx.json(200, result);
  });
};

// apps/server/src/admin/csv.ts
function csvCell(v) {
  if (v === null || v === void 0) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",;\r\n\t]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// apps/server/src/analytics/metrics.ts
var DAY = 864e5;
var RangeError400 = class extends Error {
};
function utcDayString(d) {
  return d.toISOString().slice(0, 10);
}
function resolveRange(key, fromStr, toStr, now = /* @__PURE__ */ new Date()) {
  const k = key ?? "7d";
  let from;
  let to;
  switch (k) {
    case "24h":
      from = new Date(now.getTime() - DAY);
      to = now;
      break;
    case "7d":
    case "30d":
    case "90d": {
      const days = Number(k.replace("d", ""));
      to = now;
      from = new Date(Date.parse(utcDayString(now)) - (days - 1) * DAY);
      break;
    }
    case "custom": {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!fromStr || !toStr || !re.test(fromStr) || !re.test(toStr)) throw new RangeError400("custom range requires from/to as YYYY-MM-DD");
      from = /* @__PURE__ */ new Date(`${fromStr}T00:00:00.000Z`);
      to = /* @__PURE__ */ new Date(`${toStr}T23:59:59.999Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new RangeError400("invalid date");
      if (from > to) throw new RangeError400("from must be before to");
      if (to.getTime() - from.getTime() > 400 * DAY) throw new RangeError400("range too long (max 400 days)");
      break;
    }
    default:
      throw new RangeError400("unknown range");
  }
  return { key: k, from: from.toISOString(), to: to.toISOString(), firstDay: utcDayString(from), lastDay: utcDayString(to) };
}
var ratio = (num, den) => den > 0 ? num / den : null;
async function overview(sql2, r, activeRooms, now = /* @__PURE__ */ new Date()) {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const today = utcDayString(now);
  const [counts] = await sql2`
    SELECT
      (SELECT count(*) FROM users WHERE deleted_at IS NULL AND created_at <= ${to})::int AS total_players,
      (SELECT count(*) FROM users WHERE deleted_at IS NULL AND created_at BETWEEN ${from} AND ${to})::int AS new_players,
      (SELECT count(*) FROM user_daily_activity WHERE day = ${r.lastDay}::date)::int AS dau,
      (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > ${r.lastDay}::date - 7 AND day <= ${r.lastDay}::date)::int AS wau,
      (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > ${r.lastDay}::date - 30 AND day <= ${r.lastDay}::date)::int AS mau,
      (SELECT count(*) FROM matches WHERE started_at BETWEEN ${from} AND ${to})::int AS started,
      (SELECT count(*) FROM matches WHERE status = 'completed' AND ended_at BETWEEN ${from} AND ${to})::int AS completed,
      (SELECT avg(duration_ms)::float8 FROM matches WHERE status = 'completed' AND ended_at BETWEEN ${from} AND ${to}) AS avg_match,
      (SELECT avg((props->>'durationMs')::float8) FROM analytics_events
         WHERE name = 'session_ended' AND occurred_at BETWEEN ${from} AND ${to} AND jsonb_typeof(props->'durationMs') = 'number') AS avg_session,
      (SELECT count(*) FROM app_errors WHERE occurred_at BETWEEN ${from} AND ${to})::int AS errors`;
  const [conv] = await sql2`
    SELECT count(*)::int AS cohort,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM match_participants mp WHERE mp.user_id = u.id AND mp.completed))::int AS converted
    FROM users u WHERE u.deleted_at IS NULL AND u.created_at BETWEEN ${from} AND ${to}`;
  const [ret] = await sql2`
    WITH cohort AS (
      SELECT u.id, (u.created_at AT TIME ZONE 'UTC')::date AS d
      FROM users u
      WHERE u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC')::date BETWEEN ${r.firstDay}::date AND ${r.lastDay}::date
    )
    SELECT
      count(*) FILTER (WHERE c.d + 1 < ${today}::date)::int AS d1_size,
      count(*) FILTER (WHERE c.d + 1 < ${today}::date AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 1))::int AS d1_ret,
      count(*) FILTER (WHERE c.d + 7 < ${today}::date)::int AS d7_size,
      count(*) FILTER (WHERE c.d + 7 < ${today}::date AND EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 7))::int AS d7_ret
    FROM cohort c`;
  return {
    range: r,
    generatedAt: now.toISOString(),
    totalPlayers: counts.total_players,
    newPlayers: counts.new_players,
    dau: counts.dau,
    wau: counts.wau,
    mau: counts.mau,
    matchesStarted: counts.started,
    matchesCompleted: counts.completed,
    activeRooms,
    avgMatchDurationMs: counts.avg_match === null ? null : Math.round(counts.avg_match),
    avgSessionDurationMs: counts.avg_session === null ? null : Math.round(counts.avg_session),
    firstMatchConversion: ratio(conv.converted, conv.cohort),
    d1Retention: ratio(ret.d1_ret, ret.d1_size),
    d7Retention: ratio(ret.d7_ret, ret.d7_size),
    d1CohortSize: ret.d1_size,
    d7CohortSize: ret.d7_size,
    errorCount: counts.errors
  };
}
var SESSION_BUCKETS = ["<1 \u043C\u0438\u043D", "1\u20133 \u043C\u0438\u043D", "3\u20135 \u043C\u0438\u043D", "5\u201310 \u043C\u0438\u043D", "10\u201320 \u043C\u0438\u043D", "20\u201330 \u043C\u0438\u043D", "30\u201360 \u043C\u0438\u043D", "60+ \u043C\u0438\u043D"];
var MATCH_BUCKETS = ["<1 \u043C\u0438\u043D", "1\u20132 \u043C\u0438\u043D", "2\u20133 \u043C\u0438\u043D", "3\u20134 \u043C\u0438\u043D", "4\u20135 \u043C\u0438\u043D", "5+ \u043C\u0438\u043D"];
function fillBuckets(order, rows) {
  const m = new Map(rows.map((r) => [r.bucket, r.count]));
  return order.map((bucket) => ({ bucket, count: m.get(bucket) ?? 0 }));
}
async function charts(sql2, r, now = /* @__PURE__ */ new Date()) {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const today = utcDayString(now);
  const registrations = await sql2`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL
         AND u.created_at >= (g.day AT TIME ZONE 'UTC') AND u.created_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS count
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const dau = await sql2`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day, (SELECT count(*) FROM user_daily_activity a WHERE a.day = g.day::date)::int AS count
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const matches = await sql2`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM matches m WHERE m.started_at >= (g.day AT TIME ZONE 'UTC') AND m.started_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS started,
      (SELECT count(*) FROM matches m WHERE m.status = 'completed'
         AND m.ended_at >= (g.day AT TIME ZONE 'UTC') AND m.ended_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS completed
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  const cohorts = await sql2`
    WITH days AS (SELECT g.day::date AS d FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)),
    cohort AS (
      SELECT u.id, (u.created_at AT TIME ZONE 'UTC')::date AS d FROM users u
      WHERE u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC')::date BETWEEN ${r.firstDay}::date AND ${r.lastDay}::date
    )
    SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
      count(c.id)::int AS cohort,
      count(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 1))::int AS d1,
      count(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM user_daily_activity a WHERE a.user_id = c.id AND a.day = c.d + 7))::int AS d7,
      (days.d + 1 < ${today}::date) AS d1_mature,
      (days.d + 7 < ${today}::date) AS d7_mature
    FROM days LEFT JOIN cohort c ON c.d = days.d
    GROUP BY days.d ORDER BY days.d`;
  const sessionDuration = await sql2`
    SELECT bucket, count(*)::int AS count FROM (
      SELECT CASE
        WHEN v < 60000 THEN '<1 мин' WHEN v < 180000 THEN '1–3 мин' WHEN v < 300000 THEN '3–5 мин'
        WHEN v < 600000 THEN '5–10 мин' WHEN v < 1200000 THEN '10–20 мин' WHEN v < 1800000 THEN '20–30 мин'
        WHEN v < 3600000 THEN '30–60 мин' ELSE '60+ мин' END AS bucket
      FROM (SELECT (props->>'durationMs')::float8 AS v FROM analytics_events
            WHERE name = 'session_ended' AND occurred_at BETWEEN ${from} AND ${to} AND jsonb_typeof(props->'durationMs') = 'number') s
    ) b GROUP BY bucket`;
  const matchDuration = await sql2`
    SELECT bucket, count(*)::int AS count FROM (
      SELECT CASE
        WHEN duration_ms < 60000 THEN '<1 мин' WHEN duration_ms < 120000 THEN '1–2 мин' WHEN duration_ms < 180000 THEN '2–3 мин'
        WHEN duration_ms < 240000 THEN '3–4 мин' WHEN duration_ms < 300000 THEN '4–5 мин' ELSE '5+ мин' END AS bucket
      FROM matches WHERE status = 'completed' AND duration_ms IS NOT NULL AND ended_at BETWEEN ${from} AND ${to}
    ) b GROUP BY bucket`;
  const maps = await sql2`
    SELECT map_id AS key, count(*)::int AS count FROM matches WHERE started_at BETWEEN ${from} AND ${to} GROUP BY map_id ORDER BY count DESC`;
  const characters = await sql2`
    SELECT mp.character AS key, count(*)::int AS count
    FROM match_participants mp JOIN matches m ON m.id = mp.match_id
    WHERE m.started_at BETWEEN ${from} AND ${to} GROUP BY mp.character ORDER BY count DESC`;
  const platforms = await sql2`
    SELECT COALESCE(platform, 'unknown') AS key, count(DISTINCT user_id)::int AS count
    FROM sessions WHERE created_at BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY count DESC`;
  return {
    range: r,
    registrations: [...registrations],
    dau: [...dau],
    matches: [...matches],
    retention: cohorts.map((c) => ({
      day: c.day,
      cohort: c.cohort,
      d1: c.d1_mature && c.cohort > 0 ? c.d1 / c.cohort : null,
      d7: c.d7_mature && c.cohort > 0 ? c.d7 / c.cohort : null
    })),
    sessionDuration: fillBuckets(SESSION_BUCKETS, [...sessionDuration]),
    matchDuration: fillBuckets(MATCH_BUCKETS, [...matchDuration]),
    maps: [...maps],
    characters: [...characters],
    platforms: [...platforms]
  };
}
var UPPER_CYR = "\u0410\u0411\u0412\u0413\u0414\u0415\u0401\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u0406\u0407\u0404\u0490";
var LOWER_CYR = "\u0430\u0431\u0432\u0433\u0434\u0435\u0451\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F\u0456\u0457\u0454\u0491";
var PLAYER_SORTS = ["created", "last_seen", "name", "level", "xp", "matches", "wins", "losses", "kills", "assists", "playtime"];
function toPlayerRow(r) {
  return {
    id: r.id,
    displayName: r.display_name,
    telegramId: r.telegram_id,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    level: r.level,
    xp: r.xp,
    matches: r.matches_played,
    wins: r.wins,
    losses: r.losses,
    kills: r.kills,
    assists: r.assists,
    deaths: r.deaths,
    playtimeSec: r.playtime_sec
  };
}
async function listPlayers(sql2, opts) {
  const sort = PLAYER_SORTS.includes(opts.sort ?? "") ? opts.sort : "created";
  const dir = opts.dir === "asc" ? "asc" : "desc";
  const pageSize = Math.min(100, Math.max(5, Math.floor(opts.pageSize ?? 25)));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const q = (opts.q ?? "").trim().slice(0, 64);
  const like = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const folded = sql2`lower(translate(u.display_name, ${UPPER_CYR}, ${LOWER_CYR}))`;
  const col = {
    created: sql2`u.created_at`,
    last_seen: sql2`u.last_seen_at`,
    name: sql2`lower(u.display_name)`,
    level: sql2`COALESCE(p.xp, 0)`,
    xp: sql2`COALESCE(p.xp, 0)`,
    matches: sql2`COALESCE(p.matches_played, 0)`,
    wins: sql2`COALESCE(p.wins, 0)`,
    losses: sql2`COALESCE(p.losses, 0)`,
    kills: sql2`COALESCE(p.kills, 0)`,
    assists: sql2`COALESCE(p.assists, 0)`,
    playtime: sql2`COALESCE(p.playtime_sec, 0)`
  }[sort];
  const order = dir === "asc" ? sql2`ASC` : sql2`DESC`;
  const filter = q ? /^\d{1,20}$/.test(q) ? sql2`AND (u.telegram_id::text = ${q} OR ${folded} LIKE ${like})` : /^[0-9a-f-]{36}$/i.test(q) ? sql2`AND (u.id::text = ${q.toLowerCase()} OR ${folded} LIKE ${like})` : sql2`AND ${folded} LIKE ${like}` : sql2``;
  const rows = await sql2`
    SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at,
           COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
           COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
           COALESCE(p.assists, 0) AS assists,
           COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
           (count(*) OVER ())::int AS total
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL ${filter}
    ORDER BY ${col} ${order} NULLS LAST, u.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [c] = await sql2`SELECT count(*)::int AS n FROM users u WHERE u.deleted_at IS NULL ${filter}`;
    total = c.n;
  }
  return { rows: rows.map(toPlayerRow), total, page, pageSize, sort, dir };
}
async function playerErrors(sql2, userId, limit = 50) {
  const rows = await sql2`
    SELECT id::text AS id, occurred_at, source, component, category, message, client_version, server_version, session_id::text AS session_id
    FROM app_errors WHERE user_id = ${userId} ORDER BY occurred_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: Number(r.id),
    occurredAt: r.occurred_at.toISOString(),
    source: r.source,
    component: r.component,
    category: r.category,
    message: r.message,
    clientVersion: r.client_version,
    serverVersion: r.server_version,
    sessionId: r.session_id
  }));
}
async function errorGroups(sql2, r, limit = 200) {
  const rows = await sql2`
    SELECT fingerprint,
      (array_agg(source ORDER BY occurred_at DESC))[1] AS source,
      (array_agg(component ORDER BY occurred_at DESC))[1] AS component,
      (array_agg(category ORDER BY occurred_at DESC))[1] AS category,
      (array_agg(message ORDER BY occurred_at DESC))[1] AS message,
      count(*)::int AS count,
      min(occurred_at) AS first_seen,
      max(occurred_at) AS last_seen,
      (array_remove(array_agg(DISTINCT client_version), NULL))[1:5] AS client_versions,
      (array_remove(array_agg(DISTINCT server_version), NULL))[1:5] AS server_versions,
      (array_remove(array_agg(DISTINCT session_id::text), NULL))[1:5] AS session_ids
    FROM app_errors
    WHERE occurred_at BETWEEN ${new Date(r.from)} AND ${new Date(r.to)}
    GROUP BY fingerprint
    ORDER BY count(*) DESC, max(occurred_at) DESC
    LIMIT ${limit}`;
  return rows.map((x) => ({
    fingerprint: x.fingerprint,
    source: x.source,
    component: x.component,
    category: x.category,
    message: x.message,
    count: x.count,
    firstSeen: x.first_seen.toISOString(),
    lastSeen: x.last_seen.toISOString(),
    clientVersions: x.client_versions ?? [],
    serverVersions: x.server_versions ?? [],
    sessionIds: x.session_ids ?? []
  }));
}
async function dailyMetrics(sql2, r) {
  const rows = await sql2`
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL AND u.created_at >= (g.day AT TIME ZONE 'UTC') AND u.created_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS registrations,
      (SELECT count(*) FROM user_daily_activity a WHERE a.day = g.day::date)::int AS dau,
      (SELECT count(*) FROM matches m WHERE m.started_at >= (g.day AT TIME ZONE 'UTC') AND m.started_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS matches_started,
      (SELECT count(*) FROM matches m WHERE m.status = 'completed' AND m.ended_at >= (g.day AT TIME ZONE 'UTC') AND m.ended_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS matches_completed,
      (SELECT count(*) FROM app_errors e WHERE e.occurred_at >= (g.day AT TIME ZONE 'UTC') AND e.occurred_at < ((g.day + interval '1 day') AT TIME ZONE 'UTC'))::int AS errors
    FROM generate_series(${r.firstDay}::date, ${r.lastDay}::date, interval '1 day') AS g(day)
    ORDER BY g.day`;
  return [...rows];
}

// apps/server/src/admin/routes.ts
var UUID_RE3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var registerAdminRoutes = (router, deps) => {
  const loginPerIp = new RateLimiter(10, 10 / 60);
  const loginPerUser = new RateLimiter(5, 5 / 300);
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, "persistence_unavailable", "\u0411\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
    return pgContext(deps.sql, deps.env, deps.log);
  };
  const viewer = (ctx) => pg().adminAuth.require(null)(ctx);
  const admin = (ctx) => pg().adminAuth.require("admin")(ctx);
  const range = (ctx) => {
    try {
      return resolveRange(ctx.query.get("range"), ctx.query.get("from"), ctx.query.get("to"));
    } catch (e) {
      if (e instanceof RangeError400) throw new HttpError(400, "bad_range", e.message);
      throw e;
    }
  };
  const me = (ctx) => {
    const a = currentAdmin(ctx);
    return { id: a.id, username: a.username, role: a.role, csrfToken: pg().adminAuth.csrfFor(String(ctx.state.adminToken)) };
  };
  const csv = (ctx, name, body) => ctx.send(200, body, "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" });
  router.post("/api/admin/login", async (ctx) => {
    const p = pg();
    p.adminAuth.checkOrigin(ctx);
    if (!loginPerIp.take(ctx.ip)) throw new HttpError(429, "rate_limited", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435", { "retry-after": "60" });
    const body = await ctx.body(AdminLoginRequest, 2048);
    const key = `${ctx.ip}|${body.username.toLowerCase()}`;
    if (!loginPerUser.take(key)) throw new HttpError(429, "rate_limited", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435", { "retry-after": "300" });
    const res = await p.adminAuth.login(body.username, body.password, ctx.ip, String(ctx.req.headers["user-agent"] ?? ""));
    if (!res) {
      await audit(p.sql, deps.log, { adminId: null, action: "login_failed", target: body.username.toLowerCase().slice(0, 32), ip: ctx.ip });
      throw new HttpError(401, "bad_credentials", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C");
    }
    await audit(p.sql, deps.log, { adminId: res.admin.id, action: "login", ip: ctx.ip });
    const out = { id: res.admin.id, username: res.admin.username, role: res.admin.role, csrfToken: res.csrf };
    ctx.json(200, out, { "set-cookie": p.adminAuth.sessionCookie(res.token) });
  });
  router.post("/api/admin/logout", viewer, async (ctx) => {
    const p = pg();
    await p.adminAuth.logout(String(ctx.state.adminToken));
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "logout", ip: ctx.ip });
    ctx.json(200, { ok: true }, { "set-cookie": p.adminAuth.clearCookie() });
  });
  router.get("/api/admin/me", viewer, (ctx) => ctx.json(200, me(ctx)));
  router.get("/api/admin/overview", viewer, async (ctx) => {
    ctx.json(200, await overview(pg().sql, range(ctx), deps.rooms.count()));
  });
  router.get("/api/admin/charts", viewer, async (ctx) => {
    ctx.json(200, await charts(pg().sql, range(ctx)));
  });
  router.get("/api/admin/rooms", viewer, (ctx) => {
    ctx.json(200, deps.rooms.list().map((r) => ({ ...r.info(), mapName: getMap(r.mapId).name, createdAt: new Date(r.createdAt).toISOString() })));
  });
  router.get("/api/admin/players", viewer, async (ctx) => {
    ctx.json(
      200,
      await listPlayers(pg().sql, {
        q: ctx.query.get("q"),
        sort: ctx.query.get("sort"),
        dir: ctx.query.get("dir"),
        page: Number(ctx.query.get("page") ?? 1) || 1,
        pageSize: Number(ctx.query.get("pageSize") ?? 25) || 25
      })
    );
  });
  router.get("/api/admin/players/:id", viewer, async (ctx) => {
    const id = ctx.params.id ?? "";
    if (!UUID_RE3.test(id)) throw new HttpError(400, "bad_id", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440");
    const p = pg();
    const rows = await p.sql`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at, u.language_code, u.platform,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
             COALESCE(p.matches_completed, 0) AS matches_completed, COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses,
             COALESCE(p.kills, 0) AS kills, COALESCE(p.assists, 0) AS assists, COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec,
             COALESCE(p.current_win_streak, 0) AS current_win_streak, COALESCE(p.best_win_streak, 0) AS best_win_streak, p.preferred_character
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ${id} AND u.deleted_at IS NULL`;
    const r = rows[0];
    if (!r) throw new HttpError(404, "not_found", "\u0418\u0433\u0440\u043E\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const [s] = await p.sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS active,
             (array_agg(platform ORDER BY created_at DESC))[1] AS last_platform,
             (array_agg(client_version ORDER BY created_at DESC))[1] AS last_client
      FROM sessions WHERE user_id = ${id}`;
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "player_viewed", target: id, ip: ctx.ip });
    const lv = levelForXp(r.xp);
    const detail = {
      player: {
        ...toPlayerRow(r),
        matchesCompleted: r.matches_completed,
        currentWinStreak: r.current_win_streak,
        bestWinStreak: r.best_win_streak,
        preferredCharacter: r.preferred_character,
        xpIntoLevel: lv.intoLevel,
        xpForNextLevel: lv.nextLevelCost,
        languageCode: r.language_code,
        platform: r.platform
      },
      sessions: { total: s.total, active: s.active, lastPlatform: s.last_platform, lastClientVersion: s.last_client },
      achievements: await p.profiles.achievements(id),
      matches: await p.profiles.history(id, 50),
      errors: await playerErrors(p.sql, id, 50)
    };
    ctx.json(200, detail);
  });
  router.get("/api/admin/errors", viewer, async (ctx) => {
    ctx.json(200, await errorGroups(pg().sql, range(ctx)));
  });
  router.get("/api/admin/audit", admin, async (ctx) => {
    const rows = await pg().sql`
      SELECT l.id::text AS id, l.created_at, l.action, l.target, l.ip, a.username, l.details
      FROM admin_audit_log l LEFT JOIN admin_users a ON a.id = l.admin_id
      ORDER BY l.created_at DESC LIMIT 200`;
    ctx.json(200, rows.map((r) => ({ id: Number(r.id), at: r.created_at.toISOString(), action: r.action, target: r.target, ip: r.ip, username: r.username, details: r.details })));
  });
  router.post("/api/admin/users", admin, async (ctx) => {
    const p = pg();
    const body = await ctx.body(AdminCreateUserRequest, 2048);
    const problem = passwordProblems(body.password);
    if (problem) throw new HttpError(400, "weak_password", problem);
    let id;
    try {
      id = await p.adminAuth.createAdmin(body.username, body.password, body.role);
    } catch {
      throw new HttpError(409, "exists", "\u0422\u0430\u043A\u043E\u0439 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
    }
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "admin_created", target: body.username, details: { role: body.role }, ip: ctx.ip });
    ctx.json(201, { id, username: body.username, role: body.role });
  });
  router.get("/api/admin/export/players.csv", admin, async (ctx) => {
    const p = pg();
    const rows = await p.sql`
      SELECT u.id, u.display_name, u.telegram_id::text AS telegram_id, u.created_at, u.last_seen_at,
             COALESCE(p.level, 1) AS level, COALESCE(p.xp, 0) AS xp, COALESCE(p.matches_played, 0) AS matches_played,
             COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses, COALESCE(p.kills, 0) AS kills,
             COALESCE(p.assists, 0) AS assists, COALESCE(p.deaths, 0) AS deaths, COALESCE(p.playtime_sec, 0) AS playtime_sec
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.deleted_at IS NULL ORDER BY u.created_at`;
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "export_players", details: { rows: rows.length }, ip: ctx.ip });
    csv(
      ctx,
      "players.csv",
      toCsv(
        ["id", "display_name", "telegram_id", "registered_at", "last_activity", "level", "xp", "matches", "wins", "losses", "eliminations", "assists", "deaths", "playtime_sec"],
        rows.map((r) => [r.id, r.display_name, r.telegram_id, r.created_at, r.last_seen_at, r.level, r.xp, r.matches_played, r.wins, r.losses, r.kills, r.assists, r.deaths, r.playtime_sec])
      )
    );
  });
  router.get("/api/admin/export/matches.csv", admin, async (ctx) => {
    const p = pg();
    const r = range(ctx);
    const rows = await p.sql`
      SELECT id, room_id, map_id, is_private, status, started_at, ended_at, duration_ms, end_reason, player_count
      FROM matches WHERE started_at BETWEEN ${new Date(r.from)} AND ${new Date(r.to)} ORDER BY started_at`;
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "export_matches", details: { rows: rows.length, from: r.from, to: r.to }, ip: ctx.ip });
    csv(
      ctx,
      `matches_${r.firstDay}_${r.lastDay}.csv`,
      toCsv(
        ["match_id", "room_id", "map", "private", "status", "started_at", "ended_at", "duration_ms", "end_reason", "players"],
        rows.map((m) => [m.id, m.room_id, isMapId(m.map_id) ? getMap(m.map_id).name : m.map_id, m.is_private, m.status, m.started_at, m.ended_at, m.duration_ms, m.end_reason, m.player_count])
      )
    );
  });
  router.get("/api/admin/export/daily.csv", admin, async (ctx) => {
    const p = pg();
    const r = range(ctx);
    const rows = await dailyMetrics(p.sql, r);
    await audit(p.sql, deps.log, { adminId: currentAdmin(ctx).id, action: "export_daily", details: { from: r.firstDay, to: r.lastDay }, ip: ctx.ip });
    csv(
      ctx,
      `daily_${r.firstDay}_${r.lastDay}.csv`,
      toCsv(
        ["day", "registrations", "dau", "matches_started", "matches_completed", "errors"],
        rows.map((d) => [d.day, d.registrations, d.dau, d.matches_started, d.matches_completed, d.errors])
      )
    );
  });
};

// apps/server/src/app.ts
var ROUTE_MODULES = [registerAuthRoutes, registerProfileRoutes, registerRoomRoutes, registerEventRoutes, registerAdminRoutes];
function createApp(deps, modules = ROUTE_MODULES) {
  const router = new Router();
  const startedAt = Date.now();
  router.get("/api/health", (ctx) => ctx.json(200, { ok: true, version: deps.env.SERVER_VERSION, uptimeSec: Math.round((Date.now() - startedAt) / 1e3), rooms: deps.rooms.count() }));
  router.get("/api/ready", async (ctx) => {
    if (deps.sql) {
      try {
        await deps.sql`SELECT 1`;
      } catch {
        return ctx.json(503, { ok: false, db: false });
      }
    }
    ctx.json(200, { ok: true, db: !!deps.sql });
  });
  for (const m of modules) m(router, deps);
  const statics = deps.env.STATIC_DIR ? serveStatic(deps.env.STATIC_DIR) : null;
  const allowed = new Set(deps.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean));
  return async function handle(req, res) {
    const requestId = randomUUID2();
    const ctx = createCtx(req, res, { trustProxy: deps.env.TRUST_PROXY, requestId, log: deps.log });
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-allow-headers", "authorization, content-type, x-csrf-token");
      res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (ctx.method === "OPTIONS") {
      res.writeHead(origin && allowed.has(origin) ? 204 : 403);
      res.end();
      return;
    }
    const t0 = performance.now();
    try {
      if (ctx.path.startsWith("/api/")) {
        for (const [k, v] of Object.entries(securityHeaders(false))) res.setHeader(k, v);
        const handled = await router.handle(ctx);
        if (!handled) throw new HttpError(404, "not_found", "Not found");
      } else if (!statics || !statics(ctx)) {
        ctx.send(404, "Not found", "text/plain; charset=utf-8", securityHeaders(false));
      }
    } catch (err) {
      if (err instanceof HttpError) {
        ctx.json(err.status, { error: { code: err.code, message: err.message } }, err.headers);
      } else {
        deps.log.error("unhandled request error", { requestId, path: ctx.path, err });
        deps.services.analytics.error({ source: "server", component: "http", category: "unhandled", message: err.message ?? "error" });
        ctx.json(500, { error: { code: "internal", message: "Internal error" } });
      }
    } finally {
      if (ctx.path.startsWith("/api/")) {
        deps.log.debug("http", { requestId, method: ctx.method, path: ctx.path, status: res.statusCode, ms: Math.round(performance.now() - t0) });
      }
    }
  };
}

// apps/server/src/rooms/RoomManager.ts
import { randomBytes as randomBytes6 } from "node:crypto";

// apps/server/src/rooms/MatchRoom.ts
import { randomBytes as randomBytes5, randomUUID as randomUUID3 } from "node:crypto";
var AUTO_START_DELAY_MS = 4e3;
var SOLO_ABORT_MS = 2e4;
var MAX_MSGS_PER_SEC = 150;
var MatchRoom = class {
  constructor(opts, services2, log2) {
    this.services = services2;
    this.id = opts.id;
    this.mapId = opts.mapId;
    this.isPrivate = opts.isPrivate;
    this.hostId = opts.hostUserId;
    this.inviteCode = opts.inviteCode ?? null;
    this.autoStart = opts.autoStart ?? !opts.isPrivate;
    this.config = { ...DEFAULT_MATCH_CONFIG, ...opts.config };
    this.log = log2.child({ room: this.id });
    this.world = this.createWorld();
  }
  services;
  id;
  isPrivate;
  createdAt = Date.now();
  config;
  mapId;
  hostId;
  inviteCode;
  world;
  matchId = null;
  matchStartedAtWall = 0;
  closed = false;
  clients = /* @__PURE__ */ new Map();
  pendingShots = [];
  pendingEvents = [];
  emptySince = Date.now();
  autoStartAt = 0;
  soloSince = 0;
  resultsSent = false;
  autoStart;
  log;
  createWorld() {
    return new World(getMap(this.mapId), getCollision(this.mapId), { config: this.config, lagCompensation: true, seed: Math.floor(Math.random() * 2 ** 31) });
  }
  get phase() {
    return this.world.phase;
  }
  /** Players occupying a slot (connected or within the reconnect grace window). */
  get occupancy() {
    return this.clients.size;
  }
  get connectedCount() {
    let n = 0;
    for (const c of this.clients.values()) if (c.connected) n++;
    return n;
  }
  isJoinable(userId) {
    if (this.closed || this.world.phase === "closed") return false;
    if (userId && this.clients.has(userId)) return true;
    if (this.clients.size >= this.config.maxPlayers) return false;
    if (this.world.phase === "finished") return false;
    if ((this.world.phase === "active" || this.world.phase === "countdown" || this.world.phase === "ready") && !this.config.allowJoinInProgress) return false;
    return true;
  }
  hostName() {
    return this.hostId ? this.clients.get(this.hostId)?.user.displayName ?? null : null;
  }
  // ── Connections ─────────────────────────────────────────────────────────
  /** Adds or resumes a player. Returns an error code when the join is refused. */
  join(user, ws, character, viaInvite) {
    if (this.closed) return "room_closed";
    const existing = this.clients.get(user.userId);
    if (existing) {
      if (existing.ws && existing.ws !== ws) {
        try {
          existing.ws.close(WS_CLOSE.REPLACED, "replaced");
        } catch {
        }
      }
      existing.ws = ws;
      existing.connected = true;
      existing.queue = [];
      existing.lastQueuedSeq = 0;
      existing.tokens = INPUT_BUCKET_MAX;
      const p = this.world.players.get(user.userId);
      if (p) {
        p.connected = true;
        if (p.spawned && !p.alive) p.respawnAt = this.world.time + this.config.respawnDelayMs;
      }
      this.send(existing, this.welcome(existing, true));
      this.broadcastRoster();
      this.services.analytics.server("lobby_joined", { roomId: this.id, viaInvite: existing.viaInvite, resumed: true }, user);
      return "resumed";
    }
    if (!this.isJoinable()) return this.world.phase === "finished" || this.world.phase === "closed" ? "room_closed" : "room_full";
    const client = {
      user,
      ws,
      character,
      ready: this.autoStart,
      rematch: false,
      viaInvite,
      connected: true,
      disconnectedAt: 0,
      queue: [],
      tokens: INPUT_BUCKET_MAX,
      lastQueuedSeq: 0,
      reconnectToken: randomBytes5(18).toString("base64url"),
      joinedAt: Date.now(),
      matchTimeMs: 0,
      violations: 0,
      msgWindowStart: Date.now(),
      msgCount: 0
    };
    this.clients.set(user.userId, client);
    if (!this.hostId) this.hostId = user.userId;
    this.world.addPlayer(user.userId, user.displayName, character, false);
    this.send(client, this.welcome(client, false));
    this.broadcastRoster();
    this.services.analytics.server("lobby_joined", { roomId: this.id, viaInvite }, user);
    this.log.info("player joined", { user: user.userId, players: this.clients.size });
    return "ok";
  }
  welcome(c, resumed) {
    const p = this.world.players.get(c.user.userId);
    return {
      type: "welcome",
      playerId: c.user.userId,
      slot: p?.slot ?? -1,
      roomId: this.id,
      reconnectToken: c.reconnectToken,
      serverTime: this.world.time,
      tick: this.world.tick,
      mapId: this.mapId,
      config: this.config,
      resumed
    };
  }
  onSocketClose(ws) {
    for (const c of this.clients.values()) {
      if (c.ws !== ws) continue;
      c.ws = null;
      c.connected = false;
      c.disconnectedAt = Date.now();
      c.queue = [];
      const p = this.world.players.get(c.user.userId);
      if (p) {
        p.connected = false;
        if (p.alive && this.world.phase === "active") {
          p.alive = false;
          p.respawnAt = Number.MAX_SAFE_INTEGER;
        }
      }
      if (this.world.phase === "waiting") this.removeClient(c, "left");
      else this.broadcastRoster();
      return;
    }
  }
  removeClient(c, reason) {
    this.clients.delete(c.user.userId);
    this.world.removePlayer(c.user.userId);
    this.services.analytics.server("lobby_left", { roomId: this.id, phase: this.world.phase, reason }, c.user);
    if (this.hostId === c.user.userId) {
      const next = [...this.clients.values()].find((x) => x.connected) ?? [...this.clients.values()][0];
      this.hostId = next ? next.user.userId : null;
    }
    this.broadcastRoster();
  }
  // ── Messages ────────────────────────────────────────────────────────────
  onMessage(ws, data, isBinary) {
    const c = [...this.clients.values()].find((x) => x.ws === ws);
    if (!c) return;
    const now = Date.now();
    if (now - c.msgWindowStart > 1e3) {
      c.msgWindowStart = now;
      c.msgCount = 0;
    }
    if (++c.msgCount > MAX_MSGS_PER_SEC) return this.violation(c, "rate");
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (isBinary) {
      let frames;
      try {
        frames = decodeInputs(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      } catch (e) {
        if (e instanceof ProtocolError) return this.violation(c, "bad_input");
        throw e;
      }
      for (const f of frames) {
        if (f.seq <= c.lastQueuedSeq) continue;
        c.lastQueuedSeq = f.seq;
        c.queue.push(f);
      }
      if (c.queue.length > INPUT_QUEUE_MAX) c.queue.splice(0, c.queue.length - INPUT_QUEUE_MAX);
      return;
    }
    let msg;
    try {
      const parsed = ClientMessageSchema.safeParse(JSON.parse(buf.toString("utf8")));
      if (!parsed.success) return this.violation(c, "bad_message");
      msg = parsed.data;
    } catch {
      return this.violation(c, "bad_json");
    }
    this.handleControl(c, msg);
  }
  violation(c, kind) {
    c.violations++;
    if (c.violations === 1 || c.violations % 20 === 0) this.log.warn("protocol violation", { user: c.user.userId, kind, count: c.violations });
    if (c.violations > 50 && c.ws) {
      this.send(c, { type: "kicked", reason: "protocol" });
      c.ws.close(WS_CLOSE.POLICY, "protocol violations");
    }
  }
  handleControl(c, msg) {
    switch (msg.type) {
      case "ping":
        this.send(c, { type: "pong", t: msg.t, serverTime: this.world.time });
        return;
      case "ready":
        c.ready = msg.ready;
        this.broadcastRoster();
        return;
      case "character": {
        c.character = msg.character;
        const p = this.world.players.get(c.user.userId);
        if (p && (this.world.phase === "waiting" || !p.alive)) p.character = msg.character;
        this.broadcastRoster();
        return;
      }
      case "map":
        if (c.user.userId !== this.hostId) return this.error(c, "not_host", "\u0422\u043E\u043B\u044C\u043A\u043E \u0445\u043E\u0437\u044F\u0438\u043D \u043A\u043E\u043C\u043D\u0430\u0442\u044B \u043C\u0435\u043D\u044F\u0435\u0442 \u043A\u0430\u0440\u0442\u0443");
        if (this.world.phase !== "waiting") return this.error(c, "invalid_state", "\u041C\u0430\u0442\u0447 \u0443\u0436\u0435 \u0438\u0434\u0451\u0442");
        if (!isMapId(msg.mapId)) return;
        this.changeMap(msg.mapId);
        return;
      case "start":
        if (c.user.userId !== this.hostId) return this.error(c, "not_host", "\u0422\u043E\u043B\u044C\u043A\u043E \u0445\u043E\u0437\u044F\u0438\u043D \u043A\u043E\u043C\u043D\u0430\u0442\u044B \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u043C\u0430\u0442\u0447");
        if (this.world.phase !== "waiting") return this.error(c, "invalid_state", "\u041C\u0430\u0442\u0447 \u0443\u0436\u0435 \u0438\u0434\u0451\u0442");
        if (this.connectedCount < this.config.minPlayers) return this.error(c, "invalid_state", `\u041D\u0443\u0436\u043D\u043E \u043C\u0438\u043D\u0438\u043C\u0443\u043C ${this.config.minPlayers} \u0438\u0433\u0440\u043E\u043A\u0430`);
        this.startMatch();
        return;
      case "rematch":
        if (this.world.phase !== "finished") return;
        c.rematch = true;
        this.broadcastRoster();
        if ([...this.clients.values()].filter((x) => x.connected).every((x) => x.rematch)) this.toLobby(true);
        return;
      case "leave":
        if (c.ws) c.ws.close(WS_CLOSE.NORMAL, "leave");
        this.removeClient(c, "leave");
        return;
      case "hello":
        return;
    }
  }
  changeMap(mapId) {
    const roster = [...this.world.players.values()];
    this.mapId = mapId;
    this.world = this.createWorld();
    for (const p of roster) this.world.addPlayer(p.id, p.name, p.character, p.isBot).connected = p.connected;
    this.broadcastRoster();
  }
  // ── Match lifecycle ─────────────────────────────────────────────────────
  startMatch() {
    for (const c of this.clients.values()) {
      const p = this.world.players.get(c.user.userId);
      if (p) p.character = c.character;
      c.matchTimeMs = 0;
      c.rematch = false;
    }
    this.world.beginMatch();
    this.matchId = randomUUID3();
    this.matchStartedAtWall = Date.now();
    this.resultsSent = false;
    const players = [...this.clients.values()].map((c) => ({ userId: c.user.userId, character: c.character, viaInvite: c.viaInvite }));
    this.services.recorder.matchStarted({ matchId: this.matchId, roomId: this.id, mapId: this.mapId, isPrivate: this.isPrivate, startedAt: /* @__PURE__ */ new Date(), players }).catch((e) => this.log.error("matchStarted failed", { err: e }));
    this.services.analytics.server("match_started", { matchId: this.matchId, roomId: this.id, mapId: this.mapId, players: players.length });
    this.services.analytics.server("map_played", { matchId: this.matchId, mapId: this.mapId });
    this.log.info("match started", { matchId: this.matchId, players: players.length, map: this.mapId });
    this.broadcastRoster();
  }
  toLobby(rematch) {
    this.world.resetToLobby();
    this.matchId = null;
    for (const [id, c] of [...this.clients]) {
      if (!c.connected) {
        this.clients.delete(id);
        this.world.removePlayer(id);
      }
      c.rematch = false;
      c.ready = this.autoStart || rematch;
    }
    this.broadcastRoster();
    if (rematch && this.connectedCount >= this.config.minPlayers) this.startMatch();
  }
  finishResults(reason) {
    if (this.resultsSent || !this.matchId) return;
    this.resultsSent = true;
    const standings = this.world.standings();
    const durationMs = Math.max(0, this.world.time - this.world.matchStartedAt);
    this.flush();
    this.broadcast({ type: "results", matchId: this.matchId, reason, durationMs, standings, mapId: this.mapId });
    const matchId = this.matchId;
    const presentAtEnd = standings.filter((s) => this.clients.get(s.id)?.connected);
    const presentPlaces = rankPlaces(presentAtEnd);
    const participants = standings.filter((s) => !s.isBot && this.clients.has(s.id)).map((s) => {
      const c = this.clients.get(s.id);
      const presentIdx = presentAtEnd.findIndex((x) => x.id === s.id);
      return {
        userId: s.id,
        character: c.character,
        place: presentIdx >= 0 ? presentPlaces[presentIdx] : standings.length,
        kills: s.kills,
        assists: s.assists,
        deaths: s.deaths,
        score: s.score,
        damageDealt: s.damageDealt,
        completed: c.connected,
        viaInvite: c.viaInvite,
        playtimeMs: Math.round(c.matchTimeMs)
      };
    });
    this.services.analytics.server("match_completed", { matchId, mapId: this.mapId, durationMs, players: presentAtEnd.length, reason });
    this.services.recorder.matchCompleted({
      matchId,
      roomId: this.id,
      mapId: this.mapId,
      isPrivate: this.isPrivate,
      startedAt: new Date(this.matchStartedAtWall),
      endedAt: /* @__PURE__ */ new Date(),
      durationMs,
      endReason: reason,
      playersAtEnd: presentAtEnd.length,
      participants
    }).then((personal) => {
      let levelChanged = false;
      for (const [userId, result] of personal) {
        const c = this.clients.get(userId);
        if (!c) continue;
        if (c.user.level !== result.level) {
          c.user = { ...c.user, level: result.level };
          levelChanged = true;
        }
        this.send(c, { type: "progress", matchId, result });
      }
      if (levelChanged && !this.closed) this.broadcastRoster();
    }).catch((e) => {
      this.log.error("matchCompleted failed", { err: e, matchId });
      this.services.analytics.error({ source: "server", component: "results", category: "persist", message: e.message });
    });
  }
  // ── Tick ────────────────────────────────────────────────────────────────
  tick(now) {
    if (this.closed) return;
    const w = this.world;
    if (w.phase === "waiting") {
      const connected = [...this.clients.values()].filter((c) => c.connected);
      const enough = connected.length >= this.config.minPlayers;
      const allReady = enough && connected.every((c) => c.ready);
      if (allReady) {
        if (!this.autoStartAt) this.autoStartAt = now + (this.autoStart ? AUTO_START_DELAY_MS : 600);
        if (now >= this.autoStartAt) {
          this.autoStartAt = 0;
          this.startMatch();
        }
      } else this.autoStartAt = 0;
    }
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      if (w.phase === "active") c.matchTimeMs += TICK_MS;
      c.tokens = Math.min(INPUT_BUCKET_MAX, c.tokens + 1);
      let n = 0;
      while (c.queue.length > 0 && c.tokens >= 1 && n < MAX_INPUTS_PER_TICK) {
        w.applyInput(c.user.userId, c.queue.shift());
        c.tokens -= 1;
        n++;
      }
    }
    w.update();
    for (const e of w.drainEvents()) {
      if (e.t === "shot" || e.t === "melee") this.pendingShots.push(e);
      else {
        this.pendingEvents.push(e);
        if (e.t === "phase") this.broadcastRoster();
        if (e.t === "matchEnd") this.finishResults(e.reason);
      }
    }
    if (w.phase === "finished" && w.phaseEndsAt && w.time >= w.phaseEndsAt) this.toLobby(false);
    if (w.phase === "active" && this.connectedCount < 2) {
      if (!this.soloSince) this.soloSince = now;
      else if (now - this.soloSince > SOLO_ABORT_MS) {
        this.soloSince = 0;
        w.finish("aborted");
      }
    } else this.soloSince = 0;
    for (const c of [...this.clients.values()]) {
      if (!c.connected && now - c.disconnectedAt > this.config.reconnectGraceMs) this.removeClient(c, "timeout");
    }
    if (w.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush();
    if (this.connectedCount === 0) {
      if (now - this.emptySince > this.config.emptyRoomTtlMs) this.close("empty");
    } else this.emptySince = now;
  }
  flush() {
    const w = this.world;
    const snapshot = encodeSnapshot({
      tick: w.tick,
      time: w.time,
      phase: w.phase,
      phaseRemaining: w.phase === "active" ? w.matchTimeLeftMs : w.phaseEndsAt ? Math.max(0, w.phaseEndsAt - w.time) : 0,
      players: w.players.values(),
      pickups: w.pickups,
      events: this.pendingShots,
      now: w.time
    });
    this.pendingShots = [];
    const evMsg = this.pendingEvents.length ? JSON.stringify({ type: "ev", tick: w.tick, events: this.pendingEvents }) : null;
    this.pendingEvents = [];
    for (const c of this.clients.values()) {
      if (!c.connected || !c.ws || c.ws.readyState !== 1) continue;
      if (c.ws.bufferedAmount > 256 * 1024) continue;
      c.ws.send(snapshot, { binary: true });
      if (evMsg) c.ws.send(evMsg);
    }
  }
  close(reason) {
    if (this.closed) return;
    if (this.matchId && (this.world.phase === "active" || this.world.phase === "countdown" || this.world.phase === "ready") && !this.resultsSent) {
      const id = this.matchId;
      this.services.recorder.matchAbandoned(id, reason).catch((e) => this.log.error("matchAbandoned failed", { err: e }));
      this.services.analytics.server("match_abandoned", { matchId: id, mapId: this.mapId, phase: this.world.phase });
    }
    this.closed = true;
    this.world.close();
    for (const c of this.clients.values()) {
      try {
        c.ws?.close(WS_CLOSE.ROOM_CLOSED, "room closed");
      } catch {
      }
    }
    this.clients.clear();
    this.log.info("room closed", { reason });
  }
  // ── Output helpers ──────────────────────────────────────────────────────
  roster() {
    const players = [...this.clients.values()].map((c) => {
      const p = this.world.players.get(c.user.userId);
      return {
        id: c.user.userId,
        slot: p?.slot ?? -1,
        name: c.user.displayName,
        character: c.character,
        ready: this.world.phase === "finished" ? c.rematch : c.ready,
        connected: c.connected,
        isHost: c.user.userId === this.hostId,
        isBot: false,
        level: c.user.level
      };
    });
    return { type: "roster", players, hostId: this.hostId, mapId: this.mapId, phase: this.world.phase, inviteCode: this.inviteCode, isPrivate: this.isPrivate, maxPlayers: this.config.maxPlayers };
  }
  broadcastRoster() {
    this.broadcast(this.roster());
  }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const c of this.clients.values()) if (c.connected && c.ws && c.ws.readyState === 1) c.ws.send(s);
  }
  send(c, msg) {
    if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }
  error(c, code, message) {
    this.send(c, { type: "error", code, message });
  }
  info() {
    return { id: this.id, mapId: this.mapId, phase: this.world.phase, players: this.clients.size, maxPlayers: this.config.maxPlayers, isPrivate: this.isPrivate, hostName: this.hostName() };
  }
  static protocolVersion = PROTOCOL_VERSION;
};

// apps/server/src/rooms/RoomManager.ts
var ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function newRoomId(len = 10) {
  const bytes = randomBytes6(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return s;
}
var RoomManager = class {
  constructor(services2, log2, opts) {
    this.services = services2;
    this.log = log2;
    this.opts = opts;
  }
  services;
  log;
  opts;
  rooms = /* @__PURE__ */ new Map();
  timer = null;
  nextTickAt = 0;
  count() {
    return this.rooms.size;
  }
  get(id) {
    const r = this.rooms.get(id);
    return r && !r.closed ? r : void 0;
  }
  list() {
    return [...this.rooms.values()].filter((r) => !r.closed);
  }
  create(mapId, isPrivate, hostUserId, inviteCode = null) {
    if (this.rooms.size >= this.opts.maxRooms) throw new Error("room limit reached");
    let id = newRoomId();
    while (this.rooms.has(id)) id = newRoomId();
    const room = new MatchRoom({ id, mapId, isPrivate, hostUserId, inviteCode, config: this.opts.config }, this.services, this.log);
    this.rooms.set(id, room);
    this.services.analytics.server("lobby_created", { roomId: id, mapId, isPrivate }, { userId: hostUserId });
    return room;
  }
  /** Finds a public joinable room (preferring the requested map and fuller rooms) or creates one. */
  quickMatch(userId, mapId) {
    const candidates = this.list().filter((r) => !r.isPrivate && r.isJoinable(userId) && (!mapId || r.mapId === mapId)).sort((a, b2) => b2.occupancy - a.occupancy);
    if (candidates[0]) return candidates[0];
    const map = mapId ?? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)];
    return this.create(map, false, null);
  }
  start() {
    if (this.timer) return;
    this.nextTickAt = performance.now();
    const loop = () => {
      const now = performance.now();
      let steps = 0;
      while (now >= this.nextTickAt && steps < 5) {
        this.tickAll();
        this.nextTickAt += TICK_MS;
        steps++;
      }
      if (now - this.nextTickAt > 250) this.nextTickAt = now;
      this.timer = setTimeout(loop, Math.max(0, this.nextTickAt - performance.now()));
    };
    loop();
  }
  tickAll(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      try {
        room.tick(now);
      } catch (e) {
        this.log.error("room tick failed", { room: id, err: e });
        this.services.analytics.error({ source: "server", component: "room", category: "tick", message: e.message });
        room.close("error");
      }
      if (room.closed) this.rooms.delete(id);
    }
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const r of this.rooms.values()) r.close("shutdown");
    this.rooms.clear();
  }
};

// ../../../opt/npm-tools/node_modules/ws/wrapper.mjs
var import_stream3 = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// apps/server/src/rooms/gateway.ts
function attachGateway(server2, rooms2, services2, log2, opts) {
  const wss = new import_websocket_server.default({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const alive = /* @__PURE__ */ new WeakMap();
  const perIp = /* @__PURE__ */ new Map();
  const selfOrigin = new URL(opts.publicUrl).origin;
  const allowed = /* @__PURE__ */ new Set([selfOrigin, ...opts.allowedOrigins]);
  server2.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    const host = req.headers.host;
    const sameHost = origin && host && new URL(origin).host === host;
    if (origin && !allowed.has(origin) && !sameHost) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const ip = (opts.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "") || req.socket.remoteAddress || "unknown";
    const n = perIp.get(ip) ?? 0;
    if (n >= opts.maxConnectionsPerIp) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIp.set(ip, n + 1);
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      ws.on("close", () => {
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left <= 0) perIp.delete(ip);
        else perIp.set(ip, left);
      });
      handleSocket(ws);
    });
  });
  function handleSocket(ws) {
    let joined = false;
    const helloTimer = setTimeout(() => {
      if (!joined) ws.close(WS_CLOSE.UNAUTHORIZED, "hello timeout");
    }, 8e3);
    ws.on("error", () => {
    });
    const onFirst = async (data, isBinary) => {
      if (joined) return;
      if (isBinary) return ws.close(WS_CLOSE.POLICY, "expected hello");
      let msg;
      try {
        const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
        msg = ClientMessageSchema.safeParse(JSON.parse(raw.toString("utf8")));
      } catch {
        return ws.close(WS_CLOSE.POLICY, "bad hello");
      }
      if (!msg.success || msg.data.type !== "hello") {
        ws.send(JSON.stringify({ type: "error", code: "version_mismatch", message: `protocol ${PROTOCOL_VERSION} required` }));
        return ws.close(WS_CLOSE.POLICY, "bad hello");
      }
      const hello = msg.data;
      ws.off("message", onFirst);
      const user = await services2.sessions.verify(hello.token).catch(() => null);
      if (!user) {
        ws.send(JSON.stringify({ type: "error", code: "unauthorized", message: "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430" }));
        return ws.close(WS_CLOSE.UNAUTHORIZED, "unauthorized");
      }
      const room = rooms2.get(hello.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", code: "room_not_found", message: "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" }));
        return ws.close(WS_CLOSE.ROOM_NOT_FOUND, "room not found");
      }
      const viaInvite = room.isPrivate;
      const result = room.join(user, ws, hello.character, viaInvite);
      if (result === "room_full" || result === "room_closed") {
        ws.send(JSON.stringify({ type: "error", code: result, message: result === "room_full" ? "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0430" : "\u041C\u0430\u0442\u0447 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D" }));
        return ws.close(result === "room_full" ? WS_CLOSE.ROOM_FULL : WS_CLOSE.ROOM_CLOSED, result);
      }
      joined = true;
      clearTimeout(helloTimer);
      ws.on("message", (d, bin) => {
        try {
          room.onMessage(ws, d, bin);
        } catch (e) {
          log2.error("message handling failed", { err: e });
        }
      });
      ws.on("close", () => room.onSocketClose(ws));
    };
    ws.on("message", onFirst);
    ws.on("close", () => clearTimeout(helloTimer));
  }
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
      }
    }
  }, 15e3);
  wss.on("close", () => clearInterval(interval));
  return wss;
}

// apps/server/src/index.ts
var env = loadEnv();
var log = createLogger(env.LOG_LEVEL, { service: "blatkom-server", version: env.SERVER_VERSION });
var sql = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, log });
var applied = await migrate(sql);
if (applied.length) log.info("migrations applied", { applied });
var persistence = await createPersistence({ sql, env, log });
var services = persistence.services;
var rooms = new RoomManager(services, log, { maxRooms: env.MAX_ROOMS, config: matchConfigFromEnv(env) });
var handler = createApp({ env, sql, log, services, rooms });
var server = createServer((req, res) => {
  handler(req, res).catch((e) => log.error("fatal request error", { err: e }));
});
server.headersTimeout = 2e4;
server.requestTimeout = 3e4;
attachGateway(server, rooms, services, log, {
  allowedOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  publicUrl: env.PUBLIC_URL,
  maxConnectionsPerIp: 24,
  trustProxy: env.TRUST_PROXY
});
rooms.start();
server.listen(env.PORT, env.HOST, () => log.info("listening", { host: env.HOST, port: env.PORT, publicUrl: env.PUBLIC_URL, devAuth: env.DEV_AUTH_ENABLED }));
var stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info("shutting down", { signal });
  rooms.stop();
  server.close();
  await persistence.close?.();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error("unhandledRejection", { err: e }));
//# sourceMappingURL=server.js.map
