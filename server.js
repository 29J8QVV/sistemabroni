
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Увеличиваем лимит JSON до 15 МБ для загрузки фотографий кабинетов с ПК
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(__dirname));

// Подключение к серверу PostgreSQL (из .env или Docker)
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_DATABASE || 'college_booking',
    password: process.env.DB_PASSWORD || '12345678',
    port: process.env.DB_PORT || 5432,
});

// Инициализация таблиц при запуске сервера
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS booking (
                id SERIAL PRIMARY KEY,
                item_title VARCHAR(255) NOT NULL,
                teacher_name VARCHAR(255) NOT NULL,
                booking_time VARCHAR(100) NOT NULL,
                username VARCHAR(100)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                image TEXT DEFAULT '1.jpg',
                is_busy BOOLEAN DEFAULT FALSE
            );
        `);

        // На случай если таблица rooms уже была создана со старым типом колонки image
        await pool.query('ALTER TABLE rooms ALTER COLUMN image TYPE TEXT;').catch(() => {});

        console.log('База данных PostgreSQL подключена и таблицы проверены.');
    } catch (err) {
        console.error('Ошибка инициализации БД:', err.message);
    }
}
initDB();

// Регистрация нового пользователя
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Заполните логин и пароль' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username.trim(), password.trim()]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Такой логин уже занят' });
        }
        res.status(500).json({ success: false, error: 'Ошибка регистрации на сервере' });
    }
});

// Вход пользователя
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Введите логин и пароль' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username FROM users WHERE username = $1 AND password = $2',
            [username.trim(), password.trim()]
        );

        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка при входе в систему' });
    }
});

// Вход администратора
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && (password === 'admin' || password === '12345')) {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, error: 'Неверные данные администратора' });
});
// Создание новой заявки на бронирование
app.post('/api/book', async (req, res) => {
    const { item_title, teacher_name, booking_time, username } = req.body;
    if (!item_title || !teacher_name || !booking_time) {
        return res.status(400).json({ success: false, error: 'Заполните все поля заявки' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO booking (item_title, teacher_name, booking_time, username) VALUES ($1, $2, $3, $4) RETURNING *',
            [item_title, teacher_name, booking_time, username || teacher_name]
        );
        res.json({ success: true, booking: result.rows });
    } catch (err) {
        console.error('Ошибка создания заявки:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения заявки в БД' });
    }
});

// Получение заявок конкретного пользователя
app.get('/api/bookings/:username', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM booking WHERE username = $1 ORDER BY id DESC',
            [req.params.username]
        );
        res.json({ success: true, bookings: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка загрузки ваших заявок' });
    }
});

// Получение всех заявок для админ-панели
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM booking ORDER BY id DESC');
        res.json({ success: true, bookings: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки заявок для админки:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки заявок' });
    }
});

// Удаление заявки
app.delete('/api/bookings/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM booking WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка при удалении заявки' });
    }
});
// --- МАРШРУТЫ ДЛЯ УПРАВЛЕНИЯ АУДИТОРИЯМИ ---

// Получить все аудитории
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms ORDER BY id ASC');
        res.json({ success: true, rooms: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка загрузки аудиторий' });
    }
});

// Добавить новую аудиторию (поддерживает загрузку фото с ПК в Base64)
app.post('/api/rooms', async (req, res) => {
    const { title, description, image } = req.body;
    if (!title) {
        return res.status(400).json({ success: false, error: 'Укажите название аудитории' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO rooms (title, description, image, is_busy) VALUES ($1, $2, $3, false) RETURNING *',
            [title.trim(), (description || 'Специализированная аудитория').trim(), image || '1.jpg']
        );
        res.json({ success: true, room: result.rows });
    } catch (err) {
        console.error('Ошибка добавления аудитории:', err);
        res.status(500).json({ success: false, error: 'Ошибка добавления аудитории' });
    }
});

// Изменить статус аудитории (Свободна <-> Занята)
app.patch('/api/rooms/:id/status', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE rooms SET is_busy = NOT is_busy WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        res.json({ success: true, room: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка смены статуса' });
    }
});

// Удалить аудиторию
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка удаления аудитории' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
