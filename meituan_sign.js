#!name=美团签到
#!desc=美团签到
#!arguments=TIMEOUT:120,CRONEXP: 5 0 * * *

[Script]
# > 美团获取Cookie
美团获取 = script-path=https://raw.githubusercontent.com/chavyleung/scripts/master/meituan/meituan.cookie.js,requires-body=true,type=http-request,pattern=^https:\/\/i.meituan.com\/evolve\/signin\/signpost\/

# > 美团签到
美团签到 = type=cron,cronexp={{{CRONEXP}}},wake-system=1,timeout={{{TIMEOUT}}},script-path=https://raw.githubusercontent.com/chavyleung/scripts/master/meituan/meituan.js,script-update-interval=0

[MITM]
hostname = %APPEND% i.meituan.com
