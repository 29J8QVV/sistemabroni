const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Подключение к PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Проверка подключения и автоматическое создание таблиц
pool.connect(async (err, client, release) => {
  if (err) {
    return console.error('❌ Ошибка подключения к PostgreSQL:', err.stack);
  }
  console.log('✅ Успешно подключено к базе данных PostgreSQL');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.booking (
        id SERIAL PRIMARY KEY,
        item_title VARCHAR(255),
        teacher_name VARCHAR(255),
        booking_time VARCHAR(255),
        username VARCHAR(255)
      );
    `);
    await client.query('ALTER TABLE booking ADD COLUMN IF NOT EXISTS username VARCHAR(255);');
  } catch (e) {
    console.error('⚠️ Примечание по таблицам БД:', e.message);
  }
  release();
});
// Настройка CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 1. Создание заявки
app.post('/api/book', async (req, res) => {
  const { item_title, teacher_name, booking_time, username } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO booking (item_title, teacher_name, booking_time, username) VALUES ($1, $2, $3, $4) RETURNING *',
      [item_title, teacher_name, booking_time, username || 'Гость']
    );
    res.status(200).json({ success: true, data: result.rows.at(0) });
  } catch (err) {
    console.error('❌ Ошибка SQL в booking:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Получение заявок конкретного пользователя
app.get('/api/bookings/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM booking WHERE username = $1 ORDER BY id DESC',
      [username]
    );
    res.status(200).json({ success: true, bookings: result.rows });
  } catch (err) {
    console.error('❌ Ошибка получения заявок:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Удаление заявки
app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM booking WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Ошибка удаления заявки:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 4. Регистрация пользователя
app.post('/api/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Логин и пароль не могут быть пустыми!' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO public.users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.status(200).json({ success: true, data: result.rows.at(0) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'Этот логин уже занят!' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Вход в аккаунт
app.post('/api/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Введите логин и пароль!' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username FROM public.users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.status(200).json({ success: true, user: result.rows.at(0) });
    } else {
      res.status(401).json({ success: false, error: 'Неверный логин или пароль!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`🖥️ Сервер запущен на: http://localhost:${port}`);
});
