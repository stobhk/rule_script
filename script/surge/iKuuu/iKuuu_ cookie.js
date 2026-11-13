/**
 * iKuuu Cookie 抓取（Surge http-request 脚本）
 * 原作者：Yjwj205 / Minis（适配 Surge 修改版）
 */
(function () {
  "use strict";

  var COOKIE_KEY = "ikuuu_org_cookie";
  // 登录后才会出现的会话 Cookie
  var LOGIN_COOKIE = /(?:^|;\s*)(?:auth|uid|key|session|remember_[^=;]*)=[^;]/i;

  // 兼容 Surge 的字符串传参（支持 "notify=false" 或 JSON 字符串）与 Loon 的对象传参
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
  var notifyEnabled = args.notify !== false;

  function notify(subtitle, content) {
    if (!notifyEnabled) return;
    try {
      $notification.post("iKuuu Cookie 抓取", subtitle, content);
    } catch (e) {
      console.log("[iKuuu] 通知发送失败：" + e);
    }
  }

  function findCookie(headers) {
    if (!headers) return "";
    for (var key in headers) {
      if (key && key.toLowerCase() === "cookie" && headers[key]) {
        return String(headers[key]);
      }
    }
    return "";
  }

  var cookie = "";
  try {
    cookie = findCookie($request && $request.headers).trim();
  } catch (e) {
    console.log("[iKuuu] 读取请求头失败：" + e);
  }

  if (!cookie) {
    console.log("[iKuuu] 本次请求没有 Cookie，跳过");
    return $done({});
  }

  if (!LOGIN_COOKIE.test(cookie)) {
    console.log("[iKuuu] 当前是未登录状态，忽略本次 Cookie");
    return $done({});
  }

  var existing = "";
  try {
    existing = String($persistentStore.read(COOKIE_KEY) || "");
  } catch (e) {}

  if (existing === cookie) {
    console.log("[iKuuu] Cookie 没有变化，跳过写入");
    return $done({});
  }

  var saved = false;
  try {
    saved = $persistentStore.write(cookie, COOKIE_KEY);
  } catch (e) {
    console.log("[iKuuu] 保存 Cookie 失败：" + e);
  }

  if (saved) {
    console.log("[iKuuu] 已保存登录 Cookie（" + cookie.length + " 字节）");
    notify(
      "已获取登录 Cookie",
      "可以在 Surge 模块中关闭抓包脚本了，签到脚本会继续使用这份 Cookie。"
    );
  } else {
    console.log("[iKuuu] 写入本地存储失败");
    notify("Cookie 保存失败", "写入 Surge 持久化存储失败，请检查配置后重试。");
  }

  $done({});
})();
