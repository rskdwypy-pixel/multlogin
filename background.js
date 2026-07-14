var DEBUG_LOGS = false;

function debugLog() {
    if (DEBUG_LOGS) {
        console.log.apply(console, arguments);
    }
}

function debugError() {
    if (DEBUG_LOGS) {
        console.error.apply(console, arguments);
    }
}

// 调试代码：检查PasswordManager是否正确加载
if (typeof PasswordManager !== 'undefined') {
    debugLog('✅ PasswordManager模块已加载到background页面');
    debugLog('PasswordManager方法:', Object.keys(PasswordManager));
} else {
    debugError('❌ PasswordManager模块未加载到background页面');
}

// Profile颜色映射系统
var profileColorMap = {};
var colorIndex = 0;

/**
 * 为profile分配颜色
 */
function getProfileColor(profileId) {
    if (!profileId) {
        return '#006600'; // 默认绿色
    }

    // 如果已经分配过颜色，直接返回
    if (profileColorMap[profileId]) {
        return profileColorMap[profileId];
    }

    const colors = [
        '#E53935', '#00897B', '#1E88E5', '#43A047', '#F9A825',
        '#8E24AA', '#00ACC1', '#FB8C00', '#3949AB', '#6D4C41',
        '#D81B60', '#7CB342', '#039BE5', '#C0CA33', '#5E35B1',
        '#F4511E', '#546E7A', '#00A676', '#C2185B', '#2E7D32'
    ];

    var envId = extractEnvironmentIdForBadge(profileId);
    var envNumber = parseInt(envId, 10);
    const color = !isNaN(envNumber) && envNumber > 0 ?
        colors[(envNumber - 1) % colors.length] :
        colors[colorIndex % colors.length];
    profileColorMap[profileId] = color;
    colorIndex++;

    debugLog('为profile分配颜色:', profileId, '→', color);
    return color;
}

/**
 * 清除profile颜色（当标签页关闭时）
 */
function clearProfileColor(profileId) {
    if (profileColorMap[profileId]) {
        debugLog('清除profile颜色:', profileId);
        delete profileColorMap[profileId];
    }
}

function markPendingNewIdentityUrl(url) {
    if (!url) {
        return;
    }
    pendingNewIdentityUrls[url] = (pendingNewIdentityUrls[url] || 0) + 1;
}

function consumePendingNewIdentityUrl(url) {
    if (!url || !pendingNewIdentityUrls[url]) {
        return false;
    }
    pendingNewIdentityUrls[url]--;
    if (pendingNewIdentityUrls[url] <= 0) {
        delete pendingNewIdentityUrls[url];
    }
    return true;
}

function releasePendingNewIdentityUrl(url) {
    if (!url || !pendingNewIdentityUrls[url]) {
        return;
    }
    pendingNewIdentityUrls[url]--;
    if (pendingNewIdentityUrls[url] <= 0) {
        delete pendingNewIdentityUrls[url];
    }
}

var f = {};
/** @type {Array} */
var g = [];
/** @type {Array} */
var l = [];
var pendingNewIdentityUrls = {};
var pendingIdentityTabs = {};
m("");
chrome.browserAction.onClicked.addListener(function () {
    n++;
    var option = {};
    option.use = n;
    chrome.storage.sync.set(option);
    chrome.tabs.create({}, function (props) {
        if (chrome.runtime.lastError) {
            debugLog('创建标签页失败:', chrome.runtime.lastError.message);
            return;
        }
        p(props.id, props.id + "_@@@_");
    });
});
var q;
var n;
var r;
var s;
var t;
var u;
chrome.runtime.onInstalled.addListener(function (details) {
    chrome.storage.sync.get("date", function (o) {
        q = o.date;
        if (!q) {
            /** @type {number} */
            q = (new Date).getTime();
            /** @type {number} */
            o.date = q;
            chrome.storage.sync.set(o);
        }
    });
    chrome.storage.sync.get("use", function (c) {
        n = c.use;
        if (!n) {
            /** @type {number} */
            n = 0;
            /** @type {number} */
            c.use = n;
            chrome.storage.sync.set(c);
        }
    });
    chrome.storage.sync.get("uid", function (s) {
        r = s.uid;
        if (!r) {
            r = w();
            s.uid = r;
            chrome.storage.sync.set(s);
        }
    });
    chrome.storage.local.get("mid", function (m) {
        if (!m.mid) {
            m.mid = w();
            chrome.storage.local.set(m);
        }
        s = m.mid;
        if (!document.cookie) {
            /** @type {string} */
            document.cookie = "cuid=" + s + ";max-age=15552000";
        }
    });
    chrome.storage.local.get("orgVersion", function (data) {
        if (!data.orgVersion) {
            data.orgVersion = chrome.runtime.getManifest().version;
            chrome.storage.local.set(data);
        }
        t = data.orgVersion;
    });
    chrome.storage.local.get("mid", function (m) {
        if (!m.mid) {
            m.mid = w();
            chrome.storage.local.set(m);
        }
        s = m.mid;
        if (!document.cookie) {
            /** @type {string} */
            document.cookie = "cuid=" + s + ";max-age=15552000";
        }
    });
    chrome.storage.local.get("install", function (exports) {
        u = exports.install;
    });
    chrome.storage.sync.get(function () {
        x(details);
    });
});

/**
 * @param {Object} args
 * @return {undefined}
 */
function x(args) {
    if ("update" === args.reason) {
        if (args.previousVersion != chrome.runtime.getManifest().version) {
//            y(args.reason + "&ce_previousVersion=" + args.previousVersion);
        }
    }
    if (!("install" !== args.reason)) {
        if (!(0 != ((new Date).getTime() - q) / 864E5 << 0 || u)) {
            chrome.tabs.query({
                url: "https://chrome.google.com/webstore*"
            }, function (params) {
                if (chrome.runtime.lastError) {
                    debugLog('查询webstore标签页失败:', chrome.runtime.lastError.message);
                    return;
                }
                if (params && params[0]) {
                    var param = params[0];
                    if (param.openerTabId) {
                        chrome.tabs.get(param.openerTabId, function ($location) {
                            if (chrome.runtime.lastError) {
                                debugLog('获取来源标签页失败（可能已关闭）:', chrome.runtime.lastError.message);
                                return;
                            }
//                            y("install&ce_url=" + param.url + "&ce_referrer=" + $location.url);
                        });
                    } else {
//                        y("install&ce_url=" + param.url);
                    }
                } else {
//                    y("install");
                }
            });
        }
    }
}

/**
 * @return {?}
 */
function w() {
    return ("000000000000" + (Math.random() * Math.pow(36, 12)).toString(36)).substr(-12);
}

/**
 * @param {string} value
 * @return {undefined}
 */
function m(value) {
    chrome.cookies.getAll({}, function (map) {
        var letter;
        for (letter in map) {
            var m = map[letter];
            var name = m.name;
            if (!(null === value && 0 < name.indexOf("@@@"))) {
                if (!("" === value && -1 == name.indexOf("@@@"))) {
                    if (!(value && name.substring(0, value.length) != value)) {
                        chrome.cookies.remove({
                            url: (m.secure ? "https://" : "http://") + m.domain + m.path,
                            name: name
                        }, function () {
                        });
                    }
                }
            }
        }
    });
}

/**
 * @return {undefined}
 */
function z() {
    chrome.cookies.getAll({}, function (attrs) {
        var key;
        for (key in attrs) {
            var val = attrs[key].name;
            if (!(0 > val.indexOf("_@@@_"))) {
                for (key in val = val.substr(0, val.indexOf("_@@@_")) + "_@@@_", g) {
                    if (g[key] == val) {
                        return;
                    }
                }
            }
        }
    });
}

chrome.tabs.onReplaced.addListener(function (f, n) {
    var c = A(n);
    p(f, c);
    delete g[n];
    delete pendingIdentityTabs[n];
    B(f, c);
});
chrome.tabs.onRemoved.addListener(function (n) {
    a: {
        var val = A(n);
        if (val) {
            delete g[n];
            var key;
            for (key in g) {
                if (g[key] == val) {
                    break a;
                }
            }
            m(val);

            // 清理profile颜色（当该profile没有其他标签页时）
            if (key === undefined) {
                clearProfileColor(val);
                debugLog('标签页关闭，清理profile颜色:', val);
            }
        }
    }
    delete l[n];
    delete pendingIdentityTabs[n];
});
chrome.tabs.onUpdated.addListener(function (i, dataAndEvents, jqXHR) {
    if ("loading" == jqXHR.status) {
        p(i, A(i));
    }
});
chrome.tabs.onCreated.addListener(function (c) {
    if (c) {
        var i = c.id;
        if (i && !(0 > i)) {
            var url = "";
            if (c.pendingUrl)
            	url = c.pendingUrl;
            else
            	url = c.url;

            if (!c.openerTabId && consumePendingNewIdentityUrl(url)) {
                pendingIdentityTabs[i] = true;
                l[i] = "pending";
                return;
            }

            if (c.openerTabId && "chrome" != url.substr(0, 6)) {
                var openerProfile = A(c.openerTabId);
                if (openerProfile) {
                    p(i, openerProfile);
                }
                if ("undefined" === typeof l[i]) {
                    l[i] = c.openerTabId;
                }
            } else {
                /** @type {boolean} */
                l[i] = true;
            }
        }
    }
});
var C;
chrome.windows.getCurrent({}, function (ignores) {
    E(ignores.id);
});
chrome.windows.onFocusChanged.addListener(function (deepDataAndEvents) {
    E(deepDataAndEvents);
});

/**
 * @param {number} deepDataAndEvents
 * @return {undefined}
 */
function E(deepDataAndEvents) {
    if (deepDataAndEvents && deepDataAndEvents > -1) {
        chrome.windows.get(deepDataAndEvents, {}, function (row) {
            if (chrome.runtime.lastError) {
                debugLog('获取窗口信息失败:', chrome.runtime.lastError.message);
                return;
            }
            if (row) {
                if ("normal" == row.type) {
                    /** @type {number} */
                    C = deepDataAndEvents;
                    chrome.tabs.query({
                        active: true,
                        windowId: C
                    }, function (results) {
                        if (chrome.runtime.lastError) {
                            debugLog('查询标签页失败:', chrome.runtime.lastError.message);
                            return;
                        }
                        if (results && results[0]) {
                            D = results[0].id;
                        }
                    });
                }
            }
        });
    }
}

var D;
chrome.tabs.onActiveChanged.addListener(function (dataAndEvents, existingTab) {
    E(existingTab.windowId);
});
chrome.webRequest.onBeforeRequest.addListener(function (details) {
    var tabId = details.tabId;
    if (tabId && !(0 > tabId) && "undefined" === typeof l[tabId]) {
        z();
    }
}, {
    urls: ["http://*/*", "https://*/*"],
    types: ["main_frame"]
});
chrome.webRequest.onBeforeSendHeaders.addListener(function (data) {
    var key = data.tabId;
    if (key && !(0 > key)) {
        var a = A(key);
        var url = data.url;
        var headers = data.requestHeaders;
        /** @type {string} */
        var c = "";
        if ("https://translate.googleapis.com/translate_static/img/loading.gif" != url.substring(0, 65)) {
            if ("main_frame" == data.type) {
                /** @type {boolean} */
                f[key] = false;
                if (url && 0 == url.indexOf("https://accounts.google.com/")) {
                    var retValue;
                    var i;
                    for (i in headers) {
                        if ("Referer" == headers[i].name) {
                            retValue = headers[i].value;
                            break;
                        }
                    }
                    if (retValue) {
                        if (0 == retValue.indexOf("https://accounts.google.com/")) {
                            if (0 < retValue.indexOf("chrome.google.com")) {
                                /** @type {boolean} */
                                f[key] = true;
                                /** @type {string} */
                                a = "";
                            }
                        }
                    }
                }
                if (url) {
                    if (0 == url.indexOf("https://accounts.google.com/")) {
                        if (0 < url.indexOf("chrome.google.com")) {
                            /** @type {boolean} */
                            f[key] = true;
                            /** @type {string} */
                            a = "";
                        }
                    }
                }
                if (0 == url.indexOf("https://chrome.google.com/webstore")) {
                    /** @type {boolean} */
                    f[key] = true;
                    /** @type {string} */
                    a = "";
                }
            }
            for (i in headers) {
                if ("cookie" === headers[i].name.toLowerCase()) {
                    if (!a && -1 == headers[i].value.indexOf("_@@@_")) {
                        return;
                    }
                    data = headers[i].value.split("; ");
                    var k;
                    for (k in data) {
                        key = data[k].trim();
                        if (a) {
                            if (key.substring(0, a.length) != a) {
                                continue;
                            }
                        } else {
                            if (-1 < key.indexOf("_@@@_")) {
                                continue;
                            }
                        }
                        if (0 < c.length) {
                            c += "; ";
                        }
                        c = a ? c + key.substring(a.length) : c + key;
                    }
                    headers.splice(i, 1);
                }
            }
            if (0 < c.length) {
                headers.push({
                    name: "Cookie",
                    value: c
                });
            }
            return {
                requestHeaders: headers
            };
        }
    }
}, {
    urls: ["http://*/*", "https://*/*"]
}, ["blocking", "requestHeaders", "extraHeaders"]);
chrome.webRequest.onHeadersReceived.addListener(function (data) {
    var key = data.tabId;
    if (key && !(0 > key)) {
        var val = A(key);
        if ("" != val) {
            var url = data.url;
            data = data.responseHeaders;
            if (!f[key] && "https://translate.googleapis.com/translate_static/img/loading.gif" != url.substring(0, 65)) {
                var k;
                for (k in data) {
                    if ("set-cookie" == data[k].name.toLowerCase()) {
                        data[k].value = val + data[k].value;
                    }
                }
                return {
                    responseHeaders: data
                };
            }
        }
    }
}, {
    urls: ["http://*/*", "https://*/*"]
}, ["blocking", "responseHeaders", "extraHeaders"]);
chrome.webRequest.onBeforeRequest.addListener(function (details) {
    var tabId = details.tabId;
    if (tabId && (!(0 > tabId) && A(tabId))) {
        return {
            redirectUrl: details.url.replace("https://mail.google.com/mail/ca/", "https://mail.google.com/mail/")
        };
    }
}, {
    urls: ["https://mail.google.com/mail/ca/*"]
}, ["blocking", "requestBody"]);
chrome.webRequest.onHeadersReceived.addListener(function (details) {
    var tabId = details.tabId;
    if (tabId && !(0 > tabId)) {
        return details.responseHeaders.push({
            name: "6",
            value: A(tabId)
        }), {
            responseHeaders: details.responseHeaders
        };
    }
}, {
    urls: ["https://translate.googleapis.com/translate_static/img/loading.gif"]
}, ["blocking", "responseHeaders", "extraHeaders"]);
chrome.webNavigation.onDOMContentLoaded.addListener(function (details) {
    var tabId = details.tabId;
    if (!(!tabId || (0 > tabId || (!A(tabId) || 0 < details.frameId)))) {
        chrome.tabs.sendMessage(tabId, {
            type: 5
        }, function(response) {
            // 检查并处理runtime.lastError（bfcache或content script未加载）
            if (chrome.runtime.lastError) {
                debugLog('页面消息发送失败（可能进入bfcache）:', tabId, '-', chrome.runtime.lastError.message);
                return;
            }
            // 正常处理响应
            if (response) {
                debugLog('页面消息响应:', response);
            }
        });
    }
}, {
    urls: ["http://*/*", "https://*/*"]
});
chrome.runtime.onConnect.addListener(function (port) {
    var disconnected = false;
    port.onDisconnect.addListener(function() {
        if (chrome.runtime.lastError) {
            debugLog('端口已断开:', chrome.runtime.lastError.message);
        }
        disconnected = true;
    });
    port.onMessage.addListener(function (statement) {
        if (3 == statement.type) {
            if (port.sender.tab && !disconnected) {
                try {
                    var payload = getProfilePayload(port.sender.tab.id);
                    payload.type = 4;
                    port.postMessage(payload);
                } catch (e) {
                    debugLog('端口消息发送失败（页面可能进入bfcache）:', e.message);
                }
            }
        }
    });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    try {
        request = request || {};
        debugLog('收到消息:', request);

        // Handle MultiLogin messages (type-based)
        if (request.type === "10") {
            // Handle cross-origin request for profile
            var tabId = sender.tab ? sender.tab.id : null;
            if (tabId) {
                sendResponse(getProfilePayload(tabId));
                return true;
            } else {
                sendResponse({
                    profile: "",
                    pending: false
                });
                return true;
            }
        }

        // Handle Password Manager messages (action-based)
        const action = request.action || '';
        debugLog('处理action:', action);

        if (!action) {
            debugLog('未处理的消息类型:', action);
            sendResponse({success: false, error: '未处理的消息类型'});
            return false;
        }

        if (typeof PasswordManager === 'undefined') {
            sendResponse({success: false, error: 'PasswordManager模块未加载'});
            return false;
        }

        if (action === 'findPasswords' || action === 'passwordManager_find') {
            // Find passwords by URL
            debugLog('处理findPasswords，URL:', request.url);
            PasswordManager.findPasswordsByUrl(request.url, function(passwords) {
                debugLog('findPasswords结果:', passwords.length, '个密码');
                sendResponse({success: true, passwords: passwords});
            });
            return true; // Keep message channel open for async response

        } else if (action === 'savePassword' || action === 'passwordManager_save') {
            // Save a password
            if (!request.password || !request.password.url || !request.password.username || !request.password.password) {
                sendResponse({success: false, error: '密码数据不完整'});
                return false;
            }
            debugLog('处理savePassword:', request.password);
            PasswordManager.savePassword(request.password, function(success, data) {
                debugLog('savePassword结果:', success);
                sendResponse({success: success, data: data});
            });
            return true;

        } else if (action === 'deletePassword' || action === 'passwordManager_delete') {
            // Delete a password
            if (!request.id) {
                sendResponse({success: false, error: '缺少密码ID'});
                return false;
            }
            debugLog('处理deletePassword，ID:', request.id);
            PasswordManager.deletePassword(request.id, function(success) {
                debugLog('deletePassword结果:', success);
                sendResponse({success: success});
            });
            return true;

        } else if (action === 'getAllPasswords' || action === 'passwordManager_getAll') {
            // Get all passwords
            debugLog('处理getAllPasswords');
            PasswordManager.getAllPasswords(function(passwords) {
                debugLog('getAllPasswords结果:', passwords.length, '个密码');
                sendResponse({success: true, passwords: passwords});
            });
            return true;

        } else if (action === 'importFromCSV' || action === 'passwordManager_import') {
            // Import passwords from CSV
            if (typeof request.csv !== 'string') {
                sendResponse({success: false, error: 'CSV内容无效'});
                return false;
            }
            debugLog('处理importFromCSV，CSV长度:', request.csv ? request.csv.length : 0);
            PasswordManager.importFromCSV(request.csv, function(successCount, errorCount) {
                debugLog('importFromCSV结果:', successCount, '成功,', errorCount, '失败');
                sendResponse({success: true, successCount: successCount, errorCount: errorCount});
            });
            return true;

        } else if (action === 'exportToCSV' || action === 'passwordManager_export') {
            // Export passwords to CSV
            debugLog('处理exportToCSV');
            PasswordManager.exportToCSV(function(csv) {
                debugLog('exportToCSV结果，CSV长度:', csv.length);
                sendResponse({success: true, csv: csv});
            });
            return true;

        } else if (action === 'clearAllPasswords' || action === 'passwordManager_clearAll') {
            // Clear all passwords
            debugLog('处理clearAllPasswords');
            PasswordManager.clearAllPasswords(function(success) {
                debugLog('clearAllPasswords结果:', success);
                sendResponse({success: success});
            });
            return true;
        } else {
            debugLog('未处理的消息类型:', action);
            sendResponse({success: false, error: '未处理的消息类型'});
            return false;
        }
    } catch (e) {
        debugError('消息处理失败:', e);
        sendResponse({success: false, error: e.message || String(e)});
        return false;
    }
});

/**
 * @param {?} key
 * @return {?}
 */
function A(key) {
    if (!(1 > key)) {
        return f[key] || !g[key] ? "" : g[key];
    }
}

function getProfilePayload(tabId) {
    return {
        profile: A(tabId) || "",
        pending: !!pendingIdentityTabs[tabId]
    };
}

/**
 * @param {number} f
 * @param {string} c
 * @return {undefined}
 */
function p(f, c) {
    if (c) {
        /** @type {string} */
        delete pendingIdentityTabs[f];
        g[f] = c;
        B(f, c);
    }
}

/**
 * @param {number} a
 * @param {string} x
 * @return {undefined}
 */
function B(a, x) {
    if ("undefined" !== typeof x) {
        // 提取环境数字并转换为3位ID用于badge显示
        var envId = extractEnvironmentIdForBadge(x);

        var expectedSerialization = {
            text: envId,
            tabId: a
        };

        // 为当前profile分配颜色
        var profileColor = getProfileColor(x);

        chrome.browserAction.setBadgeBackgroundColor({
            color: profileColor,
            tabId: a
        }, function() {
            if (chrome.runtime.lastError) {
                debugLog('设置badge背景色失败:', chrome.runtime.lastError.message);
            }
        });

        chrome.browserAction.setBadgeText(expectedSerialization, function() {
            if (chrome.runtime.lastError) {
                debugLog('设置badge文本失败:', chrome.runtime.lastError.message);
            }
        });

        debugLog('设置badge:', {
            profileId: x,
            badgeText: expectedSerialization.text,
            badgeColor: profileColor,
            tabId: a
        });
    }
}

/**
 * 为badge提取并转换环境ID为简化数字
 */
function extractEnvironmentIdForBadge(profileId) {
    if (!profileId) return '000';

    // 从profile ID中提取数字部分（格式：数字_@@@_）
    var numericPart = profileId.split('_')[0];
    var envNumber = parseInt(numericPart, 10);

    if (isNaN(envNumber)) return '000';

    // 对于超大ID，取最后3位
    if (envNumber > 999) {
        envNumber = envNumber % 1000;
    }

    if (envNumber <= 0) {
        envNumber = 1;
    }

    // 返回三位环境号，和标签页标题/页面标签保持一致
    return envNumber.toString().padStart(3, '0');
}

/**
 * @param {?} e
 * @return {undefined}
 */
function F(e) {
    var file = e.pageUrl;
    if (e.linkUrl) {
        file = e.linkUrl;
    }
    markPendingNewIdentityUrl(file);
    chrome.tabs.create({
        url: file
    }, function (props) {
        if (chrome.runtime.lastError) {
            releasePendingNewIdentityUrl(file);
            debugLog('创建新标签页失败:', chrome.runtime.lastError.message);
            return;
        }
        releasePendingNewIdentityUrl(file);
        delete pendingIdentityTabs[props.id];
        p(props.id, props.id + "_@@@_");
    });
}

chrome.contextMenus.create({
    title: "Duplicate Page in New Identity",
    contexts: ["page", "image"],
    /** @type {function (?): undefined} */
    onclick: F
});
chrome.contextMenus.create({
    title: "Open Link in New Identity",
    contexts: ["link"],
    /** @type {function (?): undefined} */
    onclick: F
});
