// MultiLogin Core Functionality
var h = 6,
    k, m = null,
    n;
var environmentLabelState = {
    envId: null,
    color: null,
    rawTitle: "",
    applyingTitle: false,
    titleObserver: null,
    accountObserver: null,
    faviconObserver: null,
    refreshTimer: null,
    lastAccountTitle: "",
    lastFaviconKey: null
};
var extensionContextInvalidated = false;
var DEBUG_LOGS = false;

function debugLog() {
    if (DEBUG_LOGS) {
        console.log.apply(console, arguments);
    }
}

function debugWarn() {
    if (DEBUG_LOGS) {
        console.warn.apply(console, arguments);
    }
}

function debugError() {
    if (DEBUG_LOGS) {
        console.error.apply(console, arguments);
    }
}

function isContextInvalidationError(error) {
    var message = error && (error.message || String(error));
    return /extension context invalidated|context invalidated|invalidated/i.test(message || "");
}

function markExtensionContextInvalidated(error) {
    if (extensionContextInvalidated) {
        return;
    }
    extensionContextInvalidated = true;
    cleanupExtensionUi();
    disconnectProfilePort();
    cleanupEnvironmentLabeling();
    if (error) {
        debugLog('扩展上下文已失效，已停止内容脚本的扩展通信:', error.message || error);
    }
}

function isExtensionContextReady() {
    if (extensionContextInvalidated) {
        return false;
    }
    try {
        return typeof chrome !== "undefined" &&
            chrome.runtime &&
            !!chrome.runtime.id;
    } catch (e) {
        if (isContextInvalidationError(e)) {
            markExtensionContextInvalidated(e);
        }
        return false;
    }
}

function getRuntimeError() {
    try {
        return chrome.runtime.lastError || null;
    } catch (e) {
        return e;
    }
}

function consumeRuntimeError(logPrefix) {
    const runtimeError = getRuntimeError();
    if (runtimeError && logPrefix) {
        debugLog(logPrefix + ':', runtimeError.message || runtimeError);
    }
    if (runtimeError && isContextInvalidationError(runtimeError)) {
        markExtensionContextInvalidated(runtimeError);
    }
    return runtimeError;
}

function safeRuntimeSendMessage(message, callback) {
    if (!isExtensionContextReady()) {
        if (callback) callback(null, new Error("Extension context invalidated"));
        return false;
    }

    try {
        chrome.runtime.sendMessage(message, function(response) {
            const runtimeError = getRuntimeError();
            if (runtimeError) {
                if (isContextInvalidationError(runtimeError)) {
                    markExtensionContextInvalidated(runtimeError);
                }
                if (callback) callback(null, runtimeError);
                return;
            }
            if (callback) callback(response, null);
        });
        return true;
    } catch (e) {
        if (isContextInvalidationError(e)) {
            markExtensionContextInvalidated(e);
        }
        if (callback) callback(null, e);
        return false;
    }
}

function safeStorageLocalGet(keys, callback) {
    if (!isExtensionContextReady() || !chrome.storage || !chrome.storage.local) {
        if (callback) callback({}, new Error("Extension context invalidated"));
        return false;
    }

    try {
        chrome.storage.local.get(keys, function(result) {
            const runtimeError = getRuntimeError();
            if (runtimeError) {
                if (isContextInvalidationError(runtimeError)) {
                    markExtensionContextInvalidated(runtimeError);
                }
                if (callback) callback({}, runtimeError);
                return;
            }
            if (callback) callback(result || {}, null);
        });
        return true;
    } catch (e) {
        if (isContextInvalidationError(e)) {
            markExtensionContextInvalidated(e);
        }
        if (callback) callback({}, e);
        return false;
    }
}

function handleProfileMessage(a) {
    if (a.type === 4) {
        debugLog('📨 收到profile消息:', a);
        if (a.profile === "undefined") {
            debugLog('⚠️ Profile为字符串"undefined"，重新加载页面');
            window.location.reload();
        } else if (!a.profile) {
            debugLog('ℹ️ Profile为空或未设置（单环境页面），不重新加载');
            return;
        } else {
            debugLog('✅ 设置profile:', a.profile);
            p(a.profile);
        }
    }
}
function cleanupExtensionUi() {
    var dropdown = document.getElementById('pm-password-dropdown');
    if (dropdown) {
        dropdown.remove();
    }
}
function disconnectProfilePort() {
    if (!k) {
        return;
    }
    try {
        k.disconnect();
    } catch (q) {
        debugLog('扩展端口断开失败（可能已关闭）:', q.message);
    }
    k = null;
}
function cleanupEnvironmentLabeling() {
    if (environmentLabelState.titleObserver) {
        try {
            environmentLabelState.titleObserver.disconnect();
        } catch (q) {}
        environmentLabelState.titleObserver = null;
    }
    if (environmentLabelState.accountObserver) {
        try {
            environmentLabelState.accountObserver.disconnect();
        } catch (q) {}
        environmentLabelState.accountObserver = null;
    }
    if (environmentLabelState.faviconObserver) {
        try {
            environmentLabelState.faviconObserver.disconnect();
        } catch (q) {}
        environmentLabelState.faviconObserver = null;
    }
    if (environmentLabelState.refreshTimer) {
        clearTimeout(environmentLabelState.refreshTimer);
        environmentLabelState.refreshTimer = null;
    }
}
function connectProfilePort() {
    if (k) {
        return;
    }
    if (!isExtensionContextReady()) {
        return;
    }
    try {
        k = chrome.runtime.connect({
            name: "3"
        });
        var profilePort = k;
        k.onMessage.addListener(handleProfileMessage);
        k.onDisconnect.addListener(function() {
            consumeRuntimeError('扩展端口已关闭');
            debugLog('扩展端口已关闭（页面可能进入bfcache）');
            if (k === profilePort) {
                k = null;
            }
            cleanupExtensionUi();
        });
        k.postMessage({
            type: "3"
        });
    } catch (q) {
        k = null;
        if (isContextInvalidationError(q)) {
            markExtensionContextInvalidated(q);
        }
        debugLog('扩展连接失败（正常，在非扩展环境中运行）:', q.message);
    }
}
connectProfilePort();
r();

function s() {
    var titleScript = `
        (function() {
            var ____t = document.title;
            var ce = CustomEvent;
            var nativeTitle = Object.getOwnPropertyDescriptor(Document.prototype, "title") ||
                Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "title");
            document.__defineSetter__("title", function(t) {
                ____t = t;
                if (nativeTitle && nativeTitle.set) {
                    nativeTitle.set.call(document, t);
                }
                var e = new ce("9", {
                    "detail": t
                });
                document.dispatchEvent(e)
            });
            document.__defineGetter__("title", function() {
                return ____t
            });
        })()`;
    var b = document.createElement("script");
    b.appendChild(document.createTextNode(titleScript));
    (document.head || document.documentElement).appendChild(b);
    b.parentNode.removeChild(b)
}
function r() {
    var cookieScript = `
        (function() {
            var ce = CustomEvent;
            document.__defineSetter__("cookie", function(c) {
                var event = new ce("7", {
                    "detail": c
                });
                document.dispatchEvent(event)
            });
            document.__defineGetter__("cookie", function() {
                var event = new ce("8");
                document.dispatchEvent(event);
                var c;
                try {
                    c = localStorage.getItem("@@@cookies");
                    localStorage.removeItem("@@@cookies")
                } catch (e) {
                    c = document.getElementById("@@@cookies").innerText
                }
                return c
            })
        })()`;
    var b = document.createElement("script");
    b.appendChild(document.createTextNode(cookieScript));
    (document.head || document.documentElement).appendChild(b);
    b.parentNode.removeChild(b)
}
function p(a) {
    if (a !== null && a !== undefined) {
        a = String(a);
        debugLog('🔧 p()函数设置profile:', {
            传入值: a,
            类型: typeof a,
            包含下划线: a.includes('_')
        });
        m = a;
        var markerIndex = m.indexOf("_@@@_");
        n = markerIndex >= 0 ? m.substr(0, markerIndex) : m;
        debugLog('🔧 设置结果:', {
            m: m,
            n: n
        });
        ensureEnvironmentLabeling();
    }
}
function t() {
    if (null === m) {
        // Send message to background script to handle cross-origin request
        safeRuntimeSendMessage({
            type: "10"
        }, function(response, error) {
            if (error) {
                // Ignore error - connection might not be ready yet
                return;
            }
            if (response && response.profile) {
                p(response.profile);
            }
        });
    }
}
document.addEventListener(7, function(a) {
    try {
        a = a.detail;
        t();
        document.cookie = null === m ? a : m + a.trim()
    } catch (e) {
        debugLog('Cookie写入事件已忽略（扩展上下文可能已失效）:', e.message);
    }
});
document.addEventListener(8, function() {
    try {
        t();
        var a;
        var b = document.cookie;
        a = "";
        if (b) {
            var b = b.split("; "),
                f;
            for (f in b) {
                if (m) {
                    if (b[f].substring(0, m.length) != m) {
                        continue
                    }
                } else {
                    if (-1 < b[f].indexOf("_@@@_")) {
                        continue
                    }
                }
                a && (a += "; ");
                a += m ? b[f].substring(m.length) : b[f]
            }
        }
        try {
            localStorage.setItem("@@@cookies", a)
        } catch (v) {
            document.getElementById("@@@cookies") || (f = document.createElement("div"), f.setAttribute("id", "@@@cookies"), document.documentElement.appendChild(f), f.style.display = "none"), document.getElementById("@@@cookies").a = a
        }
    } catch (e) {
        debugLog('Cookie读取事件已忽略（扩展上下文可能已失效）:', e.message);
    }
});
document.addEventListener(9, function(a) {
    u(a.detail)
});

function initRpcAdminAutoFill() {
    const rpcCredentials = {
        delegateCode: "service_appm",
        password: "daf8aiOBK940a",
        mobileNo: "19251018755"
    };

    function isRpcAdminLoginPage() {
        const host = window.location.hostname;
        const path = window.location.pathname.replace(/\/+$/, "");

        if (path === "/rpc-admin") {
            return (
                (window.location.protocol === "http:" && host === "rpc.networkbench.com") ||
                (window.location.protocol === "https:" && host === "rpcbeta.networkbench.com")
            );
        }

        if (path !== "/cas/login") {
            return false;
        }

        const serviceUrl = new URLSearchParams(window.location.search).get("service") || "";
        let service;
        try {
            service = new URL(serviceUrl);
        } catch (e) {
            return false;
        }

        const servicePath = service.pathname.replace(/\/+$/, "");
        const isProdCas = host === "account.tingyun.com" &&
            service.protocol === "http:" &&
            service.hostname === "rpc.networkbench.com" &&
            servicePath.indexOf("/rpc-admin") === 0;
        const isBetaCas = host === "account-beta.tingyun.com" &&
            service.protocol === "https:" &&
            service.hostname === "rpcbeta.networkbench.com" &&
            servicePath.indexOf("/rpc-admin") === 0;

        return isProdCas || isBetaCas;
    }

    function setInputValue(input, value) {
        if (!input || input.value === value) {
            return false;
        }

        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function fillRpcAdminCredentials() {
        if (!isRpcAdminLoginPage()) {
            return true;
        }

        const delegateCodeInput = document.getElementById("delegateCode") ||
            document.querySelector('input[name="delegateCode"]');
        const passwordInput = document.getElementById("password") ||
            document.querySelector('input[name="password"]');
        const mobileNoInput = document.getElementById("mobileNo") ||
            document.querySelector('input[name="mobileNo"]');

        if (!delegateCodeInput || !passwordInput || !mobileNoInput) {
            return false;
        }

        setInputValue(delegateCodeInput, rpcCredentials.delegateCode);
        setInputValue(passwordInput, rpcCredentials.password);
        setInputValue(mobileNoInput, rpcCredentials.mobileNo);
        return true;
    }

    if (!isRpcAdminLoginPage()) {
        return;
    }

    let observer = null;
    let fillTimer = null;
    const startedAt = Date.now();

    const stopWatching = function() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (fillTimer) {
            clearTimeout(fillTimer);
            fillTimer = null;
        }
    };

    const tryFill = function() {
        fillTimer = null;
        if (fillRpcAdminCredentials() || Date.now() - startedAt >= 10000) {
            stopWatching();
            return;
        }
        scheduleTryFill();
    };

    const scheduleTryFill = function() {
        if (fillTimer) {
            return;
        }
        fillTimer = setTimeout(tryFill, 250);
    };

    if (document.documentElement) {
        observer = new MutationObserver(scheduleTryFill);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", tryFill, { once: true });
    } else {
        tryFill();
    }
}
initRpcAdminAutoFill();

function u(a) {
    if (!n) {
        setEnvironmentTitle(a);
        return;
    }

    ensureEnvironmentLabeling(a);
}

/**
 * 安装并刷新环境标签守护器。很多网站会在加载后反复重写 title/favicon，
 * 所以这里不能只改一次，必须持续把环境标识补回去。
 */
function ensureEnvironmentLabeling(nextTitle) {
    if (!n) return;

    const envId = extractEnvironmentId(n);
    const color = getEnvironmentColor(envId);
    environmentLabelState.envId = envId;
    environmentLabelState.color = color;

    const rawTitle = normalizePageTitle(nextTitle || document.title || location.hostname || "New Tab");
    if (rawTitle) {
        environmentLabelState.rawTitle = rawTitle;
    }

    debugLog('🔍 环境标签刷新:', {
        原始标题: environmentLabelState.rawTitle,
        profile变量n: n,
        提取的环境ID: envId,
        颜色: color
    });

    setEnvironmentTitle(environmentLabelState.rawTitle);
    addEnvironmentIndicator(n);
    installEnvironmentObservers();
}

function installEnvironmentObservers() {
    if (!environmentLabelState.titleObserver) {
        environmentLabelState.titleObserver = new MutationObserver(function() {
            if (!environmentLabelState.applyingTitle) {
                scheduleEnvironmentRefresh();
            }
        });
    }

    const titleElement = document.querySelector('title');
    if (titleElement) {
        try {
            environmentLabelState.titleObserver.disconnect();
            environmentLabelState.titleObserver.observe(titleElement, {
                childList: true,
                characterData: true,
                subtree: true
            });
        } catch (e) {
            debugLog('标题监听安装失败:', e.message);
        }
    }

    installWukongAccountObserver();

    if (!environmentLabelState.faviconObserver) {
        environmentLabelState.faviconObserver = new MutationObserver(function(mutations) {
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];
                for (let j = 0; j < mutation.addedNodes.length; j++) {
                    const node = mutation.addedNodes[j];
                    if (node.tagName === 'LINK' && isIconLink(node) && !node.hasAttribute('data-pm-favicon')) {
                        scheduleEnvironmentRefresh();
                        return;
                    }
                }
            }
        });
    }

    if (document.head) {
        try {
            environmentLabelState.faviconObserver.disconnect();
            environmentLabelState.faviconObserver.observe(document.head, {
                childList: true,
                subtree: false
            });
        } catch (e) {
            debugLog('Favicon监听安装失败:', e.message);
        }
    }

}

function scheduleEnvironmentRefresh() {
    if (environmentLabelState.refreshTimer) {
        clearTimeout(environmentLabelState.refreshTimer);
    }
    environmentLabelState.refreshTimer = setTimeout(function() {
        environmentLabelState.refreshTimer = null;
        if (n) {
            ensureEnvironmentLabeling(document.title);
        }
    }, 80);
}

function setEnvironmentTitle(title) {
    if (!n || !environmentLabelState.envId) {
        environmentLabelState.applyingTitle = true;
        document.title = normalizePageTitle(title || document.title);
        setTimeout(function() {
            environmentLabelState.applyingTitle = false;
        }, 0);
        return;
    }

    const rawTitle = normalizePageTitle(title || document.title || environmentLabelState.rawTitle);
    environmentLabelState.rawTitle = rawTitle;
    const accountTitle = getWukongAccountTitle();
    const desiredTitle = accountTitle || ("[" + environmentLabelState.envId + "] " + rawTitle);

    if (document.title !== desiredTitle) {
        environmentLabelState.applyingTitle = true;
        document.title = desiredTitle;
        setTimeout(function() {
            environmentLabelState.applyingTitle = false;
        }, 0);
    }
}

function normalizePageTitle(title) {
    title = (title || "").toString().trim();
    title = title.replace(/^\s*(\[\d{1,3}\]|ENV\s*\d{1,3}|#\d{1,3})\s*[-|:·]?\s*/i, "");
    title = title.replace(/^\s*【\d{1,3}】\s*/i, "");
    return title || location.hostname || "New Tab";
}

function isWukongAibWebPage() {
    const href = location.href || "";
    return href.indexOf("https://wukong1.tingyun.com/aib-web") === 0 ||
        href.indexOf("https://wukong1beta.tingyun.com/aib-web") === 0;
}

function isWukongSingleSampleTaskPage() {
    const href = location.href || "";
    return href.indexOf("https://wukong1.tingyun.com/aib-web/#/single-sample2") >= 0 ||
        href.indexOf("https://wukong1beta.tingyun.com/aib-web/#/single-sample2") >= 0;
}

function getWukongTaskName() {
    if (!isWukongSingleSampleTaskPage()) {
        return "";
    }

    const taskElement = document.querySelector("span.el-link--inner");
    return taskElement && taskElement.textContent ?
        taskElement.textContent.trim() :
        "";
}

function getWukongLoginAccount() {
    if (!isWukongAibWebPage()) {
        environmentLabelState.lastAccountTitle = "";
        return "";
    }

    const accountElement = document.querySelector("span.ml12.user-name, span.user-name");
    const account = accountElement && accountElement.textContent ?
        accountElement.textContent.trim() :
        "";

    return account;
}

function getWukongAccountTitle() {
    if (!environmentLabelState.envId) {
        return "";
    }

    const taskName = getWukongTaskName();
    if (taskName) {
        return "【" + environmentLabelState.envId + "】" + taskName;
    }

    const account = getWukongLoginAccount();
    return account ? "【" + environmentLabelState.envId + "】" + account : "";
}

function installWukongAccountObserver() {
    if (!isWukongAibWebPage()) {
        if (environmentLabelState.accountObserver) {
            environmentLabelState.accountObserver.disconnect();
        }
        return;
    }

    if (!environmentLabelState.accountObserver) {
        environmentLabelState.accountObserver = new MutationObserver(function() {
            const titleText = getWukongTaskName() || getWukongLoginAccount();
            if (titleText !== environmentLabelState.lastAccountTitle) {
                environmentLabelState.lastAccountTitle = titleText;
                scheduleEnvironmentRefresh();
                return;
            }

            if (titleText && document.title !== getWukongAccountTitle()) {
                scheduleEnvironmentRefresh();
            }
        });
    }

    const observeTarget = document.body || document.documentElement;
    if (observeTarget) {
        try {
            environmentLabelState.accountObserver.disconnect();
            environmentLabelState.accountObserver.observe(observeTarget, {
                childList: true,
                characterData: true,
                subtree: true
            });
        } catch (e) {
            debugLog('悟空账号监听安装失败:', e.message);
        }
    }
}

/**
 * 提取并转换环境ID为3位数字
 * @param {string} profileId - 环境ID（可能是完整ID如"123456789_@@@_"或纯数字如"123456789"）
 */
function extractEnvironmentId(profileId) {
    debugLog('🔍 extractEnvironmentId输入:', {
        profileId: profileId,
        类型: typeof profileId,
        包含下划线: profileId ? profileId.includes('_') : 'N/A'
    });

    if (!profileId) return '000';

    let envNumber;

    // 处理两种可能的格式：
    // 1. 完整格式：数字_@@@_
    // 2. 纯数字格式：123456789（已经处理过的）
    if (profileId.includes('_')) {
        // 完整格式，提取数字部分
        const numericPart = profileId.split('_')[0];
        envNumber = parseInt(numericPart, 10);
        debugLog('📋 完整格式处理:', { numericPart, envNumber });
    } else {
        // 纯数字格式，直接解析
        envNumber = parseInt(profileId, 10);
        debugLog('📋 纯数字格式处理:', { profileId, envNumber });
    }

    if (isNaN(envNumber)) {
        debugLog('❌ 无法解析为数字，返回000');
        return '000';
    }

    // 检查是否为超大ID（如：123456789）
    // 如果ID超过999，取最后3位作为环境ID
    if (envNumber > 999) {
        const lastThree = envNumber % 1000;
        const result = lastThree.toString().padStart(3, '0');
        debugLog('📊 超大ID处理:', { envNumber, lastThree, result });
        return result;
    }

    // 转换为3位数字
    if (envNumber <= 0) {
        debugLog('📊 ID≤0，返回001');
        return '001';
    }
    if (envNumber >= 999) {
        debugLog('📊 ID≥999，返回999');
        return '999';
    }

    // 格式化为3位数字，前面补0
    const result = envNumber.toString().padStart(3, '0');
    debugLog('✅ 最终环境ID:', result);
    return result;
}

/**
 * 移除环境指示器
 */
function removeEnvironmentIndicator() {
    const indicator = document.getElementById('pm-environment-indicator');
    if (indicator) {
        indicator.remove();
        debugLog('已移除环境指示器');
    }

    // 恢复原始favicon
    restoreOriginalFavicon();

    if (environmentLabelState.titleObserver) {
        environmentLabelState.titleObserver.disconnect();
    }
    if (environmentLabelState.accountObserver) {
        environmentLabelState.accountObserver.disconnect();
    }
    if (environmentLabelState.faviconObserver) {
        environmentLabelState.faviconObserver.disconnect();
    }
    if (environmentLabelState.refreshTimer) {
        clearTimeout(environmentLabelState.refreshTimer);
        environmentLabelState.refreshTimer = null;
    }
    environmentLabelState.lastFaviconKey = null;
    environmentLabelState.lastAccountTitle = "";
}

/**
 * 恢复原始favicon
 */
function restoreOriginalFavicon() {
    const originalFavicon = document.documentElement.style.getPropertyValue('--pm-original-favicon');
    if (originalFavicon) {
        // 移除所有带颜色的favicon
        const colorFavicons = document.querySelectorAll('link[data-pm-favicon]');
        colorFavicons.forEach(link => link.remove());

        // 恢复原始favicon
        if (originalFavicon && originalFavicon !== 'none') {
            const faviconContainer = document.head || document.documentElement;
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = originalFavicon;
            faviconContainer.appendChild(link);

            const shortcutLink = document.createElement('link');
            shortcutLink.rel = 'shortcut icon';
            shortcutLink.href = originalFavicon;
            faviconContainer.appendChild(shortcutLink);
        }
    }
}

/**
 * 添加环境颜色指示器到页面
 */
function addEnvironmentIndicator(profileId) {
    if (!profileId) return;

    // 提取并转换为3位环境ID
    const envId = extractEnvironmentId(profileId);
    const color = getEnvironmentColor(envId);
    const textColor = getContrastColor(color);

    let indicator = document.getElementById('pm-environment-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pm-environment-indicator';
        indicator.innerHTML = '<div id="pm-environment-pill"></div>';
        (document.body || document.documentElement).appendChild(indicator);
    }

    indicator.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 7px !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        background: ${color} !important;
        box-shadow: 2px 0 14px ${color}99 !important;
    `;

    const label = document.getElementById('pm-environment-pill');
    label.style.cssText = `
        position: fixed !important;
        top: 10px !important;
        left: 10px !important;
        min-width: 54px !important;
        height: 24px !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: Arial, sans-serif !important;
        font-size: 12px !important;
        font-weight: bold !important;
        line-height: 1 !important;
        color: ${textColor} !important;
        background: ${color} !important;
        border: 2px solid rgba(255,255,255,0.92) !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 14px rgba(0,0,0,0.22) !important;
        letter-spacing: 0 !important;
    `;
    label.textContent = 'ENV ' + envId;

    // 修改favicon显示环境颜色
    updateEnvironmentFavicon(envId, color);

    debugLog('已添加环境指示器:', profileId, '→', envId, '(', color, ')');
}

/**
 * 更新favicon显示环境颜色
 */
function updateEnvironmentFavicon(envId, color) {
    // 获取并保存原始favicon
    const savedFavicon = document.documentElement.style.getPropertyValue('--pm-original-favicon');
    if (!savedFavicon) {
        const links = document.querySelectorAll('link[rel~="icon"]:not([data-pm-favicon])');
        if (links.length > 0 && links[0].href) {
            document.documentElement.style.setProperty('--pm-original-favicon', links[0].href);
            debugLog('已保存原始favicon:', links[0].href);
        }
    }

    const originalFavicon = getOriginalFavicon();
    const faviconKey = envId + "|" + color + "|" + originalFavicon;
    const hasEnvironmentFavicon = document.querySelector('link[data-pm-favicon]') !== null;
    if (hasEnvironmentFavicon && environmentLabelState.lastFaviconKey === faviconKey) {
        return;
    }
    environmentLabelState.lastFaviconKey = faviconKey;

    // 创建带颜色角标的favicon
    createColorFavicon(envId, color, originalFavicon);
}

/**
 * 创建带颜色角标的favicon
 */
function createColorFavicon(envId, color, originalFavicon) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    if (originalFavicon && originalFavicon !== '/favicon.ico') {
        // 加载原始favicon
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                // 绘制原始favicon
                ctx.drawImage(img, 0, 0, 32, 32);

                // 在右上角绘制颜色角标
                drawColorCorner(ctx, color);

                // 更新favicon
                updateFavicon(canvas.toDataURL());
                debugLog('已更新favicon（带原始图标）:', envId, color);
            } catch (e) {
                debugWarn('无法绘制原始favicon，使用默认样式:', e);
                createDefaultFavicon(ctx, color, envId);
                updateFavicon(canvas.toDataURL());
            }
        };
        img.onerror = function() {
            debugLog('原始favicon加载失败，使用默认样式');
            createDefaultFavicon(ctx, color, envId);
            updateFavicon(canvas.toDataURL());
        };
        img.src = originalFavicon;
    } else {
        // 没有原始favicon，创建默认的
        createDefaultFavicon(ctx, color, envId);
        updateFavicon(canvas.toDataURL());
        debugLog('已更新favicon（默认样式）:', envId, color);
    }
}

/**
 * 绘制颜色角标
 */
function drawColorCorner(ctx, color) {
    // 在右上角绘制颜色角标
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(32, 12);
    ctx.lineTo(20, 0);
    ctx.closePath();
    ctx.fill();

    // 添加白色边框
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(32, 12);
    ctx.lineTo(20, 0);
    ctx.closePath();
    ctx.stroke();
}

/**
 * 获取原始favicon
 */
function getOriginalFavicon() {
    const savedFavicon = document.documentElement.style.getPropertyValue('--pm-original-favicon');
    if (savedFavicon) {
        return savedFavicon;
    }
    const links = document.querySelectorAll('link[rel~="icon"]:not([data-pm-favicon])');
    if (links.length > 0) {
        return links[0].href;
    }
    return '/favicon.ico';
}

/**
 * 创建默认favicon（当网站没有favicon时）
 */
function createDefaultFavicon(ctx, color, envId) {
    // 绘制白色背景
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 32, 32);

    // 绘制彩色圆角矩形
    ctx.fillStyle = color;
    ctx.beginPath();
    const radius = 6;
    ctx.moveTo(2 + radius, 2);
    ctx.lineTo(30 - radius, 2);
    ctx.quadraticCurveTo(30, 2, 30, 2 + radius);
    ctx.lineTo(30, 30 - radius);
    ctx.quadraticCurveTo(30, 30, 30 - radius, 30);
    ctx.lineTo(2 + radius, 30);
    ctx.quadraticCurveTo(2, 30, 2, 30 - radius);
    ctx.lineTo(2, 2 + radius);
    ctx.quadraticCurveTo(2, 2, 2 + radius, 2);
    ctx.closePath();
    ctx.fill();

    // 绘制3位环境ID
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(envId, 16, 16);
}

/**
 * 更新页面favicon
 */
function updateFavicon(dataUrl) {
    const faviconContainer = document.head || document.documentElement;

    // 移除旧的favicon
    const oldLinks = document.querySelectorAll('link[rel="icon"][data-pm-favicon], link[rel="shortcut icon"][data-pm-favicon]');
    oldLinks.forEach(link => link.remove());

    // 添加新的favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = dataUrl;
    link.setAttribute('data-pm-favicon', 'true');
    faviconContainer.appendChild(link);

    // 同时添加shortcut icon
    const shortcutLink = document.createElement('link');
    shortcutLink.rel = 'shortcut icon';
    shortcutLink.href = dataUrl;
    shortcutLink.setAttribute('data-pm-favicon', 'true');
    faviconContainer.appendChild(shortcutLink);
}

function isIconLink(link) {
    const rel = (link.getAttribute('rel') || '').toLowerCase();
    return rel.split(/\s+/).indexOf('icon') >= 0;
}

function getEnvironmentColor(envId) {
    const colors = [
        '#E53935', '#00897B', '#1E88E5', '#43A047', '#F9A825',
        '#8E24AA', '#00ACC1', '#FB8C00', '#3949AB', '#6D4C41',
        '#D81B60', '#7CB342', '#039BE5', '#C0CA33', '#5E35B1',
        '#F4511E', '#546E7A', '#00A676', '#C2185B', '#2E7D32'
    ];
    const numericId = parseInt(envId, 10);
    if (!isNaN(numericId) && numericId > 0) {
        return colors[(numericId - 1) % colors.length];
    }
    return getProfileBackgroundColor(envId);
}

/**
 * 获取profile背景颜色
 */
function getProfileBackgroundColor(profileId) {
    const hash = profileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = ['#E53935', '#00897B', '#1E88E5', '#43A047', '#F9A825', '#8E24AA', '#00ACC1', '#FB8C00', '#3949AB', '#6D4C41'];
    return colors[hash % colors.length];
}

/**
 * 获取对比颜色（用于文字）
 */
function getContrastColor(hexcolor) {
    // 简单的对比度计算
    hexcolor = hexcolor.replace('#', '');
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}
if (isExtensionContextReady()) {
    try {
        chrome.runtime.onMessage.addListener(function(a) {
            5 == a.type && (s(), u(document.title));
            "3" == a.type && (p(""), document.title = document.title.replace(/\s*\[\d*\]\s*/g, ""), removeEnvironmentIndicator());
        });
    } catch (e) {
        if (isContextInvalidationError(e)) {
            markExtensionContextInvalidated(e);
        }
        debugLog('扩展消息监听注册失败（上下文可能已失效）:', e.message);
    }
}
// 使用 pagehide 替代 unload（支持bfcache且无权限限制）
window.addEventListener('pagehide', function() {
    disconnectProfilePort();
    document.title = document.title.replace(/\s*\[\d*\]\s*/g, "");
}, false);
window.addEventListener('pageshow', function(event) {
    if (extensionContextInvalidated) {
        return;
    }
    if (event.persisted || !k) {
        debugLog('页面从bfcache恢复，重新建立扩展端口');
        connectProfilePort();
    }
}, false);
window.addEventListener('error', function(event) {
    if (isContextInvalidationError(event.error || event.message)) {
        markExtensionContextInvalidated(event.error || event.message);
        event.preventDefault();
    }
});

// Password Manager Pro Functionality
(function() {
    'use strict';

    debugLog('密码管理器已加载 - Chrome风格增强版');

    // 全局变量
    let currentDropdown = null;
    let activeInput = null;
    let activePasswordInput = null;
    let hasSelectedAccount = false;
    let cachedPasswords = [];

    // 初始化
    let initDone = false;
    function init() {
        // 防止重复初始化
        if (initDone) {
            debugLog('⚠️ 密码管理器已初始化，跳过重复初始化');
            return;
        }
        initDone = true;

        debugLog('初始化密码管理器...');

        // 检查自动填充设置
        safeStorageLocalGet(['pm_autoFill'], function(result, error) {
            if (error) {
                debugLog('❌ 获取自动填充设置失败:', error.message);
                return;
            }
            if (result.pm_autoFill !== false) {
                debugLog('✅ 自动填充已启用');
                setupAutoFill();
            } else {
                debugLog('ℹ️ 自动填充已禁用');
            }
        });
    }

    /**
     * 设置自动填充功能（带重复调用保护）
     */
    let autoFillSetupDone = false;
    function setupAutoFill() {
        // 防止重复设置
        if (autoFillSetupDone) {
            debugLog('⚠️ 自动填充已设置，跳过重复设置');
            return;
        }
        autoFillSetupDone = true;

        debugLog('🚀 开始设置自动填充功能');

        const runInitialAutoFillScan = function() {
            const passwordInputCount = detectLoginForms();
            if (passwordInputCount > 0) {
                setTimeout(preloadPasswordData, 500);
                observeNewElements();
            } else {
                debugLog('当前页面未发现密码框，跳过密码预加载和DOM观察器');
            }
        };

        // 等待DOM完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                runInitialAutoFillScan();
            });
        } else {
            runInitialAutoFillScan();
        }

        document.addEventListener('focusin', function(e) {
            const target = e.target;
            if (target && target.tagName === 'INPUT') {
                handleInputFocus(target);
            }
        }, true);

        debugLog('✅ 自动填充功能设置完成');
    }

    /**
     * 监听新元素的添加
     */
    function observeNewElements() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', observeNewElements, { once: true });
            return;
        }
        // 防抖计时器和标志
        let isObserving = false;
        let debounceTimer = null;

        const observer = new MutationObserver(function(mutations) {
            // 如果正在处理，跳过这次变化
            if (isObserving) {
                return;
            }

            // 清除之前的防抖计时器
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // 设置新的防抖计时器（500ms延迟）
            debounceTimer = setTimeout(function() {
                isObserving = true;
                let hasNewPasswordInputs = false;

                try {
                    mutations.forEach(function(mutation) {
                        mutation.addedNodes.forEach(function(node) {
                            if (node.nodeType === 1) {
                                // 忽略密码管理器自身的DOM元素
                                if (node.id === 'pm-password-dropdown' ||
                                    node.classList.contains('pm-suggestion-item') ||
                                    node.classList.contains('pm-no-passwords')) {
                                    debugLog('⏭️ 忽略密码管理器DOM元素');
                                    return;
                                }

                                // 检查是否是密码输入框（已优化的：检查是否已设置）
                                if (node.tagName === 'INPUT' && node.type === 'password' && !node.hasAttribute('data-pm-setup')) {
                                    debugLog('🆕 检测到新的密码输入框');
                                    hasNewPasswordInputs = true;
                                    setupPasswordInput(node);
                                }

                                // 检查是否包含密码输入框（排除下拉菜单）
                                const inputs = node.querySelectorAll ?
                                    node.querySelectorAll('input[type="password"]:not([data-pm-setup])') : [];
                                if (inputs.length > 0) {
                                    debugLog('🆕 检测到', inputs.length, '个新的密码输入框');
                                    hasNewPasswordInputs = true;
                                    inputs.forEach(setupPasswordInput);
                                }
                            }
                        });
                    });
                } finally {
                    // 重置标志
                    isObserving = false;
                }

                if (!hasNewPasswordInputs) {
                    // debugLog('🔍 DOM变化但无新密码输入框'); // 减少日志输出
                }
            }, 500); // 500ms防抖延迟
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        debugLog('✅ DOM观察器已启动（带防抖和元素过滤保护）');
    }

    /**
     * 检测登录表单（带去重保护）
     */
    let hasDetectedForms = false;
    function detectLoginForms() {
        // 防止重复检测
        if (hasDetectedForms) {
            debugLog('⚠️ 已经检测过登录表单，跳过重复检测');
            return 0;
        }

        debugLog('检测登录表单...');
        hasDetectedForms = true;

        const passwordInputs = document.querySelectorAll('input[type="password"]:not([data-pm-setup])');
        debugLog('找到', passwordInputs.length, '个未设置的密码输入框');

        passwordInputs.forEach(function(passwordInput) {
            setupPasswordInput(passwordInput);
        });

        return passwordInputs.length;
    }

    /**
     * 设置密码输入框
     */
    function setupPasswordInput(passwordInput) {
        if (passwordInput.hasAttribute('data-pm-setup')) {
            return;
        }
        passwordInput.setAttribute('data-pm-setup', 'true');

        debugLog('设置密码输入框:', passwordInput);

        const usernameInput = findUsernameInput(passwordInput);
        if (usernameInput) {
            debugLog('✅ 找到对应的用户名输入框:', usernameInput);

            usernameInput.addEventListener('focus', function(e) {
                debugLog('🎯 用户名输入框获得焦点');
                if (hasSelectedAccount) {
                    debugLog('ℹ️ 已选择过账号，不自动显示下拉框');
                    debugLog('💡 提示：双击输入框可重新显示账号列表');
                    return;
                }
                debugLog('🔍 查找密码建议');
                preloadPasswordData();
                showPasswordSuggestions(usernameInput, passwordInput);
            });

            usernameInput.addEventListener('click', function(e) {
                debugLog('🖱️ 点击用户名输入框');
                if (hasSelectedAccount) {
                    debugLog('ℹ️ 已选择过账号，不自动显示下拉框');
                    return;
                }
                debugLog('🔍 查找密码建议');
                showPasswordSuggestions(usernameInput, passwordInput);
            });

            usernameInput.addEventListener('dblclick', function(e) {
                debugLog('🖱️🖱️ 双击用户名输入框，强制显示下拉框');
                hasSelectedAccount = false;
                preloadPasswordData();
                showPasswordSuggestions(usernameInput, passwordInput, true);
            });

            passwordInput.addEventListener('focus', function(e) {
                debugLog('🎯 密码输入框获得焦点');
                if (hasSelectedAccount) {
                    debugLog('ℹ️ 已选择过账号，不自动显示下拉框');
                    return;
                }
                debugLog('🔍 查找密码建议');
                showPasswordSuggestions(usernameInput, passwordInput);
            });
        } else {
            debugWarn('⚠️ 未找到对应的用户名输入框');
            passwordInput.addEventListener('focus', function(e) {
                debugLog('🎯 密码输入框获得焦点（无用户名框）');
                showPasswordSuggestions(null, passwordInput);
            });
        }
    }

    /**
     * 处理输入框焦点
     */
    function handleInputFocus(input) {
        debugLog('输入框获得焦点:', input.type, input.name);

        if (input.type === 'password') {
            if (!input.hasAttribute('data-pm-setup')) {
                setupPasswordInput(input);
            }
            const usernameInput = findUsernameInput(input);
            if (usernameInput) {
                showPasswordSuggestions(usernameInput, input);
            } else {
                showPasswordSuggestions(null, input);
            }
        } else if (input.type === 'text' || input.type === 'email') {
            const passwordInput = findRelatedPasswordInput(input);
            if (passwordInput) {
                if (!passwordInput.hasAttribute('data-pm-setup')) {
                    setupPasswordInput(passwordInput);
                }
                showPasswordSuggestions(input, passwordInput);
            }
        }
    }

    /**
     * 查找用户名输入框（增强版 - 支持Google等复杂登录表单）
     */
    function findUsernameInput(passwordInput) {
        debugLog('🔍 查找用户名输入框...');

        // 方法1: 在同一表单中查找（扩展模式 - 包含Google特定模式）
        const form = passwordInput.closest('form');
        if (form) {
            debugLog('📋 在表单中查找');
            const allInputs = form.querySelectorAll('input');
            debugLog('表单中共有', allInputs.length, '个输入框');

            for (const input of allInputs) {
                if (input === passwordInput) continue;
                if (input.type === 'password') continue;

                const type = input.type.toLowerCase();
                const name = input.name ? input.name.toLowerCase() : '';
                const id = input.id ? input.id.toLowerCase() : '';
                const placeholder = input.placeholder ? input.placeholder.toLowerCase() : '';
                const className = input.className ? input.className.toLowerCase() : '';
                const ariaLabel = input.getAttribute('aria-label') ? input.getAttribute('aria-label').toLowerCase() : '';
                const autocomplete = input.getAttribute('autocomplete') ? input.getAttribute('autocomplete').toLowerCase() : '';

                // 扩展的用户名字段检测（包括Google特定模式）
                const isUsernameField =
                    (type === 'text' || type === 'email') &&
                    (
                        // 标准模式
                        name.includes('user') || name.includes('email') || name.includes('login') || name.includes('account') ||
                        id.includes('user') || id.includes('email') || id.includes('login') || id.includes('account') ||
                        placeholder.includes('user') || placeholder.includes('email') || placeholder.includes('login') ||
                        className.includes('user') || className.includes('email') || className.includes('login') ||
                        // Google特定模式
                        name.includes('identifier') || name.includes('emailaddress') ||
                        id.includes('identifier') || id.includes('emailaddress') ||
                        className.includes('identifier') ||
                        // ARIA标签检测
                        ariaLabel.includes('email') || ariaLabel.includes('user') || ariaLabel.includes('identifier') ||
                        // Autocomplete检测
                        autocomplete === 'username' || autocomplete === 'email'
                    );

                if (isUsernameField) {
                    debugLog('✅ 找到用户名输入框（方法1）:', input);
                    return input;
                }
            }
        }

        // 方法1.5: Google特定检测 - 查找特定的输入框
        debugLog('🔍 执行Google特定检测');
        const googleInputs = document.querySelectorAll('input[type="email"], input[type="text"]');
        for (const input of googleInputs) {
            if (input === passwordInput) continue;
            if (input.type === 'password') continue;

            const name = input.name ? input.name.toLowerCase() : '';
            const id = input.id ? input.id.toLowerCase() : '';
            const className = input.className ? input.className.toLowerCase() : '';
            const ariaLabel = input.getAttribute('aria-label') ? input.getAttribute('aria-label').toLowerCase() : '';

            // Google常用的字段名
            if (name === 'identifier' || name === 'email' || name === 'emailaddress' ||
                id === 'identifier' || id === 'email' ||
                className.includes('whs') || // Google使用的类名前缀
                ariaLabel.includes('email') || ariaLabel.includes('identifier')) {
                debugLog('✅ 找到Google用户名输入框（方法1.5）:', input);
                return input;
            }
        }

        // 方法2: 查找前面的兄弟元素
        debugLog('🔍 在兄弟元素中查找');
        let prev = passwordInput.previousElementSibling;
        let searchCount = 0;
        while (prev && searchCount < 10) {
            searchCount++;

            if (prev.tagName === 'INPUT') {
                const type = prev.type.toLowerCase();
                if (type === 'text' || type === 'email') {
                    debugLog('✅ 找到用户名输入框（方法2）:', prev);
                    return prev;
                }
            }

            if (prev.tagName === 'DIV') {
                const innerInput = prev.querySelector('input[type="text"], input[type="email"]');
                if (innerInput) {
                    debugLog('✅ 找到用户名输入框（方法2-容器）:', innerInput);
                    return innerInput;
                }
            }

            prev = prev.previousElementSibling;
        }

        // 方法3: 查找父容器中的所有输入框
        debugLog('🔍 在父容器中查找');
        let container = passwordInput.parentElement;
        let containerSearchCount = 0;
        while (container && containerSearchCount < 3) {
            containerSearchCount++;

            const siblings = container.querySelectorAll('input');
            for (const input of siblings) {
                if (input === passwordInput) continue;
                if (input.type === 'password') continue;

                if (input.type === 'text' || input.type === 'email') {
                    debugLog('✅ 找到用户名输入框（方法3）:', input);
                    return input;
                }
            }

            container = container.parentElement;
        }

        // 方法4: 全局搜索 - 最后的备用方案
        debugLog('🔍 全局搜索用户名输入框');
        const allTextInputs = document.querySelectorAll('input[type="text"], input[type="email"]');
        for (const input of allTextInputs) {
            if (input === passwordInput) continue;

            const name = input.name ? input.name.toLowerCase() : '';
            const id = input.id ? input.id.toLowerCase() : '';
            const placeholder = input.placeholder ? input.placeholder.toLowerCase() : '';
            const ariaLabel = input.getAttribute('aria-label') ? input.getAttribute('aria-label').toLowerCase() : '';

            // 检查是否有任何用户名相关的特征
            if (name.includes('user') || name.includes('email') || name.includes('login') || name.includes('identifier') ||
                id.includes('user') || id.includes('email') || id.includes('login') || id.includes('identifier') ||
                placeholder.includes('email') || placeholder.includes('user') ||
                ariaLabel.includes('email') || ariaLabel.includes('user')) {
                debugLog('✅ 找到用户名输入框（方法4-全局搜索）:', input);
                return input;
            }
        }

        // 方法5: 位置启发式 - 取页面中第一个文本/email输入框
        debugLog('🔍 使用位置启发式方法');
        const firstTextInput = document.querySelector('input[type="text"]:not([type="password"]):not([type="hidden"]), input[type="email"]');
        if (firstTextInput && firstTextInput !== passwordInput) {
            debugLog('✅ 找到用户名输入框（方法5-位置启发式）:', firstTextInput);
            return firstTextInput;
        }

        debugWarn('❌ 未找到用户名输入框');
        debugLog('🔍 调试信息: 页面上的文本输入框数量:', document.querySelectorAll('input[type="text"], input[type="email"]').length);
        return null;
    }

    /**
     * 查找关联的密码输入框
     */
    function findRelatedPasswordInput(usernameInput) {
        const form = usernameInput.closest('form');
        if (form) {
            const passwordInput = form.querySelector('input[type="password"]');
            if (passwordInput) {
                return passwordInput;
            }
        }

        let next = usernameInput.nextElementSibling;
        let searchCount = 0;
        while (next && searchCount < 5) {
            searchCount++;
            if (next.tagName === 'INPUT' && next.type === 'password') {
                return next;
            }
            next = next.nextElementSibling;
        }

        if (usernameInput.parentElement) {
            const passwordInput = usernameInput.parentElement.querySelector('input[type="password"]');
            if (passwordInput) {
                return passwordInput;
            }
        }

        return null;
    }

    /**
     * 显示密码建议下拉框
     */
    function showPasswordSuggestions(usernameInput, passwordInput, forceReload = false) {
        removeExistingDropdown();

        if (cachedPasswords.length > 0 && !forceReload) {
            debugLog('📦 使用缓存的密码数据:', cachedPasswords.length, '个');
            if (cachedPasswords.length > 0) {
                renderDropdown(usernameInput, passwordInput, cachedPasswords);
            } else {
                renderNoPasswordsDropdown(usernameInput || passwordInput);
            }
            return;
        }

        const currentUrl = window.location.href;
        debugLog('🔍 查找密码建议:', currentUrl);

        safeRuntimeSendMessage({
            action: 'findPasswords',
            url: currentUrl
        }, function(response, error) {
            if (error) {
                debugError('❌ 查找密码失败:', error);
                return;
            }

            debugLog('📋 密码查找结果:', response);

            if (response && response.success && response.passwords) {
                cachedPasswords = response.passwords;
                debugLog('💾 已缓存密码数据:', cachedPasswords.length, '个');

                if (cachedPasswords.length > 0) {
                    renderDropdown(usernameInput, passwordInput, cachedPasswords);
                } else {
                    renderNoPasswordsDropdown(usernameInput || passwordInput);
                }
            } else {
                debugLog('ℹ️ 没有找到保存的密码');
                renderNoPasswordsDropdown(usernameInput || passwordInput);
            }
        });
    }

    /**
     * 渲染无密码提示
     */
    function renderNoPasswordsDropdown(targetInput) {
        removeExistingDropdown();

        const dropdown = document.createElement('div');
        dropdown.id = 'pm-password-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #dadce0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 2147483647;
            min-width: 200px;
            font-family: "Google Sans", Roboto, "Segoe UI", sans-serif;
            font-size: 13px;
        `;

        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #888;">
                <div style="font-size: 24px; margin-bottom: 8px;">🔐</div>
                <div>此网站没有保存的密码</div>
                <div style="font-size: 11px; margin-top: 8px;">
                    登录后可自动保存密码
                </div>
                <div style="font-size: 11px; color: #aaa; margin-top: 4px;">ESC 关闭</div>
            </div>
        `;

        positionDropdown(dropdown, targetInput);
        document.body.appendChild(dropdown);
        currentDropdown = dropdown;

        setTimeout(function() {
            document.addEventListener('click', handleClickOutside);
        }, 50);
    }

    /**
     * 渲染下拉框
     */
    function renderDropdown(usernameInput, passwordInput, passwords, selectedIndex = 0) {
        activeInput = usernameInput;
        activePasswordInput = passwordInput;

        if (!passwords || passwords.length === 0) {
            return;
        }

        const displayPasswords = passwords.length > 50 ? passwords.slice(0, 50) : passwords;
        const totalCount = passwords.length;
        const displayedCount = displayPasswords.length;

        removeExistingDropdown();

        const dropdown = document.createElement('div');
        dropdown.id = 'pm-password-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #dadce0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 2147483647;
            max-height: 280px;
            overflow-y: auto;
            min-width: 200px;
            font-family: "Google Sans", Roboto, "Segoe UI", Helvetica, Arial, sans-serif;
            font-size: 13px;
            cursor: default;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #dadce0;
            color: #5f6368;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const tipText = hasSelectedAccount ?
            '双击输入框可重新显示账号列表' :
            'ESC 关闭';

        header.innerHTML = `
            <span>🔐 选择账号 (${totalCount}个${displayedCount < totalCount ? '，显示前' + displayedCount + '个' : ''})</span>
            <span style="font-size: 11px; color: #888;">${tipText}</span>
        `;
        dropdown.appendChild(header);

        window.pmDropdownItems = [];
        window.pmSelectedIndex = selectedIndex;

        const fragment = document.createDocumentFragment();

        displayPasswords.forEach(function(pwd, index) {
            const item = document.createElement('div');
            item.className = 'pm-dropdown-item';
            item.dataset.index = index;

            const domain = extractDomain(pwd.url);
            const searchTerm = usernameInput ? usernameInput.value.toLowerCase().trim() : '';
            const displayUsername = highlightMatch(pwd.username, searchTerm);
            const displayDomain = highlightMatch(domain, searchTerm);

            if (index === selectedIndex) {
                item.style.cssText = `
                    padding: 12px 16px;
                    cursor: pointer;
                    border-bottom: 1px solid #f1f3f4;
                    transition: background 0.1s;
                    background: #e8f0fe;
                `;
                window.pmSelectedIndex = index;
            } else {
                item.style.cssText = `
                    padding: 12px 16px;
                    cursor: pointer;
                    border-bottom: 1px solid #f1f3f4;
                    transition: background 0.1s;
                `;
            }

            item.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 18px; margin-right: 8px;">👤</span>
                    <span style="color: #202124; font-weight: 500;">${displayUsername}</span>
                </div>
                <div style="color: #5f6368; font-size: 11px; margin-left: 26px;">${displayDomain}</div>
            `;

            item.addEventListener('mouseenter', function() {
                updateSelectedItem(index);
            });

            item.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                fillCredentials(usernameInput, passwordInput, pwd);
                removeExistingDropdown();
            });

            window.pmDropdownItems.push(item);
            fragment.appendChild(item);
        });

        dropdown.appendChild(fragment);

        positionDropdown(dropdown, usernameInput || passwordInput);

        document.body.appendChild(dropdown);
        currentDropdown = dropdown;

        setupKeyboardNavigation(usernameInput, passwordInput, passwords);

        setTimeout(function() {
            document.addEventListener('click', handleClickOutside);
        }, 50);

        setupInputFilter(usernameInput, passwordInput);
    }

    /**
     * 高亮匹配的文字
     */
    function highlightMatch(text, searchTerm) {
        if (!searchTerm) {
            return escapeHtml(text);
        }

        const index = text.toLowerCase().indexOf(searchTerm);
        if (index === -1) {
            return escapeHtml(text);
        }

        const before = text.substring(0, index);
        const match = text.substring(index, index + searchTerm.length);
        const after = text.substring(index + searchTerm.length);

        return escapeHtml(before) +
               '<strong style="color: #1a73e8; background: #e8f0fe;">' +
               escapeHtml(match) +
               '</strong>' +
               escapeHtml(after);
    }

    /**
     * 更新选中项
     */
    function updateSelectedItem(newIndex) {
        if (!window.pmDropdownItems || window.pmDropdownItems.length === 0) return;

        if (window.pmSelectedIndex >= 0 && window.pmSelectedIndex < window.pmDropdownItems.length) {
            const oldItem = window.pmDropdownItems[window.pmSelectedIndex];
            oldItem.style.background = 'white';
        }

        window.pmSelectedIndex = newIndex;
        const newItem = window.pmDropdownItems[newIndex];
        newItem.style.background = '#e8f0fe';

        newItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /**
     * 设置键盘导航
     */
    function setupKeyboardNavigation(usernameInput, passwordInput, passwords) {
        const keyHandler = function(e) {
            if (!currentDropdown) return;

            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const nextIndex = Math.min(window.pmSelectedIndex + 1, window.pmDropdownItems.length - 1);
                    updateSelectedItem(nextIndex);
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    const prevIndex = Math.max(window.pmSelectedIndex - 1, 0);
                    updateSelectedItem(prevIndex);
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (window.pmSelectedIndex >= 0 && window.pmSelectedIndex < passwords.length) {
                        const selectedPwd = passwords[window.pmSelectedIndex];
                        fillCredentials(usernameInput, passwordInput, selectedPwd);
                        removeExistingDropdown();
                    }
                    break;

                case 'Escape':
                    e.preventDefault();
                    removeExistingDropdown();
                    break;

                case 'Tab':
                    removeExistingDropdown();
                    break;
            }
        };

        document.addEventListener('keydown', keyHandler);
        window.pmKeyHandler = keyHandler;
    }

    /**
     * 设置输入过滤
     */
    function setupInputFilter(usernameInput, passwordInput) {
        if (!usernameInput || window.pmFilterHandler) {
            if (usernameInput && window.pmFilterHandler) {
                usernameInput.removeEventListener('input', window.pmFilterHandler);
            }
        }

        let debounceTimer;

        const filterHandler = function(e) {
            if (!usernameInput.value.trim()) {
                debugLog('🔄 输入框已清空，重置选择状态');
                hasSelectedAccount = false;
            }

            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(function() {
                const searchTerm = usernameInput.value.toLowerCase().trim();
                debugLog('🔍 过滤账号:', searchTerm);

                if (cachedPasswords.length > 0) {
                    if (!searchTerm) {
                        debugLog('📋 显示所有账号:', cachedPasswords.length);
                        renderDropdown(usernameInput, passwordInput, cachedPasswords, 0);
                    } else {
                        const filtered = cachedPasswords.filter(function(pwd) {
                            return pwd.username.toLowerCase().includes(searchTerm);
                        });

                        debugLog('📋 过滤后账号数:', filtered.length);

                        if (filtered.length > 0) {
                            renderDropdown(usernameInput, passwordInput, filtered, 0);
                        } else {
                            renderNoResultsDropdown(usernameInput);
                        }
                    }
                } else {
                    debugLog('⚠️ 无缓存数据，重新查询background');
                    showPasswordSuggestions(usernameInput, passwordInput, true);
                }
            }, 80);
        };

        usernameInput.addEventListener('input', filterHandler);
        window.pmFilterHandler = filterHandler;
    }

    /**
     * 渲染无结果提示
     */
    function renderNoResultsDropdown(usernameInput) {
        removeExistingDropdown();

        const dropdown = document.createElement('div');
        dropdown.id = 'pm-password-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #dadce0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 2147483647;
            min-width: 200px;
            font-family: "Google Sans", Roboto, "Segoe UI", sans-serif;
            font-size: 13px;
        `;

        const tip = hasSelectedAccount ?
            '双击输入框显示所有账号' :
            '清空输入显示所有账号';

        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #888;">
                <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
                <div>没有找到匹配的账号</div>
                <div style="font-size: 11px; margin-top: 8px;">${tip}</div>
                <div style="font-size: 11px; color: #aaa; margin-top: 4px;">ESC 关闭</div>
            </div>
        `;

        positionDropdown(dropdown, usernameInput);
        document.body.appendChild(dropdown);
        currentDropdown = dropdown;

        setTimeout(function() {
            document.addEventListener('click', handleClickOutside);
        }, 50);
    }

    /**
     * 定位下拉框
     */
    function positionDropdown(dropdown, targetInput) {
        if (!targetInput || !targetInput.getBoundingClientRect) {
            dropdown.style.top = '8px';
            dropdown.style.left = '8px';
            dropdown.style.width = '250px';
            return;
        }
        const rect = targetInput.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        let top = rect.bottom + scrollTop + 2;
        let left = rect.left + scrollLeft;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (top + 250 > scrollTop + viewportHeight) {
            top = rect.top + scrollTop - 252;
        }

        if (left + 300 > scrollLeft + viewportWidth) {
            left = scrollLeft + viewportWidth - 302;
        }

        if (left < scrollLeft) {
            left = scrollLeft + 8;
        }

        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';
        dropdown.style.width = Math.max(rect.width, 250) + 'px';
    }

    /**
     * 点击外部关闭下拉框
     */
    function handleClickOutside(e) {
        const dropdown = document.getElementById('pm-password-dropdown');
        if (dropdown && !dropdown.contains(e.target) && e.target !== activeInput) {
            removeExistingDropdown();
        }
    }

    /**
     * 移除已存在的下拉框
     */
    function removeExistingDropdown() {
        const existing = document.getElementById('pm-password-dropdown');
        if (existing) {
            existing.remove();
        }
        currentDropdown = null;
        document.removeEventListener('click', handleClickOutside);

        if (window.pmKeyHandler) {
            document.removeEventListener('keydown', window.pmKeyHandler);
            window.pmKeyHandler = null;
        }

        window.pmDropdownItems = null;
        window.pmSelectedIndex = null;
        window.pmFilterHandler = null;
    }

    /**
     * 填充凭据
     */
    function fillCredentials(usernameInput, passwordInput, passwordData) {
        debugLog('填充凭据:', passwordData.username);

        hasSelectedAccount = true;

        if (usernameInput) {
            usernameInput.value = passwordData.username;
            usernameInput.dispatchEvent(new Event('input', {bubbles: true}));
            usernameInput.dispatchEvent(new Event('change', {bubbles: true}));
        }

        setTimeout(function() {
            passwordInput.value = passwordData.password;
            passwordInput.dispatchEvent(new Event('input', {bubbles: true}));
            passwordInput.dispatchEvent(new Event('change', {bubbles: true}));

            passwordInput.focus();

            setTimeout(function() {
                passwordInput.dispatchEvent(new Event('blur', {bubbles: true}));
            }, 100);

            debugLog('凭据填充完成');
        }, 100);
    }

    /**
     * 提取域名
     */
    function extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            return url;
        }
    }

    /**
     * 预加载密码数据
     */
    let preloadDone = false;
    function preloadPasswordData() {
        // 防止重复预加载
        if (preloadDone) {
            debugLog('⚠️ 密码数据已预加载，跳过重复预加载');
            return;
        }
        preloadDone = true;

        const currentUrl = window.location.href;
        debugLog('⚡ 预加载密码数据...');

        safeRuntimeSendMessage({
            action: 'findPasswords',
            url: currentUrl
        }, function(response, error) {
            if (error) {
                debugLog('💾 预加载失败（扩展端口关闭）:', error.message);
                cachedPasswords = [];
                return;
            }

            if (response && response.success && response.passwords) {
                cachedPasswords = response.passwords;
                debugLog('💾 预加载完成，缓存', cachedPasswords.length, '个密码');
            } else {
                cachedPasswords = [];
                debugLog('💾 预加载完成，无密码数据');
            }
        });
    }

    /**
     * HTML转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始化（只执行一次）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            debugLog('📄 DOM加载完成，初始化密码管理器');
            setTimeout(init, 500);
        });
    } else {
        debugLog('📄 DOM已加载，立即初始化密码管理器');
        setTimeout(init, 500);
    }

    debugLog('密码管理器脚本已就绪');

})();
