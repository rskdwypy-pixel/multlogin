/**
 * Popup JavaScript for Password Manager
 * 密码管理器弹出窗口脚本
 */

(function() {
    'use strict';

    // 全局变量
    let allPasswords = [];
    let filteredPasswords = [];

    // 页面加载完成后初始化
    document.addEventListener('DOMContentLoaded', function() {
        initTabs();
        loadPasswords();
        setupEventListeners();
        loadSettings();
    });

    /**
     * 初始化标签切换
     */
    function initTabs() {
        const tabs = document.querySelectorAll('.tab');
        const sections = document.querySelectorAll('.section');

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const targetTab = this.dataset.tab;

                // 更新标签激活状态
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                // 显示对应的内容区域
                sections.forEach(section => {
                    section.classList.remove('active');
                    if (section.id === targetTab + '-section') {
                        section.classList.add('active');
                    }
                });

                // 如果切换到密码库标签，重新加载密码
                if (targetTab === 'passwords') {
                    loadPasswords();
                }
            });
        });
    }

    /**
     * 设置事件监听器
     */
    function setupEventListeners() {
        // 搜索功能
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', handleSearch);

        // 导入功能
        document.getElementById('import-btn').addEventListener('click', handleImport);
        document.getElementById('load-file-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', handleFileLoad);

        // 导出功能
        document.getElementById('export-btn').addEventListener('click', handleExport);
        document.getElementById('copy-btn').addEventListener('click', handleCopy);

        // 设置功能
        document.getElementById('auto-fill-enabled').addEventListener('change', (e) => {
            saveSetting('pm_autoFill', e.target.checked);
        });
        document.getElementById('auto-save-enabled').addEventListener('change', (e) => {
            saveSetting('pm_autoSave', e.target.checked);
        });
        document.getElementById('notifications-enabled').addEventListener('change', (e) => {
            saveSetting('pm_showNotifications', e.target.checked);
        });
        document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);

        // 调试功能
        document.getElementById('check-storage-btn').addEventListener('click', handleCheckStorage);
        document.getElementById('check-decrypt-btn').addEventListener('click', handleCheckDecrypt);
    }

    /**
     * 加载密码列表
     */
    function loadPasswords() {
        console.log('开始加载密码列表');
        showLoading(true);

        chrome.runtime.sendMessage({
            action: 'getAllPasswords'
        }, function(response) {
            console.log('密码列表响应:', response);
            showLoading(false);

            if (response && response.success && response.passwords) {
                console.log('成功加载', response.passwords.length, '个密码');
                allPasswords = response.passwords;
                filteredPasswords = allPasswords;
                updateStats();
                displayPasswords(filteredPasswords);
            } else {
                console.error('加载密码失败:', response);
                showAlert('加载密码失败: ' + (response ? response.error : '未知错误'), 'error');
            }
        });
    }

    /**
     * 显示密码列表
     */
    function displayPasswords(passwords) {
        const listContainer = document.getElementById('passwords-list');

        if (!passwords || passwords.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔐</div>
                    <div class="empty-state-text">没有保存的密码</div>
                    <div class="empty-state-subtext">前往"导入/导出"标签导入你的密码</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        passwords.forEach(pwd => {
            const item = document.createElement('div');
            item.className = 'password-item';

            item.innerHTML = `
                <div class="password-item-header">
                    <div>
                        <div class="password-item-name">${escapeHtml(pwd.name)}</div>
                        <div class="password-item-domain">${escapeHtml(pwd.url)}</div>
                    </div>
                </div>
                <div class="password-item-detail">
                    <strong>用户名:</strong> ${escapeHtml(pwd.username)}
                </div>
                <div class="password-item-detail">
                    <strong>密码:</strong> <span class="password-display" data-id="${pwd.id}">••••••••</span>
                </div>
                <div class="password-actions">
                    <button class="btn btn-primary btn-small show-password-btn" data-id="${pwd.id}">👁️ 显示密码</button>
                    <button class="btn btn-secondary btn-small copy-username-btn" data-username="${escapeHtml(pwd.username)}">📋 复制用户名</button>
                    <button class="btn btn-secondary btn-small copy-password-btn" data-id="${pwd.id}">📋 复制密码</button>
                    <button class="btn btn-danger btn-small delete-btn" data-id="${pwd.id}">🗑️ 删除</button>
                </div>
            `;

            // 添加事件监听器
            const showPasswordBtn = item.querySelector('.show-password-btn');
            const passwordDisplay = item.querySelector('.password-display');
            let passwordVisible = false;

            showPasswordBtn.addEventListener('click', function() {
                passwordVisible = !passwordVisible;
                if (passwordVisible) {
                    passwordDisplay.textContent = pwd.password;
                    showPasswordBtn.textContent = '🙈 隐藏密码';
                } else {
                    passwordDisplay.textContent = '••••••••';
                    showPasswordBtn.textContent = '👁️ 显示密码';
                }
            });

            item.querySelector('.copy-username-btn').addEventListener('click', function() {
                copyToClipboard(pwd.username);
                showAlert('用户名已复制', 'success');
            });

            item.querySelector('.copy-password-btn').addEventListener('click', function() {
                copyToClipboard(pwd.password);
                showAlert('密码已复制', 'success');
            });

            item.querySelector('.delete-btn').addEventListener('click', function() {
                if (confirm('确定要删除这个密码吗？')) {
                    deletePassword(pwd.id, pwd.username);
                }
            });

            listContainer.appendChild(item);
        });
    }

    /**
     * 更新统计信息
     */
    function updateStats() {
        const totalPasswords = allPasswords.length;
        const uniqueDomains = new Set(allPasswords.map(p => {
            try {
                return new URL(p.url).hostname;
            } catch (e) {
                return p.url;
            }
        })).size;

        document.getElementById('total-passwords').textContent = totalPasswords;
        document.getElementById('total-domains').textContent = uniqueDomains;
    }

    /**
     * 处理搜索
     */
    function handleSearch() {
        const searchTerm = this.value.toLowerCase();

        filteredPasswords = allPasswords.filter(pwd =>
            (pwd.name && pwd.name.toLowerCase().includes(searchTerm)) ||
            (pwd.url && pwd.url.toLowerCase().includes(searchTerm)) ||
            (pwd.username && pwd.username.toLowerCase().includes(searchTerm))
        );

        displayPasswords(filteredPasswords);
    }

    /**
     * 处理导入
     */
    function handleImport() {
        const csv = document.getElementById('import-text').value.trim();

        if (!csv) {
            showAlert('请输入要导入的CSV数据', 'error');
            return;
        }

        console.log('开始导入，CSV长度:', csv.length);

        const importBtn = document.getElementById('import-btn');
        importBtn.disabled = true;
        importBtn.textContent = '导入中...';

        chrome.runtime.sendMessage({
            action: 'importFromCSV',
            csv: csv
        }, function(response) {
            importBtn.disabled = false;
            importBtn.textContent = '导入密码';

            console.log('导入响应:', response);

            if (response && response.success) {
                const successCount = response.successCount || 0;
                const errorCount = response.errorCount || 0;

                console.log('导入完成:', successCount, '成功,', errorCount, '失败');

                if (errorCount > 0) {
                    showAlert(`成功导入 ${successCount} 个密码，失败 ${errorCount} 个`, 'info');
                } else {
                    showAlert(`成功导入 ${successCount} 个密码！`, 'success');
                }

                document.getElementById('import-text').value = '';

                // 延迟刷新，确保存储完成
                setTimeout(function() {
                    console.log('开始刷新密码列表');
                    loadPasswords();
                }, 500);
            } else {
                console.error('导入失败:', response);
                showAlert('导入失败: ' + (response ? response.error : '未知错误'), 'error');
            }
        });
    }

    /**
     * 处理文件加载
     */
    function handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('import-text').value = e.target.result;
        };
        reader.readAsText(file);

        // 重置文件输入
        e.target.value = '';
    }

    /**
     * 处理导出
     */
    function handleExport() {
        const exportBtn = document.getElementById('export-btn');
        exportBtn.disabled = true;
        exportBtn.textContent = '导出中...';

        chrome.runtime.sendMessage({
            action: 'exportToCSV'
        }, function(response) {
            exportBtn.disabled = false;
            exportBtn.textContent = '导出密码';

            if (response && response.success && response.csv) {
                const csv = response.csv;
                const exportText = document.getElementById('export-text');
                exportText.value = csv;
                exportText.classList.remove('hidden');

                // 下载文件
                downloadCSV(csv);

                showAlert('密码已导出', 'success');
            } else {
                showAlert('导出失败', 'error');
            }
        });
    }

    /**
     * 下载CSV文件
     */
    function downloadCSV(csv) {
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Chrome 密码.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 处理复制
     */
    function handleCopy() {
        const exportText = document.getElementById('export-text');

        if (!exportText.value) {
            showAlert('请先导出密码', 'error');
            return;
        }

        copyToClipboard(exportText.value);
        showAlert('已复制到剪贴板', 'success');
    }

    /**
     * 删除密码
     */
    function deletePassword(id, username) {
        chrome.runtime.sendMessage({
            action: 'deletePassword',
            id: id
        }, function(response) {
            if (response && response.success) {
                showAlert(`已删除 ${username} 的密码`, 'success');
                loadPasswords();
            } else {
                showAlert('删除失败', 'error');
            }
        });
    }

    /**
     * 处理清除所有密码
     */
    function handleClearAll() {
        if (!confirm('确定要清除所有保存的密码吗？此操作不可撤销！')) {
            return;
        }

        if (!confirm('最后确认：这将删除所有密码，无法恢复！')) {
            return;
        }

        chrome.runtime.sendMessage({
            action: 'clearAllPasswords'
        }, function(response) {
            if (response && response.success) {
                showAlert('所有密码已清除', 'success');
                loadPasswords();
            } else {
                showAlert('清除失败', 'error');
            }
        });
    }

    /**
     * 加载设置
     */
    function loadSettings() {
        chrome.storage.local.get([
            'pm_autoFill',
            'pm_autoSave',
            'pm_showNotifications'
        ], function(result) {
            document.getElementById('auto-fill-enabled').checked = result.pm_autoFill !== false;
            document.getElementById('auto-save-enabled').checked = result.pm_autoSave !== false;
            document.getElementById('notifications-enabled').checked = result.pm_showNotifications !== false;
        });
    }

    /**
     * 保存设置
     */
    function saveSetting(key, value) {
        chrome.storage.local.set({[key]: value}, function() {
            console.log('设置已保存:', key, value);
        });
    }

    /**
     * 显示加载状态
     */
    function showLoading(show) {
        const loading = document.getElementById('passwords-loading');
        const list = document.getElementById('passwords-list');

        if (show) {
            loading.classList.remove('hidden');
            list.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
            list.classList.remove('hidden');
        }
    }

    /**
     * 显示提示信息
     */
    function showAlert(message, type = 'info') {
        const container = document.getElementById('alert-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;

        container.appendChild(alert);

        // 3秒后自动消失
        setTimeout(() => {
            alert.remove();
        }, 3000);
    }

    /**
     * 复制到剪贴板
     */
    function copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    /**
     * HTML转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 检查原始存储数据
     */
    function handleCheckStorage() {
        chrome.storage.local.get('pm_passwords', function(result) {
            const passwords = result.pm_passwords || [];

            let html = '<div style="margin: 15px 0;">';
            html += '<strong>原始存储数据检查：</strong><br>';
            html += '总密码数: <strong>' + passwords.length + '</strong><br><br>';

            if (passwords.length === 0) {
                html += '⚠️ 存储中没有密码！';
            } else {
                html += '<strong>前20个密码：</strong><br>';

                passwords.slice(0, 20).forEach((pwd, index) => {
                    html += '<div style="background: #f8f9fa; padding: 8px; margin: 5px 0; border-radius: 4px; font-size: 12px;">';
                    html += '<strong>#' + (index + 1) + '</strong><br>';
                    html += 'ID: ' + pwd.id + '<br>';
                    html += '名称: ' + escapeHtml(pwd.name) + '<br>';
                    html += 'URL: ' + escapeHtml(pwd.url) + '<br>';
                    html += '用户名: ' + escapeHtml(pwd.username) + '<br>';
                    html += '加密密码长度: ' + (pwd.password ? pwd.password.length : 0) + '<br>';
                    html += '是否加密: ' + (pwd.encrypted ? '是' : '否');
                    html += '</div>';
                });

                if (passwords.length > 20) {
                    html += '<br>... 还有 ' + (passwords.length - 20) + ' 个密码';
                }
            }

            html += '</div>';
            document.getElementById('debug-result').innerHTML = html;
        });
    }

    /**
     * 检查解密状态
     */
    function handleCheckDecrypt() {
        chrome.runtime.sendMessage({
            action: 'getAllPasswords'
        }, function(response) {
            let html = '<div style="margin: 15px 0;">';
            html += '<strong>解密状态检查：</strong><br>';

            if (response && response.success && response.passwords) {
                html += '总密码数: <strong>' + response.passwords.length + '</strong><br><br>';

                let successCount = 0;
                let failCount = 0;

                response.passwords.slice(0, 20).forEach((pwd, index) => {
                    if (pwd.password && pwd.password.length > 0) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                });

                html += '解密成功: <strong style="color: #10b981;">' + successCount + '</strong><br>';
                html += '解密失败: <strong style="color: #ef4444;">' + failCount + '</strong><br><br>';

                html += '<strong>前20个密码详情：</strong><br>';

                response.passwords.slice(0, 20).forEach((pwd, index) => {
                    const status = pwd.password && pwd.password.length > 0 ?
                        '<span style="color: #10b981;">✅ 成功</span>' :
                        '<span style="color: #ef4444;">❌ 失败</span>';

                    html += '<div style="background: #f8f9fa; padding: 8px; margin: 5px 0; border-radius: 4px; font-size: 12px;">';
                    html += '<strong>#' + (index + 1) + '</strong> ' + status + '<br>';
                    html += '名称: ' + escapeHtml(pwd.name) + '<br>';
                    html += 'URL: ' + escapeHtml(pwd.url) + '<br>';
                    html += '用户名: ' + escapeHtml(pwd.username) + '<br>';
                    html += '密码: ' + (pwd.password ? '*** (' + pwd.password.length + '字符)' : '(解密失败)');
                    html += '</div>';
                });

                if (response.passwords.length > 20) {
                    html += '<br>... 还有 ' + (response.passwords.length - 20) + ' 个密码';
                }
            } else {
                html += '<span style="color: #ef4444;">❌ 无法获取密码</span>';
            }

            html += '</div>';
            document.getElementById('debug-result').innerHTML = html;
        });
    }

})();
