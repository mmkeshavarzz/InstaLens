/* ═══════════════════════════════════════════════════════════════════
 *  InstaLens — موتور تحلیلگر فالوورهای اینستاگرام
 *  نسخه: 3.0.0 — Calibrated Edition
 *  توضیح: این فایل مسئول پارس فایل‌های JSON خروجی اینستاگرام،
 *          محاسبات مقایسه‌ای Set-based و مدیریت رابط کاربری است.
 * 
 *  ساختار فایل‌های پشتیبانی‌شده (کالیبره‌شده):
 *  ─ followers_1.json: آرایه [] → هر آیتم: { string_list_data[0].value }
 *  ─ following.json:   آبجکت {} → { relationships_following[].title }
 * ═══════════════════════════════════════════════════════════════════ */

;(function () {
    'use strict';

    /* ═══════════════════════════════════
       ثابت‌ها و تنظیمات اولیه
       ═══════════════════════════════════ */
    const CONFIG = {
        STORAGE_KEY: 'instalens_data_v3',
        TOAST_DURATION: 3200,
        ANIMATION_DELAY: 80,
        MAX_TIMELINE_ITEMS: 30,
        CHART_COLORS: {
            unfollowers: '#FFB5C2',
            mutual: '#B5FFCB',
            fans: '#D4B5FF'
        }
    };

    /* ═══════════════════════════════════
       مراجع DOM
       ═══════════════════════════════════ */
    const DOM = {
        // آپلود
        followersZone: document.getElementById('followersZone'),
        followingZone: document.getElementById('followingZone'),
        followersInput: document.getElementById('followersInput'),
        followingInput: document.getElementById('followingInput'),
        followersStatus: document.getElementById('followersStatus'),
        followingStatus: document.getElementById('followingStatus'),
        followersCard: document.getElementById('followersCard'),
        followingCard: document.getElementById('followingCard'),

        // دکمه‌ها
        analyzeBtn: document.getElementById('analyzeBtn'),
        testBtn: document.getElementById('testBtn'),
        exportPng: document.getElementById('exportPng'),
        exportCsv: document.getElementById('exportCsv'),
        resetBtn: document.getElementById('resetBtn'),
        clearStorage: document.getElementById('clearStorage'),
        themeToggle: document.getElementById('themeToggle'),

        // بخش‌ها
        uploadSection: document.getElementById('uploadSection'),
        resultsSection: document.getElementById('resultsSection'),
        debugSection: document.getElementById('debugSection'),
        toggleDebug: document.getElementById('toggleDebug'),
        debugOutput: document.getElementById('debugOutput'),
        reportArea: document.getElementById('reportArea'),

        // آمار
        totalFollowers: document.getElementById('totalFollowers'),
        totalFollowing: document.getElementById('totalFollowing'),
        followbackRate: document.getElementById('followbackRate'),
        progressFill: document.getElementById('progressFill'),
        progressLabel: document.getElementById('progressLabel'),
        analysisDate: document.getElementById('analysisDate'),

        // لیست‌ها
        unfollowersList: document.getElementById('unfollowersList'),
        mutualList: document.getElementById('mutualList'),
        fansList: document.getElementById('fansList'),
        unfollowersCount: document.getElementById('unfollowersCount'),
        mutualCount: document.getElementById('mutualCount'),
        fansCount: document.getElementById('fansCount'),

        // نمودار
        pieChart: document.getElementById('pieChart'),
        chartLegend: document.getElementById('chartLegend'),

        // تایم‌لاین
        timelineList: document.getElementById('timelineList'),

        // نوتیفیکیشن
        toastContainer: document.getElementById('toastContainer')
    };

    /* ═══════════════════════════════════
       مخزن داده
       ═══════════════════════════════════ */
    const store = {
        followersRaw: null,
        followingRaw: null,
        followersSet: null,
        followingSet: null,
        followersData: [],   // آرایه { username, timestamp }
        followingData: [],   // آرایه { username, timestamp }
        results: null
    };

    /* ═══════════════════════════════════
       ابزارهای کمکی
       ═══════════════════════════════════ */

    /**
     * نمایش نوتیفیکیشن Toast
     * @param {string} message - متن پیام
     * @param {string} type - نوع: success | error | info
     */
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        DOM.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('out');
            toast.addEventListener('animationend', () => toast.remove());
        }, CONFIG.TOAST_DURATION);
    }

    /**
     * تبدیل timestamp به تاریخ شمسی ساده
     * (پیاده‌سازی ساده بدون وابستگی خارجی)
     */
    function formatTimestamp(ts) {
        if (!ts) return '—';
        const d = new Date(ts * 1000);
        // استفاده از Intl برای تاریخ فارسی
        try {
            return new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }).format(d);
        } catch {
            return d.toLocaleDateString('en-US');
        }
    }

    /**
     * انیمیشن شمارش عدد
     * @param {HTMLElement} el - المان هدف
     * @param {number} target - عدد نهایی
     * @param {string} suffix - پسوند اختیاری (مثلاً %)
     */
    function animateCount(el, target, suffix = '') {
        const duration = 1200;
        const start = performance.now();
        const from = 0;

        el.classList.add('animate');

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = 1 - Math.pow(2, -10 * progress);
            const current = Math.round(from + (target - from) * eased);

            el.textContent = current.toLocaleString('fa-IR') + suffix;

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        }

        requestAnimationFrame(tick);
    }

    /**
     * ثبت لاگ در پنل دیباگ
     */
    function debugLog(label, data) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const text = `[${timestamp}] ${label}:\n${
            typeof data === 'object' ? JSON.stringify(data, null, 2) : data
        }\n${'─'.repeat(50)}\n`;

        DOM.debugOutput.textContent += text;
        DOM.debugOutput.scrollTop = DOM.debugOutput.scrollHeight;
    }

    /* ═══════════════════════════════════
       پارسر فایل‌های اینستاگرام
       (کالیبره‌شده با ساختار واقعی)
       ═══════════════════════════════════ */

    /**
     * پارس فایل فالوورها
     * ساختار: آرایه مستقیم []
     * یوزرنیم: string_list_data[0].value
     * 
     * @param {Object|Array} json - داده‌های خام JSON
     * @returns {Array<{username: string, timestamp: number}>}
     */
    function parseFollowers(json) {
        const items = [];

        // ──── حالت ۱: آرایه مستقیم (فرمت اصلی) ────
        if (Array.isArray(json)) {
            json.forEach(item => {
                const username = _extractFollowerUsername(item);
                if (username) {
                    items.push({
                        username: username.toLowerCase().trim(),
                        timestamp: _extractTimestamp(item)
                    });
                }
            });
        }
        // ──── حالت ۲: آبجکت با کلید شناخته‌شده ────
        else if (json && typeof json === 'object') {
            // بعضی نسخه‌ها ممکنه ساختار متفاوتی داشته باشن
            const possibleKeys = ['followers', 'relationships_followers'];
            for (const key of possibleKeys) {
                if (Array.isArray(json[key])) {
                    return parseFollowers(json[key]);
                }
            }
        }

        debugLog('parseFollowers', {
            inputType: Array.isArray(json) ? 'Array' : typeof json,
            extracted: items.length,
            sample: items.slice(0, 3)
        });

        return items;
    }

    /**
     * استخراج یوزرنیم از آیتم فالوور
     * اولویت: string_list_data[0].value > title > href
     */
    function _extractFollowerUsername(item) {
        if (!item) return null;

        // اولویت اول: value در string_list_data (فرمت اصلی)
        if (item.string_list_data && item.string_list_data.length > 0) {
            const sld = item.string_list_data[0];
            if (sld.value) return sld.value;
            // فال‌بک: استخراج از href
            if (sld.href) return _usernameFromUrl(sld.href);
        }

        // اولویت دوم: فیلد title
        if (item.title && item.title.length > 0) return item.title;

        return null;
    }

    /**
     * پارس فایل فالووینگ‌ها
     * ساختار: آبجکت { relationships_following: [] }
     * یوزرنیم: title در هر آیتم
     * 
     * @param {Object|Array} json - داده‌های خام JSON
     * @returns {Array<{username: string, timestamp: number}>}
     */
    function parseFollowing(json) {
        const items = [];
        let array = null;

        // ──── حالت ۱: آبجکت با relationships_following (فرمت اصلی) ────
        if (json && typeof json === 'object' && !Array.isArray(json)) {
            if (Array.isArray(json.relationships_following)) {
                array = json.relationships_following;
            }
            // فال‌بک برای کلیدهای دیگر
            else {
                const altKeys = ['following'];
                for (const key of altKeys) {
                    if (Array.isArray(json[key])) {
                        array = json[key];
                        break;
                    }
                }
                // آخرین شانس: اولین کلید آرایه‌ای
                if (!array) {
                    for (const key of Object.keys(json)) {
                        if (Array.isArray(json[key])) {
                            array = json[key];
                            break;
                        }
                    }
                }
            }
        }
        // ──── حالت ۲: آرایه مستقیم ────
        else if (Array.isArray(json)) {
            array = json;
        }

        if (array) {
            array.forEach(item => {
                const username = _extractFollowingUsername(item);
                if (username) {
                    items.push({
                        username: username.toLowerCase().trim(),
                        timestamp: _extractTimestamp(item)
                    });
                }
            });
        }

        debugLog('parseFollowing', {
            inputType: Array.isArray(json) ? 'Array' : typeof json,
            topLevelKeys: json && typeof json === 'object' ? Object.keys(json) : 'N/A',
            extracted: items.length,
            sample: items.slice(0, 3)
        });

        return items;
    }

    /**
     * استخراج یوزرنیم از آیتم فالووینگ
     * اولویت: title > string_list_data[0].value > href
     */
    function _extractFollowingUsername(item) {
        if (!item) return null;

        // اولویت اول: title (فرمت اصلی فایل following)
        if (item.title && item.title.length > 0) return item.title;

        // اولویت دوم: value در string_list_data
        if (item.string_list_data && item.string_list_data.length > 0) {
            const sld = item.string_list_data[0];
            if (sld.value) return sld.value;
            if (sld.href) return _usernameFromUrl(sld.href);
        }

        return null;
    }

    /**
     * استخراج یوزرنیم از URL اینستاگرام
     * پشتیبانی از:
     *   https://www.instagram.com/username
     *   https://www.instagram.com/_u/username
     */
    function _usernameFromUrl(url) {
        if (!url) return null;
        try {
            // حذف اسلش آخر
            const cleaned = url.replace(/\/+$/, '');
            const parts = cleaned.split('/');
            const last = parts[parts.length - 1];
            // اگه _u بود، یوزرنیم آخریه
            if (last && last !== '_u') return last;
            return null;
        } catch {
            return null;
        }
    }

    /**
     * استخراج timestamp از آیتم
     */
    function _extractTimestamp(item) {
        if (!item) return 0;
        // مستقیم
        if (item.timestamp) return item.timestamp;
        // از string_list_data
        if (item.string_list_data && item.string_list_data.length > 0) {
            return item.string_list_data[0].timestamp || 0;
        }
        return 0;
    }

    /* ═══════════════════════════════════
       موتور تحلیل — الگوریتم Set
       ═══════════════════════════════════ */

    /**
     * اجرای تحلیل اصلی
     * 
     * الگوریتم:
     *   فالوبک نکرده = Following \ Followers    (تفاضل مجموعه‌ها)
     *   دوطرفه       = Following ∩ Followers     (اشتراک مجموعه‌ها)
     *   فن‌ها         = Followers \ Following     (تفاضل مجموعه‌ها)
     *   نرخ فالوبک  = |دوطرفه| / |Following| × 100
     */
    function runAnalysis() {
        const { followersData, followingData } = store;

        // ساخت Set برای جستجوی O(1)
        const followersSet = new Set(followersData.map(u => u.username));
        const followingSet = new Set(followingData.map(u => u.username));

        store.followersSet = followersSet;
        store.followingSet = followingSet;

        // ── فالوبک نکرده‌ها: کسایی که فالوشون کردی ولی فالوبکت نکردن ──
        const unfollowers = followingData.filter(u => !followersSet.has(u.username));

        // ── دوطرفه: هم فالوورن هم فالووینگ ──
        const mutual = followingData.filter(u => followersSet.has(u.username));

        // ── فن‌ها: فالوورات که فالوشون نکردی ──
        const fans = followersData.filter(u => !followingSet.has(u.username));

        // نرخ فالوبک
        const rate = followingData.length > 0
            ? ((mutual.length / followingData.length) * 100).toFixed(1)
            : 0;

        const results = {
            totalFollowers: followersData.length,
            totalFollowing: followingData.length,
            unfollowers: unfollowers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
            mutual: mutual.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
            fans: fans.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
            followbackRate: parseFloat(rate),
            analyzedAt: Date.now()
        };

        store.results = results;

        debugLog('runAnalysis', {
            followers: followersData.length,
            following: followingData.length,
            unfollowers: unfollowers.length,
            mutual: mutual.length,
            fans: fans.length,
            followbackRate: rate + '%'
        });

        return results;
    }

    /* ═══════════════════════════════════
       رندر نتایج در UI
       ═══════════════════════════════════ */

    function renderResults(results) {
        // ── آمار کلی ──
        animateCount(DOM.totalFollowers, results.totalFollowers);
        animateCount(DOM.totalFollowing, results.totalFollowing);
        animateCount(DOM.followbackRate, results.followbackRate, '%');

        // نوار پیشرفت
        setTimeout(() => {
            DOM.progressFill.style.width = results.followbackRate + '%';
        }, 300);
        DOM.progressLabel.textContent =
            `${results.mutual.length.toLocaleString('fa-IR')} از ${results.totalFollowing.toLocaleString('fa-IR')} نفر فالوبک کردن`;

        // تاریخ تحلیل
        DOM.analysisDate.textContent = new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(results.analyzedAt));

        // ── شمارنده‌ها ──
        DOM.unfollowersCount.textContent = results.unfollowers.length.toLocaleString('fa-IR') + ' نفر';
        DOM.mutualCount.textContent = results.mutual.length.toLocaleString('fa-IR') + ' نفر';
        DOM.fansCount.textContent = results.fans.length.toLocaleString('fa-IR') + ' نفر';

        // ── لیست‌ها ──
        _renderUserList(DOM.unfollowersList, results.unfollowers, '💔');
        _renderUserList(DOM.mutualList, results.mutual, '🤝');
        _renderUserList(DOM.fansList, results.fans, '🌟');

        // ── نمودار ──
        _drawPieChart(results);

        // ── تایم‌لاین ──
        _renderTimeline(results);

        // نمایش بخش نتایج
        DOM.resultsSection.style.display = 'block';
        DOM.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * رندر لیست کاربران
     */
    function _renderUserList(container, users, emoji) {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        users.forEach((user, idx) => {
            const li = document.createElement('li');
            li.style.animationDelay = `${Math.min(idx * 15, 600)}ms`;
            li.style.animation = 'fadeSlideUp 0.3s ease backwards';

            li.innerHTML = `
                <span class="user-index">${(idx + 1).toLocaleString('fa-IR')}</span>
                <span class="username">${emoji} ${user.username}</span>
                <a class="user-link" href="https://www.instagram.com/${user.username}" 
                   target="_blank" rel="noopener noreferrer">
                    پروفایل ↗
                </a>
            `;
            fragment.appendChild(li);
        });

        container.appendChild(fragment);
    }

    /**
     * رسم نمودار دایره‌ای (Canvas خالص — بدون کتابخانه)
     */
    function _drawPieChart(results) {
        const canvas = DOM.pieChart;
        const ctx = canvas.getContext('2d');
        const size = 300;
        canvas.width = size * 2;  // رتینا
        canvas.height = size * 2;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.scale(2, 2);

        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 30;
        const total = results.unfollowers.length + results.mutual.length + results.fans.length;

        if (total === 0) return;

        const segments = [
            { label: 'فالوبک نکرده', count: results.unfollowers.length, color: CONFIG.CHART_COLORS.unfollowers },
            { label: 'دوطرفه', count: results.mutual.length, color: CONFIG.CHART_COLORS.mutual },
            { label: 'فن‌ها', count: results.fans.length, color: CONFIG.CHART_COLORS.fans }
        ];

        let startAngle = -Math.PI / 2;

        segments.forEach(seg => {
            if (seg.count === 0) return;
            const sliceAngle = (seg.count / total) * Math.PI * 2;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();

            // خط جدا‌کننده
            ctx.strokeStyle = '#FFFDF9';
            ctx.lineWidth = 3;
            ctx.stroke();

            // لیبل درون اسلایس
            const midAngle = startAngle + sliceAngle / 2;
            const labelR = radius * 0.65;
            const lx = cx + Math.cos(midAngle) * labelR;
            const ly = cy + Math.sin(midAngle) * labelR;
            const percent = ((seg.count / total) * 100).toFixed(0);

            if (parseInt(percent) > 5) {
                ctx.fillStyle = '#2D2B29';
                ctx.font = 'bold 14px Vazirmatn, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${percent}%`, lx, ly);
            }

            startAngle += sliceAngle;
        });

        // حلقه مرکزی (دونات استایل)
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFDF9';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // متن مرکز
        ctx.fillStyle = '#2D2B29';
        ctx.font = 'bold 22px Vazirmatn, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toLocaleString('fa-IR'), cx, cy - 8);
        ctx.font = '11px Vazirmatn, sans-serif';
        ctx.fillStyle = '#6B6966';
        ctx.fillText('مجموع', cx, cy + 14);

        // لجند
        DOM.chartLegend.innerHTML = segments.map(seg =>
            `<div class="legend-item">
                <span class="legend-dot" style="background:${seg.color}"></span>
                <span>${seg.label} (${seg.count.toLocaleString('fa-IR')})</span>
            </div>`
        ).join('');
    }

    /**
     * رندر تایم‌لاین
     */
    function _renderTimeline(results) {
        // ترکیب همه کاربرها با نوع‌شون
        const allUsers = [
            ...results.unfollowers.map(u => ({ ...u, type: 'unfollower', emoji: '💔' })),
            ...results.fans.slice(0, 10).map(u => ({ ...u, type: 'fan', emoji: '🌟' })),
            ...results.mutual.slice(0, 10).map(u => ({ ...u, type: 'mutual', emoji: '🤝' }))
        ];

        // مرتب‌سازی بر اساس زمان (جدیدترین اول)
        allUsers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const limited = allUsers.slice(0, CONFIG.MAX_TIMELINE_ITEMS);

        DOM.timelineList.innerHTML = limited.map(u => `
            <li>
                <span class="tl-emoji">${u.emoji}</span>
                <span class="tl-user">${u.username}</span>
                <span class="tl-date">${formatTimestamp(u.timestamp)}</span>
            </li>
        `).join('');
    }

    /* ═══════════════════════════════════
       مدیریت فایل‌ها — دراگ‌اند‌دراپ و آپلود
       ═══════════════════════════════════ */

    function setupFileHandlers() {
        // ── فالوورها ──
        _setupZone(DOM.followersZone, DOM.followersInput, 'followers');

        // ── فالووینگ ──
        _setupZone(DOM.followingZone, DOM.followingInput, 'following');
    }

    function _setupZone(zone, input, type) {
        // کلیک
        zone.addEventListener('click', () => input.click());

        // تغییر فایل
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                _processFile(e.target.files[0], type);
            }
        });

        // دراگ
        ['dragenter', 'dragover'].forEach(evt => {
            zone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            zone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('drag-over');
            });
        });

        zone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                _processFile(files[0], type);
            }
        });
    }

    /**
     * پردازش فایل آپلود‌شده
     */
    function _processFile(file, type) {
        // بررسی نوع فایل
        if (!file.name.endsWith('.json')) {
            showToast('⚠️ فقط فایل‌های JSON قابل قبوله!', 'error');
            return;
        }

        const reader = new FileReader();
        const statusEl = type === 'followers' ? DOM.followersStatus : DOM.followingStatus;
        const zoneEl = type === 'followers' ? DOM.followersZone : DOM.followingZone;

        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);

                if (type === 'followers') {
                    store.followersRaw = json;
                    store.followersData = parseFollowers(json);
                    statusEl.innerHTML = `✅ ${store.followersData.length.toLocaleString('fa-IR')} فالوور بارگذاری شد`;
                    statusEl.style.color = '#27AE60';
                } else {
                    store.followingRaw = json;
                    store.followingData = parseFollowing(json);
                    statusEl.innerHTML = `✅ ${store.followingData.length.toLocaleString('fa-IR')} فالووینگ بارگذاری شد`;
                    statusEl.style.color = '#27AE60';
                }

                zoneEl.classList.add('loaded');
                _checkReadyState();

                showToast(`📂 فایل ${file.name} با موفقیت خونده شد!`, 'success');

            } catch (err) {
                statusEl.innerHTML = `❌ خطا در خواندن فایل`;
                statusEl.style.color = '#E74C3C';
                showToast(`❌ فایل ${file.name} معتبر نیست: ${err.message}`, 'error');
                debugLog('File Parse Error', { file: file.name, error: err.message });
            }
        };

        reader.onerror = () => {
            showToast('❌ خطا در خواندن فایل', 'error');
        };

        reader.readAsText(file, 'UTF-8');
    }

    /**
     * بررسی آماده بودن هر دو فایل
     */
    function _checkReadyState() {
        const ready = store.followersData.length > 0 && store.followingData.length > 0;
        DOM.analyzeBtn.disabled = !ready;

        if (ready) {
            DOM.analyzeBtn.classList.add('pulse');
            showToast('🎯 هر دو فایل آماده‌ان! دکمه تحلیل رو بزن', 'info');
        }
    }

    /* ═══════════════════════════════════
       اکشن‌های دکمه‌ها
       ═══════════════════════════════════ */

    function setupActions() {
        // ── دکمه تحلیل ──
        DOM.analyzeBtn.addEventListener('click', () => {
            DOM.analyzeBtn.classList.add('loading');

            // شبیه‌سازی تأخیر برای UX بهتر
            setTimeout(() => {
                const results = runAnalysis();
                renderResults(results);
                _saveToStorage(results);
                DOM.analyzeBtn.classList.remove('loading');
                showToast('✅ تحلیل با موفقیت انجام شد!', 'success');
            }, 800);
        });

        // ── دکمه تست ──
        DOM.testBtn.addEventListener('click', _loadTestData);

        // ── خروجی PNG ──
        DOM.exportPng.addEventListener('click', _exportAsPng);

        // ── خروجی CSV ──
        DOM.exportCsv.addEventListener('click', _exportAsCsv);

        // ── شروع مجدد ──
        DOM.resetBtn.addEventListener('click', () => {
            DOM.resultsSection.style.display = 'none';
            DOM.followersZone.classList.remove('loaded');
            DOM.followingZone.classList.remove('loaded');
            DOM.followersStatus.innerHTML = '';
            DOM.followingStatus.innerHTML = '';
            DOM.followersInput.value = '';
            DOM.followingInput.value = '';
            store.followersRaw = null;
            store.followingRaw = null;
            store.followersData = [];
            store.followingData = [];
            store.results = null;
            DOM.analyzeBtn.disabled = true;
            DOM.debugOutput.textContent = '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('🔄 همه‌چی ریست شد!', 'info');
        });

        // ── پاک‌سازی حافظه ──
        DOM.clearStorage.addEventListener('click', () => {
            localStorage.removeItem(CONFIG.STORAGE_KEY);
            showToast('🗑️ حافظه محلی پاک شد', 'info');
        });

        // ── دیباگ ──
        DOM.toggleDebug.addEventListener('click', () => {
            DOM.debugSection.style.display = 'none';
        });

        // کلید ترکیبی Ctrl+D برای دیباگ
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                const section = DOM.debugSection;
                section.style.display = section.style.display === 'none' ? 'block' : 'none';
            }
        });

        // ── جستجو در لیست‌ها ──
        document.querySelectorAll('.search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const listId = e.target.dataset.list;
                const list = document.getElementById(listId);
                if (!list) return;

                Array.from(list.children).forEach(li => {
                    const username = li.querySelector('.username')?.textContent?.toLowerCase() || '';
                    li.style.display = username.includes(query) ? '' : 'none';
                });
            });
        });
    }

    /**
     * بارگذاری داده تستی
     */
    function _loadTestData() {
        const testFollowers = [];
        const testFollowing = [];
        const sampleNames = [
            'ali.design', 'sara_photo', 'mmd.dev', 'neda_art', 'reza.code',
            'mina_style', 'amir.travel', 'zara_music', 'hassan_fit', 'leila_cook',
            'mehdi.game', 'fatemeh_write', 'arash_film', 'parisa_draw', 'omid.tech',
            'shirin_yoga', 'behnam_run', 'niloo_dance', 'kaveh_photo', 'golnaz_sing'
        ];

        // 12 نفر فالوور
        for (let i = 0; i < 12; i++) {
            testFollowers.push({
                username: sampleNames[i],
                timestamp: Math.floor(Date.now() / 1000) - (i * 86400)
            });
        }

        // 15 نفر فالووینگ (با همپوشانی 8 نفر)
        for (let i = 4; i < 19 && i < sampleNames.length; i++) {
            testFollowing.push({
                username: sampleNames[i],
                timestamp: Math.floor(Date.now() / 1000) - (i * 43200)
            });
        }

        store.followersData = testFollowers;
        store.followingData = testFollowing;

        DOM.followersStatus.innerHTML = `🧪 ${testFollowers.length} فالوور تستی`;
        DOM.followersStatus.style.color = '#9B59B6';
        DOM.followingStatus.innerHTML = `🧪 ${testFollowing.length} فالووینگ تستی`;
        DOM.followingStatus.style.color = '#9B59B6';
        DOM.followersZone.classList.add('loaded');
        DOM.followingZone.classList.add('loaded');

        DOM.analyzeBtn.disabled = false;
        showToast('🧪 داده تستی بارگذاری شد! حالا تحلیل رو بزن', 'info');

        debugLog('Test Data Loaded', {
            followers: testFollowers.length,
            following: testFollowing.length
        });
    }

    /* ═══════════════════════════════════
       خروجی‌ها
       ═══════════════════════════════════ */

    /**
     * خروجی PNG با html2canvas (ساده‌سازی شده بدون کتابخانه خارجی)
     * استفاده از Canvas API خالص
     */
    function _exportAsPng() {
        if (!store.results) {
            showToast('⚠️ اول تحلیل رو انجام بده', 'error');
            return;
        }

        showToast('📸 در حال ساخت تصویر...', 'info');

        const r = store.results;
        const lineHeight = 28;
        const padding = 40;
        const headerH = 120;
        const statsH = 80;
        const listHeaderH = 40;
        const maxListItems = Math.max(r.unfollowers.length, r.mutual.length, r.fans.length);
        const listH = Math.min(maxListItems, 40) * lineHeight;
        const totalH = headerH + statsH + listHeaderH * 3 + listH * 3 + padding * 4;
        const width = 900;

        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = totalH * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);

        // بک‌گراند
        ctx.fillStyle = '#F8F6F2';
        ctx.fillRect(0, 0, width, totalH);

        // هدر گرادیانت
        const headerGrad = ctx.createLinearGradient(0, 0, width, headerH);
        headerGrad.addColorStop(0, '#FFB5C2');
        headerGrad.addColorStop(0.5, '#D4B5FF');
        headerGrad.addColorStop(1, '#B5D8FF');
        ctx.fillStyle = headerGrad;
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px Vazirmatn, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('InstaLens — گزارش تحلیل فالوورها', width / 2, 50);
        ctx.font = '14px Vazirmatn, sans-serif';
        ctx.fillText(`تاریخ: ${DOM.analysisDate.textContent}`, width / 2, 80);

        // آمار
        let y = headerH + padding;
        ctx.fillStyle = '#2D2B29';
        ctx.font = 'bold 18px Vazirmatn, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`👥 فالوور: ${r.totalFollowers}  |  ➕ فالووینگ: ${r.totalFollowing}  |  📈 نرخ فالوبک: ${r.followbackRate}%`, width - padding, y);

        y += statsH;

        // لیست‌ها
        const sections = [
            { title: '💔 فالوبک نکرده‌ها', items: r.unfollowers, color: '#E8527A' },
            { title: '🤝 دوطرفه‌ها', items: r.mutual, color: '#27AE60' },
            { title: '🌟 فن‌ها', items: r.fans, color: '#9B59B6' }
        ];

        sections.forEach(section => {
            ctx.fillStyle = section.color;
            ctx.font = 'bold 16px Vazirmatn, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${section.title} (${section.items.length} نفر)`, width - padding, y);
            y += 8;

            // خط جدا‌کننده
            ctx.strokeStyle = section.color + '40';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            y += 20;

            const items = section.items.slice(0, 40);
            ctx.fillStyle = '#2D2B29';
            ctx.font = '13px Vazirmatn, monospace';

            items.forEach((user, idx) => {
                const text = `${idx + 1}. @${user.username}`;
                ctx.textAlign = 'right';
                ctx.fillText(text, width - padding - 10, y);
                y += lineHeight;
            });

            if (section.items.length > 40) {
                ctx.fillStyle = '#9E9B97';
                ctx.font = 'italic 12px Vazirmatn, sans-serif';
                ctx.fillText(`... و ${section.items.length - 40} نفر دیگر`, width - padding - 10, y);
                y += lineHeight;
            }

            y += padding / 2;
        });

        // دانلود
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `InstaLens_Report_${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('✅ تصویر ذخیره شد!', 'success');
        });
    }

    /**
     * خروجی CSV
     */
    function _exportAsCsv() {
        if (!store.results) {
            showToast('⚠️ اول تحلیل رو انجام بده', 'error');
            return;
        }

        const r = store.results;
        let csv = '\uFEFF'; // BOM for UTF-8
        csv += 'دسته‌بندی,نام کاربری,لینک پروفایل\n';

        r.unfollowers.forEach(u => {
            csv += `فالوبک نکرده,${u.username},https://www.instagram.com/${u.username}\n`;
        });

        r.mutual.forEach(u => {
            csv += `دوطرفه,${u.username},https://www.instagram.com/${u.username}\n`;
        });

        r.fans.forEach(u => {
            csv += `فن,${u.username},https://www.instagram.com/${u.username}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `InstaLens_Report_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ فایل CSV ذخیره شد!', 'success');
    }

    /* ═══════════════════════════════════
       ذخیره‌سازی محلی (localStorage)
       ═══════════════════════════════════ */

    function _saveToStorage(results) {
        try {
            const data = {
                results: {
                    totalFollowers: results.totalFollowers,
                    totalFollowing: results.totalFollowing,
                    unfollowers: results.unfollowers,
                    mutual: results.mutual,
                    fans: results.fans,
                    followbackRate: results.followbackRate,
                    analyzedAt: results.analyzedAt
                },
                savedAt: Date.now()
            };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
            debugLog('Storage', 'نتایج در localStorage ذخیره شد');
        } catch (err) {
            debugLog('Storage Error', err.message);
            // اگه حجم زیاده، لیست‌ها رو کوتاه کن
            try {
                const lite = {
                    results: {
                        totalFollowers: results.totalFollowers,
                        totalFollowing: results.totalFollowing,
                        unfollowers: results.unfollowers.slice(0, 200),
                        mutual: results.mutual.slice(0, 200),
                        fans: results.fans.slice(0, 200),
                        followbackRate: results.followbackRate,
                        analyzedAt: results.analyzedAt
                    },
                    savedAt: Date.now()
                };
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(lite));
            } catch {
                showToast('⚠️ حجم داده زیاده، ذخیره نشد', 'error');
            }
        }
    }

    function _loadFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return false;

            const data = JSON.parse(raw);
            if (!data.results) return false;

            store.results = data.results;
            store.followersData = [
                ...(data.results.mutual || []),
                ...(data.results.fans || [])
            ];
            store.followingData = [
                ...(data.results.mutual || []),
                ...(data.results.unfollowers || [])
            ];

            renderResults(data.results);
            showToast('📦 نتایج قبلی از حافظه بازیابی شد!', 'info');

            debugLog('Storage Load', {
                savedAt: new Date(data.savedAt).toLocaleString('fa-IR'),
                followers: data.results.totalFollowers,
                following: data.results.totalFollowing
            });

            return true;
        } catch (err) {
            debugLog('Storage Load Error', err.message);
            return false;
        }
    }

    /* ═══════════════════════════════════
       مقداردهی اولیه
       ═══════════════════════════════════ */

    function init() {
        debugLog('InstaLens Init', 'v3.0.0 — Calibrated Edition');

        // تنظیم هندلرهای فایل
        setupFileHandlers();

        // تنظیم اکشن‌ها
        setupActions();

        // بازیابی از حافظه
        _loadFromStorage();

        // سلام!
        console.log(
            '%c 🔍 InstaLens v3.0.0 ',
            'background: linear-gradient(135deg, #E8527A, #9B59B6); color: white; font-size: 16px; padding: 8px 16px; border-radius: 8px; font-weight: bold;'
        );
        console.log(
            '%c Ctrl+D برای پنل دیباگ ',
            'color: #9B59B6; font-size: 12px; padding: 4px;'
        );
    }

    // ── اجرا بعد از لود کامل DOM ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
