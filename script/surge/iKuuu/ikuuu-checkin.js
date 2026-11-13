/**
 * iKuuu 自动签到（Surge cron / generic 脚本）
 * 原作者：Yjwj205 / Minis（适配 Surge 修改版）
 */
(function () {
  "use strict";

  var HOST = "https://ikuuu.org";
  var COOKIE_KEY = "ikuuu_org_cookie";
  var MAX_ATTEMPTS = 3;
  var UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  // 兼容 Surge 的字符串传参（如 "cookie=xxx&notify=true&requestNode=DIRECT"）与 Loon 的对象传参
  function parseArgs(arg) {
    if (!arg) return {};
    if (typeof arg === "object") return arg;
    if (typeof arg === "string") {
      try {
        return JSON.parse(arg);
      } catch (e) {
        var res = {};
        arg.split("&").forEach(function (pair) {
          var idx = pair.indexOf("=");
          if (idx > -1) {
            var k = decodeURIComponent(pair.slice(0, idx).trim());
            var v = decodeURIComponent(pair.slice(idx + 1).trim());
            if (v === "true") res[k] = true;
            else if (v === "false") res[k] = false;
            else res[k] = v;
          }
        });
        return res;
      }
    }
    return {};
  }

  var args = parseArgs(typeof $argument !== "undefined" ? $argument : undefined);
  var manualCookie = (args.cookie === null || args.cookie === undefined)
    ? "" : String(args.cookie);
  var notifyEnabled = args.notify !== false;
  var requestNode = (args.requestNode === null || args.requestNode === undefined)
    ? "" : String(args.requestNode).trim();

  // 允许直接粘贴 "Cookie: xxx" 或换行粘贴
  manualCookie = manualCookie
    .replace(/^\s*cookie\s*:\s*/i, "")
    .replace(/[\r\n]+/g, " ")
    .trim();

  var savedCookie = "";
  try {
    savedCookie = String($persistentStore.read(COOKIE_KEY) || "").trim();
  } catch (e) {
    console.log("[iKuuu] 读取本地 Cookie 失败：" + e);
  }

  var cookie = manualCookie || savedCookie;

  /**
   * 请求参数（Surge 适配版）：
   * timeout：Surge 单位为秒（15 秒），若不设或过大兼容处理
   * insecure：跳过自签名 MITM 证书校验
   * policy：Surge 中指定策略组/节点名/DIRECT 的字段名为 policy（Loon 中为 node）
   */
  function requestOptions(url, headers) {
    var options = {
      url: url,
      timeout: 15,
      insecure: true,
      headers: headers
    };
    if (requestNode) options.policy = requestNode;
    return options;
  }

  function finish(subtitle, content) {
    if (notifyEnabled) {
      try {
        $notification.post("iKuuu 签到", subtitle, content);
      } catch (e) {
        console.log("[iKuuu] 通知发送失败：" + e);
      }
    }
    console.log("[iKuuu] " + subtitle + " | " + String(content).replace(/\n/g, " / "));
    $done();
  }

  /* ---------- Base64 / UTF-8（站点页面被 base64 包在 var originBody 里） ---------- */

  var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function utf8Decode(bytes) {
    var out = "", i = 0;
    while (i < bytes.length) {
      var b = bytes[i++];
      if (b < 0x80) {
        out += String.fromCharCode(b);
      } else if (b >= 0xC0 && b < 0xE0) {
        out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
      } else if (b >= 0xE0 && b < 0xF0) {
        out += String.fromCharCode(((b & 0x0F) << 12) |
          ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
      } else {
        var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) |
          ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      }
    }
    return out;
  }

  function base64Decode(str) {
    str = String(str).replace(/[^A-Za-z0-9+/=]/g, "");
    var bytes = [], buf = 0, bits = 0, i, v;
    for (i = 0; i < str.length; i++) {
      if (str.charAt(i) === "=") break;
      v = B64_CHARS.indexOf(str.charAt(i));
      if (v < 0) continue;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buf >> bits) & 0xFF);
      }
    }
    return utf8Decode(bytes);
  }

  function extractHtml(data) {
    var text = String(data || "");
    var m = text.match(/var\s+originBody\s*=\s*["']([^"']+)["']/);
    if (!m) return text;
    try {
      return base64Decode(m[1]);
    } catch (e) {
      return text;
    }
  }

  function pick(html, label) {
    var re = new RegExp(
      label + "[\\s\\S]{0,400}?<span[^>]*class=\"[^\"]*counter[^\"]*\"[^>]*>" +
      "\\s*([\\d.]+)\\s*<\\/span>\\s*([KMGTP]?B)", "i");
    var m = html.match(re);
    if (m) return m[1] + " " + m[2].toUpperCase();
    var plain = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    var m2 = plain.match(new RegExp(label + "\\s*[:：]?\\s*([\\d.]+)\\s*([KMGTP]?B)", "i"));
    return m2 ? m2[1] + " " + m2[2].toUpperCase() : null;
  }

  /* ---------- 签到后的流量播报（失败不影响签到结果） ---------- */

  function fetchTraffic(callback, attempt) {
    attempt = attempt || 1;
    $httpClient.get(requestOptions(HOST + "/user", {
      "Cookie": cookie,
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": HOST + "/user"
    }), function (error, response, data) {
      if (error && attempt < 2) {
        return setTimeout(function () {
          fetchTraffic(callback, attempt + 1);
        }, 1000);
      }
      if (error || !data) return callback(null);
      var result = [];
      try {
        var html = extractHtml(data);
        var rest = pick(html, "剩余流量");
        if (rest) result.push("剩余流量：" + rest);
      } catch (e) {
        console.log("[iKuuu] 解析流量失败：" + e);
      }
      callback(result.length ? result.join("\n") : null);
    });
  }

  /* ---------- 主流程 ---------- */

  function handleCheckin(error, response, data, attempts) {
    if (error) {
      var errText = String(error);
      if (/certificate|SSL|TLS/i.test(errText)) {
        return finish("TLS 校验失败", [
          "签到请求连续 " + attempts + " 次没通过证书校验（insecure=true 已开启）。",
          "① 在模块参数「requestNode」里指定一个节点/策略组，排除线路或节点证书问题；",
          "② 检查 Surge 的 MITM 证书是否安装并在系统里信任；",
          "③ 不需要自动抓 Cookie 的话，删掉模块里的 [MITM] 段、改用手动 Cookie。",
          "",
          errText.slice(0, 160)
        ].join("\n"));
      }
      return finish("请求失败", "签到接口请求出错（已试 " + attempts + " 次）：" + errText);
    }

    var status = (response && response.status) ? response.status : 0;
    var text = String(data === null || data === undefined ? "" : data).trim();
    var json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {}

    if (!json || typeof json !== "object") {
      if (status === 302 || /<html|<script/i.test(text)) {
        return finish("Cookie 已失效",
          "服务器返回的是登录页，请在 Safari 重新登录 ikuuu.org（脚本会自动更新 Cookie）。");
      }
      return finish("签到失败",
        "返回内容无法解析（HTTP " + status + "）：" + text.slice(0, 120));
    }

    var ret = Number(json.ret);
    var msg = String(json.msg || "").trim() || "服务器没有返回说明";
    var already = /已经?签到|重复签到|签到过了|明天再来/.test(msg);
    var subtitle;
    if (ret === 1) {
      subtitle = "签到成功";
    } else if (already) {
      subtitle = "今日已签到";
    } else if (/未登录|登录.*(?:失效|过期)|请重新登录|请先登录/.test(msg)) {
      subtitle = "Cookie 已失效";
    } else {
      subtitle = "签到失败";
    }

    fetchTraffic(function (traffic) {
      var content = msg;
      if (traffic) content += "\n" + traffic;
      finish(subtitle, content);
    });
  }

  function attemptCheckin(attempt) {
    $httpClient.post(requestOptions(HOST + "/user/checkin", {
      "Cookie": cookie,
      "User-Agent": UA,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": HOST + "/user",
      "Origin": HOST,
      "X-Requested-With": "XMLHttpRequest"
    }), function (error, response, data) {
      if (error && attempt < MAX_ATTEMPTS) {
        console.log("[iKuuu] 第 " + attempt + " 次请求失败：" + error + "，1.5 秒后重试");
        return setTimeout(function () {
          attemptCheckin(attempt + 1);
        }, 1500);
      }
      handleCheckin(error, response, data, attempt);
    });
  }

  if (!cookie) {
    return finish("没有 Cookie", [
      "还没拿到登录 Cookie。",
      "① 启用模块并开启 MITM，在 Safari 打开 https://ikuuu.org 登录一次自动抓取；",
      "② 或在模块参数的 cookie 里手动粘贴。"
    ].join("\n"));
  }

  attemptCheckin(1);
})();
