/**
 * ============================================
 *  Follow Analyzer - Core Application Logic
 * ============================================
 *  تحلیل فالوورها و فالووینگ‌های اینستاگرام
 *  بر اساس فایل‌های JSON خروجی اکانت
 * 
 *  ویژگی‌ها:
 *   - پارس و مقایسه خودکار فایل‌ها
 *   - ذخیره‌سازی محلی (localStorage)
 *   - خروجی PNG با html2canvas
 *   - دراگ اند دراپ فایل
 *   - جستجو در لیست
 * ============================================
 */

(function () {
    'use strict';

    /* ----------------------------------------- */
    /* متغیرهای سراسری و نگهداری وضعیت            */
    /* ----------------------------------------- */

    /** @type {Array} لیست یوزرنیم‌های فالوورها */
    let followersData = [];

    /** @type {Array} لیست یوزرنیم‌های فالووینگ‌ها */
    let followingData = [];

    /** @type {Object} نتایج تحلیل */
    let analysisResults = {
        notFollowingBack: [],  // فالوبک نکرده‌ها
        mutual: [],            // دوطرفه
        fans: []               // فن‌ها (ما فالو نکردیم ولی فالومون کردن)
    };

    /** @type {string} تب فعال فعلی */
    let currentTab = 'not-following-back';

    /* ----------------------------------------- */
    /* ارجاع به المنت‌های DOM                      */
    /* ----------------------------------------- */
    const DOM = {
        followersInput: document.getElementById('followers-input'),
        followingInput: document.getElementById('following-input'),
        followersDropZone: document.getElementById('followers-drop-zone'),
        followingDropZone: document.getElementById('following-drop-zone'),
        followersStatus: document.getElementById('followers-status'),
        followingStatus: document.getElementById('following-status'),
        followersCard: document.getElementById('followers-upload-card'),
        followingCard: document.getElementById('following-upload-card'),
        analyzeBtn: document.getElementById('analyze-btn'),
        clearBtn: document.getElementById('clear-btn'),
        exportBtn: document.getElementById('export-btn'),
        resultsSection: document.getElementById('results-section'),
        statsContainer: document.getElementById('stats-container'),
        searchInput: document.getElementById('search-input'),
        // آمار
        statFollowers: document.getElementById('stat-followers'),
        statFollowing: document.getElementById('stat-following'),
        statNotBack: document.getElementById('stat-not-back'),
        statMutual: document.getElementById('stat-mutual'),
        statFans: document.getElementById('stat-fans'),
        statRatio: document.getElementById('stat-ratio'),
        // لیست‌ها
        listNotFollowingBack: document.getElementById('list-not-following-back'),
        listMutual: document.getElementById('list-mutual'),
        listFans: document.getElementById('list-fans')
    };

    /* ----------------------------------------- */
    /* مقداردهی اولیه (Initialize)                 */
    /* ----------------------------------------- */
    function init() {
        _loadFromStorage();
        _bindEvents();
        _updateButtonStates();

        // اگه قبلاً نتایجی بود نشونشون بده
        if (followersData.length > 0 && followingData.length > 0) {
            _runAnalysis();
        }
    }

    /* ----------------------------------------- */
    /* بایند کردن ایونت‌ها                          */
    /* ----------------------------------------- */
    function _bindEvents() {
        // ایونت آپلود فایل فالوورها
        DOM.followersInput.addEventListener('change', function (e) {
            _handleFileUpload(e.target.files[0], 'followers');
        });

        // ایونت آپلود فایل فالووینگ‌ها
        DOM.followingInput.addEventListener('change', function (e) {
            _handleFileUpload(e.target.files[0], 'following');
        });

        // دراگ اند دراپ برای فالوورها
        _setupDropZone(DOM.followersDropZone, DOM.followersInput, 'followers');

        // دراگ اند دراپ برای فالووینگ‌ها
        _setupDropZone(DOM.followingDropZone, DOM.followingInput, 'following');

        // دکمه تحلیل
        DOM.analyzeBtn.addEventListener('click', function () {
            _showLoading('در حال تحلیل... 🔍');
            // کمی تأخیر برای نمایش لودینگ
            setTimeout(function () {
                _runAnalysis();
                _hideLoading();
                _showToast('تحلیل انجام شد! حالا ببین کیا بی‌معرفتن 😈', 'success');
            }, 800);
        });

        // دکمه پاک کردن
        DOM.clearBtn.addEventListener('click', _clearAll);

        // دکمه خروجی PNG
        DOM.exportBtn.addEventListener('click', _exportPNG);

        // تب‌ها
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _switchTab(this.dataset.tab);
            });
        });

        // جستجو
        DOM.searchInput.addEventListener('input', _handleSearch);
    }

    /* ----------------------------------------- */
    /* مدیریت دراگ اند دراپ                        */
    /* ----------------------------------------- */

    /**
     * راه‌اندازی ناحیه دراگ اند دراپ
     * @param {HTMLElement} dropZone - المنت ناحیه دراپ
     * @param {HTMLInputElement} fileInput - ورودی فایل
     * @param {string} type - نوع فایل (followers یا following)
     */
    function _setupDropZone(dropZone, fileInput, type) {
        // جلوگیری از رفتار پیشفرض مرورگر
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (eventName) {
            dropZone.addEventListener(eventName, function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // افکت هاور هنگام دراگ
        ['dragenter', 'dragover'].forEach(function (eventName) {
            dropZone.addEventListener(eventName, function () {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(function (eventName) {
            dropZone.addEventListener(eventName, function () {
                dropZone.classList.remove('drag-over');
            });
        });

        // مدیریت دراپ فایل
        dropZone.addEventListener('drop', function (e) {
            var files = e.dataTransfer.files;
            if (files.length > 0) {
                _handleFileUpload(files[0], type);
            }
        });
    }

    /* ----------------------------------------- */
    /* مدیریت آپلود و پارس فایل                    */
    /* ----------------------------------------- */

    /**
     * پردازش فایل آپلود شده
     * @param {File} file - فایل JSON
     * @param {string} type - نوع (followers | following)
     */
    function _handleFileUpload(file, type) {
        // بررسی اینکه فایل JSON باشه
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            _showToast('فقط فایل JSON قبول میکنم! 🙅‍♂️', 'error');
            return;
        }

        var reader = new FileReader();

        reader.onload = function (e) {
            try {
                var jsonData = JSON.parse(e.target.result);
                var usernames = _extractUsernames(jsonData, type);

                if (usernames.length === 0) {
                    _showToast('فایل خالیه یا فرمتش درست نیست! 🤔', 'error');
                    return;
                }

                // ذخیره داده‌ها
                if (type === 'followers') {
                    followersData = usernames;
                    _updateFileStatus('followers', file.name, usernames.length);
                    _saveToStorage('followers', usernames);
                } else {
                    followingData = usernames;
                    _updateFileStatus('following', file.name, usernames.length);
                    _saveToStorage('following', usernames);
                }

                _updateButtonStates();
                _showToast(
                    type === 'followers'
                        ? 'فایل فالوورها لود شد! ' + usernames.length + ' نفر 👥'
                        : 'فایل فالووینگ‌ها لود شد! ' + usernames.length + ' نفر 👤',
                    'success'
                );

            } catch (err) {
                console.error('JSON Parse Error:', err);
                _showToast('خطا در خوندن فایل! مطمئنی JSON معتبره؟ 😵', 'error');
            }
        };

        reader.onerror = function () {
            _showToast('خطا در خوندن فایل! 😢', 'error');
        };

        reader.readAsText(file);
    }

    /**
     * استخراج یوزرنیم‌ها از ساختار JSON اینستاگرام
     * اینستاگرام فرمت‌های مختلفی داره، این تابع همه رو ساپورت میکنه
     * 
     * @param {Object|Array} data - داده JSON
     * @param {string} type - نوع فایل
     * @returns {Array<string>} آرایه یوزرنیم‌ها
     */
    function _extractUsernames(data, type) {
        var usernames = [];

        try {
            /**
             * فرمت جدید اینستاگرام (2024+):
             * followers_1.json => آرایه‌ای از آبجکت‌هایی با string_list_data
             * following.json => { relationships_following: [...] }
             */

            // ── فرمت 1: آرایه مستقیم (followers_1.json) ──
            if (Array.isArray(data)) {
                data.forEach(function (item) {
                    var name = _digUsername(item);
                    if (name) usernames.push(name);
                });
            }
            // ── فرمت 2: آبجکت با کلید relationships_following ──
            else if (data.relationships_following) {
                var list = data.relationships_following;
                if (Array.isArray(list)) {
                    list.forEach(function (item) {
                        var name = _digUsername(item);
                        if (name) usernames.push(name);
                    });
                }
            }
            // ── فرمت 3: آبجکت با کلید‌های دیگه ──
            else if (typeof data === 'object') {
                // سعی میکنیم از هر ساختاری یوزرنیم دربیاریم
                var keys = Object.keys(data);
                keys.forEach(function (key) {
                    if (Array.isArray(data[key])) {
                        data[key].forEach(function (item) {
                            var name = _digUsername(item);
                            if (name) usernames.push(name);
                        });
                    }
                });
            }
        } catch (err) {
            console.error('Extract error:', err);
        }

        // حذف موارد تکراری
        return _unique(usernames);
    }

    /**
     * استخراج یوزرنیم از یک آیتم منفرد
     * سازگار با ساختارهای مختلف JSON اینستاگرام
     * 
     * @param {Object} item - یک آیتم از آرایه
     * @returns {string|null} یوزرنیم یا null
     */
    function _digUsername(item) {
        if (!item) return null;

        // ساختار string_list_data (رایج‌ترین)
        if (item.string_list_data && Array.isArray(item.string_list_data)) {
            for (var i = 0; i < item.string_list_data.length; i++) {
                if (item.string_list_data[i].value) {
                    return item.string_list_data[i].value.toLowerCase().trim();
                }
            }
        }

        // ساختار ساده با value
        if (item.value) {
            return item.value.toLowerCase().trim();
        }

        // ساختار با username
        if (item.username) {
            return item.username.toLowerCase().trim();
        }

        // ساختار با name
        if (item.name) {
            return item.name.toLowerCase().trim();
        }

        // ساختار href (بعضی نسخه‌ها لینک میدن)
        if (item.href || (item.string_list_data && item.string_list_data[0] && item.string_list_data[0].href)) {
            var href = item.href || item.string_list_data[0].href;
            // استخراج یوزرنیم از URL
            var match = href.match(/instagram\.com\/([^\/\?]+)/);
            if (match) return match[1].toLowerCase().trim();
        }

        return null;
    }

    /* ----------------------------------------- */
    /* منطق تحلیل و مقایسه                        */
    /* ----------------------------------------- */

    /**
     * اجرای تحلیل اصلی
     * مقایسه فالوورها و فالووینگ‌ها
     */
    function _runAnalysis() {
        if (followersData.length === 0 || followingData.length === 0) return;

        // ساخت Set از فالوورها برای جستجوی سریع O(1)
        var followersSet = new Set(followersData);
        var followingSet = new Set(followingData);

        // ── کسایی که فالوشون کردیم ولی فالوبک نکردن ──
        // (توی فالووینگ هستن ولی توی فالوور نیستن)
        analysisResults.notFollowingBack = followingData.filter(function (username) {
            return !followersSet.has(username);
        }).sort();

        // ── فالو دوطرفه ──
        // (هم فالو کردیم هم فالومون کرده)
        analysisResults.mutual = followingData.filter(function (username) {
            return followersSet.has(username);
        }).sort();

        // ── فن‌ها ──
        // (فالومون کرده ولی ما فالوش نکردیم)
        analysisResults.fans = followersData.filter(function (username) {
            return !followingSet.has(username);
        }).sort();

        // نمایش نتایج
        _displayResults();

        // ذخیره نتایج
        _saveToStorage('results', analysisResults);
    }

    /* ----------------------------------------- */
    /* نمایش نتایج                                 */
    /* ----------------------------------------- */

    /**
     * نمایش نتایج تحلیل شامل آمار و لیست‌ها
     */
    function _displayResults() {
        // نمایش بخش نتایج
        DOM.resultsSection.style.display = 'block';

        // محاسبه و نمایش آمار
        var followersCount = followersData.length;
        var followingCount = followingData.length;
        var notBackCount = analysisResults.notFollowingBack.length;
        var mutualCount = analysisResults.mutual.length;
        var fansCount = analysisResults.fans.length;

        // نرخ فالوبک: چند درصد از فالووینگ‌ها فالوبک کردن
        var ratio = followingCount > 0
            ? Math.round((mutualCount / followingCount) * 100)
            : 0;

        // انیمیشن شمارنده اعداد
        _animateCounter(DOM.statFollowers, followersCount);
        _animateCounter(DOM.statFollowing, followingCount);
        _animateCounter(DOM.statNotBack, notBackCount);
        _animateCounter(DOM.statMutual, mutualCount);
        _animateCounter(DOM.statFans, fansCount);
        _animateCounter(DOM.statRatio, ratio, '%');

        // پر کردن لیست‌ها
        _renderList(DOM.listNotFollowingBack, analysisResults.notFollowingBack, '💔');
        _renderList(DOM.listMutual, analysisResults.mutual, '🤝');
        _renderList(DOM.listFans, analysisResults.fans, '🌟');

        // فعال کردن دکمه خروجی
        DOM.exportBtn.disabled = false;

        // اسکرول به نتایج
        setTimeout(function () {
            DOM.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    /**
     * رندر لیست کاربرها
     * @param {HTMLElement} container - المنت کانتینر
     * @param {Array<string>} usernames - آرایه یوزرنیم‌ها
     * @param {string} emoji - ایموجی تزئینی
     */
    function _renderList(container, usernames, emoji) {
        container.innerHTML = '';

        if (usernames.length === 0) {
            container.innerHTML =
                '<div class="empty-message">' +
                    '<span class="empty-icon">🎉</span>' +
                    '<p>لیست خالیه! خبر خوبه</p>' +
                '</div>';
            return;
        }

        // ساخت fragment برای performance بهتر
        var fragment = document.createDocumentFragment();

        usernames.forEach(function (username, index) {
            var item = document.createElement('div');
            item.className = 'user-item';
            item.dataset.username = username;

            // رنگ آواتار تصادفی ولی ثابت برای هر یوزرنیم
            var avatarClass = 'avatar-' + ((username.charCodeAt(0) % 6) + 1);
            var initial = username.charAt(0).toUpperCase();

            item.innerHTML =
                '<div class="user-info">' +
                    '<div class="user-avatar ' + avatarClass + '">' + initial + '</div>' +
                    '<div>' +
                        '<div class="user-name">@' + _escapeHtml(username) + '</div>' +
                        '<a href="https://instagram.com/' + _escapeHtml(username) + '" target="_blank" rel="noopener noreferrer" class="insta-link">' +
                            '↗ پروفایل اینستاگرام' +
                        '</a>' +
                    '</div>' +
                '</div>' +
                '<span class="user-index">' + (index + 1) + '</span>';

            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    /* ----------------------------------------- */
    /* انیمیشن شمارنده اعداد                       */
    /* ----------------------------------------- */

    /**
     * انیمیشن شمارش اعداد از 0 تا مقدار مشخص
     * @param {HTMLElement} element - المنت نمایش عدد
     * @param {number} target - عدد هدف
     * @param {string} [suffix=''] - پسوند (مثلاً %)
     */
    function _animateCounter(element, target, suffix) {
        suffix = suffix || '';
        var current = 0;
        var duration = 1200; // میلی‌ثانیه
        var stepTime = 16; // تقریباً 60fps
        var steps = Math.ceil(duration / stepTime);
        var increment = target / steps;

        var timer = setInterval(function () {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = Math.round(current) + suffix;
        }, stepTime);
    }

    /* ----------------------------------------- */
    /* مدیریت تب‌ها                                */
    /* ----------------------------------------- */

    /**
     * تغییر تب فعال
     * @param {string} tabId - آیدی تب
     */
    function _switchTab(tabId) {
        currentTab = tabId;

        // آپدیت دکمه‌های تب
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // آپدیت محتوای تب
        document.querySelectorAll('.tab-content').forEach(function (content) {
            content.classList.toggle('active', content.id === 'tab-' + tabId);
        });

        // ریست جستجو
        DOM.searchInput.value = '';
        _handleSearch();
    }

    /* ----------------------------------------- */
    /* جستجو در لیست                               */
    /* ----------------------------------------- */
    function _handleSearch() {
        var query = DOM.searchInput.value.toLowerCase().trim();
        var activeTabContent = document.querySelector('.tab-content.active');
        
        if (!activeTabContent) return;
        
        var items = activeTabContent.querySelectorAll('.user-item');

        items.forEach(function (item) {
            var username = item.dataset.username || '';
            var match = username.includes(query);
            item.style.display = match ? '' : 'none';
        });
    }

    /* ----------------------------------------- */
    /* بروزرسانی وضعیت فایل آپلود                  */
    /* ----------------------------------------- */

    /**
     * بروزرسانی نمایش وضعیت فایل آپلود شده
     * @param {string} type - نوع فایل
     * @param {string} fileName - نام فایل
     * @param {number} count - تعداد کاربرها
     */
    function _updateFileStatus(type, fileName, count) {
        var statusEl = type === 'followers' ? DOM.followersStatus : DOM.followingStatus;
        var cardEl = type === 'followers' ? DOM.followersCard : DOM.followingCard;

        statusEl.classList.add('loaded');
        statusEl.querySelector('.status-text').textContent =
            '✅ ' + fileName + ' (' + count + ' نفر)';

        cardEl.classList.add('loaded');
    }

    /* ----------------------------------------- */
    /* مدیریت وضعیت دکمه‌ها                        */
    /* ----------------------------------------- */
    function _updateButtonStates() {
        var bothLoaded = followersData.length > 0 && followingData.length > 0;
        DOM.analyzeBtn.disabled = !bothLoaded;
    }

    /* ----------------------------------------- */
    /* ذخیره‌سازی محلی (localStorage)               */
    /* ----------------------------------------- */

    /**
     * ذخیره داده در localStorage
     * @param {string} key - کلید
     * @param {*} data - داده
     */
    function _saveToStorage(key, data) {
        try {
            localStorage.setItem('fa_' + key, JSON.stringify(data));
        } catch (err) {
            console.warn('Storage save failed:', err);
        }
    }

    /**
     * بارگذاری داده‌ها از localStorage
     * تا بعد از ریفرش صفحه داده‌ها از دست نرن
     */
    function _loadFromStorage() {
        try {
            var storedFollowers = localStorage.getItem('fa_followers');
            var storedFollowing = localStorage.getItem('fa_following');

            if (storedFollowers) {
                followersData = JSON.parse(storedFollowers);
                _updateFileStatus('followers', 'از حافظه', followersData.length);
            }

            if (storedFollowing) {
                followingData = JSON.parse(storedFollowing);
                _updateFileStatus('following', 'از حافظه', followingData.length);
            }

        } catch (err) {
            console.warn('Storage load failed:', err);
        }
    }

    /* ----------------------------------------- */
    /* پاک کردن همه داده‌ها                        */
    /* ----------------------------------------- */
    function _clearAll() {
        // پاک کردن متغیرها
        followersData = [];
        followingData = [];
        analysisResults = { notFollowingBack: [], mutual: [], fans: [] };

        // پاک کردن localStorage
        localStorage.removeItem('fa_followers');
        localStorage.removeItem('fa_following');
        localStorage.removeItem('fa_results');

        // ریست وضعیت فایل‌ها
        ['followers', 'following'].forEach(function (type) {
            var statusEl = type === 'followers' ? DOM.followersStatus : DOM.followingStatus;
            var cardEl = type === 'followers' ? DOM.followersCard : DOM.followingCard;

            statusEl.classList.remove('loaded');
            statusEl.querySelector('.status-text').textContent = 'هنوز فایلی انتخاب نشده';
            cardEl.classList.remove('loaded');
        });

        // ریست ورودی فایل‌ها
        DOM.followersInput.value = '';
        DOM.followingInput.value = '';

        // مخفی کردن نتایج
        DOM.resultsSection.style.display = 'none';

        // غیرفعال کردن دکمه‌ها
        DOM.analyzeBtn.disabled = true;
        DOM.exportBtn.disabled = true;

        // ریست جستجو
        DOM.searchInput.value = '';

        _showToast('همه چی پاک شد! از اول شروع کن 🧹', 'info');
    }

    /* ----------------------------------------- */
    /* خروجی PNG                                   */
    /* ----------------------------------------- */
    function _exportPNG() {
        if (typeof html2canvas === 'undefined') {
            _showToast('کتابخانه html2canvas لود نشده! 😕', 'error');
            return;
        }

        _showLoading('در حال ساخت تصویر... 📸');

        // کمی تأخیر تا لودینگ نمایش داده بشه
        setTimeout(function () {
            html2canvas(DOM.resultsSection, {
                backgroundColor: '#F8F6F2',
                scale: 2, // کیفیت بالا
                useCORS: true,
                logging: false,
                borderRadius: '24px',
                windowWidth: DOM.resultsSection.scrollWidth,
                windowHeight: DOM.resultsSection.scrollHeight
            }).then(function (canvas) {
                _hideLoading();

                // ساخت لینک دانلود
                var link = document.createElement('a');
                link.download = 'follow-analysis-' + _getDateString() + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();

                _showToast('تصویر ذخیره شد! 🎉', 'success');
            }).catch(function (err) {
                _hideLoading();
                console.error('Export error:', err);
                _showToast('خطا در ساخت تصویر! 😵', 'error');
            });
        }, 300);
    }

    /* ----------------------------------------- */
    /* لودینگ اسپینر                               */
    /* ----------------------------------------- */

    /**
     * نمایش لودینگ
     * @param {string} message - پیام لودینگ
     */
    function _showLoading(message) {
        var overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loading-overlay';
        overlay.innerHTML =
            '<div class="loading-spinner">' +
                '<div class="spinner-dots">' +
                    '<span></span><span></span><span></span>' +
                '</div>' +
                '<span class="loading-text">' + (message || 'لطفاً صبر کن...') + '</span>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    /**
     * مخفی کردن لودینگ
     */
    function _hideLoading() {
        var overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(function () {
                overlay.remove();
            }, 300);
        }
    }

    /* ----------------------------------------- */
    /* نوتیفیکیشن Toast                            */
    /* ----------------------------------------- */

    /**
     * نمایش پیام Toast
     * @param {string} message - متن پیام
     * @param {string} type - نوع (success|error|info)
     */
    function _showToast(message, type) {
        // حذف توست قبلی
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'info');
        toast.textContent = message;
        document.body.appendChild(toast);

        // نمایش با کمی تأخیر برای انیمیشن
        requestAnimationFrame(function () {
            toast.classList.add('show');
        });

        // مخفی کردن بعد از 3 ثانیه
        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () {
                toast.remove();
            }, 400);
        }, 3000);
    }

    /* ----------------------------------------- */
    /* توابع کمکی (Utility)                       */
    /* ----------------------------------------- */

    /**
     * حذف آیتم‌های تکراری از آرایه
     * @param {Array} arr - آرایه ورودی
     * @returns {Array} آرایه بدون تکرار
     */
    function _unique(arr) {
        return Array.from(new Set(arr));
    }

    /**
     * Escape کردن HTML برای جلوگیری از XSS
     * @param {string} str - رشته ورودی
     * @returns {string} رشته ایمن
     */
    function _escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * ساخت رشته تاریخ برای نام فایل
     * @returns {string} تاریخ به فرمت YYYY-MM-DD
     */
    function _getDateString() {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        var d = String(now.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    /* ----------------------------------------- */
    /* اجرای برنامه                                */
    /* ----------------------------------------- */
    document.addEventListener('DOMContentLoaded', init);

})();
