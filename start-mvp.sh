#!/bin/bash

# Video-Chat MVP Launch Script
echo "🎥 Запуск Video-Chat MVP..."

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден. Пожалуйста, установите Node.js версии 16+"
    exit 1
fi

# Проверяем наличие Yarn
if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn не найден. Пожалуйста, установите Yarn"
    exit 1
fi

echo "✅ Node.js и Yarn найдены"

# Переходим в корневую директорию проекта
cd "$(dirname "$0")"

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    yarn install
fi

if [ ! -d "client/node_modules" ]; then
    echo "📦 Установка зависимостей клиента..."
    yarn client:install
fi

if [ ! -d "server/node_modules" ]; then
    echo "📦 Установка зависимостей сервера..."
    yarn server:install
fi

# Собираем клиент для продакшна
echo "🔨 Сборка клиента..."
yarn client:build

echo "🚀 Запуск сервера..."
echo "📱 Откройте http://localhost:4000 в браузере"
echo "🛑 Нажмите Ctrl+C для остановки"

# Запускаем сервер
yarn start