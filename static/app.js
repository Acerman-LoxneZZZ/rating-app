/* =====================================================
   People Rating — Dashboard Frontend
   ===================================================== */

const API = '/api';
let people = [];
let penalties = [];
let rewards = [];
let currentPersonId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    navBtns: $$('.nav-btn'),
    views: $$('.view'),

    // Sidebar
    ringAvg: $('#ring-avg'),
    ringValue: $('#ring-value'),
    statHigh: $('#stat-high'),
    statMid: $('#stat-mid'),
    statLow: $('#stat-low'),
    top3List: $('#top3-list'),
    recentList: $('#recent-list'),

    // Stat cards
    totalPeople: $('#total-people'),
    bestRating: $('#best-rating'),
    worstRating: $('#worst-rating'),
    changesToday: $('#changes-today'),

    // People grid
    grid: $('#people-grid'),
    emptyState: $('#empty-state'),
    peopleCount: $('#people-count'),

    // Leaderboard
    podium: $('#podium'),
    lbList: $('#leaderboard-list'),

    // Person modal
    modalPerson: $('#modal-person'),
    modalPersonTitle: $('#modal-person-title'),
    formPerson: $('#form-person'),
    personId: $('#person-id'),
    personName: $('#person-name'),
    personDescription: $('#person-description'),
    personRating: $('#person-rating'),
    ratingValueLabel: $('#rating-value-label'),
    personPhoto: $('#person-photo'),
    photoUploadArea: $('#photo-upload-area'),
    photoPreview: $('#photo-preview'),

    // Profile modal
    modalProfile: $('#modal-profile'),
    profileName: $('#profile-name'),
    profilePhoto: $('#profile-photo'),
    profileNoPhoto: $('#profile-no-photo'),
    profileDescription: $('#profile-description'),
    profileRating: $('#profile-rating'),
    profileRatingBar: $('#profile-rating-bar'),

    // Rating change
    formRating: $('#form-rating'),
    ratingPersonId: $('#rating-person-id'),
    newRating: $('#new-rating'),
    newRatingLabel: $('#new-rating-label'),
    ratingComment: $('#rating-comment'),

    // Timeline
    timeline: $('#timeline'),

    // Templates view
    penaltyTemplatesList: $('#penalty-templates-list'),
    rewardTemplatesList: $('#reward-templates-list'),
    formAddPenalty: $('#form-add-penalty'),
    penaltyName: $('#penalty-name'),
    penaltyVal: $('#penalty-val'),
    formAddReward: $('#form-add-reward'),
    rewardName: $('#reward-name'),
    rewardVal: $('#reward-val'),
    quickPenalties: $('#quick-penalties'),
    quickRewards: $('#quick-rewards'),
};

// ─── Init ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupModals();
    setupForms();
    loadPeople();
    loadPenalties();
    loadRewards();
});

// ─── Navigation ──────────────────────────────────────
function setupNavigation() {
    dom.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            dom.navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            dom.views.forEach(v => v.classList.remove('active'));
            $(`#view-${view}`).classList.add('active');
            if (view === 'leaderboard') renderLeaderboard();
            if (view === 'penalties') {
                renderPenaltiesTab();
                renderRewardsTab();
            }
        });
    });
}

// ─── Data ────────────────────────────────────────────
async function loadPeople() {
    try {
        const res = await fetch(`${API}/people`);
        people = await res.json();
        renderAll();
    } catch (e) {
        console.error('Failed to load people:', e);
    }
}

function renderAll() {
    renderPeopleGrid();
    renderSidebar();
    renderStatCards();
}

// ─── Sidebar ─────────────────────────────────────────
function renderSidebar() {
    const total = people.length;
    const avg = total ? Math.round(people.reduce((s, p) => s + p.rating, 0) / total) : 0;

    // Ring chart
    const circumference = 2 * Math.PI * 52; // r=52
    const dashLen = (avg / 100) * circumference;
    dom.ringAvg.setAttribute('stroke-dasharray', `${dashLen} ${circumference}`);

    // Color ring based on avg
    if (avg <= 30) dom.ringAvg.style.stroke = 'var(--color-low)';
    else if (avg <= 60) dom.ringAvg.style.stroke = 'var(--color-mid)';
    else dom.ringAvg.style.stroke = 'var(--color-high)';

    dom.ringValue.textContent = avg;

    // Distribution
    let high = 0, mid = 0, low = 0;
    people.forEach(p => {
        if (p.rating > 60) high++;
        else if (p.rating > 30) mid++;
        else low++;
    });
    dom.statHigh.textContent = high;
    dom.statMid.textContent = mid;
    dom.statLow.textContent = low;

    // Top 3
    const sorted = [...people].sort((a, b) => b.rating - a.rating);
    const top3 = sorted.slice(0, 3);
    const medals = ['1 место', '2 место', '3 место'];

    if (top3.length === 0) {
        dom.top3List.innerHTML = '<p class="text-muted">Нет данных</p>';
    } else {
        dom.top3List.innerHTML = top3.map((p, i) => `
            <div class="top3-item" onclick="openProfile(${p.id})">
                <span class="top3-medal" style="font-size: 11px; font-weight: bold; opacity: 0.7; min-width: 50px;">${medals[i]}</span>
                ${p.photo_url
                ? `<img class="top3-photo" src="${p.photo_url}" alt="">`
                : `<div class="top3-no-photo">${getInitial(p.name)}</div>`
            }
                <span class="top3-name">${esc(p.name)}</span>
                <span class="top3-rating ${ratingColorClass(p.rating)}">${p.rating}</span>
            </div>
        `).join('');
    }

    // Recent activity — load from all people
    loadRecentActivity();
}

async function loadRecentActivity() {
    try {
        const res = await fetch(`${API}/rating-changes`);
        if (!res.ok) {
            const errText = await res.text();
            console.error('API /rating-changes returned error:', res.status, errText);
            dom.recentList.innerHTML = `<p class="text-danger" style="font-size:12px; color:var(--color-low);">Ошибка загрузки истории (${res.status}): ${esc(errText.substring(0, 100))}</p>`;
            dom.changesToday.textContent = '0';
            return;
        }
        const allHistory = await res.json();

        if (!Array.isArray(allHistory)) {
            console.error('API /rating-changes returned non-array payload:', allHistory);
            dom.recentList.innerHTML = `<p class="text-danger" style="font-size:12px; color:var(--color-low);">Неверный формат данных истории</p>`;
            dom.changesToday.textContent = '0';
            return;
        }

        const recent = allHistory.slice(0, 5);

        if (allHistory.length === 0) {
            dom.recentList.innerHTML = '<p class="text-muted">Нет изменений</p>';
            dom.changesToday.textContent = '0';
            return;
        }

        // Count today's changes
        const today = new Date().toDateString();
        const todayCount = allHistory.filter(h => {
            if (!h.created_at) return false;
            return new Date(h.created_at).toDateString() === today;
        }).length;
        dom.changesToday.textContent = todayCount;

        dom.recentList.innerHTML = recent.map(h => {
            const diff = h.new_rating - h.old_rating;
            const arrow = diff > 0 ? '↑' : '↓';
            const color = diff > 0 ? 'color-high' : 'color-low';
            return `
                <div class="recent-item">
                    <span class="recent-arrow ${color}">${arrow}</span>
                    <div class="recent-text">
                        <strong>${esc(h._personName || 'Челик')}</strong> ${h.old_rating} → ${h.new_rating}
                        ${h.comment ? `<br>${esc(h.comment)}` : ''}
                    </div>
                    <span class="recent-date">${formatShortDate(h.created_at)}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load recent activity:', e);
    }
}

// ─── Stat Cards ──────────────────────────────────────
function renderStatCards() {
    dom.totalPeople.textContent = people.length;
    if (people.length > 0) {
        const sorted = [...people].sort((a, b) => b.rating - a.rating);
        dom.bestRating.textContent = sorted[0].rating;
        dom.worstRating.textContent = sorted[sorted.length - 1].rating;
    } else {
        dom.bestRating.textContent = '—';
        dom.worstRating.textContent = '—';
    }
}

// ─── People Grid ─────────────────────────────────────
function renderPeopleGrid() {
    dom.peopleCount.textContent = people.length;

    if (people.length === 0) {
        dom.grid.style.display = 'none';
        dom.emptyState.style.display = 'block';
        return;
    }

    dom.grid.style.display = '';
    dom.emptyState.style.display = 'none';

    dom.grid.innerHTML = people.map(p => `
        <div class="person-card" onclick="openProfile(${p.id})">
            ${p.photo_url
            ? `<img class="card-photo" src="${p.photo_url}" alt="${esc(p.name)}" onerror="this.onerror=null; this.outerHTML='<div class=&quot;card-no-photo&quot;>${getInitial(p.name)}</div>';">`
            : `<div class="card-no-photo">${getInitial(p.name)}</div>`
        }
            <div class="card-name">${esc(p.name)}</div>
            <div class="card-description">${esc(p.description) || 'Без описания'}</div>
            <div class="card-rating">
                <span class="card-rating-number ${ratingColorClass(p.rating)}">${p.rating}</span>
                <div class="card-rating-bar-wrap">
                    <div class="card-rating-bar ${ratingBarClass(p.rating)}" style="width:${p.rating}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ─── Leaderboard ─────────────────────────────────────
function renderLeaderboard() {
    const sorted = [...people].sort((a, b) => b.rating - a.rating);
    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    if (top3.length === 0) {
        dom.podium.innerHTML = '<div class="empty-state"><h3>Нет данных</h3><p>Добавьте людей</p></div>';
        dom.lbList.innerHTML = '';
        return;
    }

    const medals = ['1', '2', '3'];
    const placeLabels = ['1-е место', '2-е место', '3-е место'];

    dom.podium.innerHTML = top3.map((p, i) => `
        <div class="podium-card podium-${i + 1}" onclick="openProfile(${p.id})">
            <span class="podium-medal" style="font-size: 20px; font-weight: 800; opacity: 0.8; margin-bottom: 8px;">#${medals[i]}</span>
            ${p.photo_url
            ? `<img class="podium-photo" src="${p.photo_url}" alt="${esc(p.name)}" onerror="this.onerror=null; this.outerHTML='<div class=&quot;podium-no-photo&quot;>${getInitial(p.name)}</div>';">`
            : `<div class="podium-no-photo">${getInitial(p.name)}</div>`
        }
            <div class="podium-name">${esc(p.name)}</div>
            <div class="podium-rating">${p.rating}</div>
            <div class="podium-place">${placeLabels[i]}</div>
        </div>
    `).join('');

    dom.lbList.innerHTML = rest.map((p, i) => `
        <div class="lb-row" onclick="openProfile(${p.id})">
            <span class="lb-rank">#${i + 4}</span>
            ${p.photo_url
            ? `<img class="lb-photo" src="${p.photo_url}" alt="${esc(p.name)}" onerror="this.onerror=null; this.outerHTML='<div class=&quot;lb-no-photo&quot;>${getInitial(p.name)}</div>';">`
            : `<div class="lb-no-photo">${getInitial(p.name)}</div>`
        }
            <span class="lb-name">${esc(p.name)}</span>
            <div class="lb-bar-wrap">
                <div class="lb-bar ${ratingBarClass(p.rating)}" style="width:${p.rating}%"></div>
            </div>
            <span class="lb-rating ${ratingColorClass(p.rating)}">${p.rating}</span>
        </div>
    `).join('');
}

// ─── Modals ──────────────────────────────────────────
function setupModals() {
    $('#btn-add-person').addEventListener('click', () => openPersonModal());
    $('#btn-add-empty').addEventListener('click', () => openPersonModal());
    $('#modal-person-close').addEventListener('click', () => closeModal(dom.modalPerson));
    $('#btn-cancel-person').addEventListener('click', () => closeModal(dom.modalPerson));
    $('#modal-profile-close').addEventListener('click', () => closeModal(dom.modalProfile));

    $('#btn-edit-person').addEventListener('click', () => {
        closeModal(dom.modalProfile);
        const person = people.find(p => p.id === currentPersonId);
        if (person) openPersonModal(person);
    });

    $('#btn-delete-person').addEventListener('click', async () => {
        if (!currentPersonId) return;
        if (!confirm('Удалить этого человека?')) return;
        try {
            await fetch(`${API}/people/${currentPersonId}`, { method: 'DELETE' });
            closeModal(dom.modalProfile);
            await loadPeople();
        } catch (e) {
            console.error('Delete failed:', e);
        }
    });

    [dom.modalPerson, dom.modalProfile].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    dom.photoUploadArea.addEventListener('click', () => dom.personPhoto.click());
    dom.personPhoto.addEventListener('change', handlePhotoSelect);

    dom.personRating.addEventListener('input', () => {
        dom.ratingValueLabel.textContent = dom.personRating.value;
    });
    dom.newRating.addEventListener('input', () => {
        dom.newRatingLabel.textContent = dom.newRating.value;
    });
}

function openPersonModal(person = null) {
    dom.formPerson.reset();
    dom.photoPreview.innerHTML = '<span class="photo-placeholder">📷</span><p>Нажмите для загрузки</p>';

    if (person) {
        dom.modalPersonTitle.textContent = 'Редактировать';
        dom.personId.value = person.id;
        dom.personName.value = person.name;
        dom.personDescription.value = person.description || '';
        dom.personRating.value = person.rating;
        dom.ratingValueLabel.textContent = person.rating;
        dom.personRating.closest('.form-group').style.display = 'none';
        if (person.photo_url) {
            dom.photoPreview.innerHTML = `<img src="${person.photo_url}" alt=""><p>Нажмите чтобы заменить</p>`;
        }
    } else {
        dom.modalPersonTitle.textContent = 'Добавить человека';
        dom.personId.value = '';
        dom.personRating.value = 50;
        dom.ratingValueLabel.textContent = '50';
        dom.personRating.closest('.form-group').style.display = '';
    }

    openModal(dom.modalPerson);
}

function openModal(modal) {
    const inner = modal.querySelector('.modal');
    if (inner) {
        inner.style.animation = 'none';
        void inner.offsetHeight;
        inner.style.animation = '';
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        dom.photoPreview.innerHTML = `<img src="${ev.target.result}" alt="Preview"><p>Фото выбрано ✔</p>`;
    };
    reader.readAsDataURL(file);
}

// ─── Profile ─────────────────────────────────────────
async function openProfile(id) {
    currentPersonId = id;
    const person = people.find(p => p.id === id);
    if (!person) return;

    dom.profileName.textContent = person.name;
    dom.profileDescription.textContent = person.description || 'Описание не добавлено';

    if (person.photo_url) {
        dom.profilePhoto.src = person.photo_url;
        dom.profilePhoto.style.display = 'block';
        dom.profileNoPhoto.style.display = 'none';
    } else {
        dom.profilePhoto.style.display = 'none';
        dom.profileNoPhoto.style.display = 'flex';
    }

    updateProfileRating(person.rating);
    dom.newRating.value = person.rating;
    dom.newRatingLabel.textContent = person.rating;
    dom.ratingPersonId.value = person.id;
    dom.ratingComment.value = '';

    // Render dynamic penalty templates
    if (penalties.length === 0) {
        dom.quickPenalties.innerHTML = '<p class="text-muted" style="font-size: 11px; margin-bottom: 6px;">Нет шаблонов штрафов</p>';
    } else {
        dom.quickPenalties.innerHTML = penalties.map(t => `
            <button type="button" class="btn btn-penalty" data-penalty="${t.penalty_value}" data-reason="${esc(t.name)}">
                ${esc(t.name)} (-${t.penalty_value})
            </button>
        `).join('');

        dom.quickPenalties.querySelectorAll('.btn-penalty').forEach(btn => {
            btn.addEventListener('click', () => applyQuickPenalty(btn));
        });
    }

    // Render dynamic reward templates
    if (rewards.length === 0) {
        dom.quickRewards.innerHTML = '<p class="text-muted" style="font-size: 11px; margin-bottom: 6px;">Нет шаблонов поощрений</p>';
    } else {
        dom.quickRewards.innerHTML = rewards.map(t => `
            <button type="button" class="btn btn-reward" data-reward="${t.reward_value}" data-reason="${esc(t.name)}">
                ${esc(t.name)} (+${t.reward_value})
            </button>
        `).join('');

        dom.quickRewards.querySelectorAll('.btn-reward').forEach(btn => {
            btn.addEventListener('click', () => applyQuickReward(btn));
        });
    }

    await loadHistory(id);
    openModal(dom.modalProfile);
}

function updateProfileRating(rating) {
    dom.profileRating.textContent = rating;
    dom.profileRating.className = `profile-rating-number ${ratingColorClass(rating)}`;
    dom.profileRatingBar.style.width = `${rating}%`;
    dom.profileRatingBar.className = `profile-rating-bar ${ratingBarClass(rating)}`;
}

async function loadHistory(personId) {
    try {
        const res = await fetch(`${API}/people/${personId}/history`);
        const history = await res.json();
        renderTimeline(history);
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

function renderTimelineItem(h) {
    const diff = h.new_rating - h.old_rating;
    const isUp = diff > 0;
    const arrow = isUp ? '↑' : '↓';
    const cls = isUp ? 'up' : 'down';
    const colorCls = isUp ? 'change-up' : 'change-down';

    return `
        <div class="timeline-item ${cls}">
            <div class="timeline-change">
                ${h.old_rating} → ${h.new_rating}
                <span class="${colorCls}">${arrow} ${Math.abs(diff)}</span>
            </div>
            ${h.comment ? `<div class="timeline-comment">${esc(h.comment)}</div>` : ''}
            <div class="timeline-date">${formatDate(h.created_at)}</div>
        </div>
    `;
}

const TIMELINE_PREVIEW_COUNT = 3;

function renderTimeline(history) {
    if (history.length === 0) {
        dom.timeline.innerHTML = '<p class="timeline-empty">Пока нет изменений</p>';
        return;
    }

    const visible = history.slice(0, TIMELINE_PREVIEW_COUNT);
    const hidden = history.slice(TIMELINE_PREVIEW_COUNT);

    let html = visible.map(renderTimelineItem).join('');

    if (hidden.length > 0) {
        html += `<div class="timeline-hidden" id="timeline-hidden">${hidden.map(renderTimelineItem).join('')}</div>`;
        html += `<button class="timeline-toggle-btn" id="timeline-toggle" type="button">
                    <span class="toggle-icon">▼</span> Показать все (ещё ${hidden.length})
                 </button>`;
    }

    dom.timeline.innerHTML = html;

    // Attach expand/collapse handler
    const toggleBtn = $('#timeline-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const hiddenBlock = $('#timeline-hidden');
            const isExpanded = hiddenBlock.classList.contains('expanded');
            hiddenBlock.classList.toggle('expanded');
            if (isExpanded) {
                toggleBtn.innerHTML = `<span class="toggle-icon">▼</span> Показать все (ещё ${hidden.length})`;
            } else {
                toggleBtn.innerHTML = `<span class="toggle-icon">▲</span> Скрыть`;
            }
        });
    }
}

// ─── Forms ───────────────────────────────────────────
function setupForms() {
    dom.formPerson.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = dom.personId.value;
        const formData = new FormData();
        formData.append('name', dom.personName.value.trim());
        formData.append('description', dom.personDescription.value.trim());
        if (!id) formData.append('rating', dom.personRating.value);
        const photoFile = dom.personPhoto.files[0];
        if (photoFile) formData.append('photo', photoFile);

        try {
            const url = id ? `${API}/people/${id}` : `${API}/people`;
            const method = id ? 'PUT' : 'POST';
            await fetch(url, { method, body: formData });
            closeModal(dom.modalPerson);
            await loadPeople();
        } catch (e) {
            console.error('Save failed:', e);
        }
    });

    dom.formRating.addEventListener('submit', async (e) => {
        e.preventDefault();
        const personId = dom.ratingPersonId.value;
        const formData = new FormData();
        formData.append('new_rating', dom.newRating.value);
        formData.append('comment', dom.ratingComment.value.trim());

        try {
            const res = await fetch(`${API}/people/${personId}/rating`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || 'Ошибка');
                return;
            }
            const data = await res.json();
            const idx = people.findIndex(p => p.id === parseInt(personId));
            if (idx !== -1) people[idx].rating = data.person.rating;

            updateProfileRating(data.person.rating);
            dom.ratingComment.value = '';
            await loadHistory(personId);
            renderPeopleGrid();
            renderSidebar();
            renderStatCards();
        } catch (e) {
            console.error('Rating change failed:', e);
        }
    });

    // Add Penalty Template Form
    if (dom.formAddPenalty) {
        dom.formAddPenalty.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = dom.penaltyName.value.trim();
            const val = parseInt(dom.penaltyVal.value);

            const formData = new FormData();
            formData.append('name', name);
            formData.append('penalty_value', val);

            try {
                const res = await fetch(`${API}/penalties`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    dom.penaltyName.value = '';
                    dom.penaltyVal.value = '25';
                    await loadPenalties();
                    renderPenaltiesTab();
                }
            } catch (e) {
                console.error('Failed to create penalty template:', e);
            }
        });
    }

    // Add Reward Template Form
    if (dom.formAddReward) {
        dom.formAddReward.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = dom.rewardName.value.trim();
            const val = parseInt(dom.rewardVal.value);

            const formData = new FormData();
            formData.append('name', name);
            formData.append('reward_value', val);

            try {
                const res = await fetch(`${API}/rewards`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    dom.rewardName.value = '';
                    dom.rewardVal.value = '25';
                    await loadRewards();
                    renderRewardsTab();
                }
            } catch (e) {
                console.error('Failed to create reward template:', e);
            }
        });
    }
}

// ─── Penalty Templates ────────────────────────────────
async function loadPenalties() {
    try {
        const res = await fetch(`${API}/penalties`);
        penalties = await res.json();
    } catch (e) {
        console.error('Failed to load penalties:', e);
    }
}

function renderPenaltiesTab() {
    if (penalties.length === 0) {
        dom.penaltyTemplatesList.innerHTML = '<p class="text-muted" style="padding: 20px 0; text-align: center; width: 100%;">Нет шаблонов штрафов</p>';
        return;
    }

    dom.penaltyTemplatesList.innerHTML = penalties.map(t => `
        <div class="template-item-row">
            <div class="template-item-info">
                <span class="template-item-name">${esc(t.name)}</span>
            </div>
            <span class="template-item-badge">-${t.penalty_value}</span>
            <button class="btn-icon btn-icon-danger template-item-delete" onclick="deletePenaltyTemplate(${t.id})" title="Удалить шаблон" style="padding: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');
}

async function deletePenaltyTemplate(id) {
    if (!confirm('Удалить этот шаблон штрафа?')) return;
    try {
        const res = await fetch(`${API}/penalties/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadPenalties();
            renderPenaltiesTab();
        }
    } catch (e) {
        console.error('Failed to delete penalty:', e);
    }
}

async function applyQuickPenalty(btn) {
    const personId = dom.ratingPersonId.value;
    const person = people.find(p => p.id === parseInt(personId));
    if (!person) return;

    const penalty = parseInt(btn.dataset.penalty);
    const reason = btn.dataset.reason;

    // Minimum rating is 1
    const newRatingVal = Math.max(1, person.rating - penalty);

    if (newRatingVal === person.rating) {
        alert('Рейтинг уже минимальный (1)');
        return;
    }

    const formData = new FormData();
    formData.append('new_rating', newRatingVal);
    formData.append('comment', reason);

    try {
        const res = await fetch(`${API}/people/${personId}/rating`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json();
            alert(err.detail || 'Ошибка при изменении рейтинга');
            return;
        }
        const data = await res.json();
        const idx = people.findIndex(p => p.id === parseInt(personId));
        if (idx !== -1) people[idx].rating = data.person.rating;

        updateProfileRating(data.person.rating);
        dom.newRating.value = data.person.rating;
        dom.newRatingLabel.textContent = data.person.rating;

        await loadHistory(personId);
        renderPeopleGrid();
        renderSidebar();
        renderStatCards();
    } catch (e) {
        console.error('Quick penalty failed:', e);
    }
}

// ─── Reward Templates ─────────────────────────────────
async function loadRewards() {
    try {
        const res = await fetch(`${API}/rewards`);
        rewards = await res.json();
    } catch (e) {
        console.error('Failed to load rewards:', e);
    }
}

function renderRewardsTab() {
    if (rewards.length === 0) {
        dom.rewardTemplatesList.innerHTML = '<p class="text-muted" style="padding: 20px 0; text-align: center; width: 100%;">Нет шаблонов поощрений</p>';
        return;
    }

    dom.rewardTemplatesList.innerHTML = rewards.map(t => `
        <div class="template-item-row">
            <div class="template-item-info">
                <span class="template-item-name">${esc(t.name)}</span>
            </div>
            <span class="template-item-badge">+${t.reward_value}</span>
            <button class="btn-icon btn-icon-danger template-item-delete" onclick="deleteRewardTemplate(${t.id})" title="Удалить шаблон" style="padding: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');
}

async function deleteRewardTemplate(id) {
    if (!confirm('Удалить этот шаблон поощрения?')) return;
    try {
        const res = await fetch(`${API}/rewards/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadRewards();
            renderRewardsTab();
        }
    } catch (e) {
        console.error('Failed to delete reward template:', e);
    }
}

async function applyQuickReward(btn) {
    const personId = dom.ratingPersonId.value;
    const person = people.find(p => p.id === parseInt(personId));
    if (!person) return;

    const reward = parseInt(btn.dataset.reward);
    const reason = btn.dataset.reason;

    // Maximum rating is 100
    const newRatingVal = Math.min(100, person.rating + reward);

    if (newRatingVal === person.rating) {
        alert('Рейтинг уже максимальный (100)');
        return;
    }

    const formData = new FormData();
    formData.append('new_rating', newRatingVal);
    formData.append('comment', reason);

    try {
        const res = await fetch(`${API}/people/${personId}/rating`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json();
            alert(err.detail || 'Ошибка при изменении рейтинга');
            return;
        }
        const data = await res.json();
        const idx = people.findIndex(p => p.id === parseInt(personId));
        if (idx !== -1) people[idx].rating = data.person.rating;

        updateProfileRating(data.person.rating);
        dom.newRating.value = data.person.rating;
        dom.newRatingLabel.textContent = data.person.rating;

        await loadHistory(personId);
        renderPeopleGrid();
        renderSidebar();
        renderStatCards();
    } catch (e) {
        console.error('Quick reward failed:', e);
    }
}

// ─── Helpers ─────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function ratingColorClass(r) {
    if (r <= 30) return 'rating-color-low';
    if (r <= 60) return 'rating-color-mid';
    return 'rating-color-high';
}

function ratingBarClass(r) {
    if (r <= 30) return 'bar-low';
    if (r <= 60) return 'bar-mid';
    return 'bar-high';
}

function getInitial(name) {
    return (name || '?')[0].toUpperCase();
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatShortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Unregister Service Worker to prevent caching issues
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister().then(ok => {
                if (ok) {
                    console.log('ServiceWorker unregistered successfully');
                    // Reload to apply changes immediately
                    window.location.reload();
                }
            });
        }
    });
}
