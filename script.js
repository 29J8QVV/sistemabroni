document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:3000';

    // Получение текущего авторизованного пользователя
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

    // Безопасное получение текста кнопки или поля
    function getElText(el) {
        if (!el) return '';
        return (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Поиск модальных окон по заголовку
    function findModalByTitle(keyword) {
        const overlays = Array.from(document.querySelectorAll('.modal-overlay'));
        return overlays.find(overlay => {
            const title = overlay.querySelector('.modal-title, h2, h3');
            return title && title.textContent.toLowerCase().includes(keyword.toLowerCase());
        });
    }

    let authModal = findModalByTitle('Личный кабинет');
    let myBookingsModal = findModalByTitle('Мои заявки');

    // Создаём окно "Мои заявки", если его нет в HTML
    if (!myBookingsModal) {
        const bookingsModalHTML = `
            <div id="myBookingsModal" class="modal-overlay">
                <div class="modal-window" style="max-width: 600px;">
                    <button type="button" class="modal-close" id="closeMyBookingsBtn">&times;</button>
                    <h3 class="modal-title">Мои заявки</h3>
                    <p class="modal-subtitle">Список ваших активных бронирований</p>
                    <div id="myBookingsList" class="bookings-list"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', bookingsModalHTML);
        myBookingsModal = document.getElementById('myBookingsModal');
    }

    let myBookingsList = myBookingsModal.querySelector('#myBookingsList, .bookings-list');
    if (!myBookingsList) {
        myBookingsList = document.createElement('div');
        myBookingsList.id = 'myBookingsList';
        myBookingsList.className = 'bookings-list';
        myBookingsModal.querySelector('.modal-window').appendChild(myBookingsList);
    }

    // Открытие и закрытие модальных окон поверх всех элементов
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

    // Загрузка отправленных заявок текущего пользователя
    async function loadUserBookings() {
        const user = getCurrentUser();
        if (!user) {
            myBookingsList.innerHTML = '<p class="empty-bookings">Войдите в аккаунт, чтобы увидеть свои заявки.</p>';
            return;
        }

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
                        <p><b>Преподаватель:</b> ${b.teacher_name}</p>
                    </div>
                    <button type="button" class="btn-delete" onclick="deleteMyBooking(${b.id})">
                        Удалить
                    </button>
                </div>
            `).join('');
        } catch (err) {
            myBookingsList.innerHTML = '<p class="empty-bookings" style="color:#e63946;">Ошибка загрузки заявок. Проверьте, запущен ли сервер Node.js.</p>';
        }
    }

    window.deleteMyBooking = async function(id) {
        if (!confirm('Вы действительно хотите удалить эту заявку?')) return;
        try {
            const res = await fetch(`${API_URL}/api/bookings/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadUserBookings();
            } else {
                alert('Ошибка при удалении заявки');
            }
        } catch (err) {
            alert('Ошибка соединения с сервером');
        }
    };
    // Отправка формы бронирования
    const bookingForm = document.getElementById('postgresBookingForm') ||
                        document.getElementById('booking-form') ||
                        document.querySelector('.booking-form');

    if (bookingForm) {
        bookingForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const user = getCurrentUser();
            if (!user) {
                alert('Пожалуйста, сначала войдите в Личный кабинет!');
                openModal(authModal);
                return;
            }

            const teacherInput = document.getElementById('teacherName') ||
                                 document.getElementById('teacher-name') ||
                                 bookingForm.querySelector('input[type="text"]');
            const itemInput = document.getElementById('bookingItem') ||
                              document.getElementById('booking-item') ||
                              bookingForm.querySelector('select');
            const timeInput = document.getElementById('bookingTime') ||
                              document.getElementById('booking-datetime') ||
                              bookingForm.querySelector('input[type="datetime-local"], input[type="date"], input[type="time"]');

            const formData = {
                item_title: itemInput ? itemInput.value : '',
                teacher_name: teacherInput ? teacherInput.value.trim() : '',
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
                    alert('Заявка успешно отправлена! Посмотреть её можно в разделе «Мои заявки».');
                    bookingForm.reset();
                } else {
                    alert(`Ошибка сервера: ${result.error}`);
                }
            } catch (error) {
                alert('Не удалось связаться с сервером Node.js.');
            }
        });
    }

    // Элементы управления в шапке
    const openCabinetBtn = Array.from(document.querySelectorAll('button, a, span, div'))
        .find(el => el.children.length === 0 && getElText(el) === 'Личный кабинет');

    const statusText = document.getElementById('userStatusText') ||
                       document.getElementById('user-status') ||
                       Array.from(document.querySelectorAll('span, div, p')).find(el => getElText(el).includes('Вы не вошли в систему'));

    const logoutBtn = document.getElementById('logoutBtn') ||
                      document.getElementById('logout-btn') ||
                      Array.from(document.querySelectorAll('button, a')).find(el => getElText(el) === 'Выйти');

    const navMenu = document.querySelector('.nav, nav');
    let myBookingsNavBtn = Array.from(document.querySelectorAll('.nav a, nav a, .nav button'))
        .find(el => getElText(el) === 'Мои заявки');

    if (navMenu && !myBookingsNavBtn) {
        myBookingsNavBtn = document.createElement('a');
        myBookingsNavBtn.href = '#';
        myBookingsNavBtn.className = 'nav-link';
        myBookingsNavBtn.textContent = 'Мои заявки';
        navMenu.appendChild(myBookingsNavBtn);
    }

    if (myBookingsNavBtn) {
        myBookingsNavBtn.style.color = '#0056b3';
        myBookingsNavBtn.style.fontWeight = '700';
    }

    // Обновление интерфейса при входе и выходе
    function updateAuthUI() {
        const user = getCurrentUser();
        if (user && user.username) {
            if (statusText) statusText.innerHTML = `👤 Вы вошли как: <b>${user.username}</b>`;
            if (openCabinetBtn) openCabinetBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (myBookingsNavBtn) myBookingsNavBtn.style.display = 'inline-block';
        } else {
            if (statusText) statusText.textContent = 'Вы не вошли в систему';
            if (openCabinetBtn) openCabinetBtn.style.display = 'inline-block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (myBookingsNavBtn) myBookingsNavBtn.style.display = 'none';
        }
    }

    updateAuthUI();
    // Извлечение логина (inputs[0]) и пароля (inputs[1]) из активной формы
    function extractCredentials(triggerEl) {
        const container = triggerEl.closest('form') ||
                          triggerEl.closest('.modal-form') ||
                          authModal;
        if (!container) return { username: '', password: '', inputs: [] };

        const inputs = Array.from(container.querySelectorAll('input'))
            .filter(inp => inp.type !== 'submit' && inp.type !== 'button' && inp.type !== 'hidden');

        return {
            username: inputs[0] ? inputs[0].value.trim() : '',
            password: inputs[1] ? inputs[1].value.trim() : '',
            inputs
        };
    }

    // Отправка запроса входа или регистрации
    async function handleAuthRequest(endpoint, triggerEl, isRegister) {
        const { username, password, inputs } = extractCredentials(triggerEl);

        if (!username || !password) {
            alert(isRegister ? 'Придумайте логин и пароль!' : 'Пожалуйста, введите логин и пароль!');
            return;
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                const rawUser = isRegister ? result.data : result.user;
                const userObj = Array.isArray(rawUser) ? rawUser[0] : (rawUser || { username });
                localStorage.setItem('currentUser', JSON.stringify(userObj));
                updateAuthUI();
                inputs.forEach(inp => inp.value = '');
                closeModal(authModal);
                alert(isRegister
                    ? `Регистрация успешна! Вы вошли как ${userObj.username}`
                    : `Успешный вход! Добро пожаловать, ${userObj.username}`
                );
            } else {
                alert(result.error || (isRegister ? 'Ошибка регистрации' : 'Неверный логин или пароль'));
            }
        } catch (err) {
            alert('Ошибка соединения с сервером. Проверьте, запущен ли Node.js.');
        }
    }

    // Единый обработчик кликов по странице
    document.addEventListener('click', (e) => {
        const target = e.target;

        if (target.classList.contains('modal-overlay')) {
            closeModal(target);
            return;
        }

        const clickable = target.closest('button, a, input[type="submit"], input[type="button"], .tab-btn, .modal-close, span, div');
        if (!clickable) return;

        if ((clickable.tagName === 'SPAN' || clickable.tagName === 'DIV') &&
            clickable.children.length > 0 &&
            !clickable.classList.contains('tab-btn') &&
            !clickable.classList.contains('modal-close')) {
            return;
        }

        const text = getElText(clickable);

        if (text === 'Личный кабинет') {
            e.preventDefault();
            if (!authModal) authModal = findModalByTitle('Личный кабинет');
            openModal(authModal);
            return;
        }

        if (text === 'Мои заявки') {
            e.preventDefault();
            if (!getCurrentUser()) {
                alert('Сначала войдите в Личный кабинет!');
                openModal(authModal);
                return;
            }
            openModal(myBookingsModal);
            loadUserBookings();
            return;
        }

        if (text === 'Выбрать' && clickable.closest('.card')) {
            e.preventDefault();
            const card = clickable.closest('.card');
            const title = card.querySelector('.card-title, h3, h4')?.textContent.trim() || '';
            const select = document.getElementById('bookingItem') ||
                           document.getElementById('booking-item') ||
                           document.querySelector('.booking-form select');
            if (select && title) {
                const option = Array.from(select.options).find(opt => opt.value.includes(title) || opt.textContent.includes(title));
                if (option) select.value = option.value;
            }
            if (bookingForm) bookingForm.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        if (clickable.classList.contains('modal-close')) {
            e.preventDefault();
            closeModal(clickable.closest('.modal-overlay'));
            return;
        }

        if (clickable.classList.contains('tab-btn') && authModal) {
            e.preventDefault();
            const tabs = Array.from(authModal.querySelectorAll('.tab-btn'));
            const forms = Array.from(authModal.querySelectorAll('.modal-form, form'));
            const idx = tabs.indexOf(clickable);
            if (idx !== -1 && forms.length >= tabs.length) {
                forms.forEach((f, i) => f.style.display = i === idx ? 'flex' : 'none');
                tabs.forEach((t, i) => t.style.borderBottom = i === idx ? '2px solid var(--primary-blue)' : 'none');
            }
            return;
        }

        if (text === 'Войти') {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleAuthRequest('/api/login', clickable, false);
            return;
        }

        if (text === 'Зарегистрироваться') {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleAuthRequest('/api/register', clickable, true);
            return;
        }

        if (text === 'Выйти') {
            e.preventDefault();
            localStorage.removeItem('currentUser');
            updateAuthUI();
            alert('Вы вышли из аккаунта');
        }
    }, true);
});
