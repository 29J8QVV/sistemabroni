document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '';

    // Красивое всплывающее уведомление без системных окон браузера
    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: isError ? '#e63946' : '#2a9d8f',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '99999',
            fontSize: '14px',
            fontFamily: 'inherit',
            transition: 'opacity 0.3s ease'
        });
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function getCurrentUser() {
        const saved = localStorage.getItem('currentUser');
        if (!saved || saved === 'undefined' || saved === 'null') return null;
        try {
            const parsed = JSON.parse(saved);
            return parsed && parsed.username ? parsed : { username: saved };
        } catch (e) {
            return { username: saved };
        }
    }

    let authModal = document.getElementById('auth-modal');
    let myBookingsModal = document.getElementById('bookings-modal');
    let myBookingsList = document.getElementById('bookings-list');
    const adminModal = document.getElementById('admin-modal');
    const adminLoginBlock = document.getElementById('admin-login-block');
    const adminDashboardBlock = document.getElementById('admin-dashboard-block');
    const adminBookingsList = document.getElementById('admin-bookings-list');

    function openModal(modal) {
        if (!modal) return;
        modal.classList.add('open');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '10000';
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('open');
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
        modal.style.zIndex = '';
    }

    // --- УПРАВЛЕНИЕ АУДИТОРИЯМИ ---
    const roomsGrid = document.querySelector('#rooms .grid');
    const bookingSelect = document.getElementById('booking-item');

    // Создаём блок управления аудиториями внутри админ-панели с загрузкой фото с ПК
    let adminRoomsContainer = document.getElementById('admin-rooms-section');
    if (adminDashboardBlock && !adminRoomsContainer) {
        adminRoomsContainer = document.createElement('div');
        adminRoomsContainer.id = 'admin-rooms-section';
        adminRoomsContainer.style.marginTop = '25px';
        adminRoomsContainer.style.paddingTop = '20px';
        adminRoomsContainer.style.borderTop = '1px solid #e2e8f0';
        adminRoomsContainer.innerHTML = `
            <h3 class="modal-title" style="text-align: left; margin-bottom: 10px;">Управление аудиториями</h3>
            <form id="add-room-form" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; align-items: center;">
                <input type="text" id="new-room-title" placeholder="Название (напр. Аудитория 405)" required style="flex: 1; min-width: 160px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                <input type="text" id="new-room-desc" placeholder="Краткое описание" style="flex: 2; min-width: 180px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                <label style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px dashed #94a3b8; border-radius: 6px; cursor: pointer; font-size: 13px; background: #f8fafc;">
                    <span>📷 Фото с ПК</span>
                    <input type="file" id="new-room-file" accept="image/*" style="display: none;">
                </label>
                <span id="file-name-preview" style="font-size: 12px; color: #64748b; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                <button type="submit" class="btn btn-primary" style="padding: 8px 16px;">+ Добавить</button>
            </form>
            <div id="admin-rooms-list" class="bookings-list" style="max-height: 250px;"></div>
        `;
        adminDashboardBlock.appendChild(adminRoomsContainer);
    }
    // Сжатие и конвертация выбранного с ПК фото в Base64
    function readImageAsBase64(file) {
        return new Promise((resolve) => {
            if (!file) return resolve('1.jpg');
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxWidth = 800;
                    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => resolve('1.jpg');
                img.src = event.target.result;
            };
            reader.onerror = () => resolve('1.jpg');
            reader.readAsDataURL(file);
        });
    }

    // Отображение имени выбранного файла рядом с кнопкой
    const fileInput = document.getElementById('new-room-file');
    const fileNamePreview = document.getElementById('file-name-preview');
    if (fileInput && fileNamePreview) {
        fileInput.addEventListener('change', () => {
            fileNamePreview.textContent = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : '';
        });
    }

    // Загрузка аудиторий с сервера (при первом запуске переносит карточки из HTML в БД)
    async function loadRooms() {
        try {
            const res = await fetch(`${API_URL}/api/rooms`);
            const data = await res.json();
            if (!data.success) return;

            let rooms = data.rooms || [];

            if (rooms.length === 0 && roomsGrid) {
                const initialCards = Array.from(roomsGrid.querySelectorAll('.card'));
                for (const card of initialCards) {
                    const title = card.querySelector('.card-title')?.textContent.trim();
                    const description = card.querySelector('.card-text')?.textContent.trim();
                    const image = card.querySelector('img')?.getAttribute('src') || '1.jpg';
                    if (title) {
                        await fetch(`${API_URL}/api/rooms`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, description, image })
                        });
                    }
                }
                const resReload = await fetch(`${API_URL}/api/rooms`);
                const dataReload = await resReload.json();
                rooms = dataReload.rooms || [];
            }

            renderRoomsOnPage(rooms);
            renderRoomsInAdmin(rooms);
            updateBookingSelect(rooms);
        } catch (err) {
            console.error('Ошибка загрузки аудиторий:', err);
        }
    }

    // Отрисовка карточек аудиторий на главной странице
    function renderRoomsOnPage(rooms) {
        if (!roomsGrid || rooms.length === 0) return;

        roomsGrid.innerHTML = rooms.map(r => `
            <div class="card">
                <img src="${r.image || '1.jpg'}" alt="${r.title}" class="card-image">
                <div class="card-content">
                    <h3 class="card-title">${r.title}</h3>
                    <p class="card-text">${r.description || ''}</p>
                    <div class="card-footer">
                        <span class="card-status" style="color: ${r.is_busy ? '#e63946' : '#2a9d8f'}; font-weight: 600;">
                            ${r.is_busy ? 'Занято' : 'Доступно для брони'}
                        </span>
                        <button class="btn btn-outline select-item-btn" data-item="${r.title}" ${r.is_busy ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                            ${r.is_busy ? 'Занято' : 'Выбрать'}
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Обновление выпадающего списка в форме бронирования
    function updateBookingSelect(rooms) {
        if (!bookingSelect) return;
        const equipmentOptions = [
            'Мобильный проектор (Комплект)',
            'Ноутбук преподавателя',
            'Радиомикрофон петличный'
        ];

        const freeRooms = rooms.filter(r => !r.is_busy);
        bookingSelect.innerHTML = `<option value="">Выберите из списка...</option>` +
            freeRooms.map(r => `<option value="${r.title}">${r.title}</option>`).join('') +
            equipmentOptions.map(eq => `<option value="${eq}">${eq}</option>`).join('');
    }

    // Отрисовка списка аудиторий в админ-панели
    function renderRoomsInAdmin(rooms) {
        const listEl = document.getElementById('admin-rooms-list');
        if (!listEl) return;

        if (!rooms || rooms.length === 0) {
            listEl.innerHTML = '<p class="empty-bookings">Список аудиторий пуст.</p>';
            return;
        }

        listEl.innerHTML = rooms.map(r => `
            <div class="booking-item-card" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${r.image || '1.jpg'}" alt="" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">
                    <div class="booking-item-info">
                        <h4>${r.title}</h4>
                        <p>Статус: <b style="color:${r.is_busy ? '#e63946' : '#2a9d8f'};">${r.is_busy ? 'Занято' : 'Свободно'}</b></p>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-outline" style="padding:6px 10px; font-size:12px;" onclick="toggleRoomStatus(${r.id})">
                        ${r.is_busy ? 'Сделать свободной' : 'Отметить занятой'}
                    </button>
                    <button type="button" class="btn-delete" onclick="deleteRoom(${r.id})">
                        Удалить
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Добавление новой аудитории с фото с ПК
    const addRoomForm = document.getElementById('add-room-form');
    if (addRoomForm) {
        addRoomForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('new-room-title')?.value.trim();
            const description = document.getElementById('new-room-desc')?.value.trim();
            const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;

            if (!title) return;

            const imageBase64 = await readImageAsBase64(selectedFile);

            try {
                const res = await fetch(`${API_URL}/api/rooms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, image: imageBase64 })
                });
                const data = await res.json();
                if (data.success) {
                    addRoomForm.reset();
                    if (fileNamePreview) fileNamePreview.textContent = '';
                    loadRooms();
                    showToast('Аудитория добавлена');
                } else {
                    showToast(data.error || 'Ошибка добавления', true);
                }
            } catch (err) {
                showToast('Ошибка соединения с сервером', true);
            }
        });
    }

    window.toggleRoomStatus = async function(id) {
        try {
            const res = await fetch(`${API_URL}/api/rooms/${id}/status`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                loadRooms();
                showToast('Статус аудитории обновлён');
            }
        } catch (err) {
            showToast('Ошибка смены статуса', true);
        }
    };

    window.deleteRoom = async function(id) {
        try {
            const res = await fetch(`${API_URL}/api/rooms/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadRooms();
                showToast('Аудитория удалена');
            }
        } catch (err) {
            showToast('Ошибка удаления аудитории', true);
        }
    };

    loadRooms();
    // --- ЗАЯВКИ ПОЛЬЗОВАТЕЛЯ И АДМИНА ---
    async function loadUserBookings() {
        const user = getCurrentUser();
        if (!user || !myBookingsList) return;

        myBookingsList.innerHTML = '<p class="empty-bookings">Загрузка ваших заявок...</p>';

        try {
            const res = await fetch(`${API_URL}/api/bookings/${encodeURIComponent(user.username)}`);
            const data = await res.json();

            if (!data.success || !data.bookings || data.bookings.length === 0) {
                myBookingsList.innerHTML = '<p class="empty-bookings">У вас пока нет отправленных заявок.</p>';
                return;
            }

            myBookingsList.innerHTML = data.bookings.map(b => `
                <div class="booking-item-card">
                    <div class="booking-item-info">
                        <h4>${b.item_title}</h4>
                        <p><b>Время:</b> ${b.booking_time}</p>
                        <p><b>Отправитель:</b> ${b.teacher_name}</p>
                    </div>
                    <button type="button" class="btn-delete" onclick="deleteMyBooking(${b.id})">
                        Удалить
                    </button>
                </div>
            `).join('');
        } catch (err) {
            myBookingsList.innerHTML = '<p class="empty-bookings" style="color:#e63946;">Ошибка загрузки заявок.</p>';
        }
    }

    window.deleteMyBooking = async function(id) {
        try {
            const res = await fetch(`${API_URL}/api/bookings/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadUserBookings();
                showToast('Заявка удалена');
            }
        } catch (err) {
            showToast('Ошибка при удалении заявки', true);
        }
    };

    async function loadAdminBookings() {
        if (!adminBookingsList) return;
        adminBookingsList.innerHTML = '<p class="empty-bookings">Загрузка всех заявок...</p>';

        try {
            const res = await fetch(`${API_URL}/api/admin/bookings`);
            const data = await res.json();
            const list = data.bookings || [];

            if (list.length === 0) {
                adminBookingsList.innerHTML = '<p class="empty-bookings">В базе данных пока нет заявок.</p>';
                return;
            }

            adminBookingsList.innerHTML = list.map(b => `
                <div class="booking-item-card">
                    <div class="booking-item-info">
                        <h4>${b.item_title}</h4>
                        <p><b>Время:</b> ${b.booking_time}</p>
                        <p><b>Отправитель:</b> ${b.teacher_name}</p>
                        <p><b>Аккаунт:</b> ${b.username || 'Не указан'}</p>
                    </div>
                    <button type="button" class="btn-delete" onclick="deleteAdminBooking(${b.id})">
                        Удалить
                    </button>
                </div>
            `).join('');
        } catch (err) {
            adminBookingsList.innerHTML = '<p class="empty-bookings" style="color:#e63946;">Ошибка загрузки заявок. Проверьте сервер Node.js.</p>';
        }
    }

    window.deleteAdminBooking = async function(id) {
        try {
            const res = await fetch(`${API_URL}/api/bookings/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadAdminBookings();
                showToast('Заявка удалена');
            }
        } catch (err) {
            showToast('Ошибка при удалении заявки', true);
        }
    };

    // Отправка формы бронирования
    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const user = getCurrentUser();
            if (!user) {
                showToast('Пожалуйста, сначала войдите в Личный кабинет!', true);
                openModal(authModal);
                return;
            }

            const itemInput = document.getElementById('booking-item');
            const timeInput = document.getElementById('booking-datetime');

            const formData = {
                item_title: itemInput ? itemInput.value : '',
                teacher_name: user.username,
                booking_time: timeInput ? timeInput.value.replace('T', ' ') : '',
                username: user.username
            };

            try {
                const response = await fetch(`${API_URL}/api/book`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    showToast('Заявка успешно отправлена!');
                    bookingForm.reset();
                    updateAuthUI();
                } else {
                    showToast(result.error || 'Ошибка отправки заявки', true);
                }
            } catch (error) {
                showToast('Не удалось связаться с сервером Node.js.', true);
            }
        });
    }

    // Обновление шапки и блокировка поля имени в заявке
    const openCabinetBtn = document.getElementById('open-auth-btn');
    const statusText = document.getElementById('user-status');
    const logoutBtn = document.getElementById('logout-btn');
    const myBookingsNavBtn = document.getElementById('my-bookings-nav');

    function updateAuthUI() {
        const user = getCurrentUser();
        const teacherInput = document.getElementById('teacher-name');

        if (user && user.username) {
            if (statusText) statusText.innerHTML = `Вы вошли как: <b>${user.username}</b>`;
            if (openCabinetBtn) openCabinetBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (myBookingsNavBtn) myBookingsNavBtn.style.display = 'inline-block';

            if (teacherInput) {
                teacherInput.value = user.username;
                teacherInput.readOnly = true;
                teacherInput.style.backgroundColor = '#e9ecef';
                teacherInput.style.color = '#495057';
                teacherInput.style.cursor = 'not-allowed';
            }
        } else {
            if (statusText) statusText.textContent = 'Вы не вошли в систему';
            if (openCabinetBtn) openCabinetBtn.style.display = 'inline-block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (myBookingsNavBtn) myBookingsNavBtn.style.display = 'none';

            if (teacherInput) {
                teacherInput.value = '';
                teacherInput.readOnly = false;
                teacherInput.style.backgroundColor = '';
                teacherInput.style.color = '';
                teacherInput.style.cursor = '';
            }
        }
    }

    updateAuthUI();
