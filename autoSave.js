/**
 * Auto Save Module for Password Manager
 * 自动保存模块 - 类似Chrome原生体验
 */

(function() {
    'use strict';

    const DEBUG_LOGS = false;

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

    // 全局变量
    let capturedCredentials = null; // 捕获的凭据
    let loginSuccessDetected = false; // 登录成功检测
    let savePromptShown = false; // 是否已显示保存提示
    let extensionContextInvalidated = false;
    let navigationMonitorCleanup = null;
    let formObserver = null;

    function isContextInvalidationError(error) {
        const message = error && (error.message || String(error));
        return /extension context invalidated|context invalidated|invalidated/i.test(message || "");
    }

    function markExtensionContextInvalidated(error) {
        if (extensionContextInvalidated) {
            return;
        }
        extensionContextInvalidated = true;
        if (formObserver) {
            try {
                formObserver.disconnect();
            } catch (e) {}
            formObserver = null;
        }
        if (navigationMonitorCleanup) {
            navigationMonitorCleanup();
            navigationMonitorCleanup = null;
        }
        removePromptBubble();
        if (error) {
            debugLog('扩展上下文已失效，自动保存模块停止扩展通信:', error.message || error);
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

    function safeRuntimeGetURL(path) {
        if (!isExtensionContextReady()) {
            return '';
        }
        try {
            return chrome.runtime.getURL(path);
        } catch (e) {
            if (isContextInvalidationError(e)) {
                markExtensionContextInvalidated(e);
            }
            return '';
        }
    }

    /**
     * 初始化自动保存功能
     */
    function initAutoSave() {
        debugLog('初始化密码自动保存功能');

        // 检查自动保存设置
        safeStorageLocalGet(['pm_autoSave'], function(result, error) {
            if (error) {
                debugLog('自动保存设置读取失败（扩展上下文可能已失效）:', error.message);
                return;
            }
            if (result.pm_autoSave !== false) {
                debugLog('✅ 自动保存已启用');
                setupFormMonitoring();
                setupNavigationMonitoring();
            } else {
                debugLog('ℹ️ 自动保存已禁用');
            }
        });
    }

    /**
     * 设置表单监控
     */
    function setupFormMonitoring() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', setupFormMonitoring, { once: true });
            return;
        }
        if (formObserver) {
            return;
        }

        const submitHandler = function(e) {
            const form = e.target;
            if (form && form.tagName === 'FORM') {
                debugLog('检测到表单提交');
                captureLoginForm(form);
            }
        };

        const clickHandler = function(e) {
            const target = e.target;
            const button = target && target.closest ?
                target.closest('button, input[type="submit"], input[type="button"]') :
                null;

            if (!button || !isSubmitLikeControl(button)) {
                return;
            }

            const form = button.form || (button.closest ? button.closest('form') : null);
            if (!form) {
                return;
            }

            debugLog('检测到登录按钮点击');
            captureLoginForm(form);
        };

        document.addEventListener('submit', submitHandler, true);
        document.addEventListener('click', clickHandler, true);
        formObserver = {
            disconnect: function() {
                document.removeEventListener('submit', submitHandler, true);
                document.removeEventListener('click', clickHandler, true);
            }
        };
        debugLog('自动保存表单监听已启动（事件委托模式）');
    }

    function isSubmitLikeControl(button) {
        const tagName = button.tagName;
        const type = (button.getAttribute('type') || '').toLowerCase();
        return tagName === 'BUTTON' && (!type || type === 'submit') ||
            tagName === 'INPUT' && (type === 'submit' || type === 'button');
    }

    /**
     * 捕获登录表单数据
     */
    function captureLoginForm(form) {
        debugLog('捕获登录表单数据');

        // 查找用户名和密码输入框（改进的查找逻辑）
        const passwordInput = form.querySelector('input[type="password"]');
        if (!passwordInput) {
            debugLog('未找到密码输入框，跳过');
            return;
        }

        let usernameInput = null;

        // 方法1: 查找用户名输入框（多种选择器）
        const usernameSelectors = [
            'input[type="text"]',
            'input[type="email"]',
            'input[type="tel"]',
            'input[name*="user" i]',
            'input[name*="email" i]',
            'input[name*="login" i]',
            'input[name*="account" i]',
            'input[id*="user" i]',
            'input[id*="email" i]',
            'input[id*="login" i]',
            'input[class*="user" i]',
            'input[class*="email" i]',
            'input[placeholder*="用户" i]',
            'input[placeholder*="账号" i]',
            'input[placeholder*="邮箱" i]'
        ];

        for (const selector of usernameSelectors) {
            const inputs = form.querySelectorAll(selector);
            for (const input of inputs) {
                if (input !== passwordInput && input.value && input.value.trim()) {
                    usernameInput = input;
                    debugLog('找到用户名输入框（方法1）:', input);
                    break;
                }
            }
            if (usernameInput) break;
        }

        // 方法2: 查找密码框之前的文本输入框
        if (!usernameInput) {
            debugLog('尝试方法2：查找密码框前的输入框');
            let prev = passwordInput.previousElementSibling;
            let searchCount = 0;
            while (prev && searchCount < 10) {
                searchCount++;
                if (prev.tagName === 'INPUT') {
                    const type = prev.type.toLowerCase();
                    if (type === 'text' || type === 'email' || type === 'tel') {
                        usernameInput = prev;
                        debugLog('找到用户名输入框（方法2）:', prev);
                        break;
                    }
                }
                prev = prev.previousElementSibling;
            }
        }

        // 方法3: 查找同容器中的所有文本输入框
        if (!usernameInput) {
            debugLog('尝试方法3：查找同容器中的文本输入框');
            const container = passwordInput.parentElement;
            if (container) {
                const allTextInputs = container.querySelectorAll('input[type="text"], input[type="email"], input:not([type="password"])');
                for (const input of allTextInputs) {
                    if (input !== passwordInput && input.value && input.value.trim()) {
                        usernameInput = input;
                        debugLog('找到用户名输入框（方法3）:', input);
                        break;
                    }
                }
            }
        }

        if (usernameInput) {
            debugLog('✅ 找到用户名输入框:', usernameInput);
        } else {
            debugLog('⚠️ 无法找到用户名输入框，尝试创建临时标识符');
        }

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput.value.trim();

        // 如果没有用户名，使用临时标识符
        const finalUsername = username || 'unknown_user_' + Date.now().toString().slice(-4);

        if (!password) {
            debugLog('密码为空，跳过');
            return;
        }

        // 保存捕获的凭据
        capturedCredentials = {
            username: finalUsername,
            password: password,
            url: window.location.href,
            form: form,
            hasUsernameInput: !!usernameInput
        };

        debugLog('已捕获凭据:', {
            username: finalUsername,
            password: '***',
            url: capturedCredentials.url,
            hasUsernameInput: capturedCredentials.hasUsernameInput
        });

        // 延迟检查登录是否成功
        setTimeout(function() {
            checkLoginSuccess(form);
        }, 2000);
    }

    /**
     * 检查登录是否成功
     */
    function checkLoginSuccess(form) {
        debugLog('检查登录成功状态');

        if (!capturedCredentials) {
            debugLog('没有捕获到凭据，跳过登录成功判断');
            return;
        }

        // 检查页面URL是否发生变化（重定向）
        const currentUrl = window.location.href;
        const originalUrl = capturedCredentials.url;
        const currentUrlChanged = normalizeUrlForLoginCheck(currentUrl) !== normalizeUrlForLoginCheck(originalUrl);
        const urlChangedAwayFromLogin = currentUrlChanged &&
            (isLikelyLoginUrl(originalUrl) || !isLikelyLoginUrl(currentUrl));

        // 检查是否显示用户信息（登录成功的标志）
        const userElements = document.querySelectorAll('.user-info, .username, .account-name, [class*="user" i], [class*="account" i]');
        let isLoggedIn = false;
        userElements.forEach(function(elem) {
            const text = elem.textContent || elem.innerText || '';
            if (text && capturedCredentials && text.includes(capturedCredentials.username)) {
                isLoggedIn = true;
            }
        });

        // 检查表单是否消失
        const formExists = !!(form && document.body && document.body.contains(form));
        const passwordInputsGone = !hasVisiblePasswordInput();
        const loginFailed = hasVisibleLoginFailure();

        if (!loginFailed && (isLoggedIn || urlChangedAwayFromLogin || (!formExists && passwordInputsGone))) {
            debugLog('检测到登录成功');
            loginSuccessDetected = true;
            showSavePrompt();
        } else {
            debugLog('未检测到登录成功，继续监控');
        }
    }

    function normalizeUrlForLoginCheck(url) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            return parsed.toString();
        } catch (e) {
            return (url || '').split('#')[0];
        }
    }

    function isLikelyLoginUrl(url) {
        const value = (url || '').toString().toLowerCase();
        return /login|signin|sign-in|auth|sso|cas\/login|passport|session/.test(value);
    }

    function hasVisiblePasswordInput() {
        const inputs = document.querySelectorAll('input[type="password"]');
        for (const input of inputs) {
            if (isElementVisible(input)) {
                return true;
            }
        }
        return false;
    }

    function hasVisibleLoginFailure() {
        const selectors = [
            '[role="alert"]',
            '.error',
            '.errors',
            '.error-message',
            '.login-error',
            '.ant-form-item-explain-error',
            '.el-form-item__error',
            '.invalid-feedback',
            '.toast-error',
            '.message-error'
        ];
        const failurePattern = /错误|失败|无效|不正确|不能为空|invalid|incorrect|failed|error|required/i;

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = (element.textContent || element.innerText || '').trim();
                if (text && failurePattern.test(text) && isElementVisible(element)) {
                    return true;
                }
            }
        }

        return false;
    }

    function isElementVisible(element) {
        if (!element || !element.getBoundingClientRect) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        return rect.width > 0 &&
            rect.height > 0 &&
            (!style || (style.visibility !== 'hidden' && style.display !== 'none'));
    }

    /**
     * 设置导航监控
     */
    function setupNavigationMonitoring() {
        if (navigationMonitorCleanup) {
            return;
        }

        let lastUrl = window.location.href;
        let pendingUrlCheck = null;

        const checkForUrlChange = function() {
            pendingUrlCheck = null;
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                debugLog('URL发生变化:', lastUrl, '→', currentUrl);

                // 如果从登录页面跳转到其他页面，检查是否登录成功
                if (capturedCredentials && isLikelyLoginUrl(lastUrl) && !isLikelyLoginUrl(currentUrl)) {
                    debugLog('从登录页面跳转，可能登录成功');
                    setTimeout(function() {
                        checkLoginSuccess(capturedCredentials.form);
                    }, 1000);
                }

                lastUrl = currentUrl;
            }
        };

        const scheduleUrlCheck = function(delay) {
            if (pendingUrlCheck) {
                clearTimeout(pendingUrlCheck);
            }
            pendingUrlCheck = setTimeout(checkForUrlChange, delay || 300);
        };

        const clickHandler = function() {
            scheduleUrlCheck(800);
        };
        const stateHandler = function() {
            scheduleUrlCheck(0);
        };

        document.addEventListener('click', clickHandler, true);
        window.addEventListener('popstate', stateHandler);
        window.addEventListener('hashchange', stateHandler);

        navigationMonitorCleanup = function() {
            if (pendingUrlCheck) {
                clearTimeout(pendingUrlCheck);
                pendingUrlCheck = null;
            }
            document.removeEventListener('click', clickHandler, true);
            window.removeEventListener('popstate', stateHandler);
            window.removeEventListener('hashchange', stateHandler);
        };
    }

    /**
     * 显示保存提示气泡
     */
    function showSavePrompt() {
        if (!capturedCredentials || savePromptShown) {
            debugLog('跳过显示保存提示（无凭据或已显示）');
            return;
        }

        savePromptShown = true;
        debugLog('📋 准备显示保存提示');

        const username = capturedCredentials.username;
        const password = capturedCredentials.password;
        const url = capturedCredentials.url;
        const domain = extractDomain(url);

        debugLog('检查是否已存在密码:', { username, domain });

        // 检查是否已存在此密码
        safeRuntimeSendMessage({
            action: 'findPasswords',
            url: url
        }, function(response, error) {
            if (error) {
                debugLog('密码查询失败（扩展端口可能已关闭）:', error.message);
                savePromptShown = false;
                return;
            }

            debugLog('密码查询结果:', response);

            if (response && response.success && response.passwords) {
                debugLog('找到', response.passwords.length, '个密码');
                const existingPassword = response.passwords.find(function(pwd) {
                    return pwd.username === username;
                });

                if (existingPassword) {
                    debugLog('找到已存在的密码');
                    // 检查密码是否相同
                    const isPasswordChanged = existingPassword.password !== password;
                    debugLog('密码是否改变:', isPasswordChanged);
                    if (isPasswordChanged) {
                        debugLog('密码已更改，显示更新提示');
                        showUpdatePrompt(domain, username, password);
                    } else {
                        debugLog('密码未变化，不显示提示');
                    }
                } else {
                    debugLog('新密码，显示保存提示');
                    showNewPasswordPrompt(domain, username, password);
                }
            } else {
                debugLog('未找到响应或密码列表为空，显示默认提示');
                showNewPasswordPrompt(domain, username, password);
            }
        });
    }

    /**
     * 显示新密码保存提示
     */
    function showNewPasswordPrompt(domain, username, password) {
        const prompt = createSavePromptBubble(
            '🔐 是否保存密码？',
            `是否为 <strong>${escapeHtml(username)}</strong> 在 <strong>${escapeHtml(domain)}</strong> 的密码？`,
            'save'
        );

        addPromptActions(prompt, {
            primary: { text: '💾 保存', action: 'save' },
            secondary: { text: '🚫 这次不', action: 'ignore' }
        }, domain, username, password);
    }

    /**
     * 显示密码更新提示
     */
    function showUpdatePrompt(domain, username, newPassword, oldPassword) {
        const prompt = createSavePromptBubble(
            '🔄 更新密码？',
            `<strong>${escapeHtml(username)}</strong> 在 <strong>${escapeHtml(domain)}</strong> 的密码已更新`,
            'update'
        );

        addPromptActions(prompt, {
            primary: { text: '🔄 更新', action: 'update' },
            secondary: { text: '🚫 忽略', action: 'ignore' }
        }, domain, username, newPassword);
    }

    /**
     * 创建保存提示气泡
     */
    function createSavePromptBubble(title, message, type) {
        // 移除已存在的提示
        removePromptBubble();

        debugLog('创建提示气泡:', title, type);

        const bubble = document.createElement('div');
        bubble.id = 'pm-save-bubble';
        bubble.className = 'pm-save-bubble';

        bubble.innerHTML = `
            <div class="pm-bubble-header">
                <span class="pm-bubble-icon">${type === 'save' ? '🔐' : '🔄'}</span>
                <span class="pm-bubble-title">${title}</span>
                <button class="pm-bubble-close" title="关闭">×</button>
            </div>
            <div class="pm-bubble-content">
                ${message}
            </div>
            <div class="pm-bubble-actions"></div>
            <div class="pm-bubble-footer">
                <span class="pm-bubble-tip">💾 密码仅保存在本地，加密存储</span>
            </div>
        `;

        document.body.appendChild(bubble);
        debugLog('气泡已添加到页面');

        // 定位气泡（左上角）
        setTimeout(function() {
            positionBubble(bubble);
        }, 100);

        return bubble;
    }

    /**
     * 添加提示气泡操作按钮
     */
    function addPromptActions(bubble, actions, domain, username, password) {
        const actionsDiv = bubble.querySelector('.pm-bubble-actions');

        if (!actionsDiv) {
            debugError('未找到pm-bubble-actions元素');
            return;
        }

        Object.keys(actions).forEach(function(key) {
            const action = actions[key];
            const button = document.createElement('button');

            if (key === 'primary') {
                button.className = 'pm-bubble-button pm-bubble-button-primary';
            } else {
                button.className = 'pm-bubble-button pm-bubble-button-secondary';
            }

            button.textContent = action.text;
            button.dataset.action = action.action;

            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                debugLog('用户点击按钮:', action.text);
                handleBubbleAction(action.action, domain, username, password);
            });

            actionsDiv.appendChild(button);
            debugLog('添加按钮:', action.text);
        });
    }

    /**
     * 处理气泡操作
     */
    function handleBubbleAction(action, domain, username, password) {
        debugLog('用户选择:', action);

        switch (action) {
            case 'save':
                // 保存新密码
                safeRuntimeSendMessage({
                    action: 'savePassword',
                    password: {
                        name: domain,
                        url: window.location.href,
                        username: username,
                        password: password
                    }
                }, function(response, error) {
                    if (error) {
                        debugLog('保存密码失败（扩展端口可能已关闭）:', error.message);
                        showNotification('保存失败', 'error');
                        return;
                    }

                    if (response && response.success) {
                        showNotification('密码已保存');
                        removePromptBubble();
                    } else {
                        showNotification('保存失败', 'error');
                    }
                });
                break;

            case 'update':
                // 更新密码
                safeRuntimeSendMessage({
                    action: 'savePassword',
                    password: {
                        name: domain,
                        url: window.location.href,
                        username: username,
                        password: password
                    }
                }, function(response, error) {
                    if (error) {
                        debugLog('更新密码失败（扩展端口可能已关闭）:', error.message);
                        showNotification('更新失败', 'error');
                        return;
                    }

                    if (response && response.success) {
                        showNotification('密码已更新');
                        removePromptBubble();
                    } else {
                        showNotification('更新失败', 'error');
                    }
                });
                break;

            case 'ignore':
                // 忽略，移除提示
                showNotification('已忽略');
                removePromptBubble();
                break;
        }
    }

    /**
     * 定位气泡
     */
    function positionBubble(bubble) {
        const bubbleWidth = 360;
        const bubbleHeight = 150;
        const margin = 20;

        // 定位在左上角，避免遮挡重要内容
        let top = margin;
        let left = margin;

        // 检查是否与页面重要元素重叠
        const importantSelectors = ['#header', '.header', 'nav', '.navbar', '[role="navigation"]'];
        let adjustedTop = top;

        importantSelectors.forEach(function(selector) {
            const element = document.querySelector(selector);
            if (element) {
                const rect = element.getBoundingClientRect();
                if (rect.top + rect.height > adjustedTop && adjustedTop < rect.top + rect.height + 50) {
                    adjustedTop = rect.bottom + margin;
                }
            }
        });

        top = adjustedTop;

        bubble.style.position = 'fixed';
        bubble.style.top = top + 'px';
        bubble.style.left = left + 'px';
        bubble.style.zIndex = '2147483647';
    }

    /**
     * 移除提示气泡
     */
    function removePromptBubble() {
        const existing = document.getElementById('pm-save-bubble');
        if (existing) {
            existing.remove();
        }
        savePromptShown = false;
    }

    /**
     * 显示通知
     */
    function showNotification(message, type = 'success') {
        debugLog('显示通知:', message);

        // 检查通知设置
        safeStorageLocalGet(['pm_showNotifications'], function(result, error) {
            if (error) {
                return;
            }
            if (result.pm_showNotifications === false) {
                debugLog('ℹ️ 通知已禁用，跳过显示');
                return;
            }

            const iconUrl = safeRuntimeGetURL('icon.png');

            // 检查是否支持通知API
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('密码管理器', {
                    body: message,
                    icon: iconUrl,
                    type: type
                });
                setTimeout(function() {
                    notification.close();
                }, 3000);
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                // 请求通知权限
                Notification.requestPermission().then(function(permission) {
                    if (permission === 'granted') {
                        const notification = new Notification('密码管理器', {
                            body: message,
                            icon: iconUrl,
                            type: type
                        });
                        setTimeout(function() {
                            notification.close();
                        }, 3000);
                    }
                });
            }
        });
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
     * HTML转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 初始化
    initAutoSave();

    // 标识模块已加载（供测试页面检测）
    window.pmAutoSaveModuleLoaded = true;

    // 添加气泡样式
    const style = document.createElement('style');
    style.textContent = `
        /* 密码管理器保存提示气泡样式 */
        .pm-save-bubble {
            position: fixed;
            background: white;
            border: 1px solid #dadce0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            width: 360px;
            z-index: 2147483647;
            animation: pm-bubble-slide-in 0.3s ease-out;
        }

        @keyframes pm-bubble-slide-in {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .pm-bubble-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid #e8eaed;
            background: #f8f9fa;
            border-radius: 8px 8px 0 0;
        }

        .pm-bubble-icon {
            font-size: 16px;
            margin-right: 8px;
        }

        .pm-bubble-title {
            font-size: 14px;
            font-weight: 500;
            color: #202124;
        }

        .pm-bubble-close {
            background: none;
            border: none;
            font-size: 18px;
            color: #5f6368;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            line-height: 1;
            text-align: center;
            border-radius: 4px;
        }

        .pm-bubble-close:hover {
            background: #e8eaed;
        }

        .pm-bubble-content {
            padding: 16px;
            color: #3c4043;
            font-size: 13px;
            line-height: 1.5;
        }

        .pm-bubble-actions {
            display: flex;
            gap: 8px;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 0 0 8px 8px;
        }

        .pm-bubble-button {
            flex: 1;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .pm-bubble-button-primary {
            background: #1a73e8;
            color: white;
        }

        .pm-bubble-button-primary:hover {
            background: #1557b0;
        }

        .pm-bubble-button-secondary {
            background: white;
            color: #5f6368;
            border: 1px solid #dadce0;
        }

        .pm-bubble-button-secondary:hover {
            background: #f1f3f4;
        }

        .pm-bubble-footer {
            padding: 8px 16px 12px 16px;
            font-size: 11px;
            color: #5f6368;
            text-align: center;
            border-top: 1px solid #e8eaed;
        }
    `;

    (document.head || document.documentElement).appendChild(style);

    // 监听气泡关闭按钮
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('pm-bubble-close')) {
            removePromptBubble();
        }
    });

    debugLog('自动保存模块已加载');

    window.addEventListener('error', function(event) {
        if (isContextInvalidationError(event.error || event.message)) {
            markExtensionContextInvalidated(event.error || event.message);
            event.preventDefault();
        }
    });

})();
