/**
 * Password Manager Core Module
 * 密码管理器核心模块
 * 提供密码的存储、加密、解密、导入导出功能
 */

var PasswordManager = (function() {
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

    const STORAGE_KEY = 'pm_passwords';
    const ENCRYPTION_KEY = 'pm_encryption_key';

    /**
     * 生成加密密钥
     */
    function generateKey() {
        return 'pm_key_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 简单的XOR加密
     * 注意：生产环境应该使用更强的加密算法
     */
    function encrypt(text, key) {
        if (!text) return '';
        text = unescape(encodeURIComponent(text));
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ (key.charCodeAt(i % key.length) & 255));
        }
        return btoa(result); // Base64编码
    }

    /**
     * 简单的XOR解密
     */
    function decrypt(encoded, key) {
        if (!encoded) return '';
        try {
            const text = atob(encoded); // Base64解码
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ (key.charCodeAt(i % key.length) & 255));
            }
            try {
                return decodeURIComponent(escape(result));
            } catch (unicodeError) {
                // 兼容旧版本只包含ASCII字符的密文。
                return result;
            }
        } catch (e) {
            debugError('解密错误:', e);
            return '';
        }
    }

    /**
     * 获取或创建加密密钥
     */
    function getEncryptionKey(callback) {
        chrome.storage.local.get([ENCRYPTION_KEY], function(result) {
            if (result[ENCRYPTION_KEY]) {
                callback(result[ENCRYPTION_KEY]);
            } else {
                const newKey = generateKey();
                chrome.storage.local.set({[ENCRYPTION_KEY]: newKey}, function() {
                    callback(newKey);
                });
            }
        });
    }

    /**
     * 获取所有密码（解密后的）
     */
    function getAllPasswords(callback) {
        debugLog('获取所有密码');
        getEncryptionKey(function(key) {
            debugLog('加密密钥已获取:', key.substring(0, 10) + '...');
            chrome.storage.local.get([STORAGE_KEY], function(result) {
                debugLog('存储读取结果:', result);
                const passwords = result[STORAGE_KEY] || [];
                debugLog('找到', passwords.length, '个加密的密码');

                if (passwords.length === 0) {
                    debugLog('没有找到密码，返回空数组');
                    callback([]);
                    return;
                }

                // 解密所有密码
                const decrypted = passwords.map(pwd => {
                    try {
                        const decryptedPassword = pwd.encrypted ? decrypt(pwd.password, key) : pwd.password;
                        debugLog('解密密码:', pwd.name, pwd.url, pwd.username, '密码长度:', decryptedPassword ? decryptedPassword.length : 0);

                        return {
                            id: pwd.id,
                            name: pwd.name,
                            url: pwd.url,
                            username: pwd.username,
                            password: decryptedPassword,
                            note: pwd.note || '',
                            created: pwd.created,
                            lastUsed: pwd.lastUsed
                        };
                    } catch (e) {
                        debugError('解密失败:', pwd.name, e);
                        return null;
                    }
                }).filter(pwd => pwd !== null);

                debugLog('返回', decrypted.length, '个解密后的密码');
                callback(decrypted);
            });
        });
    }

    /**
     * 保存密码（加密存储）
     * @param {Object} passwordData - 密码数据
     * @param {Function} callback - 回调函数
     * @param {Boolean} forceAdd - 是否强制添加（不检查重复）
     */
    function savePassword(passwordData, callback, forceAdd) {
        getEncryptionKey(function(key) {
            getAllPasswords(function(passwords) {
                // 生成唯一ID（包含URL和用户名的哈希，确保唯一性）
                const uniqueId = passwordData.url + '_' + passwordData.username;
                const id = passwordData.id || ('pwd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));

                // 只有在非强制添加时才检查重复
                let existingIndex = -1;
                if (!forceAdd) {
                    existingIndex = passwords.findIndex(p =>
                        p.url === passwordData.url && p.username === passwordData.username
                    );
                }

                const newPassword = {
                    id: id,
                    name: passwordData.name || extractDomain(passwordData.url),
                    url: passwordData.url,
                    username: passwordData.username,
                    password: encrypt(passwordData.password, key),
                    encrypted: true,
                    note: passwordData.note || '',
                    created: existingIndex >= 0 ? passwords[existingIndex].created : Date.now(),
                    lastUsed: Date.now()
                };

                if (existingIndex >= 0 && !forceAdd) {
                    // 更新现有密码
                    newPassword.id = passwords[existingIndex].id;
                    passwords[existingIndex] = newPassword;
                    debugLog('更新现有密码:', newPassword.name, newPassword.url, newPassword.username);
                } else {
                    // 添加新密码
                    passwords.push(newPassword);
                    debugLog('添加新密码:', newPassword.name, newPassword.url, newPassword.username);
                }

                // 保存到storage
                chrome.storage.local.set({[STORAGE_KEY]: passwords}, function() {
                    if (callback) callback(true, newPassword);
                });
            });
        });
    }

    /**
     * 删除密码
     */
    function deletePassword(id, callback) {
        getAllPasswords(function(passwords) {
            const filtered = passwords.filter(p => p.id !== id);
            chrome.storage.local.set({[STORAGE_KEY]: filtered}, function() {
                if (callback) callback(true);
            });
        });
    }

    /**
     * 根据URL查找密码
     */
    function findPasswordsByUrl(url, callback) {
        if (!url) {
            callback([]);
            return;
        }

        // 提取域名
        let domain = '';
        try {
            const urlObj = new URL(url);
            domain = urlObj.hostname;
        } catch (e) {
            domain = url;
        }

        getAllPasswords(function(passwords) {
            const matches = passwords.filter(pwd => {
                try {
                    const pwdUrl = new URL(pwd.url);
                    return pwdUrl.hostname === domain ||
                           pwd.url.includes(domain) ||
                           domain.includes(pwdUrl.hostname);
                } catch (e) {
                    return pwd.url.includes(domain);
                }
            });

            // 按最后使用时间排序
            matches.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

            callback(matches);
        });
    }

    /**
     * 从CSV导入密码
     * Chrome密码格式：name,url,username,password,note
     */
    function importFromCSV(csvText, callback) {
        debugLog('开始导入CSV，总长度:', csvText.length);

        // 检查CSV编码并转换
        let processedCsv = csvText;
        try {
            // 尝试检测BOM并处理UTF-8编码
            if (csvText.charCodeAt(0) === 0xFEFF) {
                processedCsv = csvText.substring(1); // 移除BOM
                debugLog('检测到UTF-8 BOM，已移除');
            }
        } catch (e) {
            debugWarn('CSV编码检测失败，使用原始文本:', e);
        }

        const lines = processedCsv.split('\n');
        const passwords = [];
        let successCount = 0;
        let errorCount = 0;

        // 跳过标题行
        let startIndex = 0;
        if (lines.length > 0) {
            const firstLine = lines[0].toLowerCase().trim();
            if (firstLine.startsWith('name') || firstLine.includes('url')) {
                startIndex = 1;
                debugLog('跳过标题行:', lines[0].substring(0, 50));
            }
        }

        debugLog('开始解析CSV行，总行数:', lines.length, '从第', startIndex, '行开始');

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                debugLog('第', i, '行为空，跳过');
                continue;
            }

            // 解析CSV行（处理引号包裹的字段）
            const matches = parseCSVLine(line);
            debugLog('第', i, '行解析结果字段数:', matches ? matches.length : 0);

            if (matches && matches.length >= 4) {
                const name = matches[0] || '';
                const url = matches[1] || '';
                const username = matches[2] || '';
                const password = matches[3] || '';
                const note = matches[4] || '';

                debugLog('解析密码项:', {
                    name: name || '(空)',
                    url: url || '(空)',
                    username: username || '(空)',
                    password: password ? '***(' + password.length + '字符)' : '(空)',
                    note: note || '(空)'
                });

                // 验证必要字段（改进：检查字段长度而不是简单的truthy）
                const hasUrl = url && url.length > 0 && url.trim().length > 0;
                const hasUsername = username && username.length > 0 && username.trim().length > 0;
                const hasPassword = password && password.length > 0 && password.trim().length > 0;

                if (hasUrl && hasUsername && hasPassword) {
                    passwords.push({
                        name: name || extractDomain(url),
                        url: url,
                        username: username,
                        password: password,
                        note: note
                    });
                    debugLog('✅ 添加密码项:', name, url, username);
                } else {
                    debugWarn('⚠️ 跳过无效行，缺少必要字段');
                    debugWarn('  - URL有效:', hasUrl, '值:', url ? url.substring(0, 50) : '(空)');
                    debugWarn('  - Username有效:', hasUsername, '值:', username ? username.substring(0, 50) : '(空)');
                    debugWarn('  - Password有效:', hasPassword, '长度:', password ? password.length : 0);
                    debugWarn('  - 原始行前100字符:', line.substring(0, 100));
                    errorCount++;
                }
            } else {
                debugWarn('❌ 无法解析CSV行，字段数不足');
                debugWarn('  行内容:', line.substring(0, 100));
                debugWarn('  解析结果字段数:', matches ? matches.length : 0);
                debugWarn('  解析结果:', matches);
                errorCount++;
            }
        }

        debugLog('CSV解析完成，找到', passwords.length, '个有效密码，跳过', errorCount, '个无效行');

        // 去重逻辑
        getEncryptionKey(function(key) {
            chrome.storage.local.get([STORAGE_KEY], function(result) {
                const existingPasswords = result[STORAGE_KEY] || [];
                debugLog('数据库中已有', existingPasswords.length, '个密码');

                // 创建已存在密码的集合（基于URL+用户名）
                const existingKeys = new Set();
                existingPasswords.forEach(function(pwd) {
                    const key = pwd.url + '|' + pwd.username;
                    existingKeys.add(key);
                });

                // 去除CSV内部的重复，并且过滤掉数据库中已存在的
                const uniquePasswords = [];
                const seenInCSV = new Set();

                passwords.forEach(function(pwd) {
                    const key = pwd.url + '|' + pwd.username;

                    // 检查CSV内部是否重复
                    if (!seenInCSV.has(key)) {
                        seenInCSV.add(key);

                        // 检查数据库中是否已存在
                        if (!existingKeys.has(key)) {
                            uniquePasswords.push(pwd);
                        } else {
                            debugLog('跳过已存在的密码:', pwd.name, pwd.url, pwd.username);
                        }
                    } else {
                        debugLog('跳过CSV中的重复密码:', pwd.name, pwd.url, pwd.username);
                    }
                });

                debugLog('最终要保存的密码数量:', uniquePasswords.length, '(CSV原:', passwords.length, ', 去重:', passwords.length - uniquePasswords.length, ')');

                if (uniquePasswords.length === 0) {
                    debugWarn('没有新的密码需要导入');
                    callback(0, 0);
                    return;
                }

                debugLog('开始队列保存', uniquePasswords.length, '个新密码（避免竞争条件）');

                // 使用队列机制逐个保存，避免竞争条件
                let currentIndex = 0;

                function saveNext() {
                    if (currentIndex >= uniquePasswords.length) {
                        debugLog('🎉 所有密码保存完成:', successCount, '成功,', errorCount, '失败');
                        callback(successCount, errorCount);
                        return;
                    }

                    const pwd = uniquePasswords[currentIndex];
                    debugLog('保存密码', currentIndex + 1, '/', uniquePasswords.length, ':', pwd.name, pwd.url, pwd.username);

                    // 使用forceAdd=true确保不会因为重复检查而丢失密码
                    savePassword(pwd, function(success, data) {
                        debugLog('密码保存结果:', success, data ? data.name : 'null');

                        if (success) {
                            successCount++;
                            debugLog('✅ 成功保存密码', successCount, '/', uniquePasswords.length);
                        } else {
                            errorCount++;
                            debugError('❌ 保存密码失败', errorCount);
                        }

                        currentIndex++;
                        // 保存下一个，添加小延迟避免过度压力
                        setTimeout(saveNext, 10);
                    }, true); // forceAdd=true
                }

                // 开始队列保存
                saveNext();
            });
        });
    }

    /**
     * 解析CSV行（改进版，更好地处理编码和空格）
     */
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // 两个连续的引号表示一个引号字符
                    current += '"';
                    i++;
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // 逗号分隔字段（不在引号内）
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // 添加最后一个字段
        result.push(current);

        // 去除每个字段的首尾空格
        return result.map(function(field) {
            return field.trim();
        });
    }

    /**
     * 导出密码为CSV
     */
    function exportToCSV(callback) {
        getAllPasswords(function(passwords) {
            let csv = 'name,url,username,password,note\n';

            passwords.forEach(function(pwd) {
                // 转义包含逗号或引号的字段
                const escapeField = function(text) {
                    if (!text) return '';
                    text = text.toString();
                    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                        return '"' + text.replace(/"/g, '""') + '"';
                    }
                    return text;
                };

                csv += escapeField(pwd.name) + ',';
                csv += escapeField(pwd.url) + ',';
                csv += escapeField(pwd.username) + ',';
                csv += escapeField(pwd.password) + ',';
                csv += escapeField(pwd.note) + '\n';
            });

            callback(csv);
        });
    }

    /**
     * 清除所有密码
     */
    function clearAllPasswords(callback) {
        chrome.storage.local.set({[STORAGE_KEY]: []}, function() {
            if (callback) callback(true);
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

    // 公开API
    return {
        getAllPasswords: getAllPasswords,
        savePassword: savePassword,
        deletePassword: deletePassword,
        findPasswordsByUrl: findPasswordsByUrl,
        importFromCSV: importFromCSV,
        exportToCSV: exportToCSV,
        clearAllPasswords: clearAllPasswords
    };
})();
