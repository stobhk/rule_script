/*
Surge配置参考注释,感谢@congcong.

示例↓↓↓ 
----------------------------------------

[Script]
Sub_info = type=generic,timeout=10,script-path=https://raw.githubusercontent.com/mieqq/mieqq/master/sub_info_panel.js,script-update-interval=0,argument=url=[URL encode 后的机场节点链接]&reset_day=1&title=AmyInfo&icon=bonjour&color=#007aff

[Panel]
Sub_info = script-name=Sub_info,update-interval=600

----------------------------------------

先将带有流量信息的节点订阅链接encode，用encode后的链接替换"url="后面的[机场节点链接]

（实在不会可以用这个捷径生成panel和脚本，https://www.icloud.com/shortcuts/3f24df391d594a73abd04ebdccd92584）

可选参数 &reset_day，后面的数字替换成流量每月重置的日期，如1号就写1，8号就写8。如"&reset_day=8",不加该参数不显示流量重置信息。

可选参数 &expire，机场链接不带expire信息的，可以手动传入expire参数，如"&expire=2022-02-01",注意一定要按照yyyy-MM-dd的格式。不希望显示到期信息也可以添加&expire=false取消显示。

可选参数"title=xxx" 可以自定义标题。

可选参数"icon=xxx" 可以自定义图标，内容为任意有效的 SF Symbol Name，如 bolt.horizontal.circle.fill，详细可以下载app https://apps.apple.com/cn/app/sf-symbols-browser/id1491161336

可选参数"color=xxx" 当使用 icon 字段时，可传入 color 字段控制图标颜色，字段内容为颜色的 HEX 编码。如：color=#007aff
----------------------------------------

有些服务端不支持head访问，可以添加参数&method=get
*/

let args = getArgs();

(async () => {
  let info = await getDataInfo(args.url);
  if (!info) $done();
  let resetDayLeft = getRmainingDays(parseInt(args["reset_day"]));
  
  let lsdown = info.download;
  let lsup = info.upload;

  let used = info.download + info.upload;
  let total = info.total;
  let expire = args.expire || info.expire;
  let expireDaysLeft = getExpireDaysLeft(expire);

  let content = ``;
  
  if (used == 0){
    content = [`用量：总量剩余${bytesToSize(total)}`];
  }else{
    content = [`用量：${bytesToSize(used)} | ${bytesToSize(total)}`];
  }
  
  /*
  content.push(``);
  if (lsdown && lsup !== "false") {
    content.push(`上传：${bytesToSize(lsup)}， 下载：${bytesToSize(lsdown)} `);
  }

  if (resetDayLeft) {
    content.push(`提醒：${resetDayLeft}天后重置，${expireDaysLeft}天后到期`);
  }
  */  

  
  // 判断是否为不限时套餐
  if (!resetDayLeft && !expireDaysLeft) {
  	if(used == 0 && total == 0){
  		let percentage = ((used / total) * 100).toFixed(1);
  		content.push(`提醒：流量已使用${percentage}%`);
  	}
  } else {
    if (resetDayLeft && expireDaysLeft) {
      content.push(`提醒：${resetDayLeft - 1}天后重置，${expireDaysLeft - 1}天后到期`);
    } else if (resetDayLeft) {
      content.push(`提醒：${resetDayLeft - 1}天后重置`);
    } else if (expireDaysLeft) {
      content.push(`提醒：${expireDaysLeft - 1}天后到期`);
    }
    
    // 到期时间（日期）显示
    /*
    if (expireDaysLeft) {
      content.push(`到期：${formatTime(args.expire || info.expire)}`);
    }
    */
    if (expire && expire !== "false") {
      if (/^[\d.]+$/.test(expire)) expire *= 1000;
      content.push(`到期：${formatTime(expire)}`);
    }
  }

  


  let now = new Date();
  let hour = now.getHours();
  let minutes = now.getMinutes();
  hour = hour > 9 ? hour : "0" + hour;
  minutes = minutes > 9 ? minutes : "0" + minutes;

  $done({
    title: `${args.title} | ${hour}:${minutes}`,
    content: content.join("\n"),
    icon: args.icon || "airplane.circle",
    "icon-color": args.color || "#007aff",
  });
})();

function getArgs() {
  return Object.fromEntries(
    $argument
      .split("&")
      .map((item) => item.split("="))
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );
}

function getUserInfo(url) {
  let method = args.method || "head";
  let request = { headers: { "User-Agent": "Quantumult%20X" }, url };
  return new Promise((resolve, reject) =>
    $httpClient[method](request, (err, resp) => {
      if (err != null) {
        reject(err);
        return;
      }
      if (resp.status !== 200) {
        reject(resp.status);
        return;
      }
      let header = Object.keys(resp.headers).find(
        (key) => key.toLowerCase() === "subscription-userinfo"
      );
      if (header) {
        resolve(resp.headers[header]);
        return;
      }
      reject("链接响应头不带有流量信息");
    })
  );
}

async function getDataInfo(url) {
  const [err, data] = await getUserInfo(url)
    .then((data) => [null, data])
    .catch((err) => [err, null]);
  if (err) {
    console.log(err);
    return;
  }

  return Object.fromEntries(
    data
      .match(/\w+=[\d.eE+-]+/g)
      .map((item) => item.split("="))
      .map(([k, v]) => [k, Number(v)])
  );
}

function getRmainingDays(resetDay) {
  if (!resetDay) return;

  let now = new Date();
  let today = now.getDate();
  let month = now.getMonth();
  let year = now.getFullYear();
  let daysInMonth;

  if (resetDay > today) {
    daysInMonth = 0;
  } else {
    daysInMonth = new Date(year, month + 1, 0).getDate();
  }

  return daysInMonth - today + resetDay;
}

function getExpireDaysLeft(expire) {
  if (!expire) return;

  let now = new Date().getTime();
  let expireTime;

  // 检查是否为时间戳
  if (/^[\d.]+$/.test(expire)) {
    expireTime = parseInt(expire) * 1000;
  } else {
    // 尝试解析YYYY-MM-DD格式的日期
    expireTime = new Date(expire).getTime();
  }

  let daysLeft = Math.ceil((expireTime - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 ? daysLeft : null;
}

function bytesToSize(bytes) {
  if (bytes === 0) return "0B";
  let k = 1024;
  sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function formatTime(time) {
  let dateObj = new Date(time);
  let year = dateObj.getFullYear();
  let month = dateObj.getMonth() + 1;
  let day = dateObj.getDate();
  return year + "年" + month + "月" + day + "日";
}
